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
  Modal,
  Upload,
  Spin,
  Result
} from "antd";
import {
  CloudUploadOutlined,
  DiffOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  InboxOutlined,
  DownloadOutlined,
  WarningOutlined,
  ReloadOutlined,
  FileExcelOutlined
} from "@ant-design/icons";
import { post } from "@/util/request";
import token from "@/util/token";
import * as urls from "@/constant/urls";
import {
  parseScoreExcel,
  downloadScoreTemplate,
  exportErrorReportExcel
} from "@/util/excelScoreParser";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

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
  const currentUser = token.loadUser() || {};
  const isTeacher = currentUser.role === "teacher";

  // 主模式：'excel' (全校批量) | 'json' (单条/调试)
  const [importMode, setImportMode] = useState("excel");
  const [activeType, setActiveType] = useState("subject"); // 'subject' | 'dimension'

  // Excel 批量导入状态
  const [excelFile, setExcelFile] = useState(null);
  const [parsingExcel, setParsingExcel] = useState(false);
  const [rawParsedRows, setRawParsedRows] = useState([]);
  const [batchPreviewData, setBatchPreviewData] = useState(null);
  const [batchPreviewing, setBatchPreviewing] = useState(false);
  const [batchCommitting, setBatchCommitting] = useState(false);
  const [batchCommitResult, setBatchCommitResult] = useState(null);

  // 传统 JSON 模式状态 (保留兼容)
  const [jsonText, setJsonText] = useState(JSON.stringify(SAMPLE_SUBJECT_RECORDS, null, 2));
  const [previewData, setPreviewData] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  const handleTabChange = (key) => {
    setActiveType(key);
    setPreviewData(null);
    setCommitResult(null);
    setBatchPreviewData(null);
    setBatchCommitResult(null);
    setExcelFile(null);
    setRawParsedRows([]);
    if (key === "subject") {
      setJsonText(JSON.stringify(SAMPLE_SUBJECT_RECORDS, null, 2));
    } else {
      setJsonText(JSON.stringify(SAMPLE_DIMENSION_RECORDS, null, 2));
    }
  };

  // ---------------- Excel 批量导入流程 ----------------

  const handleUploadFile = async (file) => {
    setParsingExcel(true);
    setBatchPreviewData(null);
    setBatchCommitResult(null);
    setExcelFile(file);

    try {
      const parsed = await parseScoreExcel(file, activeType.toUpperCase());
      if (!parsed.rows || parsed.rows.length === 0) {
        message.error("未在 Excel 中识别到有效的学生成绩数据行，请参考标准模板填写");
        setParsingExcel(false);
        return false;
      }
      setRawParsedRows(parsed.rows);
      message.loading({ content: `正在向服务器提交体检分析 (共 ${parsed.rows.length} 名学生)...`, key: "previewBatch" });

      setBatchPreviewing(true);
      const res = await post(urls.API_IMPORT_BATCH_PREVIEW, {
        type: activeType.toUpperCase(),
        rows: parsed.rows
      });

      if (res.code === 200) {
        setBatchPreviewData(res.data);
        message.success({ content: `文件体检完成！正常 ${res.data.validCount} 人，异常 ${res.data.invalidCount} 人`, key: "previewBatch" });
      } else {
        message.error({ content: res.message || "体检失败", key: "previewBatch" });
      }
    } catch (err) {
      message.error({ content: "Excel 文件解析或体检请求异常: " + (err.message || "未知错误"), key: "previewBatch" });
    } finally {
      setParsingExcel(false);
      setBatchPreviewing(false);
    }
    return false; // 阻止 antd 自动上传行为
  };

  const handleBatchCommit = async () => {
    if (!batchPreviewData || !batchPreviewData.validStudents || batchPreviewData.validStudents.length === 0) {
      message.warning("没有可入库的有效正常数据！");
      return;
    }

    setBatchCommitting(true);
    try {
      const res = await post(urls.API_IMPORT_BATCH_COMMIT, {
        type: activeType.toUpperCase(),
        validStudents: batchPreviewData.validStudents,
        termId: batchPreviewData.termId
      });

      if (res.code === 200) {
        setBatchCommitResult(res.data);
        message.success(`全校成绩入库成功！入账 ${res.data.committedStudents} 名学生`);
      } else {
        message.error(res.message || "入库提交失败");
      }
    } catch (err) {
      message.error("入库提交失败: " + (err.message || "网络异常"));
    } finally {
      setBatchCommitting(false);
    }
  };

  const handleExportErrors = () => {
    if (!batchPreviewData || !batchPreviewData.errors || batchPreviewData.errors.length === 0) {
      message.info("当前导入没有异常数据");
      return;
    }
    exportErrorReportExcel(batchPreviewData.errors, rawParsedRows, activeType.toUpperCase());
    message.success("已生成并下载异常数据 Excel 表格，修改后可单独补传！");
  };

  const handleResetExcel = () => {
    setExcelFile(null);
    setRawParsedRows([]);
    setBatchPreviewData(null);
    setBatchCommitResult(null);
  };

  // ---------------- 传统 JSON 模式处理 (保留兼容) ----------------

  const handlePreview = async () => {
    if (!jsonText || !jsonText.trim()) {
      message.error("导入数据不能为空，请至少录入一条学生成绩数据");
      return;
    }
    let parsedRecords;
    try {
      parsedRecords = JSON.parse(jsonText);
    } catch (e) {
      message.error("JSON 语法解析失败，请检查括号与引号格式是否完整");
      return;
    }
    if (!Array.isArray(parsedRecords) || parsedRecords.length === 0) {
      message.error("导入数据不能为空，请至少录入一条学生成绩数据");
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
      if (!err.handled) message.error(err.message || "预览请求失败");
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
      if (!err.handled) message.error(err.message || "提交失败");
    } finally {
      setCommitting(false);
    }
  };

  // 异常明细表列
  const errorColumns = [
    {
      title: "Excel行号",
      dataIndex: "rowNum",
      key: "rowNum",
      width: 110,
      render: (r) => <Tag color="default">第 {r} 行</Tag>
    },
    {
      title: "填写学号",
      dataIndex: "username",
      key: "username",
      width: 140,
      render: (u) => <Text code>{u || "（未填写）"}</Text>
    },
    {
      title: "姓名",
      dataIndex: "realName",
      key: "realName",
      width: 120,
      render: (n) => n || "—"
    },
    {
      title: "错误诊断原因",
      dataIndex: "reason",
      key: "reason",
      render: (reason) => (
        <span style={{ color: "#dc2626", fontWeight: 500 }}>
          <WarningOutlined style={{ marginRight: 6 }} />
          {reason}
        </span>
      )
    }
  ];

  const diffs = previewData?.diffs || [];
  const countBy = (predicate) => diffs.filter(predicate).length;

  return (
    <div style={{ padding: "0 8px 32px" }}>
      {/* 顶部 Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
          padding: "24px 32px",
          borderRadius: 16,
          marginBottom: 24,
          color: "#fff",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)"
        }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Tag color="#60a5fa" style={{ fontWeight: 600, padding: "2px 8px" }}>
                全校级大吞吐量支持
              </Tag>
              <Tag color="cyan">支持 2000~3000 人 Excel</Tag>
            </Space>
            <Title level={3} style={{ color: "#fff", margin: "8px 0 4px" }}>
              学生成绩批量导入中心
            </Title>
            <Text style={{ color: "#bfdbfe", fontSize: 13 }}>
              支持教务处直接导入涵盖全校各学科的 Excel 汇总大总表，自动分流正常入库与异常隔离，支持错误名单一键导出补传。
            </Text>
          </Col>
          <Col>
            <CloudUploadOutlined style={{ fontSize: 44, color: "#93c5fd" }} />
          </Col>
        </Row>
      </div>

      <Card bordered={false} style={{ borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        {/* 一级导航：导入分类（学科期末 vs 六育主观终测） */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Tabs
              activeKey={activeType}
              onChange={handleTabChange}
              type="card"
              items={[
                {
                  key: "subject",
                  label: isTeacher ? "任教学科期末成绩（独立记录）" : "1. 文化课与学科期末成绩 (全科大总表)"
                },
                ...(!isTeacher
                  ? [
                      {
                        key: "dimension",
                        label: "2. 六育主观维度终测评分 (占总评80%)"
                      }
                    ]
                  : [])
              ]}
            />
          </Col>
          <Col>
            <Space>
              <Button
                type="dashed"
                icon={<DownloadOutlined />}
                onClick={() => downloadScoreTemplate(activeType)}
                style={{ borderColor: "#2563eb", color: "#2563eb", fontWeight: 500 }}
              >
                下载《{activeType === "subject" ? "期末学科成绩" : "六育终测评分"}标准 Excel 模板》
              </Button>
              <Tabs
                activeKey={importMode}
                onChange={setImportMode}
                size="small"
                items={[
                  { key: "excel", label: "📊 Excel 批量导入 (推荐)" },
                  { key: "json", label: "🔧 JSON 开发者调试" }
                ]}
              />
            </Space>
          </Col>
        </Row>

        {/* ---------------- 模式一：Excel 批量导入 ---------------- */}
        {importMode === "excel" ? (
          <div>
            {!batchCommitResult ? (
              <div>
                {/* 拖拽上传区域 */}
                {!batchPreviewData && (
                  <div style={{ marginBottom: 24 }}>
                    <Dragger
                      name="scoreExcel"
                      accept=".xlsx, .xls"
                      multiple={false}
                      showUploadList={false}
                      beforeUpload={handleUploadFile}
                      style={{
                        padding: "36px 20px",
                        background: "#f8fafc",
                        border: "2px dashed #93c5fd",
                        borderRadius: 16
                      }}
                    >
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined style={{ color: "#2563eb", fontSize: 52 }} />
                      </p>
                      <p className="ant-upload-text" style={{ fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                        点击或将全校成绩 Excel 表格拖拽到此处
                      </p>
                      <p className="ant-upload-hint" style={{ color: "#64748b", fontSize: 13 }}>
                        支持 .xlsx, .xls 格式，单表支持 3,000 名学生及 10+ 门学科横向汇总导入。
                      </p>
                      <div style={{ marginTop: 12 }}>
                        <Button type="primary" icon={<FileExcelOutlined />} style={{ borderRadius: 8 }}>
                          选择本地 Excel 文件
                        </Button>
                      </div>
                    </Dragger>
                  </div>
                )}

                {/* 正在解析加载中 */}
                {(parsingExcel || batchPreviewing) && (
                  <div style={{ padding: "40px 0", textAlign: "center" }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16, color: "#475569", fontWeight: 500 }}>
                      正在解析全校学生名单并执行分流体检，请稍候...
                    </div>
                  </div>
                )}

                {/* 体检分析卡片与异常明细 */}
                {batchPreviewData && !parsingExcel && (
                  <div>
                    <div
                      style={{
                        background: "#f8fafc",
                        padding: "20px 24px",
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        marginBottom: 20
                      }}
                    >
                      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                        <Col>
                          <Space size="middle">
                            <Tag color="blue" style={{ fontSize: 13, padding: "2px 8px" }}>
                              当前文件：{excelFile?.name || "成绩汇总表.xlsx"}
                            </Tag>
                            <Text type="secondary">（共解析 {batchPreviewData.totalStudents} 名学生）</Text>
                          </Space>
                        </Col>
                        <Col>
                          <Space>
                            <Button icon={<ReloadOutlined />} onClick={handleResetExcel}>
                              重新选择文件
                            </Button>
                            {batchPreviewData.invalidCount > 0 && (
                              <Button
                                danger
                                icon={<DownloadOutlined />}
                                onClick={handleExportErrors}
                                style={{ fontWeight: 500 }}
                              >
                                导出 {batchPreviewData.invalidCount} 条异常名单 (Excel)
                              </Button>
                            )}
                            <Button
                              type="primary"
                              size="large"
                              icon={<CheckCircleOutlined />}
                              onClick={handleBatchCommit}
                              loading={batchCommitting}
                              disabled={batchPreviewData.validCount === 0}
                              style={{
                                background: "#059669",
                                borderColor: "#059669",
                                borderRadius: 8,
                                fontWeight: 600
                              }}
                            >
                              确认写入 {batchPreviewData.validCount} 条正常成绩
                            </Button>
                          </Space>
                        </Col>
                      </Row>

                      {/* 统计指标卡 */}
                      <Row gutter={16}>
                        <Col span={6}>
                          <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            <Statistic
                              title="正常待入库学生"
                              value={batchPreviewData.validCount}
                              valueStyle={{ color: "#16a34a", fontWeight: "bold" }}
                              suffix={<span style={{ fontSize: 13, fontWeight: "normal" }}>人</span>}
                            />
                          </div>
                        </Col>
                        <Col span={6}>
                          <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            <Statistic
                              title="异常阻断行（自动剔除）"
                              value={batchPreviewData.invalidCount}
                              valueStyle={{ color: batchPreviewData.invalidCount > 0 ? "#dc2626" : "#64748b", fontWeight: "bold" }}
                              suffix={<span style={{ fontSize: 13, fontWeight: "normal" }}>人</span>}
                            />
                          </div>
                        </Col>
                        <Col span={12}>
                          <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                              检测到的考核科目/维度 ({batchPreviewData.subjectsDetected?.length || 0} 项)：
                            </div>
                            <Space wrap size={[4, 6]}>
                              {(batchPreviewData.subjectsDetected || []).map((code) => (
                                <Tag key={code} color="geekblue" style={{ borderRadius: 4 }}>
                                  {code}
                                </Tag>
                              ))}
                            </Space>
                          </div>
                        </Col>
                      </Row>
                    </div>

                    {/* 异常表格明细 */}
                    {batchPreviewData.invalidCount > 0 ? (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontWeight: 600, color: "#dc2626" }}>
                            ⚠️ 异常数据明细（系统将自动跳过以下行，其余正常数据可照常入库）：
                          </span>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            提示：点击右上角【导出异常名单 (Excel)】发给班主任修正后，可单独重新导入补全。
                          </Text>
                        </div>
                        <Table
                          dataSource={batchPreviewData.errors}
                          columns={errorColumns}
                          rowKey={(r) => `${r.rowNum}_${r.username}`}
                          pagination={{ pageSize: 8 }}
                          size="small"
                          bordered
                        />
                      </div>
                    ) : (
                      <Alert
                        message="全表数据格式校验 100% 通过！"
                        description="未发现任何无效学号或异常分值，可直接点击右上角【确认写入】完成全校入库。"
                        type="success"
                        showIcon
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* 入库成功结果展示页 */
              <Result
                status="success"
                title="全校学生成绩批量导入成功！"
                subTitle={
                  <Space direction="vertical" size="small" style={{ marginTop: 8 }}>
                    <div>
                      入库流水批次号：
                      <Text copyable strong style={{ fontSize: 15, color: "#059669" }}>
                        {batchCommitResult.batchNo}
                      </Text>
                    </div>
                    <div>
                      本次已成功原子落库 <strong>{batchCommitResult.committedStudents}</strong> 名学生，共计{" "}
                      <strong>{batchCommitResult.committedScoresCount}</strong> 项科目分值。
                    </div>
                  </Space>
                }
                extra={[
                  <Button type="primary" key="continue" icon={<ReloadOutlined />} onClick={handleResetExcel}>
                    继续导入其他成绩文件
                  </Button>
                ]}
              />
            )}
          </div>
        ) : (
          /* ---------------- 模式二：传统 JSON 模式 (调试保留) ---------------- */
          <div>
            <Alert
              message="开发者 / 测试调试模式"
              description="该模式适用于单条数据模拟调试。如需导入全校上千名学生，请切换为上方的【📊 Excel 批量导入】模式。"
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
                      columns={[
                        {
                          title: "变更类型",
                          dataIndex: "action",
                          key: "action",
                          width: 100,
                          render: (act, r) => {
                            if (!r.valid) return <Tag color="red">错误</Tag>;
                            if (act === "NEW") return <Tag color="green">新增</Tag>;
                            if (act === "UPDATE") return <Tag color="orange">修改</Tag>;
                            return <Tag color="default">无变化</Tag>;
                          }
                        },
                        {
                          title: "学生",
                          dataIndex: "studentName",
                          key: "studentName",
                          render: (name, r) => name || r.username || `ID:${r.studentId}`
                        },
                        {
                          title: "科目/目标",
                          dataIndex: "target",
                          key: "target"
                        },
                        {
                          title: "新得分",
                          dataIndex: "newScore",
                          key: "newScore"
                        }
                      ]}
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
                    <Text type="secondary">点击左侧【预览变更】查看对比结果</Text>
                  </div>
                )}
              </Col>
            </Row>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminImport;
