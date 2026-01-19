use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 私有包信息（前端使用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageInfo {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub versions: Vec<String>,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// Verdaccio API 返回的包信息（用于反序列化）
#[derive(Debug, Clone, Deserialize)]
struct VerdaccioPackageResponse {
    name: String,
    version: Option<String>,
    description: Option<String>,
    author: Option<serde_json::Value>,
    license: Option<String>,
    time: Option<serde_json::Value>,
}

impl VerdaccioPackageResponse {
    fn into_package_info(self) -> PackageInfo {
        // 解析 author 字段（可能是字符串或对象）
        let author = self.author.and_then(|a| {
            if let Some(s) = a.as_str() {
                Some(s.to_string())
            } else if let Some(obj) = a.as_object() {
                obj.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())
            } else {
                None
            }
        });

        // 解析 time 字段
        let (created, modified) = if let Some(time) = &self.time {
            if let Some(s) = time.as_str() {
                (Some(s.to_string()), Some(s.to_string()))
            } else if let Some(obj) = time.as_object() {
                (
                    obj.get("created").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    obj.get("modified").and_then(|v| v.as_str()).map(|s| s.to_string()),
                )
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        PackageInfo {
            name: self.name,
            version: self.version.unwrap_or_else(|| "0.0.0".to_string()),
            description: self.description,
            author,
            license: self.license,
            versions: vec![],  // API 不返回版本列表，后续从详情获取
            created,
            modified,
        }
    }
}

/// 获取存储目录
fn get_storage_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".verdaccio").join("storage")
}

/// 获取私有包列表
#[tauri::command]
pub async fn get_packages(port: u16) -> Result<Vec<PackageInfo>, String> {
    let client = reqwest::Client::new();
    let url = format!("http://localhost:{}/-/verdaccio/data/packages", port);
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    if !response.status().is_success() {
        // 如果 API 不可用，尝试从存储目录读取
        return get_packages_from_storage().await;
    }
    
    // 解析 Verdaccio API 响应
    let api_packages: Vec<VerdaccioPackageResponse> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    // 转换为 PackageInfo
    let packages: Vec<PackageInfo> = api_packages
        .into_iter()
        .map(|p| p.into_package_info())
        .collect();
    
    Ok(packages)
}

/// 从存储目录获取包列表
async fn get_packages_from_storage() -> Result<Vec<PackageInfo>, String> {
    let storage_path = get_storage_path();
    
    if !storage_path.exists() {
        return Ok(vec![]);
    }
    
    let mut packages = Vec::new();
    
    // 读取存储目录
    let entries = std::fs::read_dir(&storage_path)
        .map_err(|e| format!("读取存储目录失败: {}", e))?;
    
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            
            // 跳过隐藏目录和特殊目录
            if name.starts_with('.') || name.starts_with("@") {
                // 处理 scoped 包
                if name.starts_with('@') {
                    if let Ok(scoped_entries) = std::fs::read_dir(&path) {
                        for scoped_entry in scoped_entries.flatten() {
                            let scoped_path = scoped_entry.path();
                            if scoped_path.is_dir() {
                                let scoped_name = scoped_entry.file_name().to_string_lossy().to_string();
                                let full_name = format!("{}/{}", name, scoped_name);
                                
                                if let Some(pkg_info) = read_package_json(&scoped_path, &full_name) {
                                    packages.push(pkg_info);
                                }
                            }
                        }
                    }
                }
                continue;
            }
            
            if let Some(pkg_info) = read_package_json(&path, &name) {
                packages.push(pkg_info);
            }
        }
    }
    
    Ok(packages)
}

