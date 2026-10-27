import React, { useState } from "react";
import { Card, Table, Button, Form, Input, Tag, Space, Typography, message, Modal } from "antd";
import { DesktopOutlined, PlusOutlined, SafetyCertificateOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { post } from "@/util/request";
import { API_DEVICE_REGISTER } from "@/constant/urls";

const { Title, Paragraph } = Typography;

const DevicesManager = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [devices, setDevices] = useState([
    {
      id: 1,
      deviceCode: "KIOSK_BUILDING_1F_01",
      locationName: "教学楼1F大厅主终端",
      status: 1,
      createdAt: "2026-10-27 10:00:00"
    }
  ]);

  const handleRegister = async (values) => {
    setSubmitting(true);
    try {
      await post(API_DEVICE_REGISTER, values);
      message.success("受控终端设备注册成功");
      setDevices((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          deviceCode: values.deviceCode,
          locationName: values.locationName,
          status: 1,
          createdAt: new Date().toLocaleString()
        }
      ]);
      setModalVisible(false);
      form.resetFields();
    } catch (err) {
      message.error(err.message || "设备注册失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 60 },
    { title: "设备编码", dataIndex: "deviceCode", width: 220 },
    { title: "放置物理位置", dataIndex: "locationName" },
    {
      title: "设备状态",
      dataIndex: "status",
      width: 120,
      render: (status) => (status === 1 ? <Tag color="green">正常受控</Tag> : <Tag color="red">已停用</Tag>)
    },
    { title: "注册时间", dataIndex: "createdAt", width: 180 }
  ];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 0" }}>
      <Title level={3} style={{ marginBottom: 4 }}>
        <DesktopOutlined style={{ marginRight: 8, color: "#0284c7" }} />
        公共扫码终端与设备白名单
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        管理部署在走廊、大厅等公共区域的硬件终端。所有受控终端在学生刷卡时只签发短效、仅限兑换的受限会话，严禁泄露学生隐私报告。
      </Paragraph>

      <Card
        title="已注册受控设备列表"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            注册新终端
          </Button>
        }
        style={{ borderRadius: 12 }}
      >
        <Table dataSource={devices} columns={columns} rowKey="id" pagination={false} size="small" />
      </Card>

      <Modal
        title="注册受控公共终端设备"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleRegister}>
          <Form.Item
            name="deviceCode"
            label="设备唯一编码 (MAC/出厂编码)"
            rules={[{ required: true, message: "请输入设备编码" }]}
          >
            <Input placeholder="例如：KIOSK_LIBRARY_01" />
          </Form.Item>

          <Form.Item
            name="deviceSecret"
            label="设备认证密钥 (Secret)"
            rules={[{ required: true, message: "请输入安全密钥" }]}
          >
            <Input.Password placeholder="终端与云端通信对称凭据" />
          </Form.Item>

          <Form.Item
            name="locationName"
            label="放置物理位置"
            rules={[{ required: true, message: "请输入安装位置" }]}
          >
            <Input placeholder="例如：图书馆2层扫卡角" />
          </Form.Item>

          <Form.Item style={{ textAlign: "right", marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                确认注册
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DevicesManager;
