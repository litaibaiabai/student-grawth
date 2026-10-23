import React, { useState, useEffect } from "react";
import { Card, Form, Input, Button, Tag, message, Space, Row, Col, Typography, Alert } from "antd";
import { BookOutlined, SendOutlined, SaveOutlined, RobotOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const MONTHS = [
  { key: "09", label: "9 月", status: "已评分", tagType: "green" },
  { key: "10", label: "10 月", status: "写作中", tagType: "gold" },
  { key: "11", label: "11 月", status: "未开始", tagType: "default" },
  { key: "12", label: "12 月", status: "未开始", tagType: "default" },
  { key: "01", label: "1 月", status: "未开始", tagType: "default" }
];

const StudentStories = () => {
  const [selectedMonth, setSelectedMonth] = useState("10");
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("一张属于我们的小小自然笔记");
  const [content, setContent] = useState(
    "这个月，我们班开展了一次校园观察活动。\n\n我和小组同学一起寻找秋天的变化，记录落叶的颜色，也观察种植角里的小生命。刚开始我总是急着说出自己的发现，后来才明白，认真听同伴分享，也是一种收获。\n\n我们把每个人的观察画在一张大纸上，完成了一份属于我们的小小自然笔记。我最开心的不是得到了表扬，而是发现大家一起合作，真的能把事情做得更好。\n\n下个月，我想继续记录身边的变化，也想学会更有耐心地听别人说话。"
  );
  const [aiFeedback, setAiFeedback] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const fetchStories = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_STORIES);
      if (res.code === 200 && res.data) {
        setStories(res.data);
        const thisMonthStory = res.data.find(s => s.month_key === `2026-${selectedMonth}`);
        if (thisMonthStory) {
          setTitle(thisMonthStory.title || "");
          setContent(thisMonthStory.content || "");
          setIsSubmitted(thisMonthStory.status === "REVIEWED" || thisMonthStory.status === "SUBMITTED");
          if (thisMonthStory.ai_score) {
            setAiFeedback({
              score: thisMonthStory.ai_score,
              suggestion: "文稿情感真实，体现了观察、责任与合作意识。"
            });
          }
        }
      }
    } catch {
      // 容错
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, [selectedMonth]);

  const handleSubmit = async (isDraft = false) => {
    if (!title.trim() || !content.trim()) {
      message.warning("请填写故事篇名与正文内容");
      return;
    }

    setSubmitting(true);
    try {
      const res = await post(urls.API_SUBMIT_STORY, {
        month_key: `2026-${selectedMonth}`,
        title: title.trim(),
        content: content.trim(),
        is_draft: isDraft
      });

      if (res.code === 200) {
        message.success(isDraft ? "草稿保存成功！" : "生活故事已正式提交！等待教师终审");
        if (!isDraft) setIsSubmitted(true);
        if (res.data?.ai_score) {
          setAiFeedback({
            score: res.data.ai_score,
            suggestion: res.data.ai_suggestion || "文稿情感真挚，展现了敏锐的观察力与团队合作精神。"
          });
        }
        fetchStories();
      } else {
        message.error(res.message || "提交失败");
      }
    } catch (err) {
      message.error(err.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}>
          MONTHLY GROWTH STORIES
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>
          月度故事
        </h1>
        <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>
          把一个真实的瞬间，写成属于自己的成长故事。
        </p>
      </div>

      {/* 月份横向时间条 */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", marginBottom: 24 }}>
        {MONTHS.map((m) => {
          const isActive = selectedMonth === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setSelectedMonth(m.key)}
              style={{
                border: isActive ? "1px solid #277460" : "1px solid #e6ebe7",
                borderRadius: 8,
                background: isActive ? "#edf5f0" : "#ffffff",
                padding: "12px 20px",
                minWidth: 110,
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: isActive ? "#277460" : "#25332d", marginBottom: 4 }}>
                {m.label}
              </div>
              <Tag color={m.tagType}>{m.status}</Tag>
            </button>
          );
        })}
      </div>

      <Row gutter={24}>
        <Col span={15}>
          <Card
            title={
              <Space>
                <Tag color="green">10月28日截止</Tag>
                <Tag color={isSubmitted ? "blue" : "default"}>{isSubmitted ? "已提交" : "草稿状态"}</Tag>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入本月生活故事篇名..."
              disabled={isSubmitted}
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#1e382b",
                border: "none",
                borderBottom: "1px solid #e6ebe7",
                borderRadius: 0,
                padding: "8px 0 14px",
                marginBottom: 16
              }}
            />

            <TextArea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="记录一个真实的场景、你的真实行动和内心的收获感受..."
              disabled={isSubmitted}
              style={{
                fontSize: 14,
                lineHeight: 2,
                color: "#3a4a3f",
                border: "none",
                borderRadius: 0,
                resize: "none"
              }}
            />

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid #f0f4f1",
              paddingTop: 16,
              fontSize: 12,
              color: "#9ca89f"
            }}>
              <span>{isSubmitted ? "已提交，等待教师人工终审打分" : "草稿保存在系统云端"}</span>
              <span>{content.length} 字</span>
            </div>

            <div style={{ marginTop: 20, textAlign: "right" }}>
              {isSubmitted ? (
                <Tag color="cyan" style={{ fontSize: 13, padding: "4px 12px" }}>
                  已正式提交 · 占期末综合分 5%
                </Tag>
              ) : (
                <Space>
                  <Button
                    icon={<SaveOutlined />}
                    onClick={() => handleSubmit(true)}
                    loading={submitting}
                  >
                    保存草稿
                  </Button>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => handleSubmit(false)}
                    loading={submitting}
                    style={{
                      background: "#277460",
                      borderColor: "#277460",
                      fontWeight: 600
                    }}
                  >
                    提交本月故事
                  </Button>
                </Space>
              )}
            </div>

            {aiFeedback && (
              <div style={{
                marginTop: 20,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 8,
                padding: 16
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534", fontWeight: 600 }}>
                  <RobotOutlined style={{ color: "#16a34a" }} />
                  <span>AI 智能语义预评参考 (建议分: {aiFeedback.score} 分)</span>
                  <Tag color="green">仅供参考</Tag>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#15803d", lineHeight: 1.8 }}>
                  {aiFeedback.suggestion}
                </p>
              </div>
            )}
          </Card>
        </Col>

        <Col span={9}>
          <Card
            title="写作小灵感"
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7", marginBottom: 20 }}
          >
            <div style={{
              background: "#f6f8f5",
              borderRadius: 8,
              padding: "16px 20px",
              lineHeight: 1.8,
              color: "#4e6252",
              fontSize: 13
            }}>
              "不必写一件了不起的大事。一次合作、一份坚持、一个小小的生活发现，都可以成为你最动人的成长印记。"
            </div>
            <div style={{ fontSize: 13, color: "#56685c", lineHeight: 2.2, marginTop: 16 }}>
              <div><strong>① 发生了什么？</strong> 写一个具体的场景或瞬间</div>
              <div><strong>② 你做了什么？</strong> 记录真实的行动与内心独白</div>
              <div><strong>③ 你有什么收获？</strong> 发现自己细微却坚定的改变</div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StudentStories;
