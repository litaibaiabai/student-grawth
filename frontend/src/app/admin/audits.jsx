import React, { useState, useEffect } from "react";
import {
  Card, Table, Tag, Button, Space, Typography,
  Row, Col, Alert, Divider, message, Modal, Tabs, Form, Input, InputNumber
} from "antd";
import {
  SafetyCertificateOutlined, ReloadOutlined, RollbackOutlined,
  SearchOutlined, FileTextOutlined
} from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const AdminAudits = () => {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchAudits = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_AUDITS);
      if (res.code === 200) {
        setAudits(res.data || []);
      }
    } catch (err) {
      message.error("获取审计日志失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, []);

  const handleExecuteReversal = async (values) => {
    setSubmitting(true);
    try {
      const res = await post(urls.API_REVERSE_SCORE, {
        original_score_id: Number(values.original_score_id),
        reason: values.reason
      });

      if (res.code === 200) {
        message.success(`受控冲销执行成功！系统已自动写入 -1 负向修正记录，原记录保持只读锁定！`);
        setReversalModalOpen(false);
        form.resetFields();
        fetchAudits();
      } else {
        message.error(res.message || "冲销操作失败");
      }
    } catch (err) {
      message.error(err.message || "冲销失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: "日志 ID",
      dataIndex: "id",
      key: "id",
      width: 80,
      render: (id) => <Text code>#{id}</Text>
    },
    {
      title: "操作时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (t) => t ? new Date(t).toLocaleString("zh-CN") : "--"
    },
    {
      title: "操作人",
      key: "operator",
      width: 140,
      render: (_, r) => (
        <div>
          <span style={{ fontWeight: 600, color: "#1e382b" }}>{r.operator_name || "管理员"}</span>
          <div style={{ fontSize: 11, color: "#8a9990" }}>ID: {r.operator_id}</div>
        </div>
      )
    },
    {
      title: "高危动作代码",
      dataIndex: "action",
      key: "action",
      width: 160,
      render: (act) => (
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          background: "#f0f4ef",
          color: "#277460",
          padding: "3px 8px",
          borderRadius: 4
        }}>
          {act}
        </span>
      )
    },
    {
      title: "目标资源 / 业务类型",
      dataIndex: "resource_type",
      key: "res",
      width: 140,
      render: (res) => <Tag color="blue">{res}</Tag>
    },
    {
      title: "变更前/后上下文快照",
      key: "diff",
      render: (_, r) => {
        let afterObj = {};
        try {
          afterObj = typeof r.after_value === "string" ? JSON.parse(r.after_value) : r.after_value;
        } catch {
          afterObj = r.after_value;
        }
        return (
          <Text ellipsis style={{ maxWidth: 360, fontSize: 12, color: "#56685c" }}>
            {JSON.stringify(afterObj)}
          </Text>
        );
      }
    }
  ];

  return (
    <div>
      {/* 标题 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}>
            AUDIT TRAIL & CONTROLLED CORRECTION
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>
            审计与受控更正
          </h1>
          <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>
            保留原始记录，以新增冲销流水进行受控纠错；关键操作完整留痕。
          </p>
        </div>
        <Space>
          <Button
            type="primary"
            danger
            icon={<RollbackOutlined />}
            onClick={() => setReversalModalOpen(true)}
            style={{ borderRadius: 8, fontWeight: 600 }}
          >
            受控冲销流水录入
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchAudits}>
            刷新日志
          </Button>
        </Space>
      </div>

      <Alert
        message="风控不变量：单据只追加不删除"
        description="系统禁止硬删除任何已确认的过程记录或终审数据。若发现录入失误，必须通过【受控冲销】写入负向流水 (-1分)，并以数据库唯一索引 `uk_score_reversal_original` 杜绝重复冲销攻击。"
        type="info"
        showIcon
        style={{ marginBottom: 20, borderRadius: 8 }}
      />

      <Card
        title="系统不可变审计流水"
        bordered={false}
        style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
      >
        <Table
          dataSource={audits}
          columns={columns}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: "暂无操作审计日志" }}
        />
      </Card>

      {/* 冲销执行对话框 */}
      <Modal
        title={
          <Space>
            <RollbackOutlined style={{ color: "#dc2626" }} />
            <span>执行积分记录受控冲销 (-1 修正)</span>
          </Space>
        }
        open={reversalModalOpen}
        onOk={() => form.submit()}
        onCancel={() => setReversalModalOpen(false)}
        confirmLoading={submitting}
        okText="确认冲销入账"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleExecuteReversal}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="original_score_id"
            label="原考评记录 ID (流水展示号)"
            rules={[{ required: true, message: "请输入需要冲销的原记录 ID" }]}
          >
            <InputNumber placeholder="例如：1" style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            name="reason"
            label="冲销理由与复核依据 (必填，写入审计)"
            rules={[{ required: true, message: "请详细填写冲销纠错原因" }]}
          >
            <TextArea
              rows={4}
              placeholder="例如：经教务处核实，该学生当日请假未到校，任课教师误选学生姓名批量加分，故予以冲销。"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminAudits;
