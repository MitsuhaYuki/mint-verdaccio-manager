import { invoke } from '@tauri-apps/api/core'
import type { AppSettings, LogEntry, PackageInfo, PackageType, PaginatedResult, UserInfo, VerdaccioStatus } from '../types'

// Verdaccio 服务相关
export async function startVerdaccio(port: number, allowLan: boolean): Promise<VerdaccioStatus> {
  return invoke('start_verdaccio', { port, allowLan })
}

export async function stopVerdaccio(): Promise<void> {
  return invoke('stop_verdaccio')
}

export async function getVerdaccioStatus(): Promise<VerdaccioStatus> {
  return invoke('get_verdaccio_status')
}

export async function checkVerdaccioInstalled(): Promise<boolean> {
  return invoke('check_verdaccio_installed')
}

export async function getVerdaccioVersion(): Promise<string> {
  return invoke('get_verdaccio_version')
}

// 日志相关
export async function getVerdaccioLogs(): Promise<LogEntry[]> {
  return invoke('get_verdaccio_logs')
}

export async function clearVerdaccioLogs(): Promise<void> {
  return invoke('clear_verdaccio_logs')
}

// 配置相关
export async function getVerdaccioConfig(): Promise<string> {
  return invoke('get_verdaccio_config')
}

export async function saveVerdaccioConfig(config: string): Promise<void> {
  return invoke('save_verdaccio_config', { config })
}

export async function getConfigFilePath(): Promise<string> {
  return invoke('get_config_file_path')
}

export async function resetConfigToDefault(): Promise<void> {
  return invoke('reset_config_to_default')
}

// 包管理相关
export async function getPackages(
  port: number,
  packageType: PackageType,
  page: number,
  pageSize: number
): Promise<PaginatedResult<PackageInfo>> {
  return invoke('get_packages', { port, packageType, page, pageSize })
}

export async function getPackageCount(port: number, packageType: PackageType): Promise<number> {
  return invoke('get_package_count', { port, packageType })
}

export async function deletePackage(packageName: string): Promise<void> {
  return invoke('delete_package', { packageName })
}

export async function deletePackages(port: number, packageType: PackageType): Promise<number> {
  return invoke('delete_packages', { port, packageType })
}

// 设置相关
export async function getAppSettings(): Promise<AppSettings> {
  return invoke('get_app_settings')
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  return invoke('save_app_settings', { settings })
}

export async function setAutoStart(enable: boolean): Promise<void> {
  return invoke('set_auto_start', { enable })
}

export async function getAutoStartStatus(): Promise<boolean> {
  return invoke('get_auto_start_status')
}

// 托盘相关
export async function syncTrayStatus(running: boolean): Promise<void> {
  return invoke('sync_tray_status', { running })
}

// 用户管理相关
export async function getUsers(): Promise<UserInfo[]> {
  return invoke('get_users')
}

export async function addUser(username: string, password: string): Promise<void> {
  return invoke('add_user', { username, password })
}

export async function deleteUser(username: string): Promise<void> {
  return invoke('delete_user', { username })
}

export async function changeUserPassword(username: string, newPassword: string): Promise<void> {
  return invoke('change_user_password', { username, newPassword })
}

export async function getUserCount(): Promise<number> {
  return invoke('get_user_count')
}
