import React, { useState, useEffect } from "react";
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
  DatePicker,
  Switch,
  Typography,
  Alert,
  Row,
  Col,
  Badge,
  Popconfirm,
  Tooltip
} from "antd";
import {
  CalendarOutlined,
  PlusOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { get, post, put } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text, Title } = Typography;

/**
 * 根据中国中小学/小学校历规则计算学期起止日期标准范围
 * - 第一学期（秋季学期）：当年9月1日开学 ~ 翌年1月31日（寒假前）
 * - 第二学期（春季学期）：翌年2月20日（元宵节前后春季开学）~ 7月15日（暑假前）
 * @param {string} academicYear 学年格式，如 "2026-2027"
 * @param {number|string} semester 学期，1为上学期，2为下学期
 * @returns {[dayjs.Dayjs, dayjs.Dayjs]|null}
 */
export const getChinaSchoolTermDates = (academicYear, semester) => {
  if (!academicYear) return null;
  const match = String(academicYear).match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const startYear = parseInt(match[1], 10);
  const endYear = parseInt(match[2], 10);

  const sem = Number(semester);
  if (sem === 1) {
    return [
      dayjs(`${startYear}-09-01`),
      dayjs(`${endYear}-01-31`)
    ];
  } else if (sem === 2) {
    return [
      dayjs(`${endYear}-02-20`),
      dayjs(`${endYear}-07-15`)
    ];
  }
  return null;
};

/**
 * 根据当前系统日期自动推导中国小学当前的学年、学期及校历起止时间段
 * - 8月 ~ 12月：新学年秋季学期 (第1学期，如 2026-09-01 ~ 2027-01-31)
 * - 1月：上一学年秋季学期期末 (第1学期)
 * - 2月 ~ 7月：春季学期 (第2学期，如 2027-02-20 ~ 2027-07-15)
 * @param {dayjs.Dayjs} [now=dayjs()]
 */
export const getDefaultChinaTermConfig = (now = dayjs()) => {
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // 1 ~ 12

  let academicYear = "";
  let semester = 1;

  if (currentMonth >= 8) {
    // 8月~12月：秋季学期（第1学期）
    academicYear = `${currentYear}-${currentYear + 1}`;
    semester = 1;
  } else if (currentMonth === 1) {
    // 1月：仍为当年秋季学期（第1学期）
    academicYear = `${currentYear - 1}-${currentYear}`;
    semester = 1;
  } else {
    // 2月~7月：春季学期（第2学期）
    academicYear = `${currentYear - 1}-${currentYear}`;
    semester = 2;
  }

  const dateRange = getChinaSchoolTermDates(academicYear, semester);
  return {
    academic_year: academicYear,
    semester,
    date_range: dateRange,
    is_current: false
  };
};

