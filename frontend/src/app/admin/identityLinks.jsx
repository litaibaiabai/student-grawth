import React, { useState, useEffect } from "react";
import { Table, Button, Card, Modal, Form, Input, Select, Space, Tag, Popconfirm, message, Typography, Alert } from "antd";
import { LinkOutlined, DisconnectOutlined, SafetyCertificateOutlined, UserOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, post } from "@/util/request";
import { API_IDENTITY_LINKS, API_IDENTITY_LINK_BIND, API_IDENTITY_LINK_UNBIND } from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const ROLE_LABELS = {
  student: { label: "学生", color: "blue" },
  teacher: { label: "教师", color: "green" },
  manager: { label: "管理员", color: "gold" }
};

const AdminIdentityLinks = () => {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res = await get(API_IDENTITY_LINKS);
      const data = res.data || res;
      setLinks(Array.isArray(data) ? data : []);
    } catch (err) {
      message.error(err.message || "获取身份映射列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleBind = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await post(API_IDENTITY_LINK_BIND, values);
      message.success("外部身份关联成功");
      setModalVisible(false);
      form.resetFields();
      fetchLinks();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message || "关联失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnbind = async (record) => {
    try {
      await post(API_IDENTITY_LINK_UNBIND, {
        userId: record.user_id,
        provider: record.provider,
        externalSubject: record.external_subject
      });
      message.success("已解除外部身份关联并记录审计日志");
      fetchLinks();
    } catch (err) {
      message.error(err.message || "解绑失败");
    }
  };

  const columns = [
    {
      title: "认证平台",
      dataIndex: "provider",
      key: "provider",
      render: (text) => <Tag color="blue">{text || "DINGTALK"}</Tag>
    },
    {
      title: "外部唯一ID (unionId/staffId)",
      dataIndex: "external_subject",
      key: "external_subject",
      render: (text) => <Text code>{text}</Text>
    },
    {
      title: "外部姓名",
      dataIndex: "external_name",
      key: "external_name"
    },
    {
      title: "校内账号",
      dataIndex: "username",
      key: "username"
    },
    {
      title: "校内姓名",
      dataIndex: "real_name",
      key: "real_name"
    },
    {
      title: "校内角色",
      dataIndex: "role",
      key: "role",
      render: (role) => {
        const item = ROLE_LABELS[role] || { label: role, color: "default" };
        return <Tag color={item.color}>{item.label}</Tag>;
      }
    },
    {
      title: "绑定时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (time) => time ? new Date(time).toLocaleString() : "-"
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => (
        <Popconfirm
          title="解除外部关联"
          description="解除后该外部身份将无法再识别对应校内账号，是否继续？"
          onConfirm={() => handleUnbind(record)}
          okText="确定解绑"
          cancelText="取消"
        >
          <Button danger type="link" size="small" icon={<DisconnectOutlined />}>
            解绑
          </Button>
        </Popconfirm>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>钉钉身份预留与外部账号映射</Title>
          <Text type="secondary">
            受控维护外部统一身份到校内账号绑定，关联后校内权限完全由校内职务分流，禁止客户端越权
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchLinks} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            新增外部身份关联
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="安全与边界规范说明 (C1/G0)"
        description="本模块为钉钉统一登录预留账号映射与审计能力。在未接入真实学校钉钉企业安全密钥与公钥验签前，禁止通过调试或模拟回调发放正式登录会话Token。关联与解绑操作全量记录在操作审计日志中。"
        style={{ marginBottom: 20 }}
      />

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={links}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="新增外部身份关联"
        open={modalVisible}
        onOk={handleBind}
        confirmLoading={submitting}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        okText="确认关联"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ provider: "DINGTALK", tenantId: "ding_school_tenant_01" }}>
          <Form.Item name="provider" label="认证平台" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="DINGTALK">钉钉 (DingTalk)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="tenantId" label="租户/企业CorpId" rules={[{ required: true, message: "请输入企业CorpId" }]}>
            <Input placeholder="ding_school_tenant_01" />
          </Form.Item>
          <Form.Item name="externalSubject" label="外部唯一用户标识 (StaffId/UnionId)" rules={[{ required: true, message: "请输入外部用户唯一标识" }]}>
            <Input placeholder="例如 ding_staff_001" />
          </Form.Item>
          <Form.Item name="externalName" label="外部人员姓名">
            <Input placeholder="例如 张老师" />
          </Form.Item>
          <Form.Item name="userId" label="关联校内用户ID" rules={[{ required: true, message: "请输入校内用户ID" }]}>
            <Input type="number" placeholder="输入校内用户ID (如 101)" prefix={<UserOutlined />} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminIdentityLinks;
