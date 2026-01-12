use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 应用设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub auto_start: bool,
    pub minimize_to_tray: bool,
    pub auto_start_verdaccio: bool,
    #[serde(default = "default_port")]
    pub default_port: u16,
    #[serde(default)]
    pub allow_lan: bool,
}

fn default_port() -> u16 {
    4873
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_start: false,
            minimize_to_tray: true,
            auto_start_verdaccio: false,
            default_port: 4873,
            allow_lan: false,
        }
    }
}

/// 获取设置文件路径
fn get_settings_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".mint-verdaccio").join("settings.json")
}

/// 确保设置目录存在
fn ensure_settings_dir() -> Result<(), String> {
    let settings_path = get_settings_path();
    if let Some(parent) = settings_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建设置目录失败: {}", e))?;
        }
    }
    Ok(())
}

/// 获取应用设置
#[tauri::command]
pub async fn get_app_settings() -> Result<AppSettings, String> {
    let settings_path = get_settings_path();
    
    if !settings_path.exists() {
        return Ok(AppSettings::default());
    }
    
    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("读取设置文件失败: {}", e))?;
    
    let settings: AppSettings = serde_json::from_str(&content)
        .map_err(|e| format!("解析设置文件失败: {}", e))?;
    
    Ok(settings)
}

/// 保存应用设置
#[tauri::command]
pub async fn save_app_settings(settings: AppSettings) -> Result<(), String> {
    ensure_settings_dir()?;
    
    let settings_path = get_settings_path();
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("序列化设置失败: {}", e))?;
    
    std::fs::write(&settings_path, content)
        .map_err(|e| format!("保存设置文件失败: {}", e))
}

/// 设置开机自启
#[tauri::command]
pub async fn set_auto_start(app_handle: tauri::AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    
    let autostart_manager = app_handle.autolaunch();
    
    if enable {
        autostart_manager.enable()
            .map_err(|e| format!("设置开机自启失败: {}", e))
    } else {
        autostart_manager.disable()
            .map_err(|e| format!("取消开机自启失败: {}", e))
    }
}

/// 获取开机自启状态
#[tauri::command]
pub async fn get_auto_start_status(app_handle: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    
    let autostart_manager = app_handle.autolaunch();
    autostart_manager.is_enabled()
        .map_err(|e| format!("获取开机自启状态失败: {}", e))
}
