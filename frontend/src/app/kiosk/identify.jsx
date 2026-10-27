import React, { useState } from "react";
import { Card, Input, Button, Space, Typography, Alert, Tag, Spin, message } from "antd";
import { QrcodeOutlined, UserOutlined, ClockCircleOutlined, SafetyCertificateOutlined, DesktopOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { post } from "@/util/request";
import { API_KIOSK_SESSION_ISSUE, API_KIOSK_SESSION_REVOKE } from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const KioskIdentify = () => {
  const [deviceCode, setDeviceCode] = useState("KIOSK_BUILDING_1F_01");
  const [deviceSecret, setDeviceSecret] = useState("secret_kiosk_key_9988");
  const [studentCardNumber, setStudentCardNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSession, setCurrentSession] = useState(null);
  const navigate = useNavigate();

  const handleIdentify = async () => {
    if (!studentCardNumber.trim()) {
      message.warning("请刷卡或输入学号/条码");
      return;
    }

    setLoading(true);
    try {
      const res = await post(API_KIOSK_SESSION_ISSUE, {
        deviceCode,
        deviceSecret,
        studentCardNumber: studentCardNumber.trim()
      });
      const data = res.data || res;
      setCurrentSession(data);
      message.success(`识别成功：${data.student?.name} 同学已就绪`);
    } catch (err) {
      message.error(err.message || "学生凭证识别失败");
      setCurrentSession(null);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSession = async () => {
    if (currentSession?.sessionToken) {
      try {
        await post(API_KIOSK_SESSION_REVOKE, {
          sessionToken: currentSession.sessionToken
        });
      } catch (e) {}
    }
    setCurrentSession(null);
    setStudentCardNumber("");
    message.info("屏幕已清理，会话已销毁，等待下一位同学");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Card
        style={{
          width: 580,
          borderRadius: 20,
          background: "rgba(30, 41, 59, 0.95)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          color: "#fff"
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <DesktopOutlined style={{ fontSize: 40, color: "#38bdf8", marginBottom: 12 }} />
          <Title level={3} style={{ color: "#fff", margin: 0 }}>公共扫卡激励终端</Title>
          <Text style={{ color: "#94a3b8" }}>设备编号: {deviceCode} · 安全受控环境</Text>
        </div>

        {!currentSession ? (
          <div>
            <div style={{ textAlign: "center", padding: "30px 0", background: "rgba(15, 23, 42, 0.6)", borderRadius: 14, marginBottom: 20 }}>
              <QrcodeOutlined style={{ fontSize: 56, color: "#38bdf8", marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 500, color: "#e2e8f0" }}>请将学生卡或身份条码贴近感应区</div>
              <Text type="secondary" style={{ fontSize: 12 }}>感应后自动签发 120 秒短效兑换会话</Text>
            </div>

            <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
              <Input
                size="large"
                prefix={<UserOutlined style={{ color: "#94a3b8" }} />}
                placeholder="模拟刷卡：输入学号 (如 student_a)"
                value={studentCardNumber}
                onChange={(e) => setStudentCardNumber(e.target.value)}
                onPressEnter={handleIdentify}
              />
              <Button type="primary" size="large" loading={loading} onClick={handleIdentify}>
                感应读取
              </Button>
            </Space.Compact>
          </div>
        ) : (
          <div>
            <Alert
              type="success"
              message={`学生已认证: ${currentSession.student?.name} (${currentSession.student?.studentNo})`}
              description={
                <div>
                  <div>年级班级: {currentSession.student?.grade}年级 {currentSession.student?.classNo}班</div>
                  <div>会话权限: <Tag color="blue">{currentSession.scope}</Tag> (仅限扫码兑换，已阻断隐私报告访问)</div>
                  <div style={{ marginTop: 4, color: "#64748b" }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    有效时间: {currentSession.expiresInSeconds} 秒，超时自动切人清屏
                  </div>
                </div>
              }
              showIcon
              style={{ marginBottom: 20 }}
            />

            <Space direction="vertical" style={{ width: "100%" }}>
              <Button type="primary" size="large" block onClick={() => navigate("/kiosk/redeem")}>
                前往扫卡即时兑换
              </Button>
              <Button danger block onClick={handleClearSession}>
                完成并清屏切人 (下一位)
              </Button>
            </Space>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#64748b" }}>
          <SafetyCertificateOutlined style={{ marginRight: 4 }} />
          六育学生综合素质评价系统 · 公共硬件安全隔离协议 C10
        </div>
      </Card>
    </div>
  );
};

export default KioskIdentify;
