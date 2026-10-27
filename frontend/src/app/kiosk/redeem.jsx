import React, { useState, useEffect } from "react";
import { Card, Input, Button, Space, Typography, Alert, Tag, Spin, Result, message } from "antd";
import { QrcodeOutlined, CheckCircleOutlined, TrophyOutlined, ClockCircleOutlined, SafetyCertificateOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { post } from "@/util/request";
import { API_KIOSK_REDEEM, API_KIOSK_CLEAR_SESSION } from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const DIMENSION_NAMES = {
  morality: "德育",
  intelligence: "智育",
  physical: "体育",
  aesthetic: "美育",
  labor: "劳育",
  mind: "心育",
  M: "德育",
  I: "智育",
  P: "体育",
  A: "美育",
  L: "劳育",
  D: "素质"
};

const KioskRedeem = () => {
  const navigate = useNavigate();
  const [sessionToken, setSessionToken] = useState("");
  const [studentInfo, setStudentInfo] = useState(null);
  const [cardToken, setCardToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState(null);
  const [countdown, setCountdown] = useState(120);

  // 初始化会话与倒计时
  useEffect(() => {
    // 从临时内存或输入中恢复 sessionToken（或默认测试用）
    const savedToken = sessionStorage.getItem("kiosk_session_token") || "";
    setSessionToken(savedToken);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleClearSession(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleClearSession = async (isTimeout = false) => {
    if (sessionToken) {
      try {
        await post(API_KIOSK_CLEAR_SESSION, { sessionToken });
      } catch (e) {}
    }
    sessionStorage.removeItem("kiosk_session_token");
    setSessionToken("");
    setRedeemResult(null);
    if (isTimeout) {
      message.warning("终端会话已超时，已自动切人清屏");
    } else {
      message.info("已手动清屏退出，欢迎下一位同学使用");
    }
    navigate("/kiosk/identify");
  };

  const handleRedeem = async () => {
    if (!cardToken.trim()) {
      message.warning("请扫码或输入卡片凭证Token");
      return;
    }

    setLoading(true);
    const requestKey = `KIOSK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const res = await post(API_KIOSK_REDEEM, {
        sessionToken,
        cardToken: cardToken.trim(),
        requestKey
      });

      const data = res.data || res;
      setRedeemResult(data);
      setCardToken("");
      message.success("兑换成功！");

      // 3秒后自动重置兑换框，或准备切人
      setTimeout(() => {
        // 短时展示后允许继续扫或切人
      }, 3000);
    } catch (err) {
      message.error(err.message || "卡片兑换失败，请检查卡片有效性或网络重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Card
        style={{
          width: 620,
          borderRadius: 20,
          background: "rgba(30, 41, 59, 0.95)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          color: "#fff"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <Space>
            <TrophyOutlined style={{ fontSize: 28, color: "#38bdf8" }} />
            <div>
              <Title level={4} style={{ color: "#fff", margin: 0 }}>公共终端即时扫码兑换</Title>
              <Text style={{ color: "#94a3b8", fontSize: 12 }}>受控安全环境 · 会话隐私隔离</Text>
            </div>
          </Space>
          <Tag icon={<ClockCircleOutlined />} color={countdown < 30 ? "error" : "processing"}>
            倒计时: {countdown}s
          </Tag>
        </div>

        {/* 凭证输入或显示 */}
        {!sessionToken && (
          <Alert
            type="info"
            message="请输入或粘贴当前识别的受限会话凭证 (或先在识别页刷卡)"
            description={
              <Input
                style={{ marginTop: 8 }}
                placeholder="会话Token (KIOSK_SES_...)"
                value={sessionToken}
                onChange={(e) => setSessionToken(e.target.value)}
              />
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 兑换展示 */}
        {redeemResult ? (
          <div style={{ textAlign: "center", padding: "20px 0", background: "rgba(16, 185, 129, 0.1)", borderRadius: 16, border: "1px solid rgba(16, 185, 129, 0.2)", marginBottom: 20 }}>
            <CheckCircleOutlined style={{ fontSize: 64, color: "#10b981", marginBottom: 12 }} />
            <Title level={3} style={{ color: "#10b981", margin: 0 }}>
              兑换成功 +{redeemResult.pointsCredited} 分
            </Title>
            <div style={{ marginTop: 12 }}>
              <Tag color="cyan" style={{ fontSize: 14, padding: "4px 10px" }}>
                维度: {DIMENSION_NAMES[redeemResult.dimensionCode] || redeemResult.dimensionCode || "综合"}
              </Tag>
              {redeemResult.categoryName && (
                <Tag color="purple" style={{ fontSize: 14, padding: "4px 10px" }}>
                  项目: {redeemResult.categoryName}
                </Tag>
              )}
            </div>
            <Paragraph style={{ color: "#94a3b8", marginTop: 16, fontSize: 12 }}>
              积分已即时写入个人成长账本 · 无需教师二次审核
            </Paragraph>
            <Space>
              <Button type="default" onClick={() => setRedeemResult(null)}>
                继续扫下一张
              </Button>
              <Button type="primary" danger onClick={() => handleClearSession(false)}>
                完成并清屏切人
              </Button>
            </Space>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: "center", padding: "30px 0", background: "rgba(15, 23, 42, 0.6)", borderRadius: 14, marginBottom: 20 }}>
              <QrcodeOutlined style={{ fontSize: 60, color: "#38bdf8", marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 500, color: "#e2e8f0" }}>请将实体奖励卡条码/二维码对准感应窗</div>
              <Text type="secondary" style={{ fontSize: 12 }}>支持即时入账与断网幂等重试，无延迟计分</Text>
            </div>

            <Space.Compact style={{ width: "100%", marginBottom: 20 }}>
              <Input
                size="large"
                placeholder="模拟扫码：输入卡片 Token"
                value={cardToken}
                onChange={(e) => setCardToken(e.target.value)}
                onPressEnter={handleRedeem}
              />
              <Button type="primary" size="large" loading={loading} onClick={handleRedeem}>
                即刻入账
              </Button>
            </Space.Compact>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => handleClearSession(false)}>
            清屏切人 (下一位)
          </Button>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            <SafetyCertificateOutlined style={{ marginRight: 4 }} />
            自动清屏防冒用 · 严禁展示过往账本与报告
          </div>
        </div>
      </Card>
    </div>
  );
};

export default KioskRedeem;
