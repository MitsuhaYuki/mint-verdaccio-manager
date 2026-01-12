use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

/// 日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

/// Verdaccio 服务状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerdaccioStatus {
    pub running: bool,
    pub port: u16,
    pub pid: Option<u32>,
    pub storage_path: String,
    pub config_path: String,
}

/// 全局 Verdaccio 进程管理器
pub struct VerdaccioProcess {
    pub child: Mutex<Option<CommandChild>>,
    pub port: Mutex<u16>,
    pub pid: Mutex<Option<u32>>,
    pub logs: Mutex<VecDeque<LogEntry>>,
    pub is_running: Mutex<bool>,
}

const MAX_LOG_ENTRIES: usize = 1000;

impl Default for VerdaccioProcess {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(4873),
            pid: Mutex::new(None),
            logs: Mutex::new(VecDeque::with_capacity(MAX_LOG_ENTRIES)),
            is_running: Mutex::new(false),
        }
    }
}

impl VerdaccioProcess {
    /// 移除 ANSI 转义序列（颜色代码）
    fn strip_ansi_codes(s: &str) -> String {
        let re = regex::Regex::new(r"\x1b\[[0-9;]*m").unwrap();
        re.replace_all(s, "").to_string()
    }

    pub fn add_log(&self, level: &str, message: String) {
        if let Ok(mut logs) = self.logs.lock() {
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
            // 移除 ANSI 颜色代码
            let clean_message = Self::strip_ansi_codes(&message);
            logs.push_back(LogEntry {
                timestamp,
                level: level.to_string(),
                message: clean_message,
            });
            while logs.len() > MAX_LOG_ENTRIES {
                logs.pop_front();
            }
        }
    }

    pub fn set_running(&self, running: bool) {
        if let Ok(mut is_running) = self.is_running.lock() {
            *is_running = running;
        }
    }

    pub fn check_running(&self) -> bool {
        self.is_running.lock().map(|r| *r).unwrap_or(false)
    }
}

/// 获取 Verdaccio 配置目录
fn get_verdaccio_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".verdaccio")
}

/// 获取 Verdaccio 配置文件路径
fn get_config_path() -> PathBuf {
    get_verdaccio_dir().join("config.yaml")
}

/// 获取 Verdaccio 存储目录
fn get_storage_path() -> PathBuf {
    get_verdaccio_dir().join("storage")
}

/// 获取 Verdaccio 入口文件路径（从资源目录）
fn get_verdaccio_entry(app: &AppHandle) -> Result<PathBuf, String> {
    // 获取资源目录
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    // Verdaccio 入口文件
    let verdaccio_bin = resource_dir
        .join("node_modules")
        .join("verdaccio")
        .join("bin")
        .join("verdaccio");

    if verdaccio_bin.exists() {
        return Ok(verdaccio_bin);
    }

    // 开发模式：从 src-tauri/resources 查找
    let dev_path = std::env::current_dir()
        .ok()
        .map(|p| p.join("resources").join("node_modules").join("verdaccio").join("bin").join("verdaccio"));

    if let Some(path) = dev_path {
        if path.exists() {
            return Ok(path);
        }
    }

    // 尝试项目根目录的 node_modules
    let exe_dir = std::env::current_exe().ok();
    if let Some(exe) = exe_dir {
        // 开发模式：exe 在 target/debug 或 target/release
        let project_root = exe
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .and_then(|p| p.parent());

        if let Some(root) = project_root {
            let fallback = root
                .join("src-tauri")
                .join("resources")
                .join("node_modules")
                .join("verdaccio")
                .join("bin")
                .join("verdaccio");

            if fallback.exists() {
                return Ok(fallback);
            }
        }
    }

    Err("无法找到 Verdaccio，请运行 pnpm prepare:runtime".to_string())
}

/// 初始化 Verdaccio 配置目录
fn ensure_verdaccio_dirs() -> Result<(), String> {
    let verdaccio_dir = get_verdaccio_dir();
    let storage_dir = get_storage_path();

    if !verdaccio_dir.exists() {
        std::fs::create_dir_all(&verdaccio_dir)
            .map_err(|e| format!("创建 Verdaccio 目录失败: {}", e))?;
    }

    if !storage_dir.exists() {
        std::fs::create_dir_all(&storage_dir)
            .map_err(|e| format!("创建存储目录失败: {}", e))?;
    }

    let config_path = get_config_path();
    if !config_path.exists() {
        let default_config = r#"# Verdaccio 配置文件
storage: ./storage
auth:
  htpasswd:
    file: ./htpasswd
    max_users: -1
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
    cache: true
packages:
  '@*/*':
    access: $all
    publish: $authenticated
    proxy: npmjs
  '**':
    access: $all
    publish: $authenticated
    proxy: npmjs
server:
  keepAliveTimeout: 60
middlewares:
  audit:
    enabled: true
log:
  type: stdout
  format: pretty
  level: http
"#;
        std::fs::write(&config_path, default_config)
            .map_err(|e| format!("创建配置文件失败: {}", e))?;
    }

    Ok(())
}

