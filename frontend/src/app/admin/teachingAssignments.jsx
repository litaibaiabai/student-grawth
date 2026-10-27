import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  message,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Typography,
  Alert,
  Row,
  Col,
  Popconfirm,
  Tooltip
} from "antd";
import {
  TeamOutlined,
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  UserOutlined,
  BookOutlined,
  CheckCircleOutlined
} from "@ant-design/icons";
import { get, post, del } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text } = Typography;

const SUBJECT_OPTIONS = [
  { label: "语文 (CHINESE)", value: "CHINESE" },
  { label: "数学 (MATH)", value: "MATH" },
  { label: "英语 (ENGLISH)", value: "ENGLISH" },
  { label: "科学 (SCIENCE)", value: "SCIENCE" },
  { label: "体育 (PE)", value: "PE" },
  { label: "音乐 (MUSIC)", value: "MUSIC" },
  { label: "美术 (ART)", value: "ART" },
  { label: "道德与法治 (MORALITY)", value: "MORALITY" },
  { label: "劳动技术 (LABOR)", value: "LABOR" }
];

const GRADE_OPTIONS = [
  { label: "一年级", value: 1 },
  { label: "二年级", value: 2 },
  { label: "三年级", value: 3 },
  { label: "四年级", value: 4 },
  { label: "五年级", value: 5 },
  { label: "六年级", value: 6 }
];

