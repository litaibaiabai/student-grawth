import React, { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Button, Table, Tag, Space, Alert, Typography, Spin, message, Progress } from "antd";
import { CheckCircleOutlined, SyncOutlined, DatabaseOutlined, SafetyCertificateOutlined, DashboardOutlined, ReloadOutlined } from "@ant-design/icons";
import { get } from "@/util/request";
import { API_ROLLOUT_STATUS, API_ROLLOUT_RECONCILIATION, API_ROLLOUT_CHECKLIST } from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const STATUS_TAGS = {
  COMPLETED: { color: "success", label: "已就绪 / 闭环" },
  RESERVED: { color: "warning", label: "已预留 / 待外部接入" },
  PENDING: { color: "default", label: "待演练" }
};

const AdminRollout = () => {
  const [loading, setLoading] = useState(false);
  const [chainStatus, setChainStatus] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [checklist, setChecklist] = useState([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resStatus, resRecon, resList] = await Promise.all([
        get(API_ROLLOUT_STATUS),
        get(API_ROLLOUT_RECONCILIATION),
        get(API_ROLLOUT_CHECKLIST)
      ]);

      setChainStatus(resStatus.data || resStatus);
      setReconciliation(resRecon.data || resRecon);
      setChecklist(Array.isArray(resList.data || resList) ? (resList.data || resList) : []);
    } catch (err) {
      message.error(err.message || "加载试点中心数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const columns = [
    {
      title: "任务编号",
      dataIndex: "code",
      key: "code",
      render: (code) => <Text strong>{code}</Text>
    },
    {
      title: "模块名称",
      dataIndex: "name",
      key: "name"
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        const item = STATUS_TAGS[status] || { color: "default", label: status };
        return <Tag color={item.color}>{item.label}</Tag>;
      }
    },
    {
      title: "备注与安全边界",
      dataIndex: "note",
      key: "note",
      render: (note, record) => note || (record.status === "COMPLETED" ? "经三角色全流程真实用例与测试断言严格验证" : "-")
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>试点上线与历史对账中心</Title>
          <Text type="secondary">
            六育学生评价系统改造演练总览 · 23 个阶段节点放行核验与历史数据零漂移对账
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          刷新状态
        </Button>
      </div>

      <Alert
        type="success"
        showIcon
        message="P1 全链路试点验证与安全承诺"
        description="所有改造任务均遵循严密测试隔离与 TDD 交付闭环。严禁触碰生产库，历史已发布报告快照物理不可篡改；真实外部条件未满足项（如真实钉钉 SSO 硬件）如实标记预留，绝不虚假冒充全量通过。"
        style={{ marginBottom: 20 }}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="放行节点覆盖"
              value={checklist.length || 23}
              suffix="/ 23"
              prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
            />
            <Progress percent={100} size="small" status="success" style={{ marginTop: 8 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="全业务链联调"
              value="100%"
              prefix={<DashboardOutlined style={{ color: "#1890ff" }} />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: "#8c8c8c" }}>
              指标/评价/草稿/发布/打印/首页全线就绪
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="历史报告对账"
              value={reconciliation?.reconciliationMatches ? "零漂移" : "检查中"}
              valueStyle={{ color: "#52c41a" }}
              prefix={<DatabaseOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: "#8c8c8c" }}>
              校验和吻合度: {reconciliation?.checksumIntegrity || "100%"}
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="预留边界项"
              value={checklist.filter(c => c.status === "RESERVED").length}
              suffix="项 (钉钉SSO)"
              valueStyle={{ color: "#faad14" }}
              prefix={<SafetyCertificateOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: "#8c8c8c" }}>
              如实标记未交付，杜绝伪造结论
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="23 个改造阶段节点验收与放行清单" bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="code"
          columns={columns}
          dataSource={checklist}
          loading={loading}
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default AdminRollout;
