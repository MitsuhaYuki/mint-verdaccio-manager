import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons'
import { useAsyncEffect, useMemoizedFn } from 'ahooks'
import { App, Button, Card, Empty, Form, Input, Modal, Space, Spin, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { type FC, useState } from 'react'
import { addUser, changeUserPassword, deleteUser, getUsers } from '../lib/api'
import type { UserInfo } from '../types'

const Content: FC = () => {
  const { message, modal } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [passwordModalVisible, setPasswordModalVisible] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [addForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const loadUsers = useMemoizedFn(async () => {
    setLoading(true)
    try {
      const list = await getUsers()
      setUsers(list)
    } catch (e) {
      console.error('获取用户列表失败:', e)
      message.error(`获取用户列表失败: ${e}`)
      setUsers([])
    } finally {
      setLoading(false)
    }
  })

  useAsyncEffect(async () => {
    await loadUsers()
  }, [])

  const handleAddUser = useMemoizedFn(async () => {
    try {
      const values = await addForm.validateFields()
      setSubmitting(true)
      await addUser(values.username, values.password)
      message.success('用户添加成功')
      setAddModalVisible(false)
      addForm.resetFields()
      await loadUsers()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) {
        return // Form validation error
      }
      message.error(`添加用户失败: ${e}`)
    } finally {
      setSubmitting(false)
    }
  })

  const handleChangePassword = useMemoizedFn(async () => {
    if (!selectedUser) return
    try {
      const values = await passwordForm.validateFields()
      setSubmitting(true)
      await changeUserPassword(selectedUser, values.newPassword)
      message.success('密码修改成功')
      setPasswordModalVisible(false)
      passwordForm.resetFields()
      setSelectedUser(null)
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) {
        return // Form validation error
      }
      message.error(`修改密码失败: ${e}`)
    } finally {
      setSubmitting(false)
    }
  })

  const handleDelete = useMemoizedFn((username: string) => {
    modal.confirm({
      title: '确认删除',
      content: (
        <div>
          <p>
            确定要删除用户 <strong>{username}</strong> 吗？
          </p>
          <p className='text-amber-500'>此操作不可恢复！</p>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteUser(username)
          message.success('删除成功')
          await loadUsers()
        } catch (e) {
          message.error(`删除失败: ${e}`)
        }
      }
    })
  })

  const openPasswordModal = useMemoizedFn((username: string) => {
    setSelectedUser(username)
    setPasswordModalVisible(true)
  })

  const columns: ColumnsType<UserInfo> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => (
        <Space>
          <UserOutlined />
          <Typography.Text strong>{username}</Typography.Text>
        </Space>
      ),
      sorter: (a, b) => a.username.localeCompare(b.username)
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: UserInfo) => (
        <Space size='small'>
          <Button type='text' size='small' icon={<EditOutlined />} onClick={() => openPasswordModal(record.username)}>
            改密
          </Button>
          <Button type='text' size='small' danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.username)}>
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div className='h-full w-full overflow-auto p-4'>
      <Card
        title={
          <Space>
            <UserOutlined />
            <span>用户管理</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<PlusOutlined />} type='primary' onClick={() => setAddModalVisible(true)}>
              添加用户
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadUsers} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          {users.length === 0 && !loading ? (
            <Empty description='暂无用户' image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button type='primary' icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}>
                添加第一个用户
              </Button>
            </Empty>
          ) : (
            <Table
              columns={columns}
              dataSource={users}
              rowKey='username'
              size='small'
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: total => `共 ${total} 个用户` }}
            />
          )}
        </Spin>
      </Card>

      {/* 添加用户弹窗 */}
      <Modal
        title='添加用户'
        open={addModalVisible}
        onOk={handleAddUser}
        onCancel={() => setAddModalVisible(false)}
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={addForm} layout='vertical' className='mt-4'>
          <Form.Item
            name='username'
            label='用户名'
            rules={[
              { required: true, message: '请输入用户名' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '用户名只能包含字母、数字、下划线和连字符' }
            ]}
          >
            <Input placeholder='请输入用户名' autoComplete='off' />
          </Form.Item>
          <Form.Item
            name='password'
            label='密码'
            rules={[
              { required: true, message: '请输入密码' },
              { min: 4, message: '密码长度至少为 4 个字符' }
            ]}
          >
            <Input.Password placeholder='请输入密码' autoComplete='new-password' />
          </Form.Item>
          <Form.Item
            name='confirmPassword'
            label='确认密码'
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                }
              })
            ]}
          >
            <Input.Password placeholder='请再次输入密码' autoComplete='new-password' />
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        title={`修改密码 - ${selectedUser}`}
        open={passwordModalVisible}
        onOk={handleChangePassword}
        onCancel={() => {
          setPasswordModalVisible(false)
          setSelectedUser(null)
        }}
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={passwordForm} layout='vertical' className='mt-4'>
          <Form.Item
            name='newPassword'
            label='新密码'
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 4, message: '密码长度至少为 4 个字符' }
            ]}
          >
            <Input.Password placeholder='请输入新密码' autoComplete='new-password' />
          </Form.Item>
          <Form.Item
            name='confirmNewPassword'
            label='确认新密码'
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                }
              })
            ]}
          >
            <Input.Password placeholder='请再次输入新密码' autoComplete='new-password' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

Content.displayName = 'Users'
export { Content as Users }
