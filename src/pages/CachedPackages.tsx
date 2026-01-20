import { ClearOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useAsyncEffect, useMemoizedFn } from 'ahooks'
import { App, Button, Card, Descriptions, Dropdown, Empty, Input, Modal, Space, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { type FC, useState } from 'react'
import { deletePackage, deletePackages, getPackages, getVerdaccioStatus } from '../lib/api'
import type { PackageInfo, VerdaccioStatus } from '../types'

const Content: FC = () => {
  const { message, modal } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [status, setStatus] = useState<VerdaccioStatus | null>(null)
  const [searchText, setSearchText] = useState('')
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null)
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)

  const loadPackages = useMemoizedFn(async (currentPage = page, currentPageSize = pageSize) => {
    setLoading(true)
    try {
      const st = await getVerdaccioStatus()
      setStatus(st)

      if (st.running) {
        const result = await getPackages(st.port, 'cached', currentPage, currentPageSize)
        setPackages(result.items)
        setTotal(result.total)
        setPage(result.page)
        setPageSize(result.page_size)
      } else {
        setPackages([])
        setTotal(0)
      }
    } catch (e) {
      console.error('获取缓存包列表失败:', e)
      message.error(`获取缓存包列表失败: ${e}`)
      setPackages([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  })

  useAsyncEffect(async () => {
    await loadPackages(1, pageSize)
  }, [])

  const handleTableChange = useMemoizedFn((pagination: TablePaginationConfig) => {
    const newPage = pagination.current || 1
    const newPageSize = pagination.pageSize || 15
    loadPackages(newPage, newPageSize)
  })

  const handleViewDetail = useMemoizedFn((pkg: PackageInfo) => {
    setSelectedPackage(pkg)
    setDetailVisible(true)
  })

  const handleDelete = useMemoizedFn((pkg: PackageInfo) => {
    modal.confirm({
      title: '确认删除',
      content: (
        <div>
          <p>
            确定要删除缓存包 <strong>{pkg.name}</strong> 吗？
          </p>
          <p className='text-amber-500'>此操作将删除该包的所有缓存版本。</p>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deletePackage(pkg.name)
          message.success('删除成功')
          await loadPackages()
        } catch (e) {
          message.error(`删除失败: ${e}`)
        }
      }
    })
  })

  const handleDeleteAll = useMemoizedFn((deleteType: 'cached' | 'all') => {
    const title = deleteType === 'cached' ? '删除所有缓存包' : '删除全部包'
    const content =
      deleteType === 'cached'
        ? '确定要删除所有缓存包吗？私有包将被保留。'
        : '确定要删除全部包吗？这将同时删除私有包和缓存包！'

    modal.confirm({
      title,
      content: (
        <div>
          <p>{content}</p>
          <p className='font-bold text-red-500'>此操作不可恢复！</p>
        </div>
      ),
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!status?.running) {
          message.error('Verdaccio 服务未运行')
          return
        }

        setDeleteAllLoading(true)
        try {
          const count = await deletePackages(status.port, deleteType)
          message.success(`成功删除 ${count} 个包`)
          await loadPackages(1, pageSize)
        } catch (e) {
          message.error(`删除失败: ${e}`)
        } finally {
          setDeleteAllLoading(false)
        }
      }
    })
  })

  // 前端搜索过滤（在当前页数据中）
  const filteredPackages = searchText
    ? packages.filter(pkg => {
      const lower = searchText.toLowerCase()
      return (
        pkg.name.toLowerCase().includes(lower) ||
        pkg.description?.toLowerCase().includes(lower) ||
        pkg.author?.toLowerCase().includes(lower)
      )
    })
    : packages

  const columns: ColumnsType<PackageInfo> = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Typography.Text strong copyable>
          {name}
        </Typography.Text>
      )
    },
    {
      title: '最新版本',
      dataIndex: 'version',
      key: 'version',
      width: 120,
      render: (version: string) => <Tag color='green'>{version}</Tag>
    },
    {
      title: '版本数',
      dataIndex: 'versions',
      key: 'versionsCount',
      width: 80,
      render: (versions: string[]) => versions.length
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string | null) => desc || <Typography.Text type='secondary'>-</Typography.Text>
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author',
      width: 150,
      ellipsis: true,
      render: (author: string | null) => author || <Typography.Text type='secondary'>-</Typography.Text>
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space size='small'>
          <Button type='text' size='small' icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button type='text' size='small' danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      )
    }
  ]

  if (loading && packages.length === 0) {
    return (
      <div className='flex h-full w-full items-center justify-center'>
        <Spin size='large' />
      </div>
    )
  }

  if (!status?.running && !loading) {
    return (
      <div className='flex h-full w-full items-center justify-center'>
        <Empty description='Verdaccio 服务未运行，请先启动服务' />
      </div>
    )
  }

  return (
    <div className='flex h-full w-full flex-col p-4'>
      <div className='mb-4 flex shrink-0 items-center justify-between'>
        <Typography.Title level={3} className='mb-0!'>
          缓存包管理
        </Typography.Title>
        <Space>
          <Input
            placeholder='搜索包名、描述、作者...'
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            className='w-64'
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadPackages()} loading={loading}>
            刷新
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'cached-only',
                  label: '仅删除缓存包',
                  icon: <ClearOutlined />,
                  onClick: () => handleDeleteAll('cached')
                },
                {
                  key: 'all',
                  label: '删除全部（含私有包）',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => handleDeleteAll('all')
                }
              ]
            }}
            disabled={total === 0 || deleteAllLoading}
          >
            <Button danger icon={<ClearOutlined />} loading={deleteAllLoading}>
              删除全部
            </Button>
          </Dropdown>
        </Space>
      </div>

      <Card className='flex flex-1 flex-col overflow-hidden shadow-sm'>
        <Table
          columns={columns}
          dataSource={filteredPackages}
          rowKey='name'
          size='small'
          loading={loading}
          onChange={handleTableChange}
          scroll={{ y: 'calc(100vh - 245px)' }}
          classNames={{ section: 'override-z4v8n' }}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: searchText ? filteredPackages.length : total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: t => `共 ${t} 个缓存包`,
            pageSizeOptions: [10, 15, 20, 50]
          }}
          locale={{
            emptyText: <Empty description='暂无缓存包' />
          }}
        />
      </Card>

      {/* 包详情弹窗 */}
      <Modal
        title={`包详情 - ${selectedPackage?.name}`}
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setSelectedPackage(null)
        }}
        footer={null}
        width={700}
      >
        {selectedPackage ? (
          <div className='dark:scheme-dark max-h-[60vh] overflow-auto'>
            <Descriptions column={1} bordered size='small' styles={{ label: { whiteSpace: 'nowrap' } }}>
              <Descriptions.Item label='包名'>
                <Typography.Text copyable>{selectedPackage.name}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label='最新版本'>
                <Tag color='green'>{selectedPackage.version}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label='描述'>{selectedPackage.description || '-'}</Descriptions.Item>
              <Descriptions.Item label='作者'>{selectedPackage.author || '-'}</Descriptions.Item>
              <Descriptions.Item label='许可证'>{selectedPackage.license || '-'}</Descriptions.Item>
              <Descriptions.Item label='主页'>
                {selectedPackage.homepage ? (
                  <Typography.Link href={selectedPackage.homepage} target='_blank'>
                    {selectedPackage.homepage}
                  </Typography.Link>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              <Descriptions.Item label='仓库'>
                {selectedPackage.repository ? (
                  <Typography.Text copyable className='break-all text-xs'>
                    {selectedPackage.repository}
                  </Typography.Text>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              <Descriptions.Item label='关键词'>
                {selectedPackage.keywords?.length > 0 ? (
                  <div className='flex flex-wrap gap-1'>
                    {selectedPackage.keywords.map(kw => (
                      <Tag key={kw}>{kw}</Tag>
                    ))}
                  </div>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              <Descriptions.Item label='所有版本'>
                <div className='flex flex-wrap gap-1'>
                  {selectedPackage.versions.map(v => (
                    <Tag key={v}>{v}</Tag>
                  ))}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label='创建时间'>{selectedPackage.created || '-'}</Descriptions.Item>
              <Descriptions.Item label='修改时间'>{selectedPackage.modified || '-'}</Descriptions.Item>
            </Descriptions>
          </div>
        ) : (
          <Empty description='无法获取包详情' />
        )}
      </Modal>
    </div>
  )
}

Content.displayName = 'CachedPackages'
export { Content as CachedPackages }
