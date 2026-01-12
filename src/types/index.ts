// Verdaccio 服务状态
export interface VerdaccioStatus {
  running: boolean
  port: number
  pid: number | null
  storage_path: string
  config_path: string
}

// 日志条目
export interface LogEntry {
  timestamp: string
  level: string
  message: string
}

// 私有包信息
export interface PackageInfo {
  name: string
  version: string
  description: string | null
  author: string | null
  license: string | null
  versions: string[]
  created: string | null
  modified: string | null
}

// 应用设置
export interface AppSettings {
  auto_start: boolean
  minimize_to_tray: boolean
  auto_start_verdaccio: boolean
  default_port: number
  allow_lan: boolean
}

// 用户信息
export interface UserInfo {
  username: string
  created: string | null
}
