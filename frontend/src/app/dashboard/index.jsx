import React, { useState, useEffect } from "react";
import { Row, Col, Card, Tag, Table, Button, Typography, Space, Spin, Alert, Progress } from "antd";
import {
  CompassOutlined,
  QrcodeOutlined,
  TrophyOutlined,
  BookOutlined,
  CheckCircleOutlined,
  RightOutlined,
  PlusOutlined,
  UploadOutlined,
  HeartOutlined,
  FireOutlined,
  CheckOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import token from "@/util/token";
import { get } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const BotanicalIllustration = () => (
  <svg style={{ width: 180, height: 110, flexShrink: 0 }} viewBox="0 0 220 140" fill="none">
    <ellipse cx="123" cy="132" rx="76" ry="4" fill="#dfe8dc" />
    <path
      d="M113 129c0-37-3-76 15-114M114 97c-14-16-27-22-40-25m41 1c14-13 31-20 45-20"
      stroke="#97b094"
      strokeWidth="1.7"
    />
    <path d="M115 96C77 97 66 80 69 61c23 0 41 8 46 35z" fill="#b4c6aa" />
    <path d="M115 72c2-31 23-42 45-37 1 20-17 36-45 37z" fill="#c5d2b9" />
    <path d="M120 39c-18-12-17-28-7-35 13 4 18 17 7 35z" fill="#9fb596" />
    <path d="M123 33c2-21 17-30 29-25-1 17-12 26-29 25z" fill="#d1d9bd" />
    <path d="M114 114c23-5 41-2 50 11-16 8-35 4-50-11z" fill="#ced8c5" />
    <circle cx="178" cy="22" r="14" fill="#e3e9d6" />
    <path d="M46 120h15m-8-8v16M181 89h9m-5-5v9" stroke="#bdcbb6" strokeWidth="1.2" />
    <circle cx="49" cy="44" r="3" fill="#ccd5c0" />
  </svg>
);

import StudentGrowthDashboard from "@/app/student/growth";

const DIMS = [
  { code: "D", name: "德育", letter: "德", desc: "品格修养" },
  { code: "Z", name: "智育", letter: "智", desc: "科学探索" },
  { code: "T", name: "体育", letter: "体", desc: "身心体魄" },
  { code: "M", name: "美育", letter: "美", desc: "艺术表现" },
  { code: "L", name: "劳育", letter: "劳", desc: "实践奉献" },
  { code: "G", name: "故事", letter: "叙", desc: "成长叙事" }
];

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [compData, setCompData] = useState(null);
  const [claimsCount, setClaimsCount] = useState(0);
  const [honorsCount, setHonorsCount] = useState(0);
  const [storiesCount, setStoriesCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [activeRuleVersion, setActiveRuleVersion] = useState("V1.0");
  const [currentTerm, setCurrentTerm] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const user = token.loadUser() || {};
    setCurrentUser(user);

    const fetchData = async () => {
      setLoading(true);
      try {
        const termRes = await get(urls.API_CURRENT_TERM);
        if (termRes.code === 200) setCurrentTerm(termRes.data);

        if (user.role === "student") {
          const [scoreRes, compRes] = await Promise.all([
            get(urls.API_STUDENT_SCORES),
            get(urls.API_COMPREHENSIVE_SCORE)
          ]);
          if (scoreRes.code === 200) setScoreData(scoreRes.data);
          if (compRes.code === 200) setCompData(compRes.data);
        } else if (user.role === "teacher") {
          const [claimsRes, honorsRes, storiesRes] = await Promise.all([
            get(urls.API_TEACHER_CLAIMS, { status: "PENDING" }),
            get(urls.API_HONORS, { status: "PENDING" }),
            get(urls.API_STORIES, { status: "SUBMITTED" })
          ]);
          if (claimsRes.code === 200) setClaimsCount(claimsRes.data?.length || 0);
          if (honorsRes.code === 200) setHonorsCount(honorsRes.data?.length || 0);
          if (storiesRes.code === 200) setStoriesCount(storiesRes.data?.length || 0);
        } else if (user.role === "manager") {
          const [studentsRes, rulesRes] = await Promise.all([
            get(urls.API_STUDENTS_LIST),
            get(urls.API_EVALUATION_RULES)
          ]);
          if (studentsRes.code === 200) setStudentsCount(studentsRes.data?.length || 0);
          if (rulesRes.code === 200 && Array.isArray(rulesRes.data) && rulesRes.data.length > 0) {
            const active =
              rulesRes.data.find((r) => r.rule_status === "ACTIVE" || r.ruleStatus === "ACTIVE") || rulesRes.data[0];
            setActiveRuleVersion(active.rule_version || active.ruleVersion || "V1.0");
          }
        }
      } catch (err) {
        // 容错
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

  const role = currentUser?.role || "student";
  const name = currentUser?.real_name || currentUser?.username || "知夏";

  // ------------------ 学生端适龄独立成长首页与主题 (Task 16) ------------------
  if (role === "student") {
    return <StudentGrowthDashboard />;
  }

  // ------------------ 教师端工作台 ------------------
  if (role === "teacher") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: "#8d9c90",
                fontWeight: 700,
                textTransform: "uppercase"
              }}
            >
              TEACHER WORKBENCH
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>教师工作台</h1>
            <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>
              {(() => {
                const hour = new Date().getHours();
                const greeting = hour >= 5 && hour < 11 ? "早上好" : (hour >= 11 && hour < 14 ? "中午好" : (hour >= 14 && hour < 18 ? "下午好" : "晚上好"));
                const teacherDisplayName = name.endsWith("老师") ? name : `${name}老师`;
                return `${teacherDisplayName}，${greeting}。今天也有值得被看见的小小进步。`;
              })()}
            </p>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/teacher/direct-score")}
            style={{
              background: "#277460",
              borderColor: "#277460",
              height: 38,
              borderRadius: 8,
              fontWeight: 600
            }}
          >
            发起无卡直评
          </Button>
        </div>

        <div className="hero-banner">
          <div className="hero-copy">
            <div className="hero-kicker">GROWING TOGETHER</div>
            <h1>把目光，放在每一次成长上。</h1>
            <p>从一份及时的反馈开始，让每个孩子都感受到被关注。</p>
          </div>
          <BotanicalIllustration />
        </div>

        <div className="overview-strip">
          <div className="overview-item">
            <div className="soft-icon">
              <QrcodeOutlined />
            </div>
            <div>
              <div className="stat-value">
                {claimsCount} <small style={{ fontSize: 13 }}>条</small>
              </div>
              <div className="stat-label">扫卡待审核单据</div>
            </div>
            <Button type="link" onClick={() => navigate("/teacher/claims")}>
              去审核 <RightOutlined />
            </Button>
          </div>
          <div className="overview-item">
            <div className="soft-icon amber">
              <TrophyOutlined />
            </div>
            <div>
              <div className="stat-value">
                {honorsCount} <small style={{ fontSize: 13 }}>条</small>
              </div>
              <div className="stat-label">荣誉申报待审阅</div>
            </div>
            <Button type="link" onClick={() => navigate("/teacher/honors")}>
              去查验 <RightOutlined />
            </Button>
          </div>
          <div className="overview-item">
            <div className="soft-icon blue">
              <BookOutlined />
            </div>
            <div>
              <div className="stat-value">
                {storiesCount} <small style={{ fontSize: 13 }}>篇</small>
              </div>
              <div className="stat-label">生活故事待终审</div>
            </div>
            <Button type="link" onClick={() => navigate("/teacher/stories")}>
              去评阅 <RightOutlined />
            </Button>
          </div>
        </div>

        <Row gutter={24}>
          <Col span={14}>
            <Card title="待处理事项" bordered={false} style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 0",
                    borderBottom: "1px solid #f0f4f1"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#25332d", fontSize: 13 }}>
                      实体卡扫码审核 ({claimsCount} 项待办)
                    </div>
                    <div style={{ color: "#8a9990", fontSize: 11, marginTop: 2 }}>
                      学生已扫码提交，等待教师核准写入不可篡改账本 (+1分)
                    </div>
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => navigate("/teacher/claims")}
                    style={{ background: "#277460", borderColor: "#277460" }}
                  >
                    立即审核
                  </Button>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 0",
                    borderBottom: "1px solid #f0f4f1"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#25332d", fontSize: 13 }}>
                      官方荣誉佐证复核 ({honorsCount} 项待办)
                    </div>
                    <div style={{ color: "#8a9990", fontSize: 11, marginTop: 2 }}>
                      查验市级/区级白名单赛事证书并核定荣誉点数 (1~9分)
                    </div>
                  </div>
                  <Button type="default" size="small" onClick={() => navigate("/teacher/honors")}>
                    审阅认定
                  </Button>
                </div>

                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#25332d", fontSize: 13 }}>月度成长故事终审</div>
                    <div style={{ color: "#8a9990", fontSize: 11, marginTop: 2 }}>
                      结合规则模拟建议给出反馈与终审分 (0-100)
                    </div>
                  </div>
                  <Button type="default" size="small" onClick={() => navigate("/teacher/stories")}>
                    评阅打分
                  </Button>
                </div>
              </div>
            </Card>
          </Col>

          <Col span={10}>
            <Card
              title="本月成长节奏与校历"
              bordered={false}
              style={{ borderRadius: 12, border: "1px solid #e6ebe7", marginBottom: 20 }}
            >
              <div style={{ fontSize: 12, color: "#56685c", lineHeight: 2 }}>
                <div>
                  🌿 <strong>第 8 教学周</strong>：日常考评与荣誉认定有序推进
                </div>
                <div>
                  📝 <strong>10月28日</strong>：月度生活故事提交截止
                </div>
                <div>
                  💳 <strong>10月31日</strong>：10月实体卡发放与使用截止
                </div>
                <div>
                  ⚖️ <strong>11月03日</strong>：10月申领单宽限期终审截止
                </div>
              </div>
            </Card>

            <Card title="教育小记" bordered={false} style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}>
              <div
                style={{
                  background: "#f6f8f5",
                  borderRadius: 8,
                  padding: "16px 20px",
                  lineHeight: 1.8,
                  color: "#4e6252",
                  fontSize: 13
                }}
              >
                "教育的美好，藏在每一次<strong>耐心的倾听</strong>
                与及时的回应里。记录成长的点滴，是在孩子心底种下自信的种子。"
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  // ------------------ 管理端视图 ------------------
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div
            style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}
          >
            SCHOOL OVERVIEW
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>管理概览</h1>
          <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>让流程有序推进，让每份成长记录准确抵达。</p>
        </div>
        <Button
          type="primary"
          onClick={() => navigate("/admin/reports")}
          style={{
            background: "#277460",
            borderColor: "#277460",
            height: 38,
            borderRadius: 8,
            fontWeight: 600
          }}
        >
          查看期末报告发布准备
        </Button>
      </div>

      <div className="hero-banner">
        <div className="hero-copy">
          <div className="hero-kicker">A CLEAR PATH TO GROWTH</div>
          <h1>把复杂留给系统，把清晰留给老师。</h1>
          <p>从日常记录到学期报告，每一步都有迹可循。</p>
        </div>
        <BotanicalIllustration />
      </div>

      <div className="overview-strip">
        <div className="overview-item">
          <div className="soft-icon">
            <CompassOutlined />
          </div>
          <div>
            <div className="stat-value">
              {studentsCount > 0 ? studentsCount.toLocaleString() : (studentsCount === 0 ? "0" : "—")}
            </div>
            <div className="stat-label">全校在读受评学生</div>
          </div>
        </div>
        <div className="overview-item">
          <div className="soft-icon amber">
            <UploadOutlined />
          </div>
          <div>
            <div className="stat-value">待核验</div>
            <div className="stat-label">六育维度底表状态</div>
          </div>
          <Button type="link" onClick={() => navigate("/admin/import")}>
            去导入 <RightOutlined />
          </Button>
        </div>
        <div className="overview-item">
          <div className="soft-icon blue">
            <CheckCircleOutlined />
          </div>
          <div>
            <div className="stat-value">{activeRuleVersion}</div>
            <div className="stat-label">当前生效评分规则 (80/15/5)</div>
          </div>
          <Button type="link" onClick={() => navigate("/admin/rules")}>
            调参 <RightOutlined />
          </Button>
        </div>
      </div>

      <Row gutter={24}>
        <Col span={14}>
          <Card title="本学期三阶段推进路径" bordered={false} style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <div style={{ padding: 16, background: "#f8faf9", borderRadius: 8, border: "1px solid #e8eee9" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#277460" }}>01 日常记录</div>
                <div style={{ fontSize: 12, color: "#6e7e73", margin: "8px 0" }}>实体激励卡 · 荣誉申报 · 月度故事</div>
                <Tag color="green">推进中</Tag>
              </div>

              <div style={{ padding: 16, background: "#f8faf9", borderRadius: 8, border: "1px solid #e8eee9" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#277460" }}>02 成绩核算</div>
                <div style={{ fontSize: 12, color: "#6e7e73", margin: "8px 0" }}>
                  成绩导入对比 · 规则校验 · 缺项检查
                </div>
                <Button type="link" size="small" onClick={() => navigate("/admin/import")} style={{ padding: 0 }}>
                  进入核对
                </Button>
              </div>

              <div style={{ padding: 16, background: "#f8faf9", borderRadius: 8, border: "1px solid #e8eee9" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#277460" }}>03 报告发布</div>
                <div style={{ fontSize: 12, color: "#6e7e73", margin: "8px 0" }}>六育完整性检查 · 版本快照 · 打印视图</div>
                <Button type="link" size="small" onClick={() => navigate("/admin/reports")} style={{ padding: 0 }}>
                  发布中心
                </Button>
              </div>
            </div>
          </Card>
        </Col>

        <Col span={10}>
          <Card title="当前学期与校历档案" bordered={false} style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}>
            <div style={{ fontSize: 13, color: "#3d4e42", lineHeight: 2 }}>
              <div>
                <strong>当前学年学期</strong>：{currentTerm ? `${currentTerm.academicYear} · 第${currentTerm.semester === 1 || currentTerm.semester === "1" ? "一" : "二"}学期` : "2026—2027 · 第一学期"}
              </div>
              <div>
                <strong>校历教学周期</strong>：{currentTerm?.startDate ? `${String(currentTerm.startDate).slice(0, 10)} ~ ${String(currentTerm.endDate).slice(0, 10)}` : "2026-09-01 ~ 2027-01-31"}
              </div>
              <div>
                <strong>业务运行状态</strong>：<Tag color="green">可操作 (ACTIVE)</Tag>
              </div>
              <div>
                <strong>发卡宽限期</strong>：次月3日 23:59 截止
              </div>
            </div>
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Button onClick={() => navigate("/admin/terms")}>校历配置与归档</Button>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
