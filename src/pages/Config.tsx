import { EditOutlined, FileTextOutlined, ReloadOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons'
import { useAsyncEffect, useMemoizedFn } from 'ahooks'
import { App, Button, Card, Input, Space, Spin, Tabs, Typography } from 'antd'
import { type FC, useState } from 'react'
import { getConfigFilePath, getVerdaccioConfig, resetConfigToDefault, saveVerdaccioConfig } from '../lib/api'

const Content: FC = () => {
  const { message, modal } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState('')
  const [originalConfig, setOriginalConfig] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [hasChanges, setHasChanges] = useState(false)

  const loadConfig = useMemoizedFn(async () => {
    setLoading(true)
    try {
      const cfg = await getVerdaccioConfig()
      setConfig(cfg)
      setOriginalConfig(cfg)
      setHasChanges(false)

      const path = await getConfigFilePath()
      setConfigPath(path)
    } catch (e) {
      message.error(`加载配置失败: ${e}`)
    } finally {
      setLoading(false)
    }
  })

  useAsyncEffect(async () => {
    await loadConfig()
  }, [])

  const handleConfigChange = useMemoizedFn((value: string) => {
    setConfig(value)
    setHasChanges(value !== originalConfig)
  })

  const handleSave = useMemoizedFn(async () => {
    setSaving(true)
    try {
      await saveVerdaccioConfig(config)
      setOriginalConfig(config)
      setHasChanges(false)
      message.success('配置已保存')
    } catch (e) {
      message.error(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  })

  const handleReset = useMemoizedFn(() => {
    modal.confirm({
      title: '确认重置',
      content: '确定要重置为默认配置吗？此操作将覆盖当前配置文件。',
      okText: '重置',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await resetConfigToDefault()
          await loadConfig()
          message.success('已重置为默认配置')
        } catch (e) {
          message.error(`重置失败: ${e}`)
        }
      }
    })
  })

  const handleRevert = useMemoizedFn(() => {
    setConfig(originalConfig)
    setHasChanges(false)
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
          服务器配置
        </Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadConfig}>
            刷新
          </Button>
          <Button icon={<UndoOutlined />} onClick={handleRevert} disabled={!hasChanges}>
            撤销更改
          </Button>
          <Button danger icon={<UndoOutlined />} onClick={handleReset}>
            重置默认
          </Button>
          <Button type='primary' icon={<SaveOutlined />} onClick={handleSave} loading={saving} disabled={!hasChanges}>
            保存配置
          </Button>
        </Space>
      </div>

      <Card className='shadow-sm'>
        <Tabs
          items={[
            {
              key: 'editor',
              label: (
                <span>
                  <EditOutlined /> 编辑器
                </span>
              ),
              children: (
                <div className='flex flex-col gap-4'>
                  <div className='flex items-center gap-2'>
                    <FileTextOutlined />
                    <Typography.Text type='secondary'>配置文件路径:</Typography.Text>
                    <Typography.Text copyable className='text-xs'>
                      {configPath}
                    </Typography.Text>
                    {hasChanges && (
                      <Typography.Text type='warning' className='ml-2'>
                        (有未保存的更改)
                      </Typography.Text>
                    )}
                  </div>
                  <Input.TextArea
                    value={config}
                    onChange={e => handleConfigChange(e.target.value)}
                    autoSize={{ minRows: 20, maxRows: 30 }}
                    className='mx-mono text-xs'
                    placeholder='Verdaccio 配置内容...'
                  />
                </div>
              )
            },
            {
              key: 'help',
              label: (
                <span>
                  <FileTextOutlined /> 配置说明
                </span>
              ),
              children: (
                <div className='prose prose-sm dark:prose-invert max-w-none'>
                  <Typography.Title level={4}>Verdaccio 配置说明</Typography.Title>

                  <Typography.Title level={5}>存储配置</Typography.Title>
                  <Typography.Paragraph>
                    <code>storage</code>: 指定包存储目录的路径，可以是相对路径或绝对路径。
                  </Typography.Paragraph>

                  <Typography.Title level={5}>认证配置</Typography.Title>
                  <Typography.Paragraph>
                    <code>auth.htpasswd</code>: 使用 htpasswd 文件进行用户认证。
                    <br />
                    <code>max_users: 10</code>: 用户数量；设置为 -1 时禁止注册新用户。
                  </Typography.Paragraph>

                  <Typography.Title level={5}>上游仓库配置</Typography.Title>
                  <Typography.Paragraph>
                    <code>uplinks</code>: 配置上游 NPM 仓库。当本地没有找到包时，会从上游仓库获取。
                    <br />
                    <code>cache: true</code>: 启用缓存，减少对上游仓库的请求。
                  </Typography.Paragraph>

                  <Typography.Title level={5}>包访问控制</Typography.Title>
                  <Typography.Paragraph>
                    <code>packages</code>: 配置包的访问、发布和代理规则。
                    <br />
                    <code>access</code>: 谁可以访问包（$all 表示所有人）
                    <br />
                    <code>publish</code>: 谁可以发布包（$authenticated 表示已认证用户）
                    <br />
                    <code>proxy</code>: 指定从哪个上游仓库代理
                  </Typography.Paragraph>

                  <Typography.Paragraph>
                    <Typography.Text>
                      如果你要发布私有包，对应包名的访问控制下不能配置<code>proxy</code>字段，同时发布包时需要通过<code>npm adduser</code>进行登录认证。
                    </Typography.Text>
                    <Typography.Paragraph className='flex gap-4'>
                      <Typography.Link href='https://www.verdaccio.org/docs/cli-registry' target='_blank'>
                        使用私有仓库
                      </Typography.Link>

                      <Typography.Link href='https://www.verdaccio.org/docs/packages' target='_blank'>
                        包访问控制配置
                      </Typography.Link>
                    </Typography.Paragraph>
                  </Typography.Paragraph>

                  <Typography.Title level={5}>日志配置</Typography.Title>
                  <Typography.Paragraph>
                    <code>log</code>: 配置日志输出。
                    <br />
                    <code>level</code>: 日志级别，可选 trace, debug, info, http, warn, error, fatal
                  </Typography.Paragraph>

                  <Typography.Link href='https://verdaccio.org/docs/configuration' target='_blank'>
                    查看完整配置文档 →
                  </Typography.Link>
                </div>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

Content.displayName = 'Config'
export { Content as Config }
