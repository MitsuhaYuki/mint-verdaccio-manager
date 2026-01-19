mod tools;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tools::VerdaccioProcess;

/// 托盘图标 PNG 数据
const TRAY_ICON_RUNNING: &[u8] = include_bytes!("../icons/tray-running.png");
const TRAY_ICON_STOPPED: &[u8] = include_bytes!("../icons/tray-stopped.png");

/// 从 PNG 数据创建 Tauri Image
fn load_png_icon(png_data: &[u8]) -> Image<'static> {
    let img = image::load_from_memory(png_data)
        .expect("无法解码 PNG 图标")
        .to_rgba8();
    let (width, height) = img.dimensions();
    let pixels = img.into_raw();
    Image::new_owned(pixels, width, height)
}

/// 更新托盘图标
fn update_tray_icon(app: &tauri::AppHandle, running: bool) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        // 根据状态选择图标文件
        let icon = if running {
            load_png_icon(TRAY_ICON_RUNNING)
        } else {
            load_png_icon(TRAY_ICON_STOPPED)
        };
        let _ = tray.set_icon(Some(icon));
    }
}

/// 同步检查 Verdaccio 状态并更新托盘
#[tauri::command]
async fn sync_tray_status(app: tauri::AppHandle, running: bool) -> Result<(), String> {
    update_tray_icon(&app, running);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .manage(VerdaccioProcess::default())
        .setup(|app| {
            // 创建托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 从文件加载初始图标 (服务未运行 - 红色)
            let icon = load_png_icon(TRAY_ICON_STOPPED);

            // 创建托盘图标
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .menu(&menu)
                .tooltip("Verdaccio 服务器管理")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        // 停止 Verdaccio 进程
                        if let Some(process) = app.try_state::<VerdaccioProcess>() {
                            if let Ok(mut child) = process.child.lock() {
                                if let Some(proc) = child.take() {
                                    let _ = proc.kill();
                                }
                            }
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 阻止窗口关闭，改为隐藏到托盘
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            sync_tray_status,
            tools::start_verdaccio,
            tools::stop_verdaccio,
            tools::get_verdaccio_status,
            tools::check_verdaccio_installed,
            tools::get_verdaccio_version,
            tools::get_verdaccio_logs,
            tools::clear_verdaccio_logs,
            tools::get_verdaccio_config,
            tools::save_verdaccio_config,
            tools::get_config_file_path,
            tools::reset_config_to_default,
            tools::get_packages,
            tools::get_package_details,
            tools::delete_package,
            tools::get_cached_package_count,
            tools::get_package_count_from_api,
            tools::get_app_settings,
            tools::save_app_settings,
            tools::set_auto_start,
            tools::get_auto_start_status,
            tools::get_users,
            tools::add_user,
            tools::delete_user,
            tools::change_user_password,
            tools::get_user_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
