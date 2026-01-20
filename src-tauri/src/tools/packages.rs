use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 包类型过滤
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PackageType {
    /// 私有包（通过 API 发布的包）
    Private,
    /// 缓存包（从上游代理的包）
    Cached,
    /// 所有包
    All,
}

/// 分页结果
#[derive(Debug, Clone, Serialize)]
pub struct PaginatedResult<T> {
    pub items: Vec<T>,
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
}

/// 包信息（前端使用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageInfo {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub versions: Vec<String>,
    pub keywords: Vec<String>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// Verdaccio API 返回的包信息（用于获取私有包名称列表）
#[derive(Debug, Clone, Deserialize)]
struct VerdaccioPackageResponse {
    name: String,
}

/// 获取存储目录
fn get_storage_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".verdaccio").join("storage")
}

/// 判断目录是否为有效的包目录（包含 package.json）
fn is_valid_package_dir(path: &PathBuf) -> bool {
    path.is_dir() && path.join("package.json").exists()
}

/// 遍历存储目录，收集所有包目录及其名称（已排序）
fn collect_package_dirs(storage_path: &PathBuf) -> Result<Vec<(PathBuf, String)>, String> {
    if !storage_path.exists() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    let entries = std::fs::read_dir(storage_path)
        .map_err(|e| format!("读取存储目录失败: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // 跳过隐藏目录（非 scoped 包）
        if name.starts_with('.') && !name.starts_with('@') {
            continue;
        }

        // 处理 scoped 包 (@scope/package)
        if name.starts_with('@') {
            if let Ok(scoped_entries) = std::fs::read_dir(&path) {
                for scoped_entry in scoped_entries.flatten() {
                    let scoped_path = scoped_entry.path();
                    if is_valid_package_dir(&scoped_path) {
                        let scoped_name = scoped_entry.file_name().to_string_lossy().to_string();
                        let full_name = format!("{}/{}", name, scoped_name);
                        result.push((scoped_path, full_name));
                    }
                }
            }
            continue;
        }

        // 处理普通包
        if is_valid_package_dir(&path) {
            result.push((path, name));
        }
    }

    // 自然排序（按名称升序）
    result.sort_by(|a, b| a.1.to_lowercase().cmp(&b.1.to_lowercase()));

    Ok(result)
}

/// 获取私有包名称列表（从 Verdaccio API 读取）
async fn get_private_package_names(port: u16) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

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

/// 根据包类型过滤包名称列表
async fn filter_package_names_by_type(
    all_names: Vec<String>,
    package_type: PackageType,
    port: u16,
) -> Result<Vec<String>, String> {
    match package_type {
        PackageType::All => Ok(all_names),
        PackageType::Private => {
            let private_names = get_private_package_names(port).await?;
            Ok(all_names
                .into_iter()
                .filter(|name| private_names.contains(name))
                .collect())
        }
        PackageType::Cached => {
            let private_names = get_private_package_names(port).await?;
            Ok(all_names
                .into_iter()
                .filter(|name| !private_names.contains(name))
                .collect())
        }
    }
}

/// 从 package.json 读取包详情
fn read_package_info(path: &PathBuf, name: &str) -> Option<PackageInfo> {
    let package_json_path = path.join("package.json");

    if !package_json_path.exists() {
        return None;
    }

    let content = std::fs::read_to_string(&package_json_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;

    // 获取版本列表
    let versions: Vec<String> = if let Some(versions_obj) = json.get("versions").and_then(|v| v.as_object()) {
        let mut v: Vec<String> = versions_obj.keys().cloned().collect();
        v.sort_by(|a, b| version_compare(b, a)); // 降序排列
        v
    } else {
        vec![]
    };

    // 获取最新版本
    let latest = json
        .get("dist-tags")
        .and_then(|dt| dt.get("latest"))
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0");

    // 获取最新版本的详细信息
    let latest_info = json
        .get("versions")
        .and_then(|v| v.get(latest));

    // 解析 author 字段（可能是字符串或对象）
    let author = latest_info
        .and_then(|info| info.get("author"))
        .and_then(|a| parse_author(a))
        .or_else(|| json.get("author").and_then(|a| parse_author(a)));

    // 获取 keywords
    let keywords: Vec<String> = latest_info
        .and_then(|info| info.get("keywords"))
        .and_then(|k| k.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    // 获取 homepage
    let homepage = latest_info
        .and_then(|info| info.get("homepage"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // 获取 repository
    let repository = latest_info
        .and_then(|info| info.get("repository"))
        .and_then(|r| parse_repository(r));

    // 获取 description
    let description = latest_info
        .and_then(|info| info.get("description"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            json.get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    // 获取 license
    let license = latest_info
        .and_then(|info| info.get("license"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            json.get("license")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    Some(PackageInfo {
        name: name.to_string(),
        version: latest.to_string(),
        description,
        author,
        license,
        versions,
        keywords,
        homepage,
        repository,
        created: json
            .get("time")
            .and_then(|t| t.get("created"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        modified: json
            .get("time")
            .and_then(|t| t.get("modified"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

/// 解析 author 字段
fn parse_author(value: &serde_json::Value) -> Option<String> {
    if let Some(s) = value.as_str() {
        Some(s.to_string())
    } else if let Some(obj) = value.as_object() {
        obj.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())
    } else {
        None
    }
}

/// 解析 repository 字段
fn parse_repository(value: &serde_json::Value) -> Option<String> {
    if let Some(s) = value.as_str() {
        Some(s.to_string())
    } else if let Some(obj) = value.as_object() {
        obj.get("url").and_then(|u| u.as_str()).map(|s| s.to_string())
    } else {
        None
    }
}

/// 简单的版本比较（用于排序）
fn version_compare(a: &str, b: &str) -> std::cmp::Ordering {
    let parse_version = |v: &str| -> Vec<u32> {
        v.split(|c: char| !c.is_ascii_digit())
            .filter_map(|s| s.parse().ok())
            .collect()
    };
    let va = parse_version(a);
    let vb = parse_version(b);
    va.cmp(&vb)
}

/// 根据包名获取包路径
fn get_package_path(storage_path: &PathBuf, package_name: &str) -> PathBuf {
    if package_name.starts_with('@') {
        let parts: Vec<&str> = package_name.splitn(2, '/').collect();
        if parts.len() == 2 {
            storage_path.join(parts[0]).join(parts[1])
        } else {
            storage_path.join(package_name)
        }
    } else {
        storage_path.join(package_name)
    }
}

// ============= Tauri 命令 =============

/// 获取包列表（分页）
#[tauri::command]
pub async fn get_packages(
    port: u16,
    package_type: PackageType,
    page: usize,
    page_size: usize,
) -> Result<PaginatedResult<PackageInfo>, String> {
    let storage_path = get_storage_path();
    let all_dirs = collect_package_dirs(&storage_path)?;

    // 获取所有包名
    let all_names: Vec<String> = all_dirs.iter().map(|(_, name)| name.clone()).collect();

    // 根据类型过滤
    let filtered_names = filter_package_names_by_type(all_names, package_type, port).await?;

    let total = filtered_names.len();
    let total_pages = if total == 0 {
        0
    } else {
        (total + page_size - 1) / page_size
    };

    // 计算分页范围
    let start = (page.saturating_sub(1)) * page_size;
    let end = (start + page_size).min(total);

    // 只获取当前页的包名
    let page_names: Vec<String> = filtered_names
        .into_iter()
        .skip(start)
        .take(end - start)
        .collect();

    // 构建名称到路径的映射
    let name_to_path: std::collections::HashMap<String, PathBuf> = all_dirs
        .into_iter()
        .map(|(path, name)| (name, path))
        .collect();

    // 读取当前页的包详情
    let items: Vec<PackageInfo> = page_names
        .into_iter()
        .filter_map(|name| {
            name_to_path
                .get(&name)
                .and_then(|path| read_package_info(path, &name))
        })
        .collect();

    Ok(PaginatedResult {
        items,
        total,
        page,
        page_size,
        total_pages,
    })
}

/// 获取包数量
#[tauri::command]
pub async fn get_package_count(port: u16, package_type: PackageType) -> Result<usize, String> {
    let storage_path = get_storage_path();
    let all_dirs = collect_package_dirs(&storage_path)?;

    let all_names: Vec<String> = all_dirs.into_iter().map(|(_, name)| name).collect();
    let filtered_names = filter_package_names_by_type(all_names, package_type, port).await?;

    Ok(filtered_names.len())
}

/// 删除包
#[tauri::command]
pub async fn delete_package(package_name: String) -> Result<(), String> {
    let storage_path = get_storage_path();
    let package_path = get_package_path(&storage_path, &package_name);

    if !package_path.exists() {
        return Err("包不存在".to_string());
    }

    std::fs::remove_dir_all(&package_path).map_err(|e| format!("删除包失败: {}", e))
}

/// 批量删除包
#[tauri::command]
pub async fn delete_packages(port: u16, package_type: PackageType) -> Result<usize, String> {
    let storage_path = get_storage_path();
    let all_dirs = collect_package_dirs(&storage_path)?;

    let all_names: Vec<String> = all_dirs.into_iter().map(|(_, name)| name).collect();
    let names_to_delete = filter_package_names_by_type(all_names, package_type, port).await?;

    let mut deleted_count = 0;
    let mut errors = Vec::new();

    for name in &names_to_delete {
        let package_path = get_package_path(&storage_path, name);
        match std::fs::remove_dir_all(&package_path) {
            Ok(_) => deleted_count += 1,
            Err(e) => errors.push(format!("{}: {}", name, e)),
        }
    }

    if !errors.is_empty() && deleted_count == 0 {
        return Err(format!("删除失败: {}", errors.join(", ")));
    }

    Ok(deleted_count)
}
