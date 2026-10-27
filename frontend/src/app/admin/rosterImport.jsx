import React, { useState } from "react";
import { Card, Table, Button, Input, Space, Tag, Alert, Typography, Row, Col, message, Modal } from "antd";
import { UploadOutlined, CheckCircleOutlined, ExclamationCircleOutlined, TeamOutlined, UserAddOutlined, SyncOutlined } from "@ant-design/icons";
import { post } from "@/util/request";
import { API_ROSTER_PREVIEW, API_ROSTER_COMMIT } from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const SAMPLE_ROSTER_DATA = `STU_2026_001,李子涵,4,1
STU_2026_002,王梓轩,4,1
STU_2026_003,张若曦,4,2
STU_2026_004,陈宇轩,4,2`;

const RosterImport = () => {
  const [rawText, setRawText] = useState(SAMPLE_ROSTER_DATA);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  const handleParseAndPreview = async () => {
    if (!rawText.trim()) {
      message.warning("请输入或粘贴学籍名单数据");
      return;
    }

    const lines = rawText.trim().split("\n");
    const rows = [];
    for (const line of lines) {
      const parts = line.split(/[,\t，\s]+/).filter(Boolean);
      if (parts.length >= 2) {
        rows.push({
          studentNo: parts[0],
          realName: parts[1],
          grade: parts[2] || 1,
          classNo: parts[3] || 1
        });
      }
    }

    if (rows.length === 0) {
      message.error("未识别到有效的学生行格式 (学号 姓名 年级 班级)");
      return;
    }

    setLoading(true);
    try {
      const res = await post(API_ROSTER_PREVIEW, { rows });
      setPreviewData(res.data || res);
      setCommitResult(null);
      message.success(`学籍表解析完成，共 ${rows.length} 条记录`);
    } catch (err) {
      message.error(err.message || "预览学籍导入失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!previewData || !previewData.items) {
      return;
    }

    setCommitting(true);
    try {
      const res = await post(API_ROSTER_COMMIT, {
        previewKey: previewData.previewKey,
        items: previewData.items
      });
      setCommitResult(res.data || res);
      message.success("学籍导入正式入库成功！");
    } catch (err) {
      message.error(err.message || "学籍入库失败");
    } finally {
      setCommitting(false);
    }
  };

  const columns = [
    { title: "序号", dataIndex: "rowIndex", width: 70 },
    { title: "稳定学号", dataIndex: "studentNo", width: 150 },
    { title: "学生姓名", dataIndex: "realName", width: 120 },
    {
      title: "操作类型",
      dataIndex: "action",
      width: 130,
      render: (action) => {
        if (action === "INSERT") return <Tag color="green" icon={<UserAddOutlined />}>新增建档</Tag>;
        if (action === "UPDATE") return <Tag color="blue" icon={<SyncOutlined />}>转班/更新</Tag>;
        return <Tag color="red" icon={<ExclamationCircleOutlined />}>冲突阻断</Tag>;
      }
    },
    {
      title: "年级班级变动",
      render: (_, r) => {
        if (r.action === "UPDATE") {
          return `${r.oldGrade || "?"}年${r.oldClassNo || "?"}班 ➔ ${r.newGrade}年${r.newClassNo}班`;
        }
        if (r.action === "INSERT") {
          return `${r.newGrade}年级 ${r.newClassNo}班`;
        }
        return <span style={{ color: "#ef4444" }}>{r.conflictReason}</span>;
      }
    },
    {
      title: "安全备注",
      dataIndex: "note",
      render: (note, r) => (
        <span style={{ fontSize: 12, color: r.action === "CONFLICT" ? "#ef4444" : "#64748b" }}>
          {note || (r.action === "UPDATE" ? "将自动推进档案版本(profile_revision)，不覆盖历史成绩" : "角色固定为学生，密码与权限安全隔离")}
        </span>
      )
    }
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 0" }}>
      <Title level={3} style={{ marginBottom: 4 }}>
        <TeamOutlined style={{ marginRight: 8, color: "#2563eb" }} />
        学籍表导入与学生建档
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        支持按学校学籍底表批量新增学生或转班更新。系统自动按【学校+稳定学号】核对身份，绝不凭重名覆盖老生档案，严禁覆盖系统角色与成绩。
      </Paragraph>

      <Card title="粘贴学籍数据 (每行：学号 姓名 年级 班级，逗号或空格分隔)" style={{ marginBottom: 20, borderRadius: 12 }}>
        <TextArea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="例如：STU_001 张三 4 1"
          style={{ fontFamily: "monospace", marginBottom: 16 }}
        />
        <Space>
          <Button type="primary" icon={<UploadOutlined />} loading={loading} onClick={handleParseAndPreview}>
            解析并校验学籍
          </Button>
          <Button onClick={() => setRawText(SAMPLE_ROSTER_DATA)}>填入样例数据</Button>
        </Space>
      </Card>

      {commitResult && (
        <Alert
          type="success"
          message={`学籍表导入成功！批次号: ${commitResult.batchId}`}
          description={`成功新增建档: ${commitResult.inserted} 人，转班更新: ${commitResult.updated} 人，自动跳过冲突: ${commitResult.skippedConflicts || 0} 人。`}
          showIcon
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      {previewData && (
        <Card
          title={
            <Space>
              <span>学籍比对与差异预览</span>
              <Tag color="green">新增: {previewData.summary?.insertCount || 0}</Tag>
              <Tag color="blue">更新: {previewData.summary?.updateCount || 0}</Tag>
              {previewData.summary?.conflictCount > 0 && (
                <Tag color="red">冲突: {previewData.summary.conflictCount}</Tag>
              )}
            </Space>
          }
          extra={
            <Button
              type="primary"
              style={{ background: "#16a34a", borderColor: "#16a34a" }}
              icon={<CheckCircleOutlined />}
              loading={committing}
              disabled={commitResult !== null}
              onClick={handleCommit}
            >
              确认无误，执行正式入库
            </Button>
          }
          style={{ borderRadius: 12 }}
        >
          <Table
            dataSource={previewData.items}
            columns={columns}
            rowKey={(r, i) => `${r.studentNo}-${i}`}
            pagination={{ pageSize: 10 }}
            size="small"
          />
        </Card>
      )}
    </div>
  );
};

export default RosterImport;
