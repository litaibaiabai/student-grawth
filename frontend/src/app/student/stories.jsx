import React, { useState, useEffect } from "react";
import { Card, Form, Input, Button, Tag, message, Space, Row, Col, Typography, Alert } from "antd";
import { BookOutlined, SendOutlined, SaveOutlined, RobotOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";
import {storyMonths,currentSchoolMonth} from "@/util/storyMonths";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const monthKeyOf = m => m;

const STATUS_TAG = {
  REVIEWED: { text: "已评分", color: "green" },
  SUBMITTED: { text: "已提交", color: "blue" },
  DRAFT: { text: "写作中", color: "gold" }
};

const StudentStories = () => {
  const [selectedMonth, setSelectedMonth] = useState(currentSchoolMonth);
  const [stories, setStories] = useState([]);
  const [months,setMonths]=useState([]);
  useEffect(()=>{get(urls.API_CURRENT_TERM).then(res=>{if(res.code!==200)return;const values=storyMonths(res.data);setMonths(values);setSelectedMonth(current=>values.some(m=>m.key===current)?current:(values[0]?.key||current));});},[]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [aiFeedback, setAiFeedback] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const fetchStories = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_STORIES);
      if (res.code === 200 && res.data) {
        setStories(res.data);
        const thisMonthStory = res.data.find((s) => s.month_key === monthKeyOf(selectedMonth));
        if (thisMonthStory) {
          const text = thisMonthStory.text_content || thisMonthStory.content || "";
          const nl = text.indexOf("\n");
          if (nl >= 0) {
            setTitle(text.slice(0, nl));
            setContent(text.slice(nl + 1));
          } else {
            setTitle(thisMonthStory.title || text);
            setContent(thisMonthStory.content || "");
          }
          setIsSubmitted(thisMonthStory.status === "REVIEWED" || thisMonthStory.status === "SUBMITTED");
          let ai = null;
          try {
            const raw = thisMonthStory.llm_suggestion;
            ai = typeof raw === "string" ? JSON.parse(raw) : raw;
          } catch {
            ai = null;
          }
          setAiFeedback(ai?.score ? { score: ai.score, suggestion: ai.suggestion } : null);
        } else {
          setTitle("");
          setContent("");
          setIsSubmitted(false);
          setAiFeedback(null);
        }
      }
    } catch {
      // 容错
      setTitle("");
      setContent("");
      setIsSubmitted(false);
      setAiFeedback(null);
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
        month_key: monthKeyOf(selectedMonth),
        title: title.trim(),
        content: `${title.trim()}\n${content.trim()}`,
        is_draft: isDraft
      });

      if (res.code === 200) {
        message.success(isDraft ? "草稿保存成功！" : "生活故事已正式提交！等待教师终审");
        if (!isDraft) setIsSubmitted(true);
        if (res.data?.aiScore) {
          setAiFeedback({
            score: res.data.aiScore,
            suggestion: res.data.aiSuggestion
          });
        }
        fetchStories();
      } else {
        message.error(res.message || "提交失败");
      }
    } catch (err) {
      if (!err.handled) message.error(err.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const currentStory = stories.find((s) => s.month_key === monthKeyOf(selectedMonth));

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}
        >
          MONTHLY GROWTH STORIES
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>月度故事</h1>
        <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>把一个真实的瞬间，写成属于自己的成长故事。</p>
      </div>

      {/* 月份横向时间条 */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", marginBottom: 24 }}>
        {months.map((m) => {
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
              <Tag
                color={
                  (STATUS_TAG[stories.find((s) => s.month_key === monthKeyOf(m.key))?.status] || {}).color || "default"
                }
              >
                {(STATUS_TAG[stories.find((s) => s.month_key === monthKeyOf(m.key))?.status] || {}).text || "未开始"}
              </Tag>
            </button>
          );
        })}
      </div>

      <Row gutter={24}>
        <Col xs={24} lg={15}>
          <Card
            title={
              <Space>
                <Tag color="green">{months.find((m) => m.key === selectedMonth)?.label}故事</Tag>
                <Tag
                  color={
                    currentStory?.status === "REVIEWED"
                      ? "green"
                      : currentStory?.status === "SUBMITTED"
                        ? "blue"
                        : "default"
                  }
                >
                  {currentStory?.status === "REVIEWED"
                    ? "已评分"
                    : currentStory?.status === "SUBMITTED"
                      ? "已提交"
                      : "写作中"}
                </Tag>
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

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid #f0f4f1",
                paddingTop: 16,
                fontSize: 12,
                color: "#9ca89f"
              }}
            >
              <span>{currentStory?.status === "REVIEWED" ? "教师已终审，正式分和评语见下方" : isSubmitted ? "已提交，等待教师人工终审打分" : "草稿保存在系统云端"}</span>
              <span>{content.length} 字</span>
            </div>

            <div style={{ marginTop: 20, textAlign: "right" }}>
              {isSubmitted ? (
                <Tag color="cyan" style={{ fontSize: 13, padding: "4px 12px" }}>
                  已正式提交 · 教师终审分作为G维度来源
                </Tag>
              ) : (
                <Space>
                  <Button icon={<SaveOutlined />} onClick={() => handleSubmit(true)} loading={submitting}>
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
              <div
                style={{
                  marginTop: 20,
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  padding: 16
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534", fontWeight: 600 }}>
                  <RobotOutlined style={{ color: "#16a34a" }} />
                  <span>规则模拟建议 (建议分: {aiFeedback.score} 分)</span>
                  <Tag color="green">仅供参考</Tag>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#15803d", lineHeight: 1.8 }}>
                  {aiFeedback.suggestion}
                </p>
              </div>
            )}

            {currentStory?.status === "REVIEWED" && (
              <div
                style={{
                  marginTop: 16,
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 8,
                  padding: 16
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#1e40af", fontWeight: 600 }}>
                  <CheckCircleOutlined style={{ color: "#2563eb" }} />
                  <span>教师终审确认分：{currentStory.teacher_score} 分</span>
                  <Tag color="blue">已入账</Tag>
                </div>
                {currentStory.teacher_comment && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#1e3a8a", lineHeight: 1.8 }}>
                    评语：{currentStory.teacher_comment}
                  </p>
                )}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Card
            title="写作小灵感"
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7", marginBottom: 20 }}
          >
            <div
              style={{
                background: "#f6f8f5",
                borderRadius: 8,
                padding: "16px 20px",
                lineHeight: 1.8,
                color: "#4e6252",
                fontSize: 13
              }}
            >
              "不必写一件了不起的大事。一次合作、一份坚持、一个小小的生活发现，都可以成为你最动人的成长印记。"
            </div>
            <div style={{ fontSize: 13, color: "#56685c", lineHeight: 2.2, marginTop: 16 }}>
              <div>
                <strong>① 发生了什么？</strong> 写一个具体的场景或瞬间
              </div>
              <div>
                <strong>② 你做了什么？</strong> 记录真实的行动与内心独白
              </div>
              <div>
                <strong>③ 你有什么收获？</strong> 发现自己细微却坚定的改变
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StudentStories;
