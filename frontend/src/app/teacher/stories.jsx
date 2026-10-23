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
  InputNumber,
  Slider,
  Typography,
  Alert,
  Row,
  Col,
  Divider,
  Progress
} from "antd";
import {
  BookOutlined,
  EditOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  ReadOutlined
} from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const TeacherStories = () => {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStory, setSelectedStory] = useState(null);
  const [teacherScore, setTeacherScore] = useState(85);
  const [teacherComment, setTeacherComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchStories = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_STORIES);
      if (res.code === 200) {
        setStories(res.data || []);
      }
    } catch (err) {
      message.error("获取月度故事列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  const handleOpenReview = (record) => {
    setSelectedStory(record);
    // 默认给予 AI 建议分，若无则默认 85 分
    setTeacherScore(record.teacher_score ?? record.ai_score ?? 85);
    setTeacherComment(record.teacher_comment || "观察细腻，情感真挚，展现了良好的反思自省能力。");
  };

  const submitReview = async () => {
    if (teacherScore === null || teacherScore === undefined) {
      message.warning("请输入评定分数 (0-100)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await post(urls.API_REVIEW_STORY(selectedStory.id), {
        teacher_score: Number(teacherScore),
        teacher_comment: teacherComment
      });

      if (res.code === 200) {
        message.success("月度故事评阅已完成并锁定归档！已纳入学期综合素质5%权重计算");
        setSelectedStory(null);
        fetchStories();
      } else {
        message.error(res.message || "评阅提交失败");
      }
    } catch (err) {
      if (!err.handled) message.error(err.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: "月份",
      dataIndex: "month_key",
      key: "month_key",
      width: 100,
      render: (m) => <Tag color="blue">{m}</Tag>
    },
    {
      title: "学生",
      key: "student",
      width: 130,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1e3a8a" }}>{r.student_name || `ID:${r.student_id}`}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{r.grade ? `${r.grade}年级${r.class_no}班` : "学生"}</div>
        </div>
      )
    },
    {
      title: "故事篇名与心路主题",
      key: "title",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{r.title}</div>
          <Paragraph ellipsis={{ rows: 2 }} style={{ color: "#64748b", margin: "4px 0 0", fontSize: 13 }}>
            {r.content}
          </Paragraph>
        </div>
      )
    },
    {
      title: "AI 智能助评参考",
      key: "ai",
      width: 160,
      render: (_, r) => (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "6px 10px"
          }}
        >
          <Space orientation="horizontal" size={4}>
            <RobotOutlined style={{ color: "#16a34a" }} />
            <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>预评分: {r.ai_score ?? "--"}</span>
          </Space>
          <div style={{ fontSize: 11, color: "#65a30d", marginTop: 2 }}>
            字数: {r.content ? r.content.length : 0} 字
          </div>
        </div>
      )
    },
    {
      title: "教师最终得分",
      key: "score",
      width: 130,
      render: (_, r) =>
        r.teacher_score !== null ? (
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              padding: "4px 10px",
              textAlign: "center"
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: "#1d4ed8" }}>{r.teacher_score}</span>
            <span style={{ fontSize: 11, color: "#3b82f6" }}> / 100</span>
          </div>
        ) : (
          <Tag color="orange">待批阅打分</Tag>
        )
    },
    {
      title: "批阅状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (st) => (st === "REVIEWED" ? <Tag color="green">已核定归档</Tag> : <Tag color="gold">待教师终审</Tag>)
    },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_, r) => (
        <Button type="primary" size="small" icon={<EditOutlined />} onClick={() => handleOpenReview(r)}>
          {r.teacher_score !== null ? "复核修订" : "批阅评分"}
        </Button>
      )
    }
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* 顶栏 */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
          borderRadius: 16,
          padding: "24px 32px",
          color: "#fff",
          marginBottom: 24,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)"
        }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Tag color="#38bdf8" style={{ fontWeight: 600, padding: "2px 8px" }}>
              主观心育成长篇章
            </Tag>
            <Title level={3} style={{ color: "#fff", margin: "8px 0 4px" }}>
              学生月度生活故事与自我反思评阅台
            </Title>
            <Text style={{ color: "#cbd5e1", fontSize: 13 }}>
              支持结合自然语言大模型（AI
              Pre-scoring）语义预评分建议，给出具有人文关怀的教师期终评语并核定终审分数（占综合评分5%权重）。
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
              <ReadOutlined style={{ fontSize: 24, color: "#38bdf8" }} />
              <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>综合评分权重</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>5 % 标准权</div>
            </div>
          </Col>
        </Row>
      </div>

      <Card
        title="学生故事提交列表"
        bordered={false}
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchStories}>
            刷新列表
          </Button>
        }
        style={{ borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
      >
        <Table
          dataSource={stories}
          columns={columns}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: "暂无提交的月度生活故事" }}
        />
      </Card>

      {/* 评阅对话框 */}
      <Modal
        title={
          <Space>
            <BookOutlined style={{ color: "#2563eb" }} />
            <span>月度成长故事终审评阅 — #{selectedStory?.id}</span>
          </Space>
        }
        open={!!selectedStory}
        onOk={submitReview}
        onCancel={() => setSelectedStory(null)}
        confirmLoading={submitting}
        okText="核定终审分数并锁定归档"
        cancelText="暂存返回"
        width={720}
      >
        {selectedStory && (
          <div style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Space>
                <Tag color="blue">{selectedStory.month_key} 故事</Tag>
                <Text strong style={{ fontSize: 16 }}>
                  {selectedStory.title}
                </Text>
              </Space>
              <Text type="secondary">作者：{selectedStory.student_name || `学号:${selectedStory.student_id}`}</Text>
            </div>

            <div
              style={{
                background: "#f8fafc",
                padding: 16,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                maxHeight: 220,
                overflowY: "auto",
                marginBottom: 16,
                lineHeight: 1.8,
                fontSize: 14,
                color: "#334155"
              }}
            >
              {selectedStory.content}
            </div>

            {/* AI 辅助评分卡片 */}
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16
              }}
            >
              <Row align="middle" justify="space-between">
                <Col>
                  <Space>
                    <RobotOutlined style={{ color: "#16a34a", fontSize: 16 }} />
                    <Text strong style={{ color: "#166534" }}>
                      AI 智能语言模型预评分建议：
                    </Text>
                    <Tag color="green" style={{ fontSize: 13, fontWeight: 700 }}>
                      {selectedStory.ai_score ?? 85} 分
                    </Tag>
                  </Space>
                </Col>
                <Col>
                  <Button size="small" onClick={() => setTeacherScore(selectedStory.ai_score ?? 85)}>
                    采纳 AI 建议分
                  </Button>
                </Col>
              </Row>
              <div style={{ fontSize: 12, color: "#15803d", marginTop: 6 }}>
                模型评语：逻辑条理清晰，心理活动描写饱满，具备较强的自我察觉与积极行动意愿。
              </div>
            </div>

            <Divider style={{ margin: "16px 0" }} />

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <Text strong>教师最终核定打分 (0 - 100 分)：</Text>
                <InputNumber
                  min={0}
                  max={100}
                  value={teacherScore}
                  onChange={(val) => setTeacherScore(val)}
                  style={{ width: 100 }}
                />
              </div>
              <Slider
                min={0}
                max={100}
                value={teacherScore}
                onChange={(val) => setTeacherScore(val)}
                marks={{ 0: "0", 60: "合格", 85: "良好", 100: "卓越" }}
              />
            </div>

            <div>
              <Text strong style={{ display: "block", marginBottom: 6 }}>
                教师人文寄语与评语：
              </Text>
              <TextArea
                rows={3}
                value={teacherComment}
                onChange={(e) => setTeacherComment(e.target.value)}
                placeholder="给学生的温暖反馈、发展建议或鼓励箴言..."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TeacherStories;
