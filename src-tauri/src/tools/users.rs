use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 用户信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub username: String,
    pub created: Option<String>,
}

/// 获取 htpasswd 文件路径
fn get_htpasswd_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".verdaccio").join("htpasswd")
}

/// 解析 htpasswd 文件内容
fn parse_htpasswd(content: &str) -> HashMap<String, String> {
    let mut users = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((username, password_hash)) = line.split_once(':') {
            users.insert(username.to_string(), password_hash.to_string());
        }
    }
    users
}

/// 生成 htpasswd 文件内容
fn generate_htpasswd(users: &HashMap<String, String>) -> String {
    users
        .iter()
        .map(|(username, password_hash)| format!("{}:{}", username, password_hash))
        .collect::<Vec<_>>()
        .join("\n")
}

/// 使用 bcrypt 生成密码哈希（Verdaccio 默认使用 bcrypt）
fn hash_password(password: &str) -> Result<String, String> {
    bcrypt::hash(password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("密码加密失败: {}", e))
}

/// 获取用户列表
#[tauri::command]
pub async fn get_users() -> Result<Vec<UserInfo>, String> {
    let htpasswd_path = get_htpasswd_path();
    
    if !htpasswd_path.exists() {
        return Ok(vec![]);
    }
    
    let content = std::fs::read_to_string(&htpasswd_path)
        .map_err(|e| format!("读取 htpasswd 文件失败: {}", e))?;
    
    let users = parse_htpasswd(&content);
    
    Ok(users
        .keys()
        .map(|username| UserInfo {
            username: username.clone(),
            created: None,
        })
        .collect())
}

/// 添加用户
#[tauri::command]
pub async fn add_user(username: String, password: String) -> Result<(), String> {
    // 验证用户名
    if username.is_empty() {
        return Err("用户名不能为空".to_string());
    }
    if username.contains(':') || username.contains('\n') {
        return Err("用户名包含非法字符".to_string());
    }
    
    // 验证密码
    if password.is_empty() {
        return Err("密码不能为空".to_string());
    }
    if password.len() < 4 {
        return Err("密码长度至少为 4 个字符".to_string());
    }
    
    let htpasswd_path = get_htpasswd_path();
    
    // 确保目录存在
    if let Some(parent) = htpasswd_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    
    // 读取现有用户
    let mut users = if htpasswd_path.exists() {
        let content = std::fs::read_to_string(&htpasswd_path)
            .map_err(|e| format!("读取 htpasswd 文件失败: {}", e))?;
        parse_htpasswd(&content)
    } else {
        HashMap::new()
    };
    
    // 检查用户是否已存在
    if users.contains_key(&username) {
        return Err(format!("用户 {} 已存在", username));
    }
    
    // 生成密码哈希
    let password_hash = hash_password(&password)?;
    
    // 添加用户
    users.insert(username.clone(), password_hash);
    
    // 写入文件
    let content = generate_htpasswd(&users);
    std::fs::write(&htpasswd_path, content)
        .map_err(|e| format!("写入 htpasswd 文件失败: {}", e))?;
    
    Ok(())
}

/// 删除用户
#[tauri::command]
pub async fn delete_user(username: String) -> Result<(), String> {
    let htpasswd_path = get_htpasswd_path();
    
    if !htpasswd_path.exists() {
        return Err("htpasswd 文件不存在".to_string());
    }
    
    let content = std::fs::read_to_string(&htpasswd_path)
        .map_err(|e| format!("读取 htpasswd 文件失败: {}", e))?;
    
    let mut users = parse_htpasswd(&content);
    
    if !users.contains_key(&username) {
        return Err(format!("用户 {} 不存在", username));
    }
    
    users.remove(&username);
    
    let content = generate_htpasswd(&users);
    std::fs::write(&htpasswd_path, content)
        .map_err(|e| format!("写入 htpasswd 文件失败: {}", e))?;
    
    Ok(())
}

/// 修改用户密码
#[tauri::command]
pub async fn change_user_password(username: String, new_password: String) -> Result<(), String> {
    // 验证密码
    if new_password.is_empty() {
        return Err("密码不能为空".to_string());
    }
    if new_password.len() < 4 {
        return Err("密码长度至少为 4 个字符".to_string());
    }
    
    let htpasswd_path = get_htpasswd_path();
    
    if !htpasswd_path.exists() {
        return Err("htpasswd 文件不存在".to_string());
    }
    
    let content = std::fs::read_to_string(&htpasswd_path)
        .map_err(|e| format!("读取 htpasswd 文件失败: {}", e))?;
    
    let mut users = parse_htpasswd(&content);
    
    if !users.contains_key(&username) {
        return Err(format!("用户 {} 不存在", username));
    }
    
    // 生成新密码哈希
    let password_hash = hash_password(&new_password)?;
    
    users.insert(username, password_hash);
    
    let content = generate_htpasswd(&users);
    std::fs::write(&htpasswd_path, content)
        .map_err(|e| format!("写入 htpasswd 文件失败: {}", e))?;
    
    Ok(())
}

/// 获取用户数量
#[tauri::command]
pub async fn get_user_count() -> Result<usize, String> {
    let users = get_users().await?;
    Ok(users.len())
}
