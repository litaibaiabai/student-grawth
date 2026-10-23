import React, { useState, useEffect } from "react";
import { Card, Table, Button, Tag, Space, message, Popconfirm, Input, Radio, Typography, Alert } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text } = Typography;

const TeacherClaims = () => {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("PENDING");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchClaims = async (status = filterStatus) => {
    setLoading(true);
    try {
      const res = await get(urls.API_TEACHER_CLAIMS, { status });
      if (res.code === 200) {
        setClaims(res.data || []);
      }
    } catch (err) {
      message.error("获取待审申领失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims(filterStatus);
  }, [filterStatus]);

  const handleDecision = async (claimId, decision, rejectReason = "") => {
    setActionLoading(true);
    try {
      const requestKey = `DECISION_${claimId}_${decision}_${Date.now()}`;
      const res = await post(urls.API_DECIDE_CLAIM(claimId), {
        decision,
        rejectReason,
        requestKey
      });

      if (res.code === 200) {
        message.success(decision === "APPROVE" ? "审核已通过：积分已正式入账 +1，实体卡已置为失效终态！" : "已驳回该申领单据，实体卡已作废");
        fetchClaims(filterStatus);
      } else {
        message.error(res.message || "审核操作失败");
      }
    } catch (err) {
      message.error(err.message || "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      title: "单据号",
      dataIndex: "claim_id",
      key: "claim_id",
      render: (id) => <strong>#{id}</strong>
    },
    {
      title: "申领学生",
      key: "student",
      render: (_, r) => (
        <div>
          <span style={{ fontWeight: 600, color: "#1e3a8a" }}>{r.student_name}</span>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {r.grade ? `${r.grade}年级${r.class_no}班` : "学生"}
          </div>
        </div>
      )
    },
    {
      title: "实体卡指标",
      key: "category",
      render: (_, r) => (
        <div>
          <Tag color="blue">{r.category_code}</Tag>
          <span>{r.category_name}</span>
        </div>
      )
    },
    {
      title: "卡片序号 / 所属月",
      key: "card_info",
      render: (_, r) => (
        <span style={{ fontSize: 12, color: "#475569" }}>
          No.{r.serial_no} · {r.month_key}
        </span>
      )
    },
    {
      title: "扫码提交时间",
      dataIndex: "claim_time",
      key: "claim_time",
      render: (t) => t ? new Date(t).toLocaleString("zh-CN") : "--"
    },
    {
      title: "状态",
      dataIndex: "claim_status",
      key: "claim_status",
      render: (st) => {
        if (st === "PENDING") return <Tag color="orange">待您审核</Tag>;
        if (st === "APPROVED") return <Tag color="green">已通过 (+1分已入账)</Tag>;
        if (st === "REJECTED") return <Tag color="red">已驳回作废</Tag>;
        return <Tag>{st}</Tag>;
      }
    },
    {
      title: "审核决策操作",
      key: "action",
      render: (_, r) => {
        if (r.claim_status !== "PENDING") {
          return <Text type="secondary">已办结</Text>;
        }
        return (
          <Space>
            <Popconfirm
              title="确认核准通过该扫卡申请？"
              description="系统将执行事务入账：向该学生账户注入+1过程积分，并将实体卡标记为永久失效(USED)。"
              onConfirm={() => handleDecision(r.claim_id, "APPROVE")}
              okText="确认核准(+1分)"
              cancelText="取消"
            >
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={actionLoading}
                style={{ background: "#059669", borderColor: "#059669" }}
              >
                核准入账(+1)
              </Button>
            </Popconfirm>

            <Popconfirm
              title="确定驳回此扫卡申请？"
              description="驳回后该实体卡将被标记为作废终态(VOID)，无法再次申领。"
              onConfirm={() => handleDecision(r.claim_id, "REJECT", "教师核实非本人卡片或不符合加分事由")}
              okText="确认驳回"
              cancelText="取消"
            >
              <Button
                danger
                size="small"
                icon={<CloseCircleOutlined />}
                loading={actionLoading}
              >
                驳回作废
              </Button>
            </Popconfirm>
          </Space>
        );
      }
    }
  ];

  return (
    <Card
      title="学生实体卡扫码申领审核工作台 (B模式核心事务审核)"
      extra={
        <Space>
          <Radio.Group
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="PENDING">待审单据</Radio.Button>
            <Radio.Button value="APPROVED">已通过</Radio.Button>
            <Radio.Button value="REJECTED">已驳回</Radio.Button>
            <Radio.Button value="">全部记录</Radio.Button>
          </Radio.Group>
          <Button icon={<ReloadOutlined />} onClick={() => fetchClaims(filterStatus)} />
        </Space>
      }
      style={{ borderRadius: 16 }}
    >
      <Alert
        message="审核风控原则"
        description="学生通过移动端扫描您发出的实体卡后，必须经过此工作台核准，积分才会写入不可篡改账本。核准同事务自动将卡片变为 USED，杜绝二次流转使用。"
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 8 }}
      />

      <Table
        dataSource={claims}
        columns={columns}
        rowKey="claim_id"
        loading={loading}
        locale={{ emptyText: "暂无待审核的扫卡申领记录" }}
      />
    </Card>
  );
};

export default TeacherClaims;
