import React, { useState } from "react";
import {
  Card, Tabs, Table, Tag, Button, Space, message, Input,
  Row, Col, Typography, Alert, Divider, Statistic, Modal
} from "antd";
import {
  CloudUploadOutlined, DiffOutlined, CheckCircleOutlined,
  FileTextOutlined, ArrowRightOutlined, SyncOutlined
} from "@ant-design/icons";
import { post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const SAMPLE_SUBJECT_RECORDS = [
  { student_id: 1, term_id: 1, subject_name: "语文", raw_score: 92.5, full_score: 100, exam_type: "FINAL" },
  { student_id: 1, term_id: 1, subject_name: "数学", raw_score: 98.0, full_score: 100, exam_type: "FINAL" },
  { student_id: 1, term_id: 1, subject_name: "英语", raw_score: 95.0, full_score: 100, exam_type: "FINAL" }
];

const SAMPLE_DIMENSION_RECORDS = [
  { student_id: 1, term_id: 1, dimension_code: "D", score_100: 95.0 },
  { student_id: 1, term_id: 1, dimension_code: "Z", score_100: 92.0 },
  { student_id: 1, term_id: 1, dimension_code: "T", score_100: 88.5 },
  { student_id: 1, term_id: 1, dimension_code: "M", score_100: 90.0 },
  { student_id: 1, term_id: 1, dimension_code: "L", score_100: 94.0 },
  { student_id: 1, term_id: 1, dimension_code: "X", score_100: 96.0 }
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
        type: activeType,
        records: parsedRecords
      });

      if (res.code === 200) {
        setPreviewData(res.data);
        message.success("内存比对完成！请复核差异项");
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
    if (!previewData || !previewData.diff_items) {
      message.warning("请先执行内存比对");
      return;
    }

    setCommitting(true);
    try {
      const parsedRecords = JSON.parse(jsonText);
      const res = await post(urls.API_IMPORT_COMMIT, {
        type: activeType,
        records: parsedRecords
      });

      if (res.code === 200) {
        setCommitResult(res.data);
        message.success(`原子提交成功！导入批次号: ${res.data.batch_no}`);
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
      render: (act) => {
        if (act === "INSERT") return <Tag color="green">新增记录 (INSERT)</Tag>;
        if (act === "UPDATE") return <Tag color="orange">更新覆盖 (UPDATE)</Tag>;
        return <Tag color="default">数据一致 (UNCHANGED)</Tag>;
      }
    },
    {
      title: "学生 ID",
      dataIndex: "student_id",
      key: "student_id",
      width: 100,
      render: (id) => <Text code>#{id}</Text>
    },
    {
      title: activeType === "subject" ? "学科名称" : "六育维度代码",
      key: "target",
      render: (_, r) => (
        activeType === "subject" ? (
          <Tag color="blue">{r.subject_name}</Tag>
        ) : (
          <Tag color="cyan">{r.dimension_code}</Tag>
        )
      )
    },
    {
      title: "比对前原始分",
      key: "old_score",
      render: (_, r) => (
        r.old_score !== undefined && r.old_score !== null ? (
          <Text delete style={{ color: "#94a3b8" }}>{r.old_score} 分</Text>
        ) : (
          <Text type="secondary">空 (新录入)</Text>
        )
      )
    },
    {
      title: "本次导入目标分",
      key: "new_score",
      render: (_, r) => (
        <Space>
          <ArrowRightOutlined style={{ color: "#3b82f6", fontSize: 12 }} />
          <Text strong style={{ color: r.action === "UPDATE" ? "#ea580c" : "#16a34a" }}>
            {r.new_score ?? r.raw_score ?? r.score_100} 分
          </Text>
        </Space>
      )
    }
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* 顶栏 */}
      <div style={{
        background: "linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%)",
        borderRadius: 16,
        padding: "24px 32px",
        color: "#fff",
        marginBottom: 24,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)"
      }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Tag color="#60a5fa" style={{ fontWeight: 600, padding: "2px 8px" }}>双模态高可靠导入</Tag>
            <Title level={3} style={{ color: "#fff", margin: "8px 0 4px" }}>
              教务成绩与六育底表 Diff 比对导入中心
            </Title>
            <Text style={{ color: "#bfdbfe", fontSize: 13 }}>
              支持在落盘前于内存中进行精确全量比对，标注新增与更新差异，并赋予全局批次号 (Batch No) 保证追溯性。
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
          message="防覆盖风控原则"
          description="系统绝不执行盲目覆盖写入。点击【内存比对】后，引擎将与数据库现存记录进行主键和内容对比，并生成可视化变更凭据。"
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />

        <Row gutter={24}>
          <Col span={10}>
            <div style={{ marginBottom: 8, fontWeight: 600, color: "#1e293b" }}>
              导入数据载荷 (JSON Array 格式)：
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
                计算 Diff 比对 (In-Memory Preview)
              </Button>
            </div>
          </Col>

          <Col span={14}>
            {previewData ? (
              <div>
                <div style={{
                  background: "#f8fafc",
                  padding: "16px 20px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  marginBottom: 16
                }}>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic title="待处理总数" value={previewData.summary?.total || 0} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="拟新增 (INSERT)" value={previewData.summary?.insert || 0} valueStyle={{ color: "#16a34a" }} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="拟更新 (UPDATE)" value={previewData.summary?.update || 0} valueStyle={{ color: "#ea580c" }} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="无变化 (IDENTICAL)" value={previewData.summary?.unchanged || 0} valueStyle={{ color: "#64748b" }} />
                    </Col>
                  </Row>
                </div>

                <Table
                  dataSource={previewData.diff_items || []}
                  columns={diffColumns}
                  rowKey={(r, i) => `${r.student_id}_${r.subject_name || r.dimension_code}_${i}`}
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
                    原子事务提交入库 (Commit)
                  </Button>
                </div>
              </div>
            ) : commitResult ? (
              <div style={{
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                padding: 24,
                borderRadius: 12,
                textAlign: "center"
              }}>
                <CheckCircleOutlined style={{ fontSize: 48, color: "#059669" }} />
                <Title level={4} style={{ color: "#065f46", margin: "16px 0 8px" }}>
                  成绩导入批次已提交完成！
                </Title>
                <div style={{ fontSize: 14, color: "#047857", marginBottom: 12 }}>
                  全局追踪流水号：<Text copyable strong>{commitResult.batch_no}</Text>
                </div>
                <div style={{ color: "#065f46" }}>
                  本次已入库新增 <strong>{commitResult.inserted}</strong> 条，覆盖更新 <strong>{commitResult.updated}</strong> 条。
                </div>
              </div>
            ) : (
              <div style={{
                height: 320,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                background: "#f8fafc",
                borderRadius: 12,
                border: "2px dashed #cbd5e1"
              }}>
                <FileTextOutlined style={{ fontSize: 40, color: "#94a3b8", marginBottom: 12 }} />
                <Text type="secondary">点击左侧【计算 Diff 比对】以激活差异审计面板</Text>
              </div>
            )}
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default AdminImport;
