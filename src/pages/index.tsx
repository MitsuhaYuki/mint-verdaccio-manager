import {
  AppstoreOutlined,
  CloudDownloadOutlined,
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
import { type FC, useMemo, useState } from 'react'
import { MenuKey } from '../types/enum'
import { CachedPackages } from './CachedPackages'
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

  useAsyncEffect(async () => {
    // 获取版本号
    const v = await getVersion()
    setVersion(`v${v}`)
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
        key: MenuKey.CachedPackages,
        label: '缓存包管理',
        icon: <CloudDownloadOutlined />
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
      case MenuKey.CachedPackages:
        return '缓存包管理'
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
      case MenuKey.CachedPackages:
        return <CachedPackages />
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
