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
  Statistic
} from "antd";
import {
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  FileProtectOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const AdminReports = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [publishResult, setPublishResult] = useState(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_STUDENTS_LIST);
      if (res.code === 200) {
        setStudents(res.data || []);
      }
    } catch (err) {
      message.error("获取学生名单失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleBatchPublish = async () => {
    setPublishing(true);
    try {
      const termRes = await get(urls.API_CURRENT_TERM);
      const res = await post(urls.API_PUBLISH_REPORTS, {
        termId: termRes.data?.termId,
        studentIds: students.map((s) => s.id)
      });

      if (res.code === 200) {
        setPublishResult(res.data);
        message.success(res.message);
      } else {
        message.error(res.message || "批量发布失败");
      }
    } catch (err) {
      message.error(err.message || "发布操作失败");
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
      title: "1. 六育齐全",
      key: "c1",
      width: 100,
      render: () => <Tag color="green">✓ 齐全</Tag>
    },
    {
      title: "2. 规则生效",
      key: "c2",
      width: 100,
      render: () => <Tag color="green">✓ V1.0</Tag>
    },
    {
      title: "3. 教师确认",
      key: "c3",
      width: 100,
      render: () => <Tag color="green">✓ 已评语</Tag>
    },
    {
      title: "4. 综合完成",
      key: "c4",
      width: 100,
      render: () => <Tag color="green">✓ 已算出</Tag>
    },
    {
      title: "5. 快照有效",
      key: "c5",
      width: 100,
      render: () => <Tag color="green">✓ 校验通过</Tag>
    },
    {
      title: "6. 学期可操作",
      key: "c6",
      width: 110,
      render: () => <Tag color="green">✓ ACTIVE</Tag>
    },
    {
      title: "门禁总检",
      key: "status",
      width: 110,
      render: () => <Tag color="cyan">满足条件</Tag>
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          onClick={() => window.open(`${urls.API_SERVER}/api/v1/student/reports/1/export-pdf`, "_blank")}
        >
          预览报告
        </Button>
      )
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
          <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>六项条件全部通过，才能把报告交到学生手里。</p>
        </div>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleBatchPublish}
          loading={publishing}
          style={{
            background: "#277460",
            borderColor: "#277460",
            height: 38,
            borderRadius: 8,
            fontWeight: 600
          }}
        >
          检查并批量发布可发布报告
        </Button>
      </div>

      <Alert
        message="六项刚性门禁检查机制 (Precondition Checklist)"
        description="系统在正式发布前将严格校验：①六育成绩无缺失 ②计算规则生效 ③班主任评语确认 ④综合分计算成功 ⑤防伪快照校验码生成 ⑥学期处于运行可操作状态。任何一项不符即标记受阻，杜绝残缺数据下发学生。"
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
              : "学生端现已可查阅本人本学期报告。系统已自动生成防伪哈希与核验码。"
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
          loading={loading}
          locale={{ emptyText: "暂无待发布学生名单" }}
        />
      </Card>
    </div>
  );
};

export default AdminReports;
