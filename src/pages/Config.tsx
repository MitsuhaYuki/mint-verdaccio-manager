import { BookOutlined, EditOutlined, FileTextOutlined, ReloadOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons'
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
    <div className='flex h-full w-full flex-col overflow-auto p-4'>
      <div className='mb-4 flex shrink-0 items-center justify-between'>
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

      <Card className='shrink grow overflow-auto shadow-sm' classNames={{ body: 'h-full w-full pt-2' }}>
        <Tabs
          className='h-full w-full'
          classNames={{ content: 'h-full w-full overflow-auto' }}
          items={[
            {
              key: 'editor',
              label: (
                <span>
                  <EditOutlined /> 编辑器
                </span>
              ),
              children: (
                <div className='flex h-full w-full flex-col gap-4'>
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
                    className='mx-mono h-full text-xs'
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
                <div className='prose prose-sm dark:prose-invert h-full w-full max-w-none'>
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
            },
            {
              key: 'userguide',
              label: (
                <span>
                  <BookOutlined /> 使用说明
                </span>
              ),
              children: (
                <div className='prose prose-sm dark:prose-invert h-full w-full max-w-none'>
                  <Typography.Title level={4}>Verdaccio 使用说明</Typography.Title>

                  <Typography.Title level={5}>用户登录</Typography.Title>
                  <Typography.Paragraph>
                    使用<code>npm adduser --registry http://localhost:4873</code>进行注册并登录。<br />
                    如果你设置了<code>maxuser=-1</code>，则可以先在“用户管理”页面创建一个新用户，然后使用<code>npm login --registry http://localhost:4873</code>登录。<br />
                    输入命令之后，依据提示输入你的 Verdaccio 用户名、密码，如果为<code>adduser</code>则还需要输入邮箱地址。
                  </Typography.Paragraph>

                  <Typography.Title level={5}>发布配置</Typography.Title>
                  <Typography.Paragraph>
                    在你的<code>package.json</code>文件中，确保添加了以下字段以指定发布到 Verdaccio 服务器：
                    <pre>
                      &#123;
                      <br />
                      &nbsp; "name": "@your-scope/your-package",
                      <br />
                      &nbsp; "version": "1.0.0",
                      <br />
                      &nbsp; "publishConfig": &#123;
                      <br />
                      &nbsp;&nbsp;&nbsp; "registry": "http://your-verdaccio-server:4873"
                      <br />
                      &nbsp; &#125;,
                      <br />
                      &#125;
                    </pre>
                    这里，<code>@your-scope</code>是你在 Verdaccio 上配置的包作用域，确保它与你在 Verdaccio 配置中的访问控制相匹配。
                  </Typography.Paragraph>
                  <Typography.Paragraph>
                    如果你没有修改过默认配置，则此处没有设置作用域，而是限定了包名为<code>local-</code>开头的所有包在发布时变为私有包，不会被代理到上游仓库。
                  </Typography.Paragraph>

                  <Typography.Title level={5}>拉取配置</Typography.Title>
                  <Typography.Paragraph>
                    如果要使用 Verdaccio 作为你的默认 NPM 注册表，可以运行以下命令：
                    <pre>npm set registry http://localhost:4873</pre>
                    这样，所有的 NPM 包安装和发布操作都会默认使用 Verdaccio 服务器。同时此设置还会影响 PNPM 和 Yarn，因为它们也会读取 NPM 的配置。
                  </Typography.Paragraph>
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