export default function TeachingAssignments() {
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [terms, setTerms] = useState([]);
  const [currentTermId, setCurrentTermId] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [filterGrade, setFilterGrade] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // 加载学期与教师列表
  useEffect(() => {
    async function loadMeta() {
      try {
        const [termRes, teacherRes] = await Promise.all([
          get(urls.API_TERMS).catch(() => ({ data: [] })),
          get(urls.API_TEACHERS_LIST).catch(() => ({ data: [] }))
        ]);

        const termList = termRes?.data || [];
        setTerms(termList);
        const cur = termList.find((t) => t.is_current) || termList[0];
        if (cur) setCurrentTermId(cur.id);

        setTeachers(teacherRes?.data || []);
      } catch (err) {
        message.error("加载基础元数据失败: " + err.message);
      }
    }
    loadMeta();
  }, []);

  // 加载任教授权记录
  const fetchAssignments = useCallback(async () => {
    if (!currentTermId) return;
    setLoading(true);
    try {
      const params = { term_id: currentTermId };
      if (filterGrade) params.grade = filterGrade;
      const res = await get(urls.API_ADMIN_TEACHING_ASSIGNMENTS, params);
      setAssignments(res?.data || []);
    } catch (err) {
      message.error("获取任教授权失败: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [currentTermId, filterGrade]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // 提交新建任教
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await post(urls.API_ADMIN_TEACHING_ASSIGNMENTS, {
        term_id: currentTermId,
        teacher_id: values.teacher_id,
        grade: values.grade,
        class_name: values.class_name,
        subject: values.subject,
        is_head_teacher: values.is_head_teacher ? 1 : 0,
        status: "ACTIVE"
      });
      message.success("任教授权创建成功");
      setIsModalOpen(false);
      form.resetFields();
      fetchAssignments();
    } catch (err) {
      if (err.errorFields) return;
      message.error("创建授权失败: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 删除授权
  const handleDelete = async (id) => {
    try {
      await del(urls.API_ADMIN_TEACHING_ASSIGNMENT_DELETE(id));
      message.success("授权已撤销");
      fetchAssignments();
    } catch (err) {
      message.error("撤销失败: " + err.message);
    }
  };

  const columns = [
    {
      title: "教师姓名",
      dataIndex: "teacher_name",
      key: "teacher_name",
      render: (text, row) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{text || `教师 #${row.teacher_id}`}</Text>
          {row.teacher_code && <Text type="secondary" style={{ fontSize: 12 }}>工号: {row.teacher_code}</Text>}
        </Space>
      )
    },
    {
      title: "年级班级",
      key: "grade_class",
      render: (_, row) => (
        <span>{row.grade}年级{row.class_name}</span>
      )
    },
    {
      title: "任教学科",
      dataIndex: "subject",
      key: "subject",
      render: (subject) => {
        const found = SUBJECT_OPTIONS.find((s) => s.value === subject);
        return <Tag color="blue">{found ? found.label.split(" ")[0] : subject}</Tag>;
      }
    },
    {
      title: "班主任职责",
      dataIndex: "is_head_teacher",
      key: "is_head_teacher",
      render: (val) => (
        val === 1 ? <Tag color="gold">班主任</Tag> : <Text type="secondary">任课教师</Text>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status) => (
        status === "ACTIVE" ? <Tag color="green">生效中</Tag> : <Tag color="default">已停用</Tag>
      )
    },
    {
      title: "操作",
      key: "action",
      render: (_, row) => (
        <Popconfirm
          title="确认撤销此任教授权？"
          description="撤销后该教师将无法录入该班级该学科成绩，Token 权限即刻失效"
          onConfirm={() => handleDelete(row.id)}
          okText="确认撤销"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button danger type="link" size="small" icon={<DeleteOutlined />}>
            撤销授权
          </Button>
        </Popconfirm>
      )
    }
  ];

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <TeamOutlined style={{ marginRight: 8, color: "#1890ff" }} />
            教师任教授权管理
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            配置教师在对应学期的年级、班级、任教学科与班主任权限（C1 授权边界严格隔离）
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchAssignments} loading={loading}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setIsModalOpen(true);
              }}
            >
              新增任教授权
            </Button>
          </Space>
        </Col>
      </Row>

      <Alert
        message="任教授权防越权安全规则"
        description="系统通过 C1 运行时授权上下文即时验证任教关系。教师在成绩录入时仅允许提交自身任教学科的数据；任教关系被撤销后，正在使用的 Token 将即刻被拒绝。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col xs={24} sm={8}>
            <div style={{ marginBottom: 4 }}>
              <Text strong>当前学期：</Text>
            </div>
            <Select
              style={{ width: "100%" }}
              value={currentTermId}
              onChange={setCurrentTermId}
              options={terms.map((t) => ({
                label: `${t.name || t.academic_year + '学年'} ${t.is_current ? '(当前)' : ''}`,
                value: t.id
              }))}
            />
          </Col>
          <Col xs={24} sm={8}>
            <div style={{ marginBottom: 4 }}>
              <Text strong>年级筛选：</Text>
            </div>
            <Select
              style={{ width: "100%" }}
              allowClear
              placeholder="全部年级"
              value={filterGrade}
              onChange={setFilterGrade}
              options={GRADE_OPTIONS}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={assignments}
          loading={loading}
          pagination={{ pageSize: 15 }}
          locale={{ emptyText: "当前学期暂无任教授权记录，点击右上角新增" }}
        />
      </Card>

      <Modal
        title="新增教师任教授权"
        open={isModalOpen}
        onOk={handleCreate}
        confirmLoading={submitting}
        onCancel={() => setIsModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ is_head_teacher: false }}>
          <Form.Item
            name="teacher_id"
            label="授课教师"
            rules={[{ required: true, message: "请选择教师" }]}
          >
            <Select
              placeholder="选择教师"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
              options={teachers.map((t) => ({
                label: `${t.name || t.username} (${t.phone || t.email || '教师'})`,
                value: t.id
              }))}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="grade"
                label="任教年级"
                rules={[{ required: true, message: "请选择年级" }]}
              >
                <Select placeholder="选择年级" options={GRADE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="class_name"
                label="班级名称"
                rules={[{ required: true, message: "请输入班级（如 1班、2班）" }]}
              >
                <Input placeholder="如 1班 或 2班" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="subject"
            label="任教学科"
            rules={[{ required: true, message: "请选择学科" }]}
          >
            <Select placeholder="选择学科" options={SUBJECT_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="is_head_teacher"
            label="是否担任该班班主任"
            valuePropName="checked"
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
