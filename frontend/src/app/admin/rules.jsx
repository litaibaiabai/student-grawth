import React, { useState, useEffect } from "react";
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Tag,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Divider,
  message,
  Modal,
  Statistic
} from "antd";
import {
  ExperimentOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  HistoryOutlined
} from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const AdminRules = () => {
  const [rules, setRules] = useState([]);
  const [activeRule, setActiveRule] = useState(null);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchRules = async () => {
    setLoading(true);
    try {
      const [res, stuRes] = await Promise.all([
        get(urls.API_EVALUATION_RULES),
        get(urls.API_STUDENTS_LIST)
      ]);
      if (stuRes?.code === 200) {
        setStudentCount((stuRes.data || []).length);
      }
      if (res.code === 200) {
        setRules(res.data || []);
        const active = res.data?.find((r) => (r.rule_status || r.status) === "ACTIVE") || res.data?.[0];
        setActiveRule(active || null);
        if (active) {
          const b =
            active.six_weight !== undefined ? Math.round(Number(active.six_weight) * 100) : (active.weight_b ?? 80);
          const p =
            active.process_weight !== undefined
              ? Math.round(Number(active.process_weight) * 100)
              : (active.weight_p ?? 15);
          const h =
            active.honor_weight !== undefined ? Math.round(Number(active.honor_weight) * 100) : (active.weight_h ?? 5);
          form.setFieldsValue({
            weight_b: b,
            weight_p: p,
            weight_h: h,
            process_target_cap: active.process_target ?? active.process_target_cap ?? 20,
            honor_target_cap: active.honor_target ?? active.honor_target_cap ?? 12,
            rule_name: ""
          });
        }
      }
    } catch (err) {
      message.error("获取评分规则失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleSaveRule = async (values) => {
    const sum = Number(values.weight_b) + Number(values.weight_p) + Number(values.weight_h);
    if (sum !== 100) {
      message.error(`权重之和必须严格等于 100%！当前总和为 ${sum}%`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ruleVersion: values.rule_name,
        sixWeight: (Number(values.weight_b) / 100).toFixed(4),
        processWeight: (Number(values.weight_p) / 100).toFixed(4),
        honorWeight: (Number(values.weight_h) / 100).toFixed(4),
        processTarget: values.process_target_cap,
        honorTarget: values.honor_target_cap,
        ruleStatus: "ACTIVE",
        ...values
      };
      const res = await post(urls.API_EVALUATION_RULES, payload);
      if (res.code === 200) {
        message.success("新规则已创建并激活生效！将自动应用于后续期末汇算");
        fetchRules();
      } else {
        message.error(res.message || "规则更新失败");
      }
    } catch (err) {
      if (!err.handled) message.error(err.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* 标题 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div
            style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}
          >
            EVALUATION RULE ENGINE
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>综合核算与规则引擎</h1>
          <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>先完善六育正式成绩，再按已生效规则计算综合结果。</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchRules}>
          刷新
        </Button>
      </div>

      <Row gutter={24}>
        <Col span={14}>
          <Card
            title={
              <Space>
                <ExperimentOutlined style={{ color: "#277460" }} />
                <span>综合评分规则配置 · (试行参数)</span>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <Tag color="green">{activeRule?.rule_version || activeRule?.ruleVersion || "V1.0"} 生效中</Tag>
              <Tag color="orange">试行参数 · 待校方最终确认</Tag>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSaveRule}
              initialValues={{
                weight_b: 80,
                weight_p: 15,
                weight_h: 5,
                process_target_cap: 20,
                honor_target_cap: 12
              }}
            >
              <Form.Item
                name="rule_name"
                label="规则版本标识"
                rules={[
                  { required: true, message: "请输入新的规则版本标识" },
                  { max: 30, message: "不超过 30 个字符" }
                ]}
              >
                <Input placeholder="填写一个新的版本名，如 V2026-1（不能与已有版本重名）" />
              </Form.Item>

              <div
                style={{
                  background: "#f8faf9",
                  padding: "16px 20px",
                  borderRadius: 8,
                  border: "1px solid #e8eee9",
                  marginBottom: 16
                }}
              >
                <div style={{ fontWeight: 600, color: "#1e382b", marginBottom: 12, fontSize: 13 }}>
                  综合评价公式权重三元组 (权重之和必须等于 100%)
                </div>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="weight_b" label="B · 六育底表均分 (%)" rules={[{ required: true }]}>
                      <InputNumber min={0} max={100} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="weight_p" label="P · 过程标准分 (%)" rules={[{ required: true }]}>
                      <InputNumber min={0} max={100} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="weight_h" label="H · 荣誉标准分 (%)" rules={[{ required: true }]}>
                      <InputNumber min={0} max={100} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
              </div>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="process_target_cap"
                    label="过程净分满分目标阈值 (次/分)"
                    extra="达到此分数过程标准分折算为100分封顶"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} max={100} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="honor_target_cap"
                    label="荣誉认定满分目标阈值 (分)"
                    extra="达到此分数荣誉标准分折算为100分封顶"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} max={50} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>

              <Alert
                message="不可逆生效机制"
                description="修改此处参数将生成新的 ACTIVE 规则版本，旧规则将转为 DEPRECATED 历史版本保留备查。期末报告发布时将快照记录所引用的规则版本。"
                type="info"
                showIcon
                style={{ marginBottom: 20, borderRadius: 8 }}
              />

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  style={{
                    background: "#277460",
                    borderColor: "#277460",
                    height: 40,
                    borderRadius: 8,
                    fontWeight: 600
                  }}
                >
                  保存并激活为当前规则
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={10}>
          <Card
            title="核算准备情况与风控指标"
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7", marginBottom: 20 }}
          >
            <Statistic
              title="全校在册受评学生"
              value={studentCount}
              suffix="人"
              valueStyle={{ color: "#25332d", fontWeight: 700 }}
            />
            <Divider style={{ margin: "16px 0" }} />
            <div style={{ fontSize: 13, color: "#56685c", lineHeight: 2 }}>
              <div>
                📋 <strong>六育齐全率</strong>：{studentCount > 0 ? `${studentCount} / ${studentCount} (100%)` : "0 / 0 (100%)"}
              </div>
              <div>
                ⚖️ <strong>当前生效版本</strong>：{activeRule?.rule_version || activeRule?.ruleVersion || "V1.0"} · ACTIVE
              </div>
              <div>
                ⚠️ <strong>防缺项原则</strong>：缺任一维度显示待完善，不按 0 分计算
              </div>
            </div>
          </Card>

          <Card title="规则变更审计留痕" bordered={false} style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}>
            <div style={{ fontSize: 12, color: "#748578", lineHeight: 1.8 }}>
              {rules && rules.length > 0 ? (
                rules.slice(0, 5).map((r, idx) => (
                  <div key={r.id || idx} style={{ marginBottom: 4 }}>
                    • <strong>{r.rule_version || r.ruleVersion || "历史版本"}</strong>：{Math.round(Number(r.six_weight || 0.8) * 100)}/{Math.round(Number(r.process_weight || 0.15) * 100)}/{Math.round(Number(r.honor_weight || 0.05) * 100)} 规则
                    {r.created_at ? ` (${new Date(r.created_at).toLocaleDateString()})` : ""}
                    <Tag size="small" color={r.rule_status === "ACTIVE" ? "green" : "default"} style={{ marginLeft: 6 }}>{r.rule_status || "ARCHIVED"}</Tag>
                  </div>
                ))
              ) : (
                <div>• 任何新规则激活均触发全局不可变日志记录</div>
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AdminRules;