/// 启动 Verdaccio 服务（使用 Node.js sidecar + Verdaccio 资源）
#[tauri::command]
pub async fn start_verdaccio(
    app: AppHandle,
    process: State<'_, VerdaccioProcess>,
    port: u16,
    allow_lan: bool,
) -> Result<VerdaccioStatus, String> {
    ensure_verdaccio_dirs()?;

    if process.check_running() {
        return Err("Verdaccio 已经在运行".to_string());
    }

    {
        let child = process.child.lock().map_err(|e| e.to_string())?;
        if child.is_some() {
            return Err("Verdaccio 已经在运行".to_string());
        }
    }

    let config_path = get_config_path();
    let verdaccio_entry = get_verdaccio_entry(&app)?;

    process.add_log("INFO", format!("正在启动 Verdaccio..."));
    process.add_log("INFO", format!("Verdaccio 入口: {}", verdaccio_entry.display()));
    process.add_log("INFO", format!("配置文件: {}", config_path.display()));
    process.add_log("INFO", format!("监听端口: {}", port));

    // 根据 allow_lan 设置监听地址
    let listen_host = if allow_lan { "0.0.0.0" } else { "127.0.0.1" };
    process.add_log("INFO", format!("监听地址: {}", listen_host));

    // 使用 Node.js sidecar 运行 Verdaccio
    let sidecar = app
        .shell()
        .sidecar("node")
        .map_err(|e| {
            let msg = format!("创建 Node.js sidecar 失败: {}", e);
            process.add_log("ERROR", msg.clone());
            msg
        })?
        .args([
            verdaccio_entry.to_str().unwrap(),
            "--config",
            config_path.to_str().unwrap(),
            "--listen",
            &format!("{}:{}", listen_host, port),
        ]);

    let (mut rx, child) = sidecar.spawn().map_err(|e| {
        let msg = format!("启动 Verdaccio 失败: {}", e);
        process.add_log("ERROR", msg.clone());
        msg
    })?;

    let pid = child.pid();
    process.add_log("INFO", format!("Verdaccio 进程已启动, PID: {}", pid));

    {
        let mut process_child = process.child.lock().map_err(|e| e.to_string())?;
        *process_child = Some(child);
        let mut process_port = process.port.lock().map_err(|e| e.to_string())?;
        *process_port = port;
        let mut process_pid = process.pid.lock().map_err(|e| e.to_string())?;
        *process_pid = Some(pid);
    }

    process.set_running(true);

    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        while let Some(event) = rx.recv().await {
            if let Some(process_state) = app_handle.try_state::<VerdaccioProcess>() {
                match event {
                    CommandEvent::Stdout(line) => {
                        let output = String::from_utf8_lossy(&line).trim().to_string();
                        if !output.is_empty() {
                            process_state.add_log("STDOUT", output);
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        let output = String::from_utf8_lossy(&line).trim().to_string();
                        if !output.is_empty() {
                            process_state.add_log("STDERR", output);
                        }
                    }
                    CommandEvent::Error(e) => {
                        process_state.add_log("ERROR", format!("进程错误: {}", e));
                    }
                    CommandEvent::Terminated(payload) => {
                        process_state.add_log(
                            "INFO",
                            format!("Verdaccio 进程已退出, 退出码: {:?}", payload.code),
                        );
                        process_state.set_running(false);
                        if let Ok(mut child) = process_state.child.lock() {
                            *child = None;
                        }
                        if let Ok(mut pid) = process_state.pid.lock() {
                            *pid = None;
                        }
                        break;
                    }
                    _ => {}
                }
            }
        }
    });

    Ok(VerdaccioStatus {
        running: true,
        port,
        pid: Some(pid),
        storage_path: get_storage_path().to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

/// 停止 Verdaccio 服务
#[tauri::command]
pub async fn stop_verdaccio(process: State<'_, VerdaccioProcess>) -> Result<(), String> {
    process.add_log("INFO", "正在停止 Verdaccio...".to_string());

    let mut child = process.child.lock().map_err(|e| e.to_string())?;

    if let Some(proc) = child.take() {
        proc.kill().map_err(|e| {
            let msg = format!("停止进程失败: {}", e);
            process.add_log("ERROR", msg.clone());
            msg
        })?;
        process.add_log("INFO", "Verdaccio 已停止".to_string());
    }

    {
        let mut pid = process.pid.lock().map_err(|e| e.to_string())?;
        *pid = None;
    }
    process.set_running(false);

    Ok(())
}

/// 获取 Verdaccio 状态
#[tauri::command]
pub async fn get_verdaccio_status(
    process: State<'_, VerdaccioProcess>,
) -> Result<VerdaccioStatus, String> {
    let port = *process.port.lock().map_err(|e| e.to_string())?;
    let pid = *process.pid.lock().map_err(|e| e.to_string())?;
    let running = process.check_running();

    Ok(VerdaccioStatus {
        running,
        port,
        pid,
        storage_path: get_storage_path().to_string_lossy().to_string(),
        config_path: get_config_path().to_string_lossy().to_string(),
    })
}

/// 获取服务日志
#[tauri::command]
pub async fn get_verdaccio_logs(
    process: State<'_, VerdaccioProcess>,
) -> Result<Vec<LogEntry>, String> {
    let logs = process.logs.lock().map_err(|e| e.to_string())?;
    Ok(logs.iter().cloned().collect())
}

/// 清除服务日志
#[tauri::command]
pub async fn clear_verdaccio_logs(process: State<'_, VerdaccioProcess>) -> Result<(), String> {
    let mut logs = process.logs.lock().map_err(|e| e.to_string())?;
    logs.clear();
    Ok(())
}

/// 检查 Verdaccio 是否就绪
#[tauri::command]
pub async fn check_verdaccio_installed() -> Result<bool, String> {
    Ok(true)
}

/// 获取 Verdaccio package.json 路径
fn get_verdaccio_package_json(app: &AppHandle) -> Result<PathBuf, String> {
    // 获取资源目录
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    // Verdaccio package.json
    let verdaccio_pkg = resource_dir
        .join("node_modules")
        .join("verdaccio")
        .join("package.json");

    if verdaccio_pkg.exists() {
        return Ok(verdaccio_pkg);
    }

    // 开发模式：从 src-tauri/resources 查找
    let dev_path = std::env::current_dir()
        .ok()
        .map(|p| p.join("resources").join("node_modules").join("verdaccio").join("package.json"));

    if let Some(path) = dev_path {
        if path.exists() {
            return Ok(path);
        }
    }

    // 尝试项目根目录的 node_modules
    let exe_dir = std::env::current_exe().ok();
    if let Some(exe) = exe_dir {
        let project_root = exe
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .and_then(|p| p.parent());

        if let Some(root) = project_root {
            let fallback = root
                .join("src-tauri")
                .join("resources")
                .join("node_modules")
                .join("verdaccio")
                .join("package.json");

            if fallback.exists() {
                return Ok(fallback);
            }
        }
    }

    Err("无法找到 Verdaccio package.json".to_string())
}

/// 获取 Verdaccio 版本
#[tauri::command]
pub async fn get_verdaccio_version(app: AppHandle) -> Result<String, String> {
    let pkg_path = get_verdaccio_package_json(&app)?;
    
    let content = std::fs::read_to_string(&pkg_path)
        .map_err(|e| format!("读取 package.json 失败: {}", e))?;
    
    let pkg: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析 package.json 失败: {}", e))?;
    
    let version = pkg.get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("未知版本");
    
    Ok(format!("{}", version))
}

// ========== 配置相关命令 ==========

/// 读取 Verdaccio 配置
#[tauri::command]
pub async fn get_verdaccio_config() -> Result<String, String> {
    let config_path = get_config_path();

    if !config_path.exists() {
        return Err("配置文件不存在".to_string());
    }

    std::fs::read_to_string(&config_path).map_err(|e| format!("读取配置文件失败: {}", e))
}

/// 保存 Verdaccio 配置
#[tauri::command]
pub async fn save_verdaccio_config(config: String) -> Result<(), String> {
    let config_path = get_config_path();

    std::fs::write(&config_path, config).map_err(|e| format!("保存配置文件失败: {}", e))
}

/// 获取配置文件路径
#[tauri::command]
pub async fn get_config_file_path() -> Result<String, String> {
    Ok(get_config_path().to_string_lossy().to_string())
}

/// 重置为默认配置
#[tauri::command]
pub async fn reset_config_to_default() -> Result<(), String> {
    let config_path = get_config_path();

    let default_config = r#"# Verdaccio 配置文件
storage: ./storage
auth:
  htpasswd:
    file: ./htpasswd
    max_users: 10
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
    cache: true
packages:
  'local-*':
    access: $all
    publish: $authenticated
  '@*/*':
    access: $all
    publish: $authenticated
    proxy: npmjs
  '**':
    access: $all
    publish: $authenticated
    proxy: npmjs
server:
  keepAliveTimeout: 60
middlewares:
  audit:
    enabled: true
log:
  type: stdout
  format: pretty
  level: http
"#;

    std::fs::write(&config_path, default_config).map_err(|e| format!("重置配置文件失败: {}", e))
}
