import React, { useState, useEffect } from "react";
import { Row, Col, Card, Tag, Button, Typography, Timeline, Space, Spin, Alert, Empty, Badge } from "antd";
import {
  QrcodeOutlined,
  TrophyOutlined,
  ReadOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  StarOutlined,
  RocketOutlined,
  CompassOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import StudentLayout from "@/component/StudentLayout";
import { get } from "@/util/request";
import { API_GROWTH_MY } from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const StudentGrowthDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const loadGrowthData = async () => {
    setLoading(true);
    try {
      const res = await get(API_GROWTH_MY);
      setData(res.data || res);
      setError(null);
    } catch (err) {
      setError(err.message || "加载成长数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrowthData();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "100px 0" }}>
        <Spin size="large" tip="正在唤醒成长足迹..." />
      </div>
    );
  }

  const { studentProfile, currentPoints, gameLevel, officialGrade, evaluation, timeline = [], theme } = data || {};

  return (
    <StudentLayout currentTheme={theme} studentInfo={studentProfile}>
      {error && <Alert type="error" message={error} style={{ marginBottom: 20 }} showIcon />}

      {/* 顶部个人成长名片 */}
      <Card
        style={{
          borderRadius: 16,
          marginBottom: 24,
          background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,249,255,0.9) 100%)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.04)"
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={14}>
            <Space orientation="vertical" size="small">
              <Space align="center" size="middle">
                <Title level={3} style={{ margin: 0 }}>
                  你好，{studentProfile?.name || "同学"}！
                </Title>
                <Tag color="cyan">{studentProfile?.grade ? `${studentProfile.grade}年级 ${studentProfile.classNo || 1}班` : "学生"}</Tag>
              </Space>
              <Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
                每一次微小的努力，都在书写属于你独特的成长篇章。
              </Paragraph>
              <Space style={{ marginTop: 8 }} wrap>
                <Tag icon={<RocketOutlined />} color="magenta" style={{ fontSize: 14, padding: "4px 10px" }}>
                  趣味成长阶梯: {gameLevel?.levelName || "初阶探索者"}
                </Tag>
                {officialGrade && (
                  <Tag color="gold" style={{ fontSize: 14, padding: "4px 10px" }}>
                    学校官方评价: {officialGrade}
                  </Tag>
                )}
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                * 注：趣味成长阶梯仅作为激励展示，与学校期末综合素质等级评价区分管理。
              </Text>
            </Space>
          </Col>

          <Col xs={24} md={10} style={{ textAlign: "right" }}>
            <div style={{ display: "inline-block", textAlign: "center", padding: "12px 24px", background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
              <Text type="secondary" style={{ fontSize: 13 }}>累计成长积分</Text>
              <div style={{ fontSize: 36, fontWeight: "bold", color: "var(--primary-color, #3b82f6)", lineHeight: 1.2 }}>
                {currentPoints ?? 0}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>分值记录真实可溯</Text>
            </div>
          </Col>
        </Row>
      </Card>

      {/* 快捷通道按钮 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate("/student/claim")} style={{ borderRadius: 12, textAlign: "center" }}>
            <QrcodeOutlined style={{ fontSize: 32, color: "#3b82f6", marginBottom: 8 }} />
            <div style={{ fontWeight: 600 }}>扫卡领取</div>
            <Text type="secondary" style={{ fontSize: 12 }}>实体卡即时入账</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate("/student/honors")} style={{ borderRadius: 12, textAlign: "center" }}>
            <TrophyOutlined style={{ fontSize: 32, color: "#eab308", marginBottom: 8 }} />
            <div style={{ fontWeight: 600 }}>荣誉申报</div>
            <Text type="secondary" style={{ fontSize: 12 }}>记录校内外奖项</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate("/student/stories")} style={{ borderRadius: 12, textAlign: "center" }}>
            <ReadOutlined style={{ fontSize: 32, color: "#10b981", marginBottom: 8 }} />
            <div style={{ fontWeight: 600 }}>生活故事</div>
            <Text type="secondary" style={{ fontSize: 12 }}>分享成长感悟</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate("/student/report")} style={{ borderRadius: 12, textAlign: "center" }}>
            <FileTextOutlined style={{ fontSize: 32, color: "#8b5cf6", marginBottom: 8 }} />
            <div style={{ fontWeight: 600 }}>学期报告</div>
            <Text type="secondary" style={{ fontSize: 12 }}>查阅与A4打印</Text>
          </Card>
        </Col>
      </Row>

      {/* 六维概览与成长足迹两栏布局 */}
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={14}>
          <Card title="我的成长足迹 (真实有效记录)" style={{ borderRadius: 14 }}>
            {timeline.length === 0 ? (
              <Empty description="暂无足迹记录，快去扫卡或申报荣誉吧！" />
            ) : (
              <Timeline
                mode="left"
                items={timeline.slice(0, 15).map((item) => ({
                  color: item.type === "SCORE" ? "blue" : item.type === "HONOR" ? "gold" : "green",
                  children: (
                    <div key={item.id} style={{ marginBottom: 12 }}>
                      <Space>
                        <Tag color={item.type === "SCORE" ? "blue" : item.type === "HONOR" ? "gold" : "green"}>
                          {item.type === "SCORE" ? "积分流水" : item.type === "HONOR" ? "荣誉认定" : "成长故事"}
                        </Tag>
                        <Text strong>{item.title}</Text>
                        {item.delta !== 0 && (
                          <Tag color={item.delta > 0 ? "success" : "error"}>
                            {item.delta > 0 ? `+${item.delta}` : item.delta}
                          </Tag>
                        )}
                      </Space>
                      <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{item.detail}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{new Date(item.createdAt).toLocaleString()}</div>
                    </div>
                  )
                }))}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="本学期六育评价状态" style={{ borderRadius: 14 }}>
            {evaluation?.isPublished ? (
              <div>
                <Alert
                  type="success"
                  message={`正式报告已发布 (版本 V${evaluation.version || 1})`}
                  description="六育评价结论已冻结，点击可前往报告专区打印。"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Button type="primary" block onClick={() => navigate("/student/report")}>
                  查看正式学期报告与A4打印
                </Button>
              </div>
            ) : (
              <div>
                <Alert
                  type="info"
                  message="期末报告正在酝酿中"
                  description={evaluation?.message || "期末综合报告尚未正式发布，班主任正在审阅核实日常数据。"}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  在报告发布前，你可以继续通过扫卡、参加活动与提交生活故事来充实自己的成长记录！
                </Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </StudentLayout>
  );
};

export default StudentGrowthDashboard;
