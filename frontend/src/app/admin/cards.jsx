import React, { useState, useEffect } from "react";
import {
  Card, Table, Tag, Button, Space, message, Modal, Form,
  Input, InputNumber, Select, Typography, Alert, Row, Col, Tabs,
  Statistic, Popconfirm, Tooltip
} from "antd";
import {
  CreditCardOutlined, PlusOutlined, ReloadOutlined, QrcodeOutlined,
  ThunderboltOutlined, ClockCircleOutlined, PrinterOutlined, MinusCircleOutlined
} from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;

const AdminCards = () => {
  const [cards, setCards] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [termId, setTermId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatedBatch, setGeneratedBatch] = useState(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [genForm] = Form.useForm();
  const [quotaForm] = Form.useForm();

  const fetchCards = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_CARDS);
      if (res.code === 200) {
        setCards(res.data || []);
      }
    } catch (err) {
      message.error("获取实体卡列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initData = async () => {
      fetchCards();
      try {
        const [tRes, cRes, termRes] = await Promise.all([
          get(urls.API_TEACHERS_LIST),
          get(urls.API_CATEGORIES),
          get(urls.API_CURRENT_TERM)
        ]);
        if (tRes.code === 200) setTeachers(tRes.data || []);
        if (termRes.code === 200) setTermId(termRes.data?.termId);
        if (cRes.code === 200) {
          // 提取扁平指标
          const leaves = [];
          const trav = (nodes) => {
            nodes.forEach(n => {
              if (!n.children || n.children.length === 0) leaves.push(n);
              else trav(n.children);
            });
          };
          trav(cRes.data || []);
          setCategories(leaves);
        }
      } catch (e) {
        // 静默
      }
    };
    initData();
  }, []);

  const handleGenerateCards = async (values) => {
    setSubmitting(true);
    try {
      const res = await post(urls.API_GENERATE_CARDS, {
        teacher_id: values.teacher_id,
        category_code: values.category_code,
        month_key: values.month_key,
        count: values.count
      });

      if (res.code === 200) {
        message.success(`成功制卡！已批量生成 ${res.data.cards?.length || values.count} 张防伪实体卡！`);
        setGeneratedBatch(res.data.cards || []);
        setGenerateModalOpen(false);
        genForm.resetFields();
        setPrintModalOpen(true);
        fetchCards();
      } else {
        message.error(res.message || "批量制卡失败");
      }
    } catch (err) {
      message.error(err.message || "制卡失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetQuota = async (values) => {
    if (!termId) {
      message.error("暂无当前活动学期，无法设置配额");
      return;
    }
    const allocationJson = {};
    (values.allocations || []).forEach(a => {
      allocationJson[a.code] = (allocationJson[a.code] || 0) + Number(a.count);
    });
    setSubmitting(true);
    try {
      const res = await post(urls.API_CARD_QUOTAS, {
        termId,
        teacherId: values.teacher_id,
        monthKey: values.month_key,
        quotaN: values.quota_count,
        allocationJson
      });
      if (res.code === 200) {
        message.success("教师月度配额已更新！");
        setQuotaModalOpen(false);
        quotaForm.resetFields();
      } else {
        message.error(res.message || "配额设置失败");
      }
    } catch (err) {
      message.error(err.message || "配额操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const triggerExpireTask = async () => {
    try {
      const res = await post(urls.API_SERVER + "/api/v1/admin/tasks/trigger-card-expiration");
      if (res.code === 200) {
        message.success(res.message || "超期实体卡过期扫描完成！");
        fetchCards();
      }
    } catch (err) {
      message.error("触发扫描失败");
    }
  };

  const columns = [
    {
      title: "流水序号",
      dataIndex: "serial_no",
      key: "serial_no",
      width: 140,
      render: (sn) => <Text code strong>{sn}</Text>
    },
    {
      title: "归属教师",
      dataIndex: "teacher_name",
      key: "teacher_name",
      width: 120,
      render: (t, r) => (
        <span style={{ fontWeight: 600, color: "#1e3a8a" }}>{t || `ID:${r.teacher_id}`}</span>
      )
    },
    {
      title: "生效月份",
      dataIndex: "month_key",
      key: "month_key",
      width: 100,
      render: (m) => <Tag color="geekblue">{m}</Tag>
    },
    {
      title: "评价指标",
      key: "cat",
      render: (_, r) => (
        <Space>
          <Tag color="cyan">{r.category_code}</Tag>
          <span>{r.category_name || "六育标准指标"}</span>
        </Space>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (st) => {
        if (st === "UNUSED") return <Tag color="blue">待使用 (UNUSED)</Tag>;
        if (st === "CLAIMED") return <Tag color="gold">已扫待审 (CLAIMED)</Tag>;
        if (st === "USED") return <Tag color="green">已核销 (USED)</Tag>;
        if (st === "VOID") return <Tag color="red">已作废 (VOID)</Tag>;
        if (st === "EXPIRED") return <Tag color="default">已过期 (EXPIRED)</Tag>;
        return <Tag>{st}</Tag>;
      }
    },
    {
      title: "生成时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (t) => t ? new Date(t).toLocaleString("zh-CN") : "--"
    }
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* 顶栏 */}
      <div style={{
        background: "linear-gradient(135deg, #092b00 0%, #135200 100%)",
        borderRadius: 16,
        padding: "24px 32px",
        color: "#fff",
        marginBottom: 24,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)"
      }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Tag color="#73d13d" style={{ fontWeight: 600, padding: "2px 8px" }}>B模式实体通兑管理</Tag>
            <Title level={3} style={{ color: "#fff", margin: "8px 0 4px" }}>
              月度配额与防伪实体卡制发中心
            </Title>
            <Text style={{ color: "#d9f7be", fontSize: 13 }}>
              采用 SHA-256 密态散列防伪技术，按月批量向教师分配物理卡片，并在月底自动执行过期巡检保障时效。
            </Text>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ClockCircleOutlined />}
                onClick={triggerExpireTask}
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none" }}
              >
                触发超期扫描
              </Button>
              <Button
                type="default"
                onClick={() => setQuotaModalOpen(true)}
              >
                配置教师月配额
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setGenerateModalOpen(true)}
                style={{
                  background: "#52c41a",
                  borderColor: "#52c41a",
                  fontWeight: 600
                }}
              >
                批量制卡 (发卡)
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      <Card
        title="学校实体激励卡流水表"
        bordered={false}
        extra={<Button icon={<ReloadOutlined />} onClick={fetchCards}>刷新</Button>}
        style={{ borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
      >
        <Alert
          message="防伪与唯一性机制"
          description="每张实体卡在制卡时生成高熵安全 Token，并计算 SHA-256 存入数据库。真实明文 Token 仅在制卡打印单导出，杜绝内鬼泄露与伪造攻击。"
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />

        <Table
          dataSource={cards}
          columns={columns}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: "暂无实体卡记录" }}
        />
      </Card>

      {/* 批量制卡弹窗 */}
      <Modal
        title={
          <Space>
            <CreditCardOutlined style={{ color: "#52c41a" }} />
            <span>批量制发实体防伪激励卡</span>
          </Space>
        }
        open={generateModalOpen}
        onOk={() => genForm.submit()}
        onCancel={() => setGenerateModalOpen(false)}
        confirmLoading={submitting}
        okText="立即批量生成"
        cancelText="取消"
        width={540}
      >
        <Form
          form={genForm}
          layout="vertical"
          onFinish={handleGenerateCards}
          initialValues={{
            month_key: "2026-10",
            count: 5
          }}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="teacher_id"
            label="持卡/赋分教师"
            rules={[{ required: true, message: "请选择领卡教师" }]}
          >
            <Select placeholder="选择领用卡片的任课教师">
              {teachers.map(t => (
                <Option key={t.id} value={t.id}>
                  {t.real_name || t.username} ({t.classes ? JSON.stringify(t.classes) : "教师"})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="category_code"
            label="卡面印制细分评价指标"
            rules={[{ required: true, message: "请选择评价指标" }]}
          >
            <Select showSearch optionFilterProp="children" placeholder="搜索六育考评行为指标">
              {categories.map(c => (
                <Option key={c.category_code} value={c.category_code}>
                  [{c.category_code}] {c.category_name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="month_key"
                label="生效月份 (YYYY-MM)"
                rules={[{ required: true, message: "请输入自然月" }]}
              >
                <Input placeholder="例如：2026-10" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="count"
                label="发卡数量 (张)"
                rules={[{ required: true, message: "请输入制卡张数" }]}
              >
                <InputNumber min={1} max={50} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 配置配额弹窗 */}
      <Modal
        title="设置教师月度发卡配额"
        open={quotaModalOpen}
        onOk={() => quotaForm.submit()}
        onCancel={() => setQuotaModalOpen(false)}
        confirmLoading={submitting}
        okText="保存配额"
        cancelText="取消"
      >
        <Form
          form={quotaForm}
          layout="vertical"
          onFinish={handleSetQuota}
          initialValues={{ month_key: "2026-10", quota_count: 30 }}
        >
          <Form.Item
            name="teacher_id"
            label="教师"
            rules={[{ required: true, message: "请选择教师" }]}
          >
            <Select placeholder="选择教师">
              {teachers.map(t => (
                <Option key={t.id} value={t.id}>{t.real_name || t.username}</Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="month_key"
                label="月份 (YYYY-MM)"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="quota_count"
                label="月度总额度 (张)"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={200} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.List
            name="allocations"
            rules={[{
              validator: async (_, list) => {
                const sum = (list || []).reduce((s, a) => s + Number(a?.count || 0), 0);
                const n = quotaForm.getFieldValue("quota_count");
                if (!list || list.length === 0) throw new Error("请至少分配一个三级指标");
                if (sum !== Number(n)) throw new Error(`指标分配总数(${sum})必须等于月度总额度(${n})`);
              }
            }]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <Space key={key} align="baseline" style={{ display: "flex" }}>
                    <Form.Item {...rest} name={[name, "code"]} rules={[{ required: true, message: "请选择指标" }]}>
                      <Select placeholder="三级指标" style={{ width: 260 }}>
                        {categories.map(c => (
                          <Option key={c.code} value={c.code}>{c.code} {c.name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                    <Form.Item {...rest} name={[name, "count"]} rules={[{ required: true, message: "请输入张数" }]}>
                      <InputNumber min={1} placeholder="张数" />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} />
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>添加指标分配</Button>
                  <Form.ErrorList errors={errors} />
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* 打印/查看导出 Token 弹窗 */}
      <Modal
        title={
          <Space>
            <PrinterOutlined style={{ color: "#16a34a" }} />
            <span>制卡成功！实体防伪印制凭单 (请妥善保存明文Token)</span>
          </Space>
        }
        open={printModalOpen}
        onOk={() => setPrintModalOpen(false)}
        onCancel={() => setPrintModalOpen(false)}
        okText="完成打印并关闭"
        width={700}
      >
        <Alert
          message="高密防伪提示"
          description="系统已对下列明文 Token 进行 SHA-256 单向散列存证。该明文令牌关闭后将不再对任何人公开显示，请立即交付印刷或复制发放。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {generatedBatch?.map((c, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                borderRadius: 8,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                marginBottom: 8
              }}
            >
              <div>
                <Tag color="green">No.{c.serial_no}</Tag>
                <Text strong>{c.month_key} 激励卡</Text>
              </div>
              <Space>
                <Text code copyable>{c.token}</Text>
              </Space>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};

export default AdminCards;
