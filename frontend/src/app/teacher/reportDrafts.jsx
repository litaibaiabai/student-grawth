import React, { useState, useEffect } from "react";
import {
  Card,
  Select,
  Input,
  Button,
  Tag,
  Space,
  Alert,
  Row,
  Col,
  message,
  Typography,
  Spin,
  Descriptions,
  Badge
} from "antd";
import {
  FileTextOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const TeacherReportDrafts = () => {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [citedEvidence, setCitedEvidence] = useState([]);

  // 加载学生列表
  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await get(urls.API_STUDENTS_LIST);
      if (res && res.code === 200 && Array.isArray(res.data)) {
        setStudents(res.data);
      }
    } catch (err) {
      console.error("加载学生列表失败", err);
    }
  };

  // 生成/获取草稿
  const handleLoadDraft = async (studentId) => {
    if (!studentId) return;
    setSelectedStudentId(studentId);
    setLoading(true);
    try {
      const res = await post(urls.API_TEACHER_REPORT_DRAFT, { studentId });
      if (res && res.code === 200 && res.data) {
        setDraft(res.data);
        setComment(res.data.teacherComment || "");
      } else {
        message.error(res?.message || "获取报告草稿失败");
      }
    } catch (err) {
      message.error(err?.message || "请求草稿失败");
    } finally {
      setLoading(false);
    }
  };

  // 生成 AI 寄语建议
  const handleGenerateAiComment = async () => {
    if (!draft) return;
    setAiGenerating(true);
    try {
      const res = await post(urls.API_TEACHER_REPORT_AI_COMMENT(draft.draftId), {
        expectedFingerprint: draft.approvalFingerprint
      });
      if (res && res.code === 200 && res.data) {
        setAiSuggestion(res.data.suggestionText || "");
        setCitedEvidence(res.data.citedEvidence || []);
        message.success("AI 寄语建议生成完成，请班主任核对！");
      } else {
        message.error(res?.message || "生成寄语建议失败，请重试或直接手写");
      }
    } catch (err) {
      message.error(err?.message || "模型服务调用异常，可重试或直接手写寄语");
    } finally {
      setAiGenerating(false);
    }
  };

  // 确认草稿
  const handleConfirm = async () => {
    if (!draft) return;
    if (!comment.trim()) {
      message.warning("请填写学期寄语后再确认报告");
      return;
    }

    setSubmitting(true);
    try {
      const res = await post(urls.API_TEACHER_REPORT_CONFIRM, {
        draftId: draft.draftId,
        expectedFingerprint: draft.approvalFingerprint,
        comment: comment.trim()
      });

      if (res && res.code === 200) {
        message.success("报告草稿与学期寄语已确认通过！");
        // 刷新草稿状态
        handleLoadDraft(selectedStudentId);
      } else if (res?.code === 409 || res?.message?.includes("变动")) {
        message.error("来源数据已变动或指纹陈旧，请刷新草稿后重新确认");
        handleLoadDraft(selectedStudentId);
      } else {
        message.error(res?.message || "确认失败");
      }
    } catch (err) {
      if (err?.response?.status === 409 || err?.status === 409) {
        message.error("报告数据源已更新，请重新核对草稿后确认！");
        handleLoadDraft(selectedStudentId);
      } else {
        message.error(err?.message || "确认失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = () => {
    if (!draft) return null;
    if (draft.isStale) {
      return <Badge status="warning" text="来源已变更 (待重新确认)" />;
    }
    if (draft.status === "CONFIRMED") {
      return <Badge status="success" text="已确认 (可发布)" />;
    }
    if (draft.status === "PENDING_CONFIRMATION") {
      return <Badge status="processing" text="待班主任确认" />;
    }
    return <Badge status="default" text="草稿 (编辑中)" />;
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <Title level={3}>
        <FileTextOutlined style={{ marginRight: 8, color: "#1890ff" }} />
        学期报告草稿与班主任确认
      </Title>
      <Paragraph type="secondary">
        班主任专属面板：按学期自动汇总六维评价、学科成绩、行为流水、荣誉及生活故事等证据，手写学期唯一寄语并确认。
      </Paragraph>

      <Card style={{ marginBottom: 20 }}>
        <Space orientation="horizontal" size="middle">
          <Text strong>选择学生：</Text>
          <Select
            placeholder="请选择学生"
            style={{ width: 240 }}
            value={selectedStudentId}
            onChange={(val) => handleLoadDraft(val)}
          >
            {students.map((st) => (
              <Option key={st.id} value={st.id}>
                {st.real_name || st.username} (年级:{st.grade} 班级:{st.class_no})
              </Option>
            ))}
          </Select>
          {selectedStudentId && (
            <Button
              icon={<SyncOutlined />}
              onClick={() => handleLoadDraft(selectedStudentId)}
              loading={loading}
            >
              刷新草稿
            </Button>
          )}
        </Space>
      </Card>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px" }}>
          <Spin orientation="vertical" size="large" />
        </div>
      ) : draft ? (
        <div>
          {draft.isStale && (
            <Alert
              message="来源数据已更新"
              description="本学期的日常积分、成绩或故事等来源版本已发生变动，原确认已自动失效，请重新核对证据并确认。"
              type="warning"
              showIcon
              style={{ marginBottom: 20 }}
            />
          )}

          <Card
            title={
              <Space>
                <span>报告草稿详情 (ID: {draft.draftId})</span>
                {renderStatusBadge()}
              </Space>
            }
            style={{ marginBottom: 20 }}
          >
            <Descriptions bordered size="small" column={{ xxl: 4, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
              <Descriptions.Item label="来源版本 (sourceRevision)">{draft.sourceRevision}</Descriptions.Item>
              <Descriptions.Item label="规则版本 (policyVersion)">{draft.policyVersion || "V1"}</Descriptions.Item>
              <Descriptions.Item label="审批指纹">
                <Text code copyable>{draft.approvalFingerprint?.slice(0, 16)}...</Text>
              </Descriptions.Item>
              <Descriptions.Item label="综合折算分">
                <Text strong style={{ color: "#1890ff", fontSize: 16 }}>
                  {draft.draftSnapshot?.evaluationSnapshot?.comprehensiveScore || "待核算"}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 20 }}>
              <Title level={5}>六育各维度与缺项概览</Title>
              {draft.draftSnapshot?.missingItems?.length > 0 ? (
                <Alert
                  type="info"
                  message={`缺项或免测提醒: ${draft.draftSnapshot.missingItems.join(", ")}`}
                  style={{ marginBottom: 12 }}
                />
              ) : (
                <Tag color="green">所有六育指标与证据完整就绪</Tag>
              )}
            </div>
          </Card>

          <Card
            title="班主任学期寄语 (手写/修订/AI辅助)"
            style={{ marginBottom: 20 }}
            extra={
              <Button
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateAiComment}
                loading={aiGenerating}
              >
                生成 AI 寄语建议 (脱敏证据)
              </Button>
            }
          >
            {aiSuggestion && (
              <Alert
                type="info"
                style={{ marginBottom: 16 }}
                message={
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <div>
                      <Text strong>🤖 AI 建议参考 (来源: MODEL):</Text>
                      <Paragraph style={{ margin: "8px 0" }}>{aiSuggestion}</Paragraph>
                    </div>
                    {citedEvidence.length > 0 && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          引用证据项: {citedEvidence.join(", ")}
                        </Text>
                      </div>
                    )}
                    <Button
                      size="small"
                      type="link"
                      onClick={() => setComment(aiSuggestion)}
                    >
                      填入编辑框进行核对与修改
                    </Button>
                  </Space>
                }
              />
            )}
            <TextArea
              rows={4}
              placeholder="请输入对该学生的唯一学期寄语（可人工手写，亦可核对并采纳AI建议，不强制等待家长评语）..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleConfirm}
              loading={submitting}
              size="large"
            >
              确认并绑定审批指纹
            </Button>
          </Card>
        </div>
      ) : (
        <Card style={{ textAlign: "center", padding: "40px" }}>
          <Text type="secondary">请在上方的下拉菜单中选择一个学生以加载报告草稿</Text>
        </Card>
      )}
    </div>
  );
};

export default TeacherReportDrafts;
