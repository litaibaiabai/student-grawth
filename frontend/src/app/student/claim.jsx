import React, { useState, useEffect } from "react";
import { Card, Input, Button, message, Alert, Tag, Space, Row, Col, Divider, Spin } from "antd";
import { QrcodeOutlined, CheckCircleOutlined, InfoCircleOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const DEMO_TOKEN = "DEMO-CARD-OCT-2026-TOKEN-1";

const DEMO_PRESETS = {
  UNUSED: {
    serial_no: 101,
    teacher_name: "张老师",
    dimension_name: "德育",
    dimension_code: "D",
    category_name: "主动帮助同学",
    month_key: "2026-10",
    valid_until: "2026-10-31 23:59",
    status: "UNUSED",
    statusLabel: "可领取"
  },
  PENDING: {
    serial_no: 102,
    teacher_name: "张老师",
    dimension_name: "智育",
    dimension_code: "Z",
    category_name: "认真完成课堂任务",
    month_key: "2026-10",
    valid_until: "2026-11-03 23:59 (宽限期)",
    status: "PENDING",
    statusLabel: "他人申领中"
  },
  USED: {
    serial_no: 103,
    teacher_name: "陈老师",
    dimension_name: "德育",
    dimension_code: "D",
    category_name: "文明礼貌问候",
    month_key: "2026-10",
    valid_until: "2026-10-31 23:59",
    status: "USED",
    statusLabel: "已使用"
  },
  EXPIRED: {
    serial_no: 88,
    teacher_name: "周老师",
    dimension_name: "劳育",
    dimension_code: "L",
    category_name: "主动参与班级劳动",
    month_key: "2026-09",
    valid_until: "2026-09-30 23:59",
    status: "EXPIRED",
    statusLabel: "已过期"
  },
  VOID: {
    serial_no: 99,
    teacher_name: "李老师",
    dimension_name: "体育",
    dimension_code: "T",
    category_name: "积极参与体育活动",
    month_key: "2026-10",
    valid_until: "2026-10-31 23:59",
    status: "VOID",
    statusLabel: "已作废"
  }
};

const StudentClaimCard = () => {
  const [tokenInput, setTokenInput] = useState(DEMO_TOKEN);
  const [selectedDemoKey, setSelectedDemoKey] = useState("UNUSED");
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(DEMO_PRESETS.UNUSED);
  const [claimSuccess, setClaimSuccess] = useState(null);

  // 1. 扫描/输入令牌获取只读预览
  const handlePreview = async (overrideToken) => {
    const tokenToQuery = (typeof overrideToken === "string" ? overrideToken : tokenInput).trim();
    if (!tokenToQuery) {
      return message.warning("请输入卡片上的防伪 Token 字符串（或扫描二维码获得）");
    }

    setLoading(true);
    setClaimSuccess(null);
    try {
      const res = await get(urls.API_CARD_PREVIEW, { token: tokenToQuery });
      if (res.code === 200 && res.data) {
        setPreviewData({
          serial_no: res.data.serialNo || res.data.serial_no || 101,
          teacher_name: res.data.teacherName || res.data.teacher_name || "任课教师",
          dimension_name: res.data.dimensionName || "六育标准指标",
          dimension_code: res.data.categoryCode ? res.data.categoryCode.charAt(0) : "D",
          category_name: res.data.categoryName || res.data.category_name || "成长表现",
          month_key: res.data.monthKey || res.data.month_key || "2026-10",
          valid_until: "2026-10-31 23:59",
          status: res.data.status || "UNUSED",
          statusLabel: res.data.status === "UNUSED" ? "可领取" : res.data.status
        });
        message.success("卡片信息已读取成功");
      } else {
        message.error(res.message || "未能识别该卡片信息");
      }
    } catch (err) {
      // 若后端卡片未在数据库找到，保持当前演示卡展示并提示
      message.info("已切换为演示预览卡片模式");
    } finally {
      setLoading(false);
    }
  };

  // 切换演示状态芯片
  const handleSelectDemo = (key) => {
    setSelectedDemoKey(key);
    setClaimSuccess(null);
    if (key === "UNUSED") {
      setTokenInput(DEMO_TOKEN);
      setPreviewData(DEMO_PRESETS.UNUSED);
    } else {
      setPreviewData(DEMO_PRESETS[key]);
      setTokenInput(`DEMO-${key}-${Date.now().toString().slice(-4)}`);
    }
  };

  // 2. 确认申领提交 (B模式创建待审单据，不发分)
  const handleConfirmClaim = async () => {
    const tokenToClaim = tokenInput.trim();
    if (!tokenToClaim) {
      return message.warning("缺少卡片防伪凭证");
    }

    if (previewData && previewData.status !== "UNUSED") {
      return message.warning("当前卡片状态不是可领取状态");
    }

    setLoading(true);
    try {
      const requestKey = `CLAIM_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await post(urls.API_CARD_CLAIM, {
        token: tokenToClaim,
        requestKey
      });

      if (res.code === 200) {
        setClaimSuccess(res.data || { claimId: Date.now() % 10000 });
        message.success("申领提交成功，已进入教师审核流程！");
      } else {
        // 如果后端返回特定状态，也可以优雅在页面呈现
        message.error(res.message || "申领失败");
      }
    } catch (err) {
      // 演示兜底
      message.error(err.message || "申领提交失败");
    } finally {
      setLoading(false);
    }
  };

  const statusNotices = {
    PENDING: "该卡已处于申领审核中，暂时无法领取。",
    USED: "该卡已使用，属于永久失效卡，无法再次领取。",
    EXPIRED: "该卡已跨月超期，禁止发起新申领。",
    VOID: "该卡已被教师或管理员作废，无法再次使用。"
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}>
          PHYSICAL REWARD CARD CLAIM
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>
          扫卡领取
        </h1>
        <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>
          先看看卡片上的成长记录，确认后交给老师审核。
        </p>
      </div>

      <Row gutter={24}>
        <Col span={14}>
          <Card
            title={
              <Space>
                <QrcodeOutlined style={{ color: "#277460" }} />
                <span>预览评价卡</span>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            {/* 搜索/扫描输入区 */}
            <div style={{ marginBottom: 14 }}>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  placeholder="粘贴二维码链接或令牌 (64位高熵防伪密态Token)"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  style={{ borderRadius: "8px 0 0 8px" }}
                />
                <Button
                  type="primary"
                  onClick={() => handlePreview()}
                  loading={loading}
                  style={{
                    borderRadius: "0 8px 8px 0",
                    background: "#277460",
                    borderColor: "#277460",
                    fontWeight: 600
                  }}
                >
                  读取卡片
                </Button>
              </Space.Compact>
            </div>

            {/* 原型状态演示切换标签 */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: "#8d9c90", marginRight: 8 }}>原型状态展示:</span>
              <Space size={6} wrap>
                {[
                  ["UNUSED", "可领取"],
                  ["PENDING", "他人申领中"],
                  ["USED", "已使用"],
                  ["EXPIRED", "已过期"],
                  ["VOID", "已作废"]
                ].map(([k, l]) => (
                  <Tag.CheckableTag
                    key={k}
                    checked={selectedDemoKey === k}
                    onChange={() => handleSelectDemo(k)}
                    style={{
                      borderRadius: 12,
                      padding: "2px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      border: selectedDemoKey === k ? "1px solid #277460" : "1px solid #e2e8e3",
                      background: selectedDemoKey === k ? "#eef6f2" : "#fdfefe",
                      color: selectedDemoKey === k ? "#277460" : "#5a6e60"
                    }}
                  >
                    {l}
                  </Tag.CheckableTag>
                ))}
              </Space>
            </div>

            {previewData ? (
              <div>
                {/* 仿真实体卡卡面 */}
                <div className="scan-card">
                  <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, marginBottom: 8 }}>
                    A LITTLE ACT, A BIG GROWTH
                  </div>
                  <Tag color="green" style={{ fontWeight: 600 }}>
                    {previewData.dimension_name || "德育"} · {previewData.dimension_code || "D"}
                  </Tag>
                  <div className="scan-category">
                    {previewData.category_name}
                  </div>
                  <div className="reward">
                    +1<small>过程积分</small>
                  </div>
                  <p style={{ fontSize: 12, color: "#7b8a80", margin: "6px 0 16px" }}>
                    谢谢你让善意与成长发生。
                  </p>
                  <div style={{ borderTop: "1px dashed #dbe5dc", margin: "16px 0" }} />

                  <div style={{ textAlign: "left", fontSize: 12, color: "#55675b", lineHeight: 2 }}>
                    <div><strong>流水编号</strong>：No.{previewData.serial_no}</div>
                    <div><strong>归属教师</strong>：{previewData.teacher_name || "任课教师"}</div>
                    <div><strong>生效月份</strong>：{previewData.month_key}</div>
                    <div><strong>有效期至</strong>：{previewData.valid_until}</div>
                    <div>
                      <strong>卡片状态</strong>：
                      <Tag color={
                        previewData.status === "UNUSED" ? "success" :
                        previewData.status === "PENDING" ? "warning" :
                        previewData.status === "USED" ? "default" : "error"
                      }>
                        {previewData.statusLabel || previewData.status}
                      </Tag>
                    </div>
                  </div>
                </div>

                {previewData.status === "UNUSED" ? (
                  !claimSuccess ? (
                    <div style={{ textAlign: "center", marginTop: 20 }}>
                      <Button
                        type="primary"
                        size="large"
                        onClick={handleConfirmClaim}
                        loading={loading}
                        style={{
                          background: "#277460",
                          borderColor: "#277460",
                          borderRadius: 8,
                          fontWeight: 600,
                          padding: "0 32px",
                          height: 44
                        }}
                      >
                        确认申领，交给老师审核
                      </Button>
                    </div>
                  ) : (
                    <Alert
                      message="申领已提交"
                      description={`单据已生成 (#${claimSuccess.claimId || claimSuccess.claim_id || "701"})，等待教师审核。审核通过后 +1 过程积分正式入账。`}
                      type="success"
                      showIcon
                      style={{ marginTop: 16, borderRadius: 8 }}
                    />
                  )
                ) : (
                  <Alert
                    message={statusNotices[previewData.status] || "当前状态卡片不可申领"}
                    type="warning"
                    showIcon
                    style={{ marginTop: 16, borderRadius: 8 }}
                  />
                )}
              </div>
            ) : (
              <div style={{
                padding: "48px 0",
                textAlign: "center",
                color: "#9aa59d",
                border: "2px dashed #e6ebe7",
                borderRadius: 8
              }}>
                <QrcodeOutlined style={{ fontSize: 36, color: "#b4c4b8", marginBottom: 12 }} />
                <div>请在上方输入卡片 Token 或扫描实体卡背面的二维码</div>
              </div>
            )}
          </Card>
        </Col>

        <Col span={10}>
          <Card
            title="领取小提示"
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            <div style={{ fontSize: 13, color: "#56685c", lineHeight: 2.2 }}>
              <div><strong>① 先核对卡片</strong>：确认指标、归属教师和有效期</div>
              <div><strong>② 确认申领</strong>：提交后锁定该卡，进入老师审核队列</div>
              <div><strong>③ 审核通过，正式入账</strong>：通过后在积分账本查看 +1 分</div>
            </div>

            <Divider style={{ margin: "16px 0" }} />

            <Alert
              message="防二次流转规则"
              description="每张实体卡只能使用一次。一旦被教师核准入账，卡片即进入永久失效终态 (USED)，杜绝在学生之间私下借用或重复转赠。"
              type="info"
              showIcon
              style={{ borderRadius: 8 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StudentClaimCard;
