import { DeleteOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useAsyncEffect, useMemoizedFn } from 'ahooks'
import { App, Button, Card, Descriptions, Empty, Input, Modal, Space, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { type FC, useMemo, useState } from 'react'
import { deletePackage, getPackageDetails, getPackages, getVerdaccioStatus } from '../lib/api'
import type { PackageInfo, VerdaccioStatus } from '../types'

const Content: FC = () => {
  const { message, modal } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [status, setStatus] = useState<VerdaccioStatus | null>(null)
  const [searchText, setSearchText] = useState('')
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null)
  const [packageDetail, setPackageDetail] = useState<Record<string, unknown> | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadPackages = useMemoizedFn(async () => {
    setLoading(true)
    try {
      const st = await getVerdaccioStatus()
      setStatus(st)

      if (st.running) {
        const pkgs = await getPackages(st.port)
        setPackages(pkgs)
      } else {
        setPackages([])
      }
    } catch (e) {
      console.error('获取包列表失败:', e)
      message.error(`获取包列表失败: ${e}`)
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
        setPackageDetail(detail as Record<string, unknown>)
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
            确定要删除包 <strong>{pkg.name}</strong> 吗？
          </p>
          <p className='text-amber-500'>此操作将删除该包的所有版本，且不可恢复！</p>
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
      render: (version: string) => <Tag color='blue'>{version}</Tag>
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
      title: '许可证',
      dataIndex: 'license',
      key: 'license',
      width: 100,
      render: (license: string | null) => license || <Typography.Text type='secondary'>-</Typography.Text>
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, record: PackageInfo) => (
        <span className='flex items-center justify-center gap-0'>
          <Button type='link' size='small' onClick={() => handleViewDetail(record)}>
            <EyeOutlined />
            详情
          </Button>
          <Button type='link' size='small' danger onClick={() => handleDelete(record)}>
            <DeleteOutlined />
            删除
          </Button>
        </span>
      )
    }
  ]

  if (!status?.running) {
    return (
      <div className='flex h-full w-full flex-col items-center justify-center gap-4 p-4'>
        <Empty description='Verdaccio 服务未运行' />
        <Typography.Text type='secondary'>请先启动 Verdaccio 服务后再管理私有包</Typography.Text>
      </div>
    )
  }

  return (
    <div className='h-full w-full overflow-auto p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <Typography.Title level={3} className='mb-0!'>
          私有包管理
        </Typography.Title>
        <Space>
          <Input
            placeholder='搜索包名、描述、作者'
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            className='w-64'
          />
          <Button icon={<ReloadOutlined />} onClick={loadPackages} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <Card className='shadow-sm'>
        <Table
          columns={columns}
          dataSource={filteredPackages}
          rowKey='name'
          loading={loading}
          size='small'
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: total => `共 ${total} 个包`
          }}
          locale={{
            emptyText: <Empty description='暂无私有包' />
          }}
        />
      </Card>

      <Modal title={`包详情 - ${selectedPackage?.name}`} open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={700}>
        {detailLoading ? (
          <div className='flex justify-center py-8'>
            <Spin />
          </div>
        ) : selectedPackage ? (
          <div className='dark:scheme-dark max-h-96 overflow-auto'>
            <Descriptions column={2} bordered size='small'>
              <Descriptions.Item label='包名' span={2}>
                {selectedPackage.name}
              </Descriptions.Item>
              <Descriptions.Item label='最新版本'>{selectedPackage.version}</Descriptions.Item>
              <Descriptions.Item label='许可证'>{selectedPackage.license || '-'}</Descriptions.Item>
              <Descriptions.Item label='作者' span={2}>
                {selectedPackage.author || '-'}
              </Descriptions.Item>
              <Descriptions.Item label='描述' span={2}>
                {selectedPackage.description || '-'}
              </Descriptions.Item>
              <Descriptions.Item label='创建时间'>{selectedPackage.created || '-'}</Descriptions.Item>
              <Descriptions.Item label='修改时间'>{selectedPackage.modified || '-'}</Descriptions.Item>
              <Descriptions.Item label='所有版本' span={2}>
                <div className='flex flex-wrap gap-1'>
                  {selectedPackage.versions.map(v => (
                    <Tag key={v}>{v}</Tag>
                  ))}
                </div>
              </Descriptions.Item>
            </Descriptions>

            {packageDetail && (
              <div className='mt-4'>
                <Typography.Text strong>原始数据</Typography.Text>
                <pre className='mt-2 max-h-48 overflow-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800'>
                  {JSON.stringify(packageDetail, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

Content.displayName = 'Packages'
export { Content as Packages }