/// 读取包的 package.json
fn read_package_json(path: &PathBuf, name: &str) -> Option<PackageInfo> {
    let package_json_path = path.join("package.json");
    
    if !package_json_path.exists() {
        return None;
    }
    
    let content = std::fs::read_to_string(&package_json_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    
    // 获取版本列表
    let versions = if let Some(versions_obj) = json.get("versions").and_then(|v| v.as_object()) {
        versions_obj.keys().cloned().collect()
    } else {
        vec![]
    };
    
    let latest = json.get("dist-tags")
        .and_then(|dt| dt.get("latest"))
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0");
    
    Some(PackageInfo {
        name: name.to_string(),
        version: latest.to_string(),
        description: json.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
        author: json.get("author").and_then(|v| v.as_str()).map(|s| s.to_string()),
        license: json.get("license").and_then(|v| v.as_str()).map(|s| s.to_string()),
        versions,
        created: json.get("time").and_then(|t| t.get("created")).and_then(|v| v.as_str()).map(|s| s.to_string()),
        modified: json.get("time").and_then(|t| t.get("modified")).and_then(|v| v.as_str()).map(|s| s.to_string()),
    })
}

/// 获取包详情
#[tauri::command]
pub async fn get_package_details(port: u16, package_name: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("http://localhost:{}/{}", port, package_name);
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    if !response.status().is_success() {
        return Err("获取包详情失败".to_string());
    }
    
    let details: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(details)
}

/// 删除包
#[tauri::command]
pub async fn delete_package(package_name: String) -> Result<(), String> {
    let storage_path = get_storage_path();
    
    // 处理 scoped 包路径
    let package_path = if package_name.starts_with('@') {
        let parts: Vec<&str> = package_name.splitn(2, '/').collect();
        if parts.len() == 2 {
            storage_path.join(parts[0]).join(parts[1])
        } else {
            storage_path.join(&package_name)
        }
    } else {
        storage_path.join(&package_name)
    };
    
    if !package_path.exists() {
        return Err("包不存在".to_string());
    }
    
    std::fs::remove_dir_all(&package_path)
        .map_err(|e| format!("删除包失败: {}", e))
}

/// 获取缓存包数量统计（从存储目录读取）
#[tauri::command]
pub async fn get_cached_package_count() -> Result<usize, String> {
    let packages = get_packages_from_storage().await?;
    Ok(packages.len())
}

/// 获取私有包数量（从 API 读取）
#[tauri::command]
pub async fn get_package_count_from_api(port: u16) -> Result<usize, String> {
    let client = reqwest::Client::new();
    let url = format!("http://localhost:{}/-/verdaccio/data/packages", port);
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    if !response.status().is_success() {
        return Err("API 请求失败".to_string());
    }
    
    let api_packages: Vec<VerdaccioPackageResponse> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(api_packages.len())
}

/// 获取私有包名称列表（从 API 读取）
async fn get_private_package_names(port: u16) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("http://localhost:{}/-/verdaccio/data/packages", port);
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    if !response.status().is_success() {
        return Ok(vec![]);
    }
    
    let api_packages: Vec<VerdaccioPackageResponse> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(api_packages.into_iter().map(|p| p.name).collect())
}

/// 获取缓存包列表（存储目录中的包减去私有包）
#[tauri::command]
pub async fn get_cached_packages(port: u16) -> Result<Vec<PackageInfo>, String> {
    // 获取所有存储的包
    let all_packages = get_packages_from_storage().await?;
    
    // 获取私有包名称列表
    let private_names = get_private_package_names(port).await.unwrap_or_default();
    
    // 过滤出缓存包（不在私有包列表中的）
    let cached_packages: Vec<PackageInfo> = all_packages
        .into_iter()
        .filter(|p| !private_names.contains(&p.name))
        .collect();
    
    Ok(cached_packages)
}

/// 删除单个缓存包
#[tauri::command]
pub async fn delete_cached_package(package_name: String) -> Result<(), String> {
    delete_package(package_name).await
}

/// 删除所有缓存包
#[tauri::command]
pub async fn delete_all_cached_packages(port: u16, exclude_private: bool) -> Result<usize, String> {
    let packages_to_delete = if exclude_private {
        // 只删除缓存包（排除私有包）
        get_cached_packages(port).await?
    } else {
        // 删除所有包（包括私有包）
        get_packages_from_storage().await?
    };
    
    let mut deleted_count = 0;
    let mut errors = Vec::new();
    
    for pkg in &packages_to_delete {
        match delete_package(pkg.name.clone()).await {
            Ok(_) => deleted_count += 1,
            Err(e) => errors.push(format!("{}: {}", pkg.name, e)),
        }
    }
    
    if !errors.is_empty() && deleted_count == 0 {
        return Err(format!("删除失败: {}", errors.join(", ")));
    }
    
    Ok(deleted_count)
}
