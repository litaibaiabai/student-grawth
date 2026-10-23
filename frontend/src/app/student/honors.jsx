import React, { useState, useEffect } from "react";
import { Card, Table, Button, Modal, Form, Input, Select, DatePicker, Tag, message, Space, Alert, Typography } from "antd";
import { TrophyOutlined, PlusOutlined, EditOutlined, FileImageOutlined } from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text } = Typography;

const StudentHonors = () => {
  const [honors, setHonors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [resubmitModal, setResubmitModal] = useState(false);
  const [currentHonor, setCurrentHonor] = useState(null);
  const [form] = Form.useForm();
  const [resubmitForm] = Form.useForm();

  const fetchHonors = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_HONORS);
      if (res.code === 200) {
        setHonors(res.data || []);
      }
    } catch (err) {
      message.error("获取荣誉列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHonors();
  }, []);

  const handleCreate = async (values) => {
    try {
      const payload = {
        title: values.title,
        awardLevel: values.awardLevel,
        prizeLevel: values.prizeLevel,
        awardDate: values.awardDate ? values.awardDate.format("YYYY-MM-DD") : undefined,
        certificateUrl: values.certificateUrl,
        description: values.description
      };
      const res = await post(urls.API_SUBMIT_HONOR, payload);
      if (res.code === 200) {
        message.success("荣誉申报已成功提交！");
        setModalVisible(false);
        form.resetFields();
        fetchHonors();
      } else {
        message.error(res.message || "提交失败");
      }
    } catch (err) {
      message.error(err.message || "提交失败");
    }
  };

  const handleResubmit = async (values) => {
    try {
      const res = await post(urls.API_RESUBMIT_HONOR(currentHonor.id), {
        certificateUrl: values.certificateUrl,
        description: values.description,
        reason: values.reason
      });
      if (res.code === 200) {
        message.success("补充佐证材料已重新提交！");
        setResubmitModal(false);
        resubmitForm.resetFields();
        fetchHonors();
      } else {
        message.error(res.message || "重新提交失败");
      }
    } catch (err) {
      message.error(err.message || "重新提交失败");
    }
  };

  const columns = [
    {
      title: "荣誉/赛事名称",
      dataIndex: "title",
      key: "title",
      render: (t) => <strong>{t}</strong>
    },
    {
      title: "获奖级别与等次",
      key: "level",
      render: (_, r) => {
        const levelMap = { PROVINCE: "省级", CITY: "市级", DISTRICT: "区级" };
        const prizeMap = { FIRST: "一等奖", SECOND: "二等奖", THIRD: "三等奖" };
        return (
          <Space>
            <Tag color="purple">{levelMap[r.award_level] || r.award_level}</Tag>
            <Tag color="cyan">{prizeMap[r.prize_level] || r.prize_level}</Tag>
          </Space>
        );
      }
    },
    {
      title: "折算荣誉分",
      dataIndex: "honor_points",
      key: "honor_points",
      render: (pts) => <span style={{ color: "#d97706", fontWeight: "bold", fontSize: 15 }}>{pts} 分</span>
    },
    {
      title: "材料版本",
      dataIndex: "material_version",
      key: "material_version",
      render: (v) => <Tag>V{v}</Tag>
    },
    {
      title: "审核状态",
      dataIndex: "status",
      key: "status",
      render: (st, r) => {
        if (st === "APPROVED") return <Tag color="green">已认定通过</Tag>;
        if (st === "REJECTED") return <Tag color="red">已退回（{r.reject_reason || "不合规范"}）</Tag>;
        return <Tag color="orange">待审核</Tag>;
      }
    },
    {
      title: "操作",
      key: "action",
      render: (_, r) => {
        if (r.status === "REJECTED") {
          return (
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                setCurrentHonor(r);
                setResubmitModal(true);
              }}
            >
              补充材料重新提交
            </Button>
          );
        }
        return <Text type="secondary">--</Text>;
      }
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card
        title={
          <Space>
            <TrophyOutlined style={{ color: "#8b5cf6", fontSize: 20 }} />
            <span style={{ fontSize: 18, fontWeight: 700 }}>荣誉奖项申报与认定</span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalVisible(true)}
            style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
          >
            申报新荣誉
          </Button>
        }
        style={{ borderRadius: 16 }}
      >
        <Alert
          message="荣誉积分折算规则说明"
          description="系统依据校方标准：省级一/二/三等奖分别折算 9/8/7分；市级一/二/三等奖折算 6/5/4分；区级一/二/三等奖折算 3/2/1分。经班主任审核确认后正式入账，并记录完整材料修改留痕。"
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />

        <Table
          dataSource={honors}
          columns={columns}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: "暂无申报荣誉" }}
        />
      </Card>

      {/* 申报模态框 */}
      <Modal
        title="申报学生荣誉奖项"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="title" label="活动 / 赛事项目名称" rules={[{ required: true, message: "请输入赛事名称" }]}>
            <Input placeholder="例如：全国青少年信息素养大赛科技创新赛" />
          </Form.Item>

          <Form.Item name="awardLevel" label="奖项级别" initialValue="CITY" rules={[{ required: true }]}>
            <Select options={[
              { label: "省级赛事 (7~9分)", value: "PROVINCE" },
              { label: "市级赛事 (4~6分)", value: "CITY" },
              { label: "区/县级赛事 (1~3分)", value: "DISTRICT" }
            ]} />
          </Form.Item>

          <Form.Item name="prizeLevel" label="获奖等次" initialValue="FIRST" rules={[{ required: true }]}>
            <Select options={[
              { label: "一等奖", value: "FIRST" },
              { label: "二等奖", value: "SECOND" },
              { label: "三等奖", value: "THIRD" }
            ]} />
          </Form.Item>

          <Form.Item name="awardDate" label="证书颁发日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="certificateUrl" label="证书原图访问路径/标识" initialValue="/uploads/honor/cert_sample.png">
            <Input prefix={<FileImageOutlined />} placeholder="证书扫描件图片URL" />
          </Form.Item>

          <Form.Item name="description" label="成果简介或心得体会">
            <Input.TextArea rows={3} placeholder="简要说明参赛过程或获奖成果概要" />
          </Form.Item>

          <div style={{ textAlign: "right" }}>
            <Button onClick={() => setModalVisible(false)} style={{ marginRight: 8 }}>取消</Button>
            <Button type="primary" htmlType="submit" style={{ background: "#7c3aed", borderColor: "#7c3aed" }}>确认申报</Button>
          </div>
        </Form>
      </Modal>

      {/* 补充材料重新提交模态框 */}
      <Modal
        title={`补充材料重新提交 (荣誉 #${currentHonor?.id})`}
        open={resubmitModal}
        onCancel={() => setResubmitModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={resubmitForm} layout="vertical" onFinish={handleResubmit}>
          <Alert message={`退回原因：${currentHonor?.reject_reason || "材料需补充"}`} type="warning" showIcon style={{ marginBottom: 16 }} />
          <Form.Item name="certificateUrl" label="更新后的证书图片路径" rules={[{ required: true, message: "请提供新证书文件路径" }]}>
            <Input prefix={<FileImageOutlined />} placeholder="请输入新上传的清晰扫描件路径" />
          </Form.Item>
          <Form.Item name="reason" label="修订原因说明" initialValue="根据退回意见重新上传盖章页">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="成果补充陈述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <div style={{ textAlign: "right" }}>
            <Button onClick={() => setResubmitModal(false)} style={{ marginRight: 8 }}>取消</Button>
            <Button type="primary" htmlType="submit">重新提交审阅</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default StudentHonors;