const AdminTerms = () => {
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null);

  const fetchTerms = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_TERMS);
      if (res.code === 200) {
        setTerms(res.data || []);
      }
    } catch (err) {
      message.error("获取学期校历列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerms();
  }, []);

  const handleOpenCreateModal = () => {
    const defaults = getDefaultChinaTermConfig();
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({...defaults,active:true});
    setCreateModalOpen(true);
  };

  const handleCreateTerm = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        academicYear: values.academic_year,
        semester: values.semester,
        startDate: values.date_range[0].format("YYYY-MM-DD"),
        endDate: values.date_range[1].format("YYYY-MM-DD"),
        isCurrent: !!values.is_current,
        active: values.active,
        reviewDeadlineAt: values.review_deadline_at ? values.review_deadline_at.second(59).format("YYYY-MM-DD HH:mm:ss") : undefined
      };

      const res = editing ? await put(`${urls.API_ADMIN_TERMS}/${editing.id}`, payload) : await post(urls.API_ADMIN_TERMS, payload);
      if (res.code === 200) {
        message.success(editing ? "学期配置已更新" : "新学期创建成功并已配置校历！");
        setCreateModalOpen(false);
        form.resetFields();
        fetchTerms();
        window.dispatchEvent(new CustomEvent("term-change"));
      } else {
        message.error(res.message || "创建学期失败");
      }
    } catch (err) {
      if (!err.handled) message.error(err.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetCurrent = async (id) => {
    try {
      const res = await post(`${urls.API_ADMIN_TERMS}/${id}/set-current`);
      if (res.code === 200) {
        message.success("已成功切换当前活跃学期！");
        fetchTerms();
        window.dispatchEvent(new CustomEvent("term-change"));
      } else {
        message.error(res.message || "切换学期失败");
      }
    } catch (err) {
      if (!err.handled) message.error(err.message || "操作失败");
    }
  };

  const editTerm = (r) => {
    setEditing(r);form.resetFields();
    form.setFieldsValue({academic_year:r.academicYear,semester:Number(r.semester),date_range:[dayjs(r.startDate),dayjs(r.endDate)],review_deadline_at:dayjs(r.reviewDeadlineAt),is_current:r.isCurrent,active:r.isActive});
    setCreateModalOpen(true);
  };

  const columns = [
    {
      title: "学期ID",
      dataIndex: "id",
      key: "id",
      width: 80,
      render: (id) => <Text code>#{id}</Text>
    },
    {
      title: "学期名称",
      dataIndex: "term_name",
      key: "term_name",
      render: (_, r) => (
        <Space>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {r.term_name ||
              `${r.academic_year || r.academicYear || ""}学年第${r.semester === 1 || r.semester === "1" ? "一" : "二"}学期`}
          </span>
          {(r.is_current === 1 || r.isCurrent) && (
            <Tag color="cyan" style={{ fontWeight: 600 }}>
              当前活跃学期
            </Tag>
          )}
        </Space>
      )
    },
    {
      title: "学期周期 (开始 - 结束)",
      key: "dates",
      render: (_, r) => {
        const s = r.start_date || r.startDate;
        const e = r.end_date || r.endDate;
        const formatStr = (d) => (d ? dayjs(d).format("YYYY-MM-DD") : "--");
        return (
          <span>
            {formatStr(s)}
            {" ~ "}
            {formatStr(e)}
          </span>
        );
      }
    },
    {title:"审核截止",dataIndex:"reviewDeadlineAt",render:v=>v||"学期结束日23:59:59"},
    {
      title: "运行状态",
      dataIndex: "active",
      key: "status",
      render: (active, r) =>
        active || r.status === "ACTIVE" || r.is_current === 1 || r.isCurrent ? (
          <Tag color="green">运行中</Tag>
        ) : (
          <Tag color="default">已停用</Tag>
        )
    },
    {
      title: "评价数据封存状态",
      key: "lock",
      render: (_, r) =>
        !r.active ? (
          <Space>
            <LockOutlined style={{ color: "#ef4444" }} />
            <Text type="secondary">只读封存</Text>
          </Space>
        ) : (
          <Space>
            <CheckCircleOutlined style={{ color: "#10b981" }} />
            <Text style={{ color: "#059669" }}>可录入/评价中</Text>
          </Space>
        )
    },
    {
      title: "操作",
      key: "action",
      width: 140,
      render: (_, r) => {
        const isCur = r.is_current === 1 || r.isCurrent;
        if (isCur) {
          return <Space direction="vertical"><Tag color="blue">当前生效中</Tag>{r.school_id&&<Button type="link" onClick={()=>editTerm(r)}>编辑校历与审核截止</Button>}</Space>;
        }
        return (
          <Space direction="vertical">{r.school_id&&<Button type="link" onClick={()=>editTerm(r)}>编辑校历与审核截止</Button>}<Popconfirm
            title="确认将该学期设为当前活跃学期？"
            description="切换默认展示学期；评价卡仍按有效校历的月份自动分配。"
            onConfirm={() => handleSetCurrent(r.id)}
            okText="确认切换"
            cancelText="取消"
          >
            <Button type="link" size="small">
              设为当前学期
            </Button>
          </Popconfirm></Space>
        );
      }
    }
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* 顶栏卡片 */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          borderRadius: 16,
          padding: "24px 32px",
          color: "#fff",
          marginBottom: 24,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)"
        }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Tag color="#38bdf8" style={{ fontWeight: 600, padding: "2px 8px" }}>
              校级系统底座配置
            </Tag>
            <Title level={3} style={{ color: "#fff", margin: "8px 0 4px" }}>
              学期与校历周期管理
            </Title>
            <Text style={{ color: "#94a3b8", fontSize: 13 }}>
              配置校历与审核截止时间。评价卡只在有效学期覆盖的月份发放，不发放寒暑假月份卡片。
            </Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                border: "none",
                height: 40,
                borderRadius: 8,
                fontWeight: 600
              }}
            >
              新建学期校历
            </Button>
          </Col>
        </Row>
      </div>

      <Card
        title="学校学期档案列表"
        bordered={false}
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchTerms}>
            刷新
          </Button>
        }
        style={{ borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
      >
        <Alert
          message="多学期排他性规则"
          description="默认展示学期与有效校历分别管理。卡片按本校有效校历分配，校历重叠时会提示异常。审核截止默认在学期结束日23:59，可按学校安排调整。"
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />

        <Table dataSource={terms} columns={columns} rowKey="id" loading={loading} />
      </Card>

      {/* 创建学期对话框 */}
      <Modal
        title={
          <Space>
            <CalendarOutlined style={{ color: "#2563eb" }} />
            <span>{editing ? "编辑学期校历" : "配置新学期"}</span>
          </Space>
        }
        open={createModalOpen}
        onOk={() => form.submit()}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={submitting}
        okText={editing ? "保存修改" : "立即创建"}
        cancelText="取消"
        width={560}
      >
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="校历智能推荐机制"
          description="系统已结合中国小学校历时间自动推导当期学年与起止段（秋季学期9月1日~次年1月31日，春季学期2月20日~7月15日）。您可根据本校校历实际排课直接使用或灵活调整。"
          style={{ marginTop: 12, marginBottom: 16, borderRadius: 8 }}
        />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateTerm}
          initialValues={getDefaultChinaTermConfig()}
          onValuesChange={(changedValues, allValues) => {
            // 当学年或学期发生变动时，自动联动匹配中国小学校历标准起止日期
            if (changedValues.academic_year !== undefined || changedValues.semester !== undefined) {
              const recommendedDates = getChinaSchoolTermDates(allValues.academic_year, allValues.semester);
              if (recommendedDates) {
                form.setFieldsValue({ date_range: recommendedDates });
              }
            }
          }}
        >
          <Form.Item
            name="academic_year"
            label="学年"
            rules={[
              { required: true, message: "请输入学年，如 2026-2027" },
              { pattern: /^\d{4}-\d{4}$/, message: "格式应为 2026-2027" }
            ]}
          >
            <Input placeholder="例如：2026-2027" />
          </Form.Item>

          <Form.Item name="semester" label="学期" rules={[{ required: true, message: "请选择学期" }]}>
            <Select
              placeholder="选择学期"
              options={[
                { value: 1, label: "第一学期（秋季学期 / 上学期）" },
                { value: 2, label: "第二学期（春季学期 / 下学期）" }
              ]}
            />
          </Form.Item>

          <Form.Item
            name="date_range"
            label={
              <Space size={8}>
                <span>学期起止日期 (校历范围)</span>
                <Tag color="cyan" style={{ fontSize: 11, borderRadius: 4 }}>
                  已按中国小学校历自动推荐
                </Tag>
              </Space>
            }
            extra="默认起止段：第1学期(当年09-01 ~ 次年01-31)，第2学期(当年02-20 ~ 当年07-15)。支持点击下方快捷键一键套用。"
            rules={[{ required: true, message: "请选择学期起止日期" }]}
          >
            <DatePicker.RangePicker
              placeholder={["开始日期", "结束日期"]}
              style={{ width: "100%" }}
              format="YYYY-MM-DD"
            />
          </Form.Item>

          <div style={{ marginTop: -8, marginBottom: 16, display: "flex", gap: 8 }}>
            <Button
              size="small"
              type="dashed"
              onClick={() => {
                const ay = form.getFieldValue("academic_year") || getDefaultChinaTermConfig().academic_year;
                form.setFieldsValue({
                  semester: 1,
                  date_range: getChinaSchoolTermDates(ay, 1)
                });
              }}
            >
              套用第1学期标准校历 (9.1 ~ 1.31)
            </Button>
            <Button
              size="small"
              type="dashed"
              onClick={() => {
                const ay = form.getFieldValue("academic_year") || getDefaultChinaTermConfig().academic_year;
                form.setFieldsValue({
                  semester: 2,
                  date_range: getChinaSchoolTermDates(ay, 2)
                });
              }}
            >
              套用第2学期标准校历 (2.20 ~ 7.15)
            </Button>
          </div>

          <Form.Item name="review_deadline_at" label="学期审核截止（北京时间）" extra="默认在学期结束日23:59。已扫码卡的审核还受次月3日23:59限制。"><DatePicker showTime={{format:"HH:mm"}} format="YYYY-MM-DD HH:mm" style={{width:"100%"}}/></Form.Item>
          <Form.Item name="active" label="校历有效" valuePropName="checked" initialValue={true}><Switch/></Form.Item>

          <Form.Item name="is_current" label="设为当前活跃学期" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminTerms;
