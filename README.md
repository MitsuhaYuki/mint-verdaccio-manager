## Verdaccio Server Manager

适用于 Windows 平台的 Verdaccio 服务器管理程序

![dashboard](docs/imgs/dashboard.png)

> Collaborate with AI.

### 功能

- 集成 Verdaccio，开箱即用
- 内置包管理，方便快速管理服务器上有缓存包与私有包
- 内置用户管理，快捷改密
- 内置服务器配置文件编辑，提供常用文档
- 自定义 Verdaccio 端口、可选开放局域网访问
- 添加一个任务栏图标来快速查看服务启动状态
- 支持开机自启、服务自启
- 自动暗色主题

### 如何使用

从 release 页面下载打包好的exe，双击安装即可。

当首次启动 Verdaccio 服务时，默认不允许局域网访问。你可以在设置中开启局域网访问：

![firewall_1](docs/imgs/firewall1.png)

当开启局域网访问后，需要重启服务才能生效。重启服务后当出现如下授权时，**请务必选择“允许”**！

![firewall_2](docs/imgs/firewall2.png)

### 二次开发

此程序使用 Tauri + React + Typescript 开发。

```shell
# fork & clone 仓库到本地

# 安装所有依赖
pnpm install
# 初始化vardaccio运行环境
pnpm prepare:runtime
# 运行开发预览服务
pnpm tauri dev

# 构建与分发
pnpm tauri build
# 构建产物位于 src-tauri/target/release/bundle 目录下
```

### 相关信息

- [Verdaccio](https://github.com/verdaccio/verdaccio)
- [Tauri](https://github.com/tauri-apps/tauri)
