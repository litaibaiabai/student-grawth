import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Divider,
  message,
  Modal,
  Tabs,
  Statistic,
  Select
} from "antd";
import {
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  FileProtectOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { get, post, openReportHtml } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const AdminReports = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [publishResult, setPublishResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const [stuRes, termRes, termsListRes] = await Promise.all([
        get(urls.API_STUDENTS_LIST),
        get(urls.API_CURRENT_TERM),
        get(urls.API_TERMS)
      ]);
      if (stuRes.code === 200) {
        setStudents(stuRes.data || []);
        setSelectedIds((stuRes.data || []).map((s) => s.id));
      }
      if (termsListRes.code === 200) {
        setTerms(termsListRes.data || []);
      }
      if (termRes.code === 200 && termRes.data) {
        setSelectedTermId(termRes.data.termId || termRes.data.id);
      } else if (termsListRes.code === 200 && termsListRes.data?.length > 0) {
        setSelectedTermId(termsListRes.data[0].id);
      }
    } catch (err) {
      message.error("获取基础数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleBatchPublish = async () => {
    if (!selectedTermId) {
      message.warning("请选择要发布的学期");
      return;
    }
    setPublishing(true);
    try {
      const res = await post(urls.API_PUBLISH_REPORTS, {
        termId: selectedTermId,
        term_id: selectedTermId,
        studentIds: selectedIds,
        student_ids: selectedIds
      });

      if (res.code === 200) {
        setPublishResult(res.data);
        message.success(res.message);
      } else {
        message.error(res.message || "批量发布失败");
      }
    } catch (err) {
      if (!err.handled) message.error(err.message || "发布操作失败");
    } finally {
      setPublishing(false);
    }
  };

  const columns = [
    {
      title: "学生姓名 / 班级",
      key: "student",
      width: 150,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1e382b" }}>{r.real_name || r.username}</div>
          <div style={{ fontSize: 11, color: "#8a9990" }}>
            {r.grade}年级{r.class_no}班
          </div>
        </div>
      )
    },
    {
      title: "门禁检查结果",
      key: "status",
      render: (_, r) => {
        const blocked = publishResult?.blocked?.find((b) => b.studentId === r.id);
        if (blocked) {
          return (
            <>
              <Tag color="red">受阻</Tag>
              <span style={{ fontSize: 12, color: "#c45757" }}>{blocked.reason}</span>
            </>
          );
        }
        if (publishResult?.published?.some((p) => p.studentId === r.id)) return <Tag color="green">已发布</Tag>;
        return <Tag>待检查（点击右上角按钮发布时自动校验）</Tag>;
      }
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, r) => {
        const reportId = publishResult?.published?.find((p) => p.studentId === r.id)?.reportId;
        return (
          <Button
            type="link"
            size="small"
            disabled={!reportId}
            onClick={() => openReportHtml(urls.API_REPORT_PDF(reportId)).catch(() => {})}
          >
            {reportId ? "预览报告" : "发布后可预览"}
          </Button>
        );
      }
    }
  ];

  return (
    <div>
      {/* 标题 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div
            style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}
          >
            TERM REPORT PUBLISHING GATEWAY
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>期末报告发布中心</h1>
          <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>先检查六育成绩完整性，再发布本学期报告快照。</p>
        </div>
        <Space size="middle">
          <Space>
            <span style={{ fontSize: 13, color: "#56685c", fontWeight: 600 }}>目标发布学期：</span>
            <Select
              value={selectedTermId}
              onChange={setSelectedTermId}
              style={{ width: 280 }}
              options={terms.map((t) => ({
                value: t.id,
                label: `${t.term_name || `${t.academic_year}第${t.semester === 1 ? "一" : "二"}学期`} ${t.is_current ? "（当前活跃）" : ""}`
              }))}
            />
          </Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleBatchPublish}
            loading={publishing}
            disabled={selectedIds.length === 0}
            style={{
              background: "#277460",
              borderColor: "#277460",
              height: 38,
              borderRadius: 8,
              fontWeight: 600
            }}
          >
            检查并发布所选报告（{selectedIds.length} 人）
          </Button>
        </Space>
      </div>

      <Alert
        message="发布前完整性检查"
        description="系统逐学生核对六育成绩是否齐全；缺项时阻断该学生，其他完整记录可发布。报告保留发布时的数据快照与版本。"
        type="info"
        showIcon
        style={{ marginBottom: 20, borderRadius: 8 }}
      />

      {publishResult && (
        <Alert
          message={`本次发布结果：成功 ${publishResult.publishedCount} 份，阻断 ${publishResult.blockedCount} 份`}
          description={
            publishResult.blockedCount > 0
              ? publishResult.blocked.map((b) => `${b.studentName || `学生ID ${b.studentId}`}：${b.reason}`).join("；")
              : "学生端现已可查阅本人本学期报告及带报告编号的打印视图。"
          }
          type={publishResult.publishedCount > 0 ? (publishResult.blockedCount > 0 ? "warning" : "success") : "error"}
          showIcon
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      <Card
        title="全校学生期末报告门禁核验表"
        bordered={false}
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchStudents}>
            刷新列表
          </Button>
        }
        style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
      >
        <Table
          dataSource={students}
          columns={columns}
          rowKey="id"
          rowSelection={{ selectedRowKeys: selectedIds, onChange: setSelectedIds }}
          loading={loading}
          locale={{ emptyText: "暂无待发布学生名单" }}
        />
      </Card>
    </div>
  );
};

export default AdminReports;
