import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Typography, Space, Row, Col, Spin, message, Alert, Divider } from "antd";
import {
  LineChartOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ArrowRightOutlined
} from "@ant-design/icons";
import { get } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const RadarChartSvg = ({ scores = {} }) => {
  // 六育：德、智、体、美、劳、故事
  const keys = ["D", "Z", "T", "M", "L", "G"];
  const labels = ["德育", "智育", "体育", "美育", "劳育", "故事"];
  const vals = keys.map((k) => scores[k] ?? 85);

  // 六边形顶点计算
  const center = { x: 150, y: 130 };
  const maxR = 90;
  const angles = [0, 60, 120, 180, 240, 300].map((a) => (a - 90) * (Math.PI / 180));

  const getPoints = (scale = 1) => {
    return angles
      .map((ang) => {
        const x = center.x + Math.cos(ang) * maxR * scale;
        const y = center.y + Math.sin(ang) * maxR * scale;
        return `${x},${y}`;
      })
      .join(" ");
  };

  const dataPoints = angles
    .map((ang, idx) => {
      const val = vals[idx] || 50;
      const r = (val / 100) * maxR;
      const x = center.x + Math.cos(ang) * r;
      const y = center.y + Math.sin(ang) * r;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 300 270" style={{ maxWidth: 280, display: "block", margin: "0 auto", width: "100%" }}>
      {/* 刻度背景环 */}
      {[1, 0.75, 0.5, 0.25].map((scale, i) => (
        <polygon
          key={i}
          points={getPoints(scale)}
          fill={scale === 1 ? "#fafcf8" : "none"}
          stroke="#e2e9df"
          strokeWidth="1"
        />
      ))}

      {/* 轴线 */}
      {angles.map((ang, i) => {
        const x = center.x + Math.cos(ang) * maxR;
        const y = center.y + Math.sin(ang) * maxR;
        return <line key={i} x1={center.x} y1={center.y} x2={x} y2={y} stroke="#e3e9e0" strokeWidth="1" />;
      })}

      {/* 数据多边形 */}
      <polygon points={dataPoints} fill="rgba(39, 116, 96, 0.25)" stroke="#277460" strokeWidth="2" />

      {/* 数据点 */}
      {angles.map((ang, idx) => {
        const val = vals[idx] || 50;
        const r = (val / 100) * maxR;
        const x = center.x + Math.cos(ang) * r;
        const y = center.y + Math.sin(ang) * r;
        return <circle key={idx} cx={x} cy={y} r="3.5" fill="#277460" />;
      })}

      {/* 维度文字 */}
      {angles.map((ang, idx) => {
        const textR = maxR + 18;
        const x = center.x + Math.cos(ang) * textR;
        const y = center.y + Math.sin(ang) * textR + 4;
        return (
          <text key={idx} x={x} y={y} textAnchor="middle" fontSize="11" fill="#56695b" fontWeight="600">
            {labels[idx]}
          </text>
        );
      })}
    </svg>
  );
};

const StudentEvaluation = () => {
  const DIM_NAMES = { D: "德育", Z: "智育", T: "体育", M: "美育", L: "劳育", G: "生活故事" };
  const [loading, setLoading] = useState(true);
  const [evalData, setEvalData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await get(urls.API_COMPREHENSIVE_SCORE);
        if (res.code === 200) {
          setEvalData(res.data);
        }
      } catch (err) {
        message.error("获取综合评价数据失败");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "100px 0" }}>
        <Spin size="large" />
      </div>
    );
  }

  const isComplete = evalData?.status === "COMPLETE";
  const calc = evalData?.calculation || {};
  const comps = calc.components || {};
  const dimScores = evalData?.dimension_scores || {};

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}
        >
          COMPREHENSIVE EVALUATION
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>综合评价</h1>
        <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>成长有不同的刻度，每一份数据都保留清楚的来源。</p>
      </div>

      {/* 综合得分横幅 Banner */}
      <div
        style={{
          background: "#eef5ee",
          border: "1px solid #dbe8dd",
          borderRadius: 12,
          padding: "28px 32px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#6b866e", fontWeight: 600 }}>本学期综合评价 · 规则 V1.0 (试行)</div>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#1e382b", margin: "8px 0 4px" }}>
            {isComplete ? calc.comprehensive_score : "待完善"}
            {isComplete && <small style={{ fontSize: 16, color: "#6b866e", marginLeft: 8 }}>/ 100 分</small>}
          </div>
          <div style={{ fontSize: 12, color: "#748578" }}>
            状态：{isComplete ? <Tag color="green">六育齐备 · 已核算</Tag> : <Tag color="orange">有维度待补录</Tag>}
          </div>
        </div>

        <div style={{ textAlign: "right", fontSize: 12, color: "#56695b", lineHeight: 1.8 }}>
          <div>六育底表均分 ({comps.B?.raw_value ?? "待录入"}) × 80%</div>
          <div>过程激励标准分 ({comps.P?.standard_score ?? "待计算"}) × 15%</div>
          <div>荣誉成果标准分 ({comps.H?.standard_score ?? "待计算"}) × 5%</div>
        </div>
      </div>

      {!isComplete && (
        <Alert
          message="六育成绩未齐备提示"
          description={`${(evalData?.missing_dimensions || []).map((c) => DIM_NAMES[c] || c).join("、") || "部分维度"}尚未录入。缺项维度不会按 0 分计算，需等待老师录入并确认后才能生成综合分。`}
          type="warning"
          showIcon
          style={{ marginBottom: 24, borderRadius: 8 }}
        />
      )}

      <Row gutter={24}>
        <Col span={12}>
          <Card
            title="六育正式成绩雷达与各维分"
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            <RadarChartSvg scores={dimScores} />

            <div style={{ marginTop: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                {[
                  { label: "德育 (D)", val: dimScores.D },
                  { label: "智育 (Z)", val: dimScores.Z },
                  { label: "体育 (T)", val: dimScores.T },
                  { label: "美育 (M)", val: dimScores.M },
                  { label: "劳育 (L)", val: dimScores.L },
                  { label: "生活故事 (G)", val: dimScores.G }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderBottom: "1px solid #edf1ea",
                      fontSize: 13,
                      color: "#4e6252"
                    }}
                  >
                    <span>{item.label}</span>
                    <strong style={{ color: "#25332d" }}>{item.val !== undefined ? `${item.val} 分` : "待录入"}</strong>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 11, color: "#9ca69e", marginTop: 16, textAlign: "center" }}>
              百分制正式成绩 · 来源：科任老师终测确认与生活故事终审
            </p>
          </Card>
        </Col>

        <Col span={12}>
          <Card
            title="过程表现与荣誉认定权重折算"
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            <div
              style={{
                background: "#fafbf8",
                padding: 20,
                borderRadius: 8,
                border: "1px solid #eef2eb",
                marginBottom: 16
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#25332d" }}>{comps.P?.raw_value ?? 0}</div>
                  <div style={{ fontSize: 11, color: "#7a8a7f" }}>过程净积分 / 次</div>
                </div>
                <ArrowRightOutlined style={{ color: "#9ba89f", fontSize: 16 }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#277460" }}>{comps.P?.standard_score ?? 0}</div>
                  <div style={{ fontSize: 11, color: "#7a8a7f" }}>过程标准分 (满分100)</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#9aa59d", marginTop: 10, textAlign: "center" }}>
                试行阈值 20 次封顶，按线性换算折入 15% 综合权重
              </div>
            </div>

            <div
              style={{
                background: "#fafbf8",
                padding: 20,
                borderRadius: 8,
                border: "1px solid #eef2eb",
                marginBottom: 16
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#25332d" }}>{comps.H?.raw_value ?? 0}</div>
                  <div style={{ fontSize: 11, color: "#7a8a7f" }}>已认定荣誉积分</div>
                </div>
                <ArrowRightOutlined style={{ color: "#9ba89f", fontSize: 16 }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#277460" }}>{comps.H?.standard_score ?? 0}</div>
                  <div style={{ fontSize: 11, color: "#7a8a7f" }}>荣誉标准分 (满分100)</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#9aa59d", marginTop: 10, textAlign: "center" }}>
                试行阈值 12 分封顶，白名单赛事官方认定纳入学期期终
              </div>
            </div>

            <Alert
              message="规则版本说明"
              description="本学期核算严格依据校风控委员会审核通过的 Rule V1.0 规则。所有计算公式与参数透明可追溯。"
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

export default StudentEvaluation;
