import { ClearOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useAsyncEffect, useMemoizedFn } from 'ahooks'
import { App, Button, Card, Descriptions, Dropdown, Empty, Input, Modal, Space, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { type FC, useMemo, useState } from 'react'
import { deleteAllCachedPackages, deleteCachedPackage, getCachedPackages, getPackageDetails, getVerdaccioStatus } from '../lib/api'
import type { PackageDetailInfo, PackageInfo, VerdaccioStatus } from '../types'

const Content: FC = () => {
  const { message, modal } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [status, setStatus] = useState<VerdaccioStatus | null>(null)
  const [searchText, setSearchText] = useState('')
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null)
  const [packageDetail, setPackageDetail] = useState<PackageDetailInfo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)

  const loadPackages = useMemoizedFn(async () => {
    setLoading(true)
    try {
      const st = await getVerdaccioStatus()
      setStatus(st)

      if (st.running) {
        const pkgs = await getCachedPackages(st.port)
        setPackages(pkgs)
      } else {
        setPackages([])
      }
    } catch (e) {
      console.error('获取缓存包列表失败:', e)
      message.error(`获取缓存包列表失败: ${e}`)
      setPackages([])
    } finally {
      setLoading(false)
    }
  })

  useAsyncEffect(async () => {
    await loadPackages()
  }, [])

  const handleViewDetail = useMemoizedFn(async (pkg: PackageInfo) => {
    setSelectedPackage(pkg)
    setDetailVisible(true)
    setDetailLoading(true)

    try {
      if (status?.running) {
        const detail = await getPackageDetails(status.port, pkg.name)
        setPackageDetail(detail as PackageDetailInfo)
      }
    } catch (e) {
      console.error('获取包详情失败:', e)
      setPackageDetail(null)
    } finally {
      setDetailLoading(false)
    }
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
          await deleteCachedPackage(pkg.name)
          message.success('删除成功')
          await loadPackages()
        } catch (e) {
          message.error(`删除失败: ${e}`)
        }
      }
    })
  })

  const handleDeleteAll = useMemoizedFn((excludePrivate: boolean) => {
    const title = excludePrivate ? '删除所有缓存包' : '删除全部包'
    const content = excludePrivate
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
          const count = await deleteAllCachedPackages(status.port, excludePrivate)
          message.success(`成功删除 ${count} 个包`)
          await loadPackages()
        } catch (e) {
          message.error(`删除失败: ${e}`)
        } finally {
          setDeleteAllLoading(false)
        }
      }
    })
  })

  const filteredPackages = useMemo(() => {
    if (!searchText) return packages
    const lower = searchText.toLowerCase()
    return packages.filter(
      pkg => pkg.name.toLowerCase().includes(lower) || pkg.description?.toLowerCase().includes(lower) || pkg.author?.toLowerCase().includes(lower)
    )
  }, [packages, searchText])

  const columns: ColumnsType<PackageInfo> = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Typography.Text strong copyable>
          {name}
        </Typography.Text>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name)
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
      render: (versions: string[]) => versions.length,
      sorter: (a, b) => a.versions.length - b.versions.length
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

  if (loading) {
    return (
      <div className='flex h-full w-full items-center justify-center'>
        <Spin size='large' />
      </div>
    )
  }

  if (!status?.running) {
    return (
      <div className='flex h-full w-full items-center justify-center'>
        <Empty description='Verdaccio 服务未运行，请先启动服务' />
      </div>
    )
  }

  return (
    <div className='h-full w-full overflow-auto p-4'>
      <div className='mb-4 flex items-center justify-between'>
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
          <Button icon={<ReloadOutlined />} onClick={loadPackages}>
            刷新
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'cached-only',
                  label: '仅删除缓存包',
                  icon: <ClearOutlined />,
                  onClick: () => handleDeleteAll(true)
                },
                {
                  key: 'all',
                  label: '删除全部（含私有包）',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => handleDeleteAll(false)
                }
              ]
            }}
            disabled={packages.length === 0 || deleteAllLoading}
          >
            <Button danger icon={<ClearOutlined />} loading={deleteAllLoading}>
              删除全部
            </Button>
          </Dropdown>
        </Space>
      </div>

      <Card className='shadow-sm'>
        <Table
          columns={columns}
          dataSource={filteredPackages}
          rowKey='name'
          size='small'
          pagination={{
            pageSize: 15,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: total => `共 ${total} 个缓存包`
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
          setPackageDetail(null)
        }}
        footer={null}
        width={700}
      >
        {detailLoading ? (
          <div className='flex h-40 items-center justify-center'>
            <Spin />
          </div>
        ) : packageDetail ? (
          <div className='max-h-[60vh] overflow-auto'>
            <Descriptions column={1} bordered size='small' styles={{ label: { whiteSpace: 'nowrap' } }}>
              <Descriptions.Item label='包名'>{packageDetail.name}</Descriptions.Item>
              <Descriptions.Item label='最新版本'>
                <Tag color='green'>{packageDetail['dist-tags']?.latest || '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label='所有版本'>
                <div className='flex flex-wrap gap-1'>
                  {Object.keys(packageDetail.versions || {}).map(v => (
                    <Tag key={v}>{v}</Tag>
                  ))}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label='创建时间'>{packageDetail.time?.created || '-'}</Descriptions.Item>
              <Descriptions.Item label='最后修改'>{packageDetail.time?.modified || '-'}</Descriptions.Item>
              {packageDetail.versions?.[packageDetail['dist-tags']?.latest] && (
                <>
                  <Descriptions.Item label='描述'>
                    {packageDetail.versions[packageDetail['dist-tags'].latest]?.description || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label='作者'>
                    {packageDetail.versions[packageDetail['dist-tags'].latest]?.author?.name || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label='许可证'>
                    {packageDetail.versions[packageDetail['dist-tags'].latest]?.license || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label='主页'>
                    {packageDetail.versions[packageDetail['dist-tags'].latest]?.homepage ? (
                      <Typography.Link
                        href={packageDetail.versions[packageDetail['dist-tags'].latest].homepage}
                        target='_blank'
                      >
                        {packageDetail.versions[packageDetail['dist-tags'].latest].homepage}
                      </Typography.Link>
                    ) : (
                      '-'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label='关键词'>
                    <div className='flex flex-wrap gap-1'>
                      {packageDetail.versions[packageDetail['dist-tags'].latest]?.keywords?.map(kw => (
                        <Tag key={kw}>{kw}</Tag>
                      )) || '-'}
                    </div>
                  </Descriptions.Item>
                </>
              )}
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
