import { ClearOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAsyncEffect, useInterval, useMemoizedFn } from 'ahooks'
import { App, Button, Empty, Space, Spin, Tag, Typography } from 'antd'
import { type FC, useEffect, useRef, useState } from 'react'
import { clearVerdaccioLogs, getVerdaccioLogs } from '../lib/api'
import type { LogEntry } from '../types'

const getLevelColor = (level: string): string => {
  switch (level.toUpperCase()) {
    case 'ERROR':
      return 'red'
    case 'STDERR':
      return 'orange'
    case 'WARN':
    case 'WARNING':
      return 'gold'
    case 'INFO':
      return 'blue'
    case 'STDOUT':
      return 'green'
    default:
      return 'default'
  }
}

const Content: FC = () => {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)

  const refreshLogs = useMemoizedFn(async () => {
    try {
      const data = await getVerdaccioLogs()
      setLogs(data)
    } catch (e) {
      console.error('获取日志失败:', e)
    } finally {
      setLoading(false)
    }
  })

  const handleClear = useMemoizedFn(async () => {
    try {
      await clearVerdaccioLogs()
      setLogs([])
      message.success('日志已清除')
    } catch (e) {
      message.error(`清除日志失败: ${e}`)
    }
  })

  useAsyncEffect(async () => {
    await refreshLogs()
  }, [])

  // 定时刷新日志
  useInterval(() => {
    refreshLogs()
  }, 1000)

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [autoScroll])

  if (loading) {
    return (
      <div className='flex h-full w-full items-center justify-center'>
        <Spin size='large' />
      </div>
    )
  }

  return (
    <div className='flex h-full w-full flex-col p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <Typography.Title level={3} className='mb-0!'>
          服务器日志
        </Typography.Title>
        <Space>
          <Button type={autoScroll ? 'primary' : 'default'} onClick={() => setAutoScroll(!autoScroll)}>
            {autoScroll ? '自动滚动: 开' : '自动滚动: 关'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={refreshLogs}>
            刷新
          </Button>
          <Button icon={<ClearOutlined />} danger onClick={handleClear}>
            清除日志
          </Button>
        </Space>
      </div>

      <div
        ref={logContainerRef}
        className='flex-1 overflow-auto rounded-lg border border-neutral-200 bg-neutral-900 p-4 font-mono text-sm dark:border-neutral-700'
      >
        {logs.length === 0 ? (
          <Empty description='暂无日志' className='mt-20' />
        ) : (
          logs.map((log, index) => (
            <div key={index} className='mb-1 flex items-start gap-2 hover:bg-neutral-800'>
              <span className='shrink-0 text-neutral-500'>{log.timestamp}</span>
              <Tag color={getLevelColor(log.level)} className='shrink-0'>
                {log.level}
              </Tag>
              <span className='break-all text-neutral-100'>{log.message}</span>
            </div>
          ))
        )}
      </div>

      <div className='mt-2 text-right text-neutral-500 text-xs'>共 {logs.length} 条日志</div>
    </div>
  )
}

Content.displayName = 'Logs'
export { Content as Logs }
