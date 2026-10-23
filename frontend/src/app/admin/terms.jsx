import React, { useState, useEffect } from "react";
import {
  Card, Table, Tag, Button, Space, message, Modal, Form,
  Input, DatePicker, Switch, Typography, Alert, Row, Col, Badge
} from "antd";
import {
  CalendarOutlined, PlusOutlined, ReloadOutlined, CheckCircleOutlined,
  LockOutlined, SafetyCertificateOutlined
} from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text, Title } = Typography;

const AdminTerms = () => {
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchTerms = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_TERMS);
      if (res.code === 200) {
        setTerms(res.data || []);
      }
    } catch (err) {
      message.error("获取学期校历列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerms();
  }, []);

  const handleCreateTerm = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        term_name: values.term_name,
        start_date: values.date_range[0].format("YYYY-MM-DD"),
        end_date: values.date_range[1].format("YYYY-MM-DD"),
        is_current: values.is_current ? 1 : 0
      };

      const res = await post(urls.API_ADMIN_TERMS, payload);
      if (res.code === 200) {
        message.success("新学期创建成功并已配置校历！");
        setCreateModalOpen(false);
        form.resetFields();
        fetchTerms();
      } else {
        message.error(res.message || "创建学期失败");
      }
    } catch (err) {
      message.error(err.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: "学期ID",
      dataIndex: "id",
      key: "id",
      width: 80,
      render: (id) => <Text code>#{id}</Text>
    },
    {
      title: "学期名称",
      dataIndex: "term_name",
      key: "term_name",
      render: (text, r) => (
        <Space>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{text}</span>
          {r.is_current === 1 && (
            <Tag color="cyan" style={{ fontWeight: 600 }}>当前活跃学期</Tag>
          )}
        </Space>
      )
    },
    {
      title: "学期周期 (开始 - 结束)",
      key: "dates",
      render: (_, r) => (
        <span>
          {r.start_date ? new Date(r.start_date).toLocaleDateString("zh-CN") : "--"}
          {" ~ "}
          {r.end_date ? new Date(r.end_date).toLocaleDateString("zh-CN") : "--"}
        </span>
      )
    },
    {
      title: "运行状态",
      dataIndex: "status",
      key: "status",
      render: (st) => {
        if (st === "ACTIVE") return <Tag color="green">运行中 (ACTIVE)</Tag>;
        if (st === "ARCHIVED") return <Tag color="default">已结课封存 (ARCHIVED)</Tag>;
        return <Tag color="blue">{st}</Tag>;
      }
    },
    {
      title: "评价数据封存状态",
      key: "lock",
      render: (_, r) => (
        r.status === "ARCHIVED" ? (
          <Space>
            <LockOutlined style={{ color: "#ef4444" }} />
            <Text type="secondary">只读封存</Text>
          </Space>
        ) : (
          <Space>
            <CheckCircleOutlined style={{ color: "#10b981" }} />
            <Text style={{ color: "#059669" }}>可录入/评价中</Text>
          </Space>
        )
      )
    }
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* 顶栏卡片 */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        borderRadius: 16,
        padding: "24px 32px",
        color: "#fff",
        marginBottom: 24,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)"
      }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Tag color="#38bdf8" style={{ fontWeight: 600, padding: "2px 8px" }}>校级系统底座配置</Tag>
            <Title level={3} style={{ color: "#fff", margin: "8px 0 4px" }}>
              学期与校历周期管理
            </Title>
            <Text style={{ color: "#94a3b8", fontSize: 13 }}>
              定义全校活跃学期，管控评价业务有效时间窗。所有过程卡片、荣誉申报及期末评价均严格依附当前活跃学期。
            </Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                border: "none",
                height: 40,
                borderRadius: 8,
                fontWeight: 600
              }}
            >
              新建学期校历
            </Button>
          </Col>
        </Row>
      </div>

      <Card
        title="学校学期档案列表"
        bordered={false}
        extra={<Button icon={<ReloadOutlined />} onClick={fetchTerms}>刷新</Button>}
        style={{ borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
      >
        <Alert
          message="多学期排他性规则"
          description="同一时刻全校仅允许一个学期标记为【当前活跃学期】(is_current=1)。激活新学期将自动将旧学期标记为已归档只读。"
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />

        <Table
          dataSource={terms}
          columns={columns}
          rowKey="id"
          loading={loading}
        />
      </Card>

      {/* 创建学期对话框 */}
      <Modal
        title={
          <Space>
            <CalendarOutlined style={{ color: "#2563eb" }} />
            <span>配置并启动新学期</span>
          </Space>
        }
        open={createModalOpen}
        onOk={() => form.submit()}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={submitting}
        okText="立即创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateTerm}
          initialValues={{ is_current: true }}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="term_name"
            label="学期完整名称"
            rules={[{ required: true, message: "请输入学期名称，如 2026-2027学年第一学期" }]}
          >
            <Input placeholder="例如：2026-2027学年第一学期" />
          </Form.Item>

          <Form.Item
            name="date_range"
            label="学期起止日期 (校历范围)"
            rules={[{ required: true, message: "请选择学期起止日期" }]}
          >
            <DatePicker.RangePicker style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            name="is_current"
            label="设为当前活跃学期"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminTerms;
