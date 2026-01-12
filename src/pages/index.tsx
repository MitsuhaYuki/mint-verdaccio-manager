import {
  AppstoreOutlined,
  DashboardOutlined,
  FileTextOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ToolOutlined,
  UserOutlined
} from '@ant-design/icons'
import { getVersion } from '@tauri-apps/api/app'
import { useAsyncEffect } from 'ahooks'
import { Button, Layout, Menu, type MenuProps } from 'antd'
import { type FC, useMemo, useRef, useState } from 'react'
import { getAppSettings, getVerdaccioStatus, startVerdaccio, syncTrayStatus } from '../lib/api'
import { MenuKey } from '../types/enum'
import { Config } from './Config'
import { Dashboard } from './Dashboard'
import { Logs } from './Logs'
import { Packages } from './Packages'
import { Settings } from './Settings'
import { Users } from './Users'

type MenuItem = Required<MenuProps>['items'][number]

const Content: FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedKey, setSelectedKey] = useState(MenuKey.Dashboard)
  const [version, setVersion] = useState<string>('')
  const initRef = useRef(false)

  useAsyncEffect(async () => {
    // 获取版本号
    const v = await getVersion()
    setVersion(`v${v}`)

    // 防止重复初始化
    if (initRef.current) return
    initRef.current = true

    // 检查是否需要自动启动 Verdaccio
    try {
      const settings = await getAppSettings()
      if (settings.auto_start_verdaccio) {
        // 先检查 Verdaccio 是否已经在运行
        const status = await getVerdaccioStatus()
        if (!status.running) {
          // 自动启动 Verdaccio（使用设置中的端口和局域网配置）
          const result = await startVerdaccio(settings.default_port, settings.allow_lan)
          await syncTrayStatus(result.running)
          console.log('自动启动 Verdaccio 成功')
        }
      }
    } catch (e) {
      console.error('自动启动 Verdaccio 失败:', e)
    }
  }, [])

  const items: MenuItem[] = useMemo(() => {
    const menu: MenuItem[] = [
      {
        key: MenuKey.Dashboard,
        label: '管理主页',
        icon: <DashboardOutlined />
      },
      {
        key: MenuKey.Packages,
        label: '私有包管理',
        icon: <AppstoreOutlined />
      },
      {
        key: MenuKey.Users,
        label: '用户管理',
        icon: <UserOutlined />
      },
      {
        key: MenuKey.Logs,
        label: '服务器日志',
        icon: <FileTextOutlined />
      },
      { type: 'divider' },
      {
        key: MenuKey.Config,
        label: '服务器配置',
        icon: <ToolOutlined />
      },
      {
        key: MenuKey.Settings,
        label: '设置',
        icon: <SettingOutlined />
      }
    ]

    return menu
  }, [])

  const titleRender = useMemo(() => {
    switch (selectedKey) {
      case MenuKey.Dashboard:
        return '管理主页'
      case MenuKey.Packages:
        return '私有包管理'
      case MenuKey.Users:
        return '用户管理'
      case MenuKey.Logs:
        return '服务器日志'
      case MenuKey.Config:
        return '服务器配置'
      case MenuKey.Settings:
        return '设置'
      default:
        return 'Unknown'
    }
  }, [selectedKey])

  const contentRender = useMemo(() => {
    switch (selectedKey) {
      case MenuKey.Dashboard:
        return <Dashboard />
      case MenuKey.Packages:
        return <Packages />
      case MenuKey.Users:
        return <Users />
      case MenuKey.Logs:
        return <Logs />
      case MenuKey.Config:
        return <Config />
      case MenuKey.Settings:
        return <Settings />
      default:
        return <div className='flex h-full w-full items-center justify-center'>Incorrect Page Indexed</div>
    }
  }, [selectedKey])

  return (
    <Layout className='h-full w-full overflow-auto'>
      <Layout.Sider trigger={null} collapsible collapsed={collapsed} collapsedWidth={48} className='bg-neutral-100 dark:bg-neutral-900'>
        <div className='flex h-full flex-col'>
          <Menu
            items={items}
            mode='inline'
            selectedKeys={[selectedKey]}
            onClick={({ key }) => setSelectedKey(key as unknown as MenuKey)}
            classNames={{
              root: 'grow bg-transparent',
              itemContent: 'select-none'
            }}
            styles={{
              item: { paddingLeft: '12px' }
            }}
          />
          <div className='mx-mono shrink-0 grow-0 border-(--ant-color-split) border-r p-2 text-neutral-600'>{version}</div>
        </div>
      </Layout.Sider>
      <Layout>
        <Layout.Header className='flex h-12 items-center justify-between bg-neutral-100 px-2 dark:bg-neutral-900'>
          <Button
            type='text'
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className='h-8 w-8 text-base text-neutral-700 dark:text-neutral-300'
          />
          <span className='cursor-default select-none pr-4 text-neutral-700 dark:text-neutral-300'>{titleRender}</span>
        </Layout.Header>
        <Layout.Content className='overflow-auto'>{contentRender}</Layout.Content>
      </Layout>
    </Layout>
  )
}

Content.displayName = 'Entrance'
export { Content as Entrance }
