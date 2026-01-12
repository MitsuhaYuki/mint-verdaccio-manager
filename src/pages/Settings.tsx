import { InfoCircleOutlined, SaveOutlined } from '@ant-design/icons'
import { getVersion } from '@tauri-apps/api/app'
import { useAsyncEffect, useMemoizedFn } from 'ahooks'
import { App, Button, Card, Descriptions, Divider, Form, InputNumber, Space, Spin, Switch, Tooltip, Typography } from 'antd'
import { type FC, useState } from 'react'
import { getAppSettings, getAutoStartStatus, saveAppSettings, setAutoStart } from '../lib/api'
import type { AppSettings } from '../types'

const Content: FC = () => {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<AppSettings>()
  const [appVersion, setAppVersion] = useState('')
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)

  const loadSettings = useMemoizedFn(async () => {
    setLoading(true)
    try {
      const settings = await getAppSettings()
      form.setFieldsValue(settings)

      const autoStart = await getAutoStartStatus()
      setAutoStartEnabled(autoStart)

      const version = await getVersion()
      setAppVersion(version)
    } catch (e) {
      console.error('加载设置失败:', e)
    } finally {
      setLoading(false)
    }
  })

  useAsyncEffect(async () => {
    await loadSettings()
  }, [])

  const handleSave = useMemoizedFn(async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      await saveAppSettings(values)

      // 单独处理开机自启
      if (values.auto_start !== autoStartEnabled) {
        await setAutoStart(values.auto_start)
        setAutoStartEnabled(values.auto_start)
      }

      message.success('设置已保存')
    } catch (e) {
      message.error(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  })

  if (loading) {
    return (
      <div className='flex h-full w-full items-center justify-center'>
        <Spin size='large' />
      </div>
    )
  }

  return (
    <div className='h-full w-full overflow-auto p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <Typography.Title level={3} className='mb-0!'>
          设置
        </Typography.Title>
        <Button type='primary' icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存设置
        </Button>
      </div>

      <div className='space-y-4'>
        <Card title='应用程序设置' className='shadow-sm' classNames={{ body: 'pb-0' }}>
          <Form
            form={form}
            labelCol={{ span: 4 }}
            initialValues={{ auto_start: false, minimize_to_tray: true, auto_start_verdaccio: false, default_port: 4873, allow_lan: false }}
          >
            <Form.Item
              name='auto_start'
              label={
                <Space>
                  开机自启动
                  <Tooltip title='启用后，此管理程序将在系统启动时自动运行'>
                    <InfoCircleOutlined className='text-neutral-400' />
                  </Tooltip>
                </Space>
              }
              valuePropName='checked'
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name='minimize_to_tray'
              label={
                <Space>
                  最小化到托盘
                  <Tooltip title='启用后，关闭窗口时程序将最小化到系统托盘而不是退出'>
                    <InfoCircleOutlined className='text-neutral-400' />
                  </Tooltip>
                </Space>
              }
              valuePropName='checked'
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name='auto_start_verdaccio'
              label={
                <Space>
                  自动启动 Verdaccio
                  <Tooltip title='启用后，打开管理程序时将自动启动 Verdaccio 服务'>
                    <InfoCircleOutlined className='text-neutral-400' />
                  </Tooltip>
                </Space>
              }
              valuePropName='checked'
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name='default_port'
              label={
                <Space>
                  服务端口
                  <Tooltip title='Verdaccio 服务监听的端口号，修改后需重启 Verdaccio 服务才能生效'>
                    <InfoCircleOutlined className='text-neutral-400' />
                  </Tooltip>
                </Space>
              }
            >
              <InputNumber min={1024} max={65535} className='w-32' />
            </Form.Item>

            <Form.Item
              name='allow_lan'
              label={
                <Space>
                  局域网访问
                  <Tooltip title='启用后，局域网内的其他设备可以访问 Verdaccio 服务；修改后需重启 Verdaccio 服务才能生效'>
                    <InfoCircleOutlined className='text-neutral-400' />
                  </Tooltip>
                </Space>
              }
              valuePropName='checked'
            >
              <Switch />
            </Form.Item>
          </Form>
        </Card>

        <Card title='关于' className='shadow-sm'>
          <Descriptions column={1}>
            <Descriptions.Item label='应用名称'>Verdaccio 服务器管理</Descriptions.Item>
            <Descriptions.Item label='版本'>v{appVersion}</Descriptions.Item>
            <Descriptions.Item label='技术栈'>Tauri + React + TypeScript</Descriptions.Item>
          </Descriptions>

          <Divider />

          <Typography.Paragraph type='secondary' className='text-sm'>
            此程序用于管理本地 Verdaccio NPM 私有仓库服务器。
          </Typography.Paragraph>

          <Typography.Paragraph type='secondary' className='text-sm'>
            Verdaccio 是一个轻量级的 NPM 私有代理仓库，支持私有包发布和 NPM 包代理缓存功能。
          </Typography.Paragraph>

          <Space className='mt-4'>
            <Button type='link' onClick={() => window.open('https://github.com/MitsuhaYuki/mint-verdaccio-manager', '_blank')} className='p-0'>
              此程序
            </Button>
            <Button type='link' onClick={() => window.open('https://verdaccio.org/', '_blank')} className='p-0'>
              Verdaccio 官网
            </Button>
            <Button type='link' onClick={() => window.open('https://github.com/verdaccio/verdaccio', '_blank')} className='p-0'>
              GitHub
            </Button>
          </Space>
        </Card>
      </div>
    </div>
  )
}

Content.displayName = 'Settings'
export { Content as Settings }
