import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  message,
  Modal,
  Input,
  Radio,
  Typography,
  Alert,
  Row,
  Col,
  Badge,
  Tooltip
} from "antd";
import {
  TrophyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  HistoryOutlined,
  LinkOutlined,
  FileTextOutlined
} from "@ant-design/icons";
import { get, post, openProtectedFile } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const LEVEL_NAMES = {
  DISTRICT: "区县级",
  CITY: "市级",
  PROVINCE: "省部级及以上"
};

const PRIZE_NAMES = {
  FIRST: "一等奖",
  SECOND: "二等奖",
  THIRD: "三等奖"
};

const TeacherHonors = () => {
  const [honors, setHonors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("PENDING");
  const [selectedHonor, setSelectedHonor] = useState(null);
  const [actionType, setActionType] = useState(null); // 'APPROVE' | 'REJECT'
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [revisions, setRevisions] = useState([]);

  const fetchHonors = async (status = filterStatus) => {
    setLoading(true);
    try {
      const res = await get(urls.API_HONORS, { status });
      if (res.code === 200) {
        setHonors(res.data || []);
      }
    } catch (err) {
      message.error("获取申报记录失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHonors(filterStatus);
  }, [filterStatus]);

  const handleOpenReview = (record, decision) => {
    setSelectedHonor(record);
    setActionType(decision);
    setRejectReason(decision === "REJECT" ? "佐证材料图片模糊，或主办单位非教育主管部门公布的规范赛事目录" : "");
  };

  const submitDecision = async () => {
    if (actionType === "REJECT" && !rejectReason.trim()) {
      message.warning("请填写驳回具体原因，以便学生修改重报");
      return;
    }

    setSubmitting(true);
    try {
      const requestKey = `DECISION_HONOR_${selectedHonor.id}_${actionType}_${Date.now()}`;
      const res = await post(urls.API_REVIEW_HONOR(selectedHonor.id), {
        decision: actionType === "APPROVE" ? "APPROVED" : "REJECTED",
        rejectReason: rejectReason,
        request_key: requestKey
      });

      if (res.code === 200) {
        message.success(
          actionType === "APPROVE"
            ? "荣誉核验通过！荣誉积分已生成并纳入学期期末汇算"
            : "已驳回该申报单据，已通知学生修改重提"
        );
        setSelectedHonor(null);
        setActionType(null);
        fetchHonors(filterStatus);
      } else {
        message.error(res.message || "审核提交失败");
      }
    } catch (err) {
      if (!err.handled) message.error(err.message || "审核操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: "申报ID",
      dataIndex: "id",
      key: "id",
      width: 80,
      render: (id) => <Text code>#{id}</Text>
    },
    {
      title: "申报学生",
      key: "student",
      width: 140,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1e3a8a" }}>{r.student_name || `学号:${r.student_id}`}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{r.grade ? `${r.grade}年级${r.class_no}班` : "在读学生"}</div>
        </div>
      )
    },
    {
      title: "荣誉成果名称 / 赛事活动",
      key: "title",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{r.title}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            申报时间：{new Date(r.created_at).toLocaleString("zh-CN")}
          </div>
        </div>
      )
    },
    {
      title: "获奖级别 / 等第",
      key: "level",
      width: 160,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Tag color="cyan">{LEVEL_NAMES[r.award_level] || r.award_level}</Tag>
          <Tag color="purple">{PRIZE_NAMES[r.prize_level] || r.prize_level}</Tag>
        </Space>
      )
    },
    {
      title: "对应法定荣誉积分",
      key: "points",
      width: 150,
      render: (_, r) => (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            padding: "6px 10px",
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: 11, color: "#065f46" }}>系统生成权重分</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#047857" }}>
            +{r.honor_points || "--"} <span style={{ fontSize: 12 }}>分</span>
          </div>
        </div>
      )
    },
    {
      title: "佐证附件",
      key: "material",
      width: 120,
      render: (_, r) => (
        <Space>
          {r.certificate_url?.startsWith("honor/") ? (
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => openProtectedFile(urls.API_HONOR_CERT_FILE(r.certificate_url)).catch(() => {})}
            >
              查看证书
            </Button>
          ) : (
            <Text type="secondary">无附件</Text>
          )}
        </Space>
      )
    },
    {
      title: "当前审核状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (st) => {
        if (st === "PENDING") return <Tag color="gold">待审核</Tag>;
        if (st === "APPROVED") return <Tag color="green">核验通过</Tag>;
        if (st === "REJECTED") return <Tag color="red">已驳回</Tag>;
        return <Tag>{st}</Tag>;
      }
    },
    {
      title: "操作与决策",
      key: "action",
      width: 180,
      render: (_, r) => {
        if (r.status !== "PENDING") {
          return (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {r.status === "APPROVED" ? "已准予入账" : `驳回理由: ${r.reject_reason || "材料不符"}`}
            </div>
          );
        }
        return (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleOpenReview(r, "APPROVE")}
              style={{ background: "#059669", borderColor: "#059669" }}
            >
              核准
            </Button>
            <Button danger size="small" icon={<CloseCircleOutlined />} onClick={() => handleOpenReview(r, "REJECT")}>
              驳回
            </Button>
          </Space>
        );
      }
    }
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* 顶栏卡片 */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
          borderRadius: 16,
          padding: "24px 32px",
          color: "#fff",
          marginBottom: 24,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)"
        }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Tag color="#818cf8" style={{ fontWeight: 600, padding: "2px 8px" }}>
              资质成果复核
            </Tag>
            <Title level={3} style={{ color: "#fff", margin: "8px 0 4px" }}>
              学生校外赛事与综合荣誉审阅工作台
            </Title>
            <Text style={{ color: "#c7d2fe", fontSize: 13 }}>
              核验学生提交的区级、市级、省部级及以上官方白名单赛事证书。通过后自动核算荣誉积分（上限12分封顶）。
            </Text>
          </Col>
          <Col>
            <div
              style={{
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(8px)",
                padding: "12px 20px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)",
                textAlign: "center"
              }}
            >
              <TrophyOutlined style={{ fontSize: 24, color: "#fbbf24" }} />
              <div style={{ fontSize: 12, color: "#c7d2fe", marginTop: 4 }}>荣誉法定分值</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>1 ~ 9 分/项</div>
            </div>
          </Col>
        </Row>
      </div>

      <Card
        title="荣誉申报审核队列"
        bordered={false}
        extra={
          <Space>
            <Radio.Group value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} buttonStyle="solid">
              <Radio.Button value="PENDING">待我审核</Radio.Button>
              <Radio.Button value="APPROVED">已核准</Radio.Button>
              <Radio.Button value="REJECTED">已退回</Radio.Button>
              <Radio.Button value="">全部记录</Radio.Button>
            </Radio.Group>
            <Button icon={<ReloadOutlined />} onClick={() => fetchHonors(filterStatus)} />
          </Space>
        }
        style={{ borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
      >
        <Table
          dataSource={honors}
          columns={columns}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: "暂无待审核的荣誉申报单据" }}
        />
      </Card>

      {/* 审核决策弹窗 */}
      <Modal
        title={
          actionType === "APPROVE" ? (
            <Space>
              <CheckCircleOutlined style={{ color: "#059669" }} />
              <span>核准荣誉成果认定</span>
            </Space>
          ) : (
            <Space>
              <CloseCircleOutlined style={{ color: "#dc2626" }} />
              <span>驳回荣誉成果申请</span>
            </Space>
          )
        }
        open={!!selectedHonor}
        onOk={submitDecision}
        onCancel={() => {
          setSelectedHonor(null);
          setActionType(null);
        }}
        confirmLoading={submitting}
        okText={actionType === "APPROVE" ? "确认核准通过" : "确认驳回并退回学生"}
        okButtonProps={{
          danger: actionType === "REJECT",
          style: actionType === "APPROVE" ? { background: "#059669", borderColor: "#059669" } : {}
        }}
        cancelText="取消"
        width={540}
      >
        {selectedHonor && (
          <div style={{ padding: "12px 0" }}>
            <div
              style={{
                background: "#f8fafc",
                padding: 16,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                marginBottom: 16
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <Text type="secondary">申报学生：</Text>
                <Text strong>{selectedHonor.student_name || selectedHonor.student_id}</Text>
              </div>
              <div style={{ marginBottom: 6 }}>
                <Text type="secondary">荣誉名称：</Text>
                <Text strong>{selectedHonor.title}</Text>
              </div>
              <div style={{ marginBottom: 6 }}>
                <Text type="secondary">赛事等第：</Text>
                <Tag color="cyan">{LEVEL_NAMES[selectedHonor.award_level]}</Tag>
                <Tag color="purple">{PRIZE_NAMES[selectedHonor.prize_level]}</Tag>
              </div>
              <div>
                <Text type="secondary">产生积分：</Text>
                <Text style={{ color: "#059669", fontWeight: 700 }}>+{selectedHonor.honor_points} 分</Text>
              </div>
            </div>

            {actionType === "REJECT" ? (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "#1e293b" }}>
                  请详细说明退回驳回原因 (必填)：
                </div>
                <TextArea
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="例如：证书图片边缘缺失防伪钢印，或颁奖单位与官方白名单目录不符，请重新上传完整高精照片。"
                />
              </div>
            ) : (
              <Alert type="success" showIcon message="核准后荣誉积分将直接纳入学期终期综合素质评分（封顶12分）。" />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TeacherHonors;
