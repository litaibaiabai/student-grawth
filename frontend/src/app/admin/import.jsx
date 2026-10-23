import React, { useState } from "react";
import {
  Card,
  Tabs,
  Table,
  Tag,
  Button,
  Space,
  message,
  Input,
  Row,
  Col,
  Typography,
  Alert,
  Divider,
  Statistic,
  Modal
} from "antd";
import {
  CloudUploadOutlined,
  DiffOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  ArrowRightOutlined,
  SyncOutlined
} from "@ant-design/icons";
import { post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const SAMPLE_SUBJECT_RECORDS = [
  { studentId: 4, subjectCode: "CHINESE", subjectName: "语文", score: 92.5 },
  { studentId: 4, subjectCode: "MATH", subjectName: "数学", score: 98.0 },
  { studentId: 4, subjectCode: "ENGLISH", subjectName: "英语", score: 95.0 }
];

const SAMPLE_DIMENSION_RECORDS = [
  { studentId: 4, dimension: "D", score: 95.0 },
  { studentId: 4, dimension: "Z", score: 92.0 },
  { studentId: 4, dimension: "T", score: 88.5 },
  { studentId: 4, dimension: "M", score: 90.0 },
  { studentId: 4, dimension: "L", score: 94.0 },
  { studentId: 4, dimension: "G", score: 96.0 }
];

const AdminImport = () => {
  const [activeType, setActiveType] = useState("subject"); // 'subject' | 'dimension'
  const [jsonText, setJsonText] = useState(JSON.stringify(SAMPLE_SUBJECT_RECORDS, null, 2));
  const [previewData, setPreviewData] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  const handleTabChange = (key) => {
    setActiveType(key);
    setPreviewData(null);
    setCommitResult(null);
    if (key === "subject") {
      setJsonText(JSON.stringify(SAMPLE_SUBJECT_RECORDS, null, 2));
    } else {
      setJsonText(JSON.stringify(SAMPLE_DIMENSION_RECORDS, null, 2));
    }
  };

  const handlePreview = async () => {
    let parsedRecords;
    try {
      parsedRecords = JSON.parse(jsonText);
      if (!Array.isArray(parsedRecords) || parsedRecords.length === 0) {
        throw new Error("必须是包含成绩对象的 JSON 数组");
      }
    } catch (e) {
      message.error("JSON 格式错误：" + e.message);
      return;
    }

    setPreviewing(true);
    try {
      const res = await post(urls.API_IMPORT_PREVIEW, {
        type: activeType.toUpperCase(),
        items: parsedRecords
      });

      if (res.code === 200) {
        setPreviewData(res.data);
        message.success("对比完成，请核对下方变更明细");
      } else {
        message.error(res.message || "比对失败");
      }
    } catch (err) {
      message.error(err.message || "预览请求失败");
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    const validItems = (previewData?.diffs || []).filter((d) => d.valid);
    if (validItems.length === 0) {
      message.warning("没有可导入的有效数据，请先预览并修正错误行");
      return;
    }

    setCommitting(true);
    try {
      const res = await post(urls.API_IMPORT_COMMIT, {
        type: activeType.toUpperCase(),
        items: validItems
      });

      if (res.code === 200) {
        setCommitResult(res.data);
        message.success(`导入成功，批次号：${res.data.batchNo}`);
        setPreviewData(null);
      } else {
        message.error(res.message || "提交入库失败");
      }
    } catch (err) {
      message.error(err.message || "提交失败");
    } finally {
      setCommitting(false);
    }
  };

  const diffColumns = [
    {
      title: "变更类型",
      dataIndex: "action",
      key: "action",
      width: 120,
      render: (act, r) => {
        if (!r.valid) return <Tag color="red">错误</Tag>;
        if (act === "NEW") return <Tag color="green">新增</Tag>;
        if (act === "UPDATE") return <Tag color="orange">修改</Tag>;
        return <Tag color="default">无变化</Tag>;
      }
    },
    {
      title: "学生",
      key: "student",
      width: 140,
      render: (_, r) => (r.studentName ? `${r.studentName} (${r.username})` : <Text code>{r.username || "-"}</Text>)
    },
    {
      title: activeType === "subject" ? "学科" : "六育维度",
      key: "target",
      render: (_, r) => (r.valid ? <Tag color="blue">{r.target}</Tag> : <Text type="danger">{r.error}</Text>)
    },
    {
      title: "现有成绩",
      key: "oldScore",
      render: (_, r) =>
        !r.valid ? null : r.oldScore !== undefined && r.oldScore !== null ? (
          <Text delete style={{ color: "#94a3b8" }}>
            {r.oldScore} 分
          </Text>
        ) : (
          <Text type="secondary">无 (首次录入)</Text>
        )
    },
    {
      title: "导入后成绩",
      key: "newScore",
      render: (_, r) =>
        r.valid ? (
          <Space>
            <ArrowRightOutlined style={{ color: "#3b82f6", fontSize: 12 }} />
            <Text strong style={{ color: r.action === "UPDATE" ? "#ea580c" : "#16a34a" }}>
              {r.newScore} 分
            </Text>
          </Space>
        ) : null
    }
  ];

  const diffs = previewData?.diffs || [];
  const countBy = (fn) => diffs.filter(fn).length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* 顶栏 */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%)",
          borderRadius: 16,
          padding: "24px 32px",
          color: "#fff",
          marginBottom: 24,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)"
        }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Tag color="#60a5fa" style={{ fontWeight: 600, padding: "2px 8px" }}>
              双模态高可靠导入
            </Tag>
            <Title level={3} style={{ color: "#fff", margin: "8px 0 4px" }}>
              成绩导入中心
            </Title>
            <Text style={{ color: "#bfdbfe", fontSize: 13 }}>
              导入前先与系统现有成绩对比，标出新增和修改的记录，确认无误后再入库，每次导入生成批次号便于追溯。
            </Text>
          </Col>
          <Col>
            <CloudUploadOutlined style={{ fontSize: 36, color: "#93c5fd" }} />
          </Col>
        </Row>
      </div>

      <Card bordered={false} style={{ borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        <Tabs
          activeKey={activeType}
          onChange={handleTabChange}
          type="card"
          items={[
            {
              key: "subject",
              label: "1. 文化课与学科期末成绩 (占总评15%)"
            },
            {
              key: "dimension",
              label: "2. 六育主观维度终测评分 (占总评80%)"
            }
          ]}
        />

        <Alert
          message="导入前先预览"
          description="点击【预览变更】后，系统会把填写的成绩与现有成绩逐条对比，列出新增、修改和有错误的行；确认无误后再点【确认导入】才会写入。"
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />

        <Row gutter={24}>
          <Col span={10}>
            <div style={{ marginBottom: 8, fontWeight: 600, color: "#1e293b" }}>
              导入数据 (JSON 数组，每条含学生ID和分数)：
            </div>
            <TextArea
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              style={{ fontFamily: "monospace", fontSize: 13, borderRadius: 8 }}
            />
            <div style={{ marginTop: 12 }}>
              <Button
                type="primary"
                icon={<DiffOutlined />}
                onClick={handlePreview}
                loading={previewing}
                style={{
                  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                  border: "none",
                  borderRadius: 6,
                  height: 38,
                  fontWeight: 600
                }}
              >
                预览变更 (与现有成绩对比)
              </Button>
            </div>
          </Col>

          <Col span={14}>
            {previewData ? (
              <div>
                <div
                  style={{
                    background: "#f8fafc",
                    padding: "16px 20px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    marginBottom: 16
                  }}
                >
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic title="总行数" value={diffs.length} />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="新增"
                        value={countBy((d) => d.valid && d.action === "NEW")}
                        valueStyle={{ color: "#16a34a" }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="修改"
                        value={countBy((d) => d.valid && d.action === "UPDATE")}
                        valueStyle={{ color: "#ea580c" }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic title="错误行" value={countBy((d) => !d.valid)} valueStyle={{ color: "#dc2626" }} />
                    </Col>
                  </Row>
                </div>

                <Table
                  dataSource={diffs}
                  columns={diffColumns}
                  rowKey="row"
                  pagination={{ pageSize: 5 }}
                  size="small"
                />

                <div style={{ marginTop: 16, textAlign: "right" }}>
                  <Button
                    type="primary"
                    size="large"
                    icon={<CheckCircleOutlined />}
                    onClick={handleCommit}
                    loading={committing}
                    style={{
                      background: "#059669",
                      borderColor: "#059669",
                      borderRadius: 8,
                      fontWeight: 600
                    }}
                  >
                    确认导入
                  </Button>
                </div>
              </div>
            ) : commitResult ? (
              <div
                style={{
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  padding: 24,
                  borderRadius: 12,
                  textAlign: "center"
                }}
              >
                <CheckCircleOutlined style={{ fontSize: 48, color: "#059669" }} />
                <Title level={4} style={{ color: "#065f46", margin: "16px 0 8px" }}>
                  成绩导入批次已提交完成！
                </Title>
                <div style={{ fontSize: 14, color: "#047857", marginBottom: 12 }}>
                  导入批次号：
                  <Text copyable strong>
                    {commitResult.batchNo}
                  </Text>
                </div>
                <div style={{ color: "#065f46" }}>
                  本次共导入 <strong>{commitResult.committedCount}</strong> 条成绩。
                </div>
              </div>
            ) : (
              <div
                style={{
                  height: 320,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  background: "#f8fafc",
                  borderRadius: 12,
                  border: "2px dashed #cbd5e1"
                }}
              >
                <FileTextOutlined style={{ fontSize: 40, color: "#94a3b8", marginBottom: 12 }} />
                <Text type="secondary">点击左侧【预览变更】查看导入前后的成绩对比</Text>
              </div>
            )}
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default AdminImport;
