import { CheckCircleOutlined, CloseCircleOutlined, PlayCircleOutlined, PoweroffOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAsyncEffect, useInterval, useMemoizedFn } from 'ahooks'
import { App, Button, Card, Descriptions, Spin, Statistic, Tag, Typography } from 'antd'
import { type FC, useState } from 'react'
import { getAppSettings, getCachedPackageCount, getPackageCountFromApi, getVerdaccioStatus, getVerdaccioVersion, startVerdaccio, stopVerdaccio, syncTrayStatus } from '../lib/api'
import type { VerdaccioStatus } from '../types'

const defaultDescStyle = { content: 'items-center' }

const Content: FC = () => {
  const { message, modal } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [status, setStatus] = useState<VerdaccioStatus | null>(null)
  const [version, setVersion] = useState<string>('')
  const [packageCount, setPackageCount] = useState(0)
  const [cachedPackageCount, setCachedPackageCount] = useState(0)
  const [port, setPort] = useState(4873)
  const [allowLan, setAllowLan] = useState(false)

  const refreshStatus = useMemoizedFn(async () => {
    try {
      const ver = await getVerdaccioVersion()
      setVersion(ver)

      const st = await getVerdaccioStatus()
      setStatus(st)

      // 加载设置中的配置
      const settings = await getAppSettings()
      setAllowLan(settings.allow_lan)
      // 如果服务运行中，使用当前运行端口；否则使用设置中的端口
      if (st.running) {
        setPort(st.port)
      } else {
        setPort(settings.default_port)
      }

      // 同步托盘状态
      await syncTrayStatus(st.running)

      // 获取缓存包数量（始终可用）
      const cached = await getCachedPackageCount()
      setCachedPackageCount(cached)

      // 从 API 获取私有包数量（仅服务运行时）
      if (st.running) {
        const count = await getPackageCountFromApi(st.port)
        setPackageCount(count)
      }
    } catch (e) {
      console.error('获取状态失败:', e)
    } finally {
      setLoading(false)
    }
  })

  useAsyncEffect(async () => {
    await refreshStatus()
  }, [])

  // 定时刷新状态
  useInterval(() => {
    if (!actionLoading) {
      refreshStatus()
    }
  }, 5000)

  const handleStart = useMemoizedFn(async () => {
    setActionLoading(true)
    try {
      await startVerdaccio(port, allowLan)
      message.success('Verdaccio 已启动')
      await refreshStatus()
    } catch (e) {
      message.error(`启动失败: ${e}`)
    } finally {
      setActionLoading(false)
    }
  })

  const handleStop = useMemoizedFn(async () => {
    modal.confirm({
      title: '确认停止',
      content: '确定要停止 Verdaccio 服务吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        setActionLoading(true)
        try {
          await stopVerdaccio()
          message.success('Verdaccio 已停止')
          await refreshStatus()
        } catch (e) {
          message.error(`停止失败: ${e}`)
        } finally {
          setActionLoading(false)
        }
      }
    })
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
          管理主页
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={refreshStatus} disabled={actionLoading}>
          刷新状态
        </Button>
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        {/* 服务状态卡片 */}
        <Card title='服务状态' className='shadow-sm'>
          <div className='mb-4 flex items-center gap-2'>
            {status?.running ? (
              <Tag icon={<CheckCircleOutlined />} color='success' className='text-base'>
                运行中
              </Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color='error' className='text-base'>
                已停止
              </Tag>
            )}
            <Typography.Text type='secondary'>Verdaccio {version}</Typography.Text>
          </div>

          <Descriptions column={1} size='small'>
            <Descriptions.Item classNames={defaultDescStyle} label='端口号'>
              {port}
            </Descriptions.Item>
            <Descriptions.Item classNames={defaultDescStyle} label='进程 PID'>
              {status?.pid ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item classNames={defaultDescStyle} label='存储目录'>
              <Typography.Text copyable className='break-all text-xs'>
                {status?.storage_path}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item classNames={defaultDescStyle} label='配置文件'>
              <Typography.Text copyable className='break-all text-xs'>
                {status?.config_path}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>

          <div className='mt-4 flex gap-2'>
            {status?.running ? (
              <Button type='primary' danger icon={<PoweroffOutlined />} loading={actionLoading} onClick={handleStop}>
                停止服务
              </Button>
            ) : (
              <Button type='primary' icon={<PlayCircleOutlined />} loading={actionLoading} onClick={handleStart}>
                启动服务
              </Button>
            )}
          </div>
        </Card>

        {/* 统计信息卡片 */}
        <Card title='统计信息' className='shadow-sm'>
          <div className='grid grid-cols-3 gap-4'>
            <Statistic title='私有包数量' value={status?.running ? packageCount : '?'} styles={{ content: { color: status?.running ? undefined : '#999' } }} />
            <Statistic title='缓存包数量' value={cachedPackageCount} />
            <Statistic title='服务状态' value={status?.running ? '在线' : '离线'} styles={{ content: { color: status?.running ? '#52c41a' : '#ff4d4f' } }} />
          </div>

          {status?.running && (
            <div className='mt-4 flex flex-col gap-2'>
              <div>
                <Typography.Text type='secondary'>访问地址: </Typography.Text>
                <Typography.Link href={`http://localhost:${port}`} target='_blank' copyable>
                  http://localhost:{port}
                </Typography.Link>
              </div>
              {allowLan && (
                <div>
                  <CheckCircleOutlined className='text-neutral-500' />{' '}
                  <Typography.Text type='secondary'>局域网访问已启用，其他设备可通过本机局域网 IP 访问该地址</Typography.Text>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 快速操作卡片 */}
        <Card title='快速操作' className='shadow-sm lg:col-span-2'>
          <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
            <Button
              block
              onClick={() => {
                navigator.clipboard.writeText(`npm set registry http://localhost:${port}`)
                message.success('已复制到剪贴板')
              }}
            >
              复制 npm registry 设置命令
            </Button>
            <Button
              block
              onClick={() => {
                navigator.clipboard.writeText(`pnpm set registry http://localhost:${port}`)
                message.success('已复制到剪贴板')
              }}
            >
              复制 pnpm registry 设置命令
            </Button>
            <Button
              block
              onClick={() => {
                navigator.clipboard.writeText(`yarn config set registry http://localhost:${port}`)
                message.success('已复制到剪贴板')
              }}
            >
              复制 yarn registry 设置命令
            </Button>
            {/* <Button
              block
              href='https://yarnpkg.com/configuration/cli'
              target='_blank'
            >
              复制 yarn registry 设置命令
            </Button> */}
          </div>
        </Card>
      </div>
    </div>
  )
}

Content.displayName = 'Dashboard'
export { Content as Dashboard }
