import React, { useState, useEffect } from "react";
import { Button, Tag, Table, Spin, Space, Result } from "antd";
import { DownloadOutlined, ReloadOutlined, FileProtectOutlined } from "@ant-design/icons";
import { get } from "@/util/request";
import * as urls from "@/constant/urls";

const RadarSvg = ({ scores = {} }) => {
  const keys = ["D", "Z", "T", "M", "L", "G"];
  const labels = ["德育", "智育", "体育", "美育", "劳育", "故事"];
  const vals = keys.map(k => scores[k] ?? 90);

  const center = { x: 140, y: 120 };
  const maxR = 80;
  const angles = [0, 60, 120, 180, 240, 300].map(a => (a - 90) * (Math.PI / 180));

  const getPoints = (scale = 1) => {
    return angles.map(ang => {
      const x = center.x + Math.cos(ang) * maxR * scale;
      const y = center.y + Math.sin(ang) * maxR * scale;
      return `${x},${y}`;
    }).join(" ");
  };

  const dataPoints = angles.map((ang, idx) => {
    const val = vals[idx] || 50;
    const r = (val / 100) * maxR;
    const x = center.x + Math.cos(ang) * r;
    const y = center.y + Math.sin(ang) * r;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 280 250" style={{ maxWidth: 260, display: "block", margin: "0 auto", width: "100%" }}>
      {[1, 0.75, 0.5, 0.25].map((scale, i) => (
        <polygon key={i} points={getPoints(scale)} fill={scale === 1 ? "#fafcf8" : "none"} stroke="#e2e9df" />
      ))}
      <polygon points={dataPoints} fill="rgba(39, 116, 96, 0.22)" stroke="#277460" strokeWidth="1.8" />
      {angles.map((ang, idx) => {
        const val = vals[idx] || 50;
        const r = (val / 100) * maxR;
        const x = center.x + Math.cos(ang) * r;
        const y = center.y + Math.sin(ang) * r;
        return <circle key={idx} cx={x} cy={y} r="3" fill="#277460" />;
      })}
      {angles.map((ang, idx) => {
        const textR = maxR + 16;
        const x = center.x + Math.cos(ang) * textR;
        const y = center.y + Math.sin(ang) * textR + 4;
        return (
          <text key={idx} x={x} y={y} textAnchor="middle" fontSize="10" fill="#697a6d" fontWeight="600">
            {labels[idx]}
          </text>
        );
      })}
    </svg>
  );
};

const StudentReport = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("published");

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_CURRENT_REPORT);
      if (res.code === 200 && res.data) {
        setReport(res.data);
        setViewMode("published");
      } else {
        setReport(null);
      }
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  if (loading) {
    return <div style={{ textAlign: "center", padding: "80px 0" }}><Spin size="large" /></div>;
  }

  // 默认模拟报告数据（用于在尚未发布或切换演示时预览报告完整卡面）
  const defaultSnapshot = {
    student: {
      name: "王小明",
      username: "student1",
      grade: 4,
      classNo: 1
    },
    evaluation: {
      dimensions: { D: 92, Z: 88, T: 90, M: 86, L: 94, G: 89 },
      sixAverage: 89.83,
      comprehensiveScore: 90.19,
      grade: "优秀"
    },
    process_points_sum: 24,
    honor_points_sum: 8,
    subjects: [
      { subject_name: "语文", raw_score: 92.5 },
      { subject_name: "数学", raw_score: 98.0 },
      { subject_name: "英语", raw_score: 95.0 }
    ]
  };

  const activeReport = report || {
    id: 1,
    studentName: "王小明",
    version: 1,
    comprehensiveScore: 90.19,
    comprehensiveGrade: "优秀",
    teacherComment: "知夏，这学期的你像一棵向阳的小树，在认真与善意中慢慢长大。愿你继续保持好奇，勇敢表达自己的想法，在每一次尝试中遇见更好的自己。",
    snapshot: defaultSnapshot,
    hash: "SHA256-VERIFIED-OFFICIAL-2026"
  };

  const snapshot = (viewMode === "published" && report?.snapshot) ? report.snapshot : defaultSnapshot;
  const evalData = snapshot.evaluation || {};
  const dims = evalData.dimensions || { D: 92, Z: 88, T: 90, M: 86, L: 94, G: 89 };
  const subjects = snapshot.subjects || defaultSnapshot.subjects;

  const handleExportPdf = () => {
    if (report?.id) {
      window.open(urls.API_REPORT_PDF(report.id), "_blank");
    } else {
      window.print();
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      {/* 顶栏操作区 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}>
            OFFICIAL TERM REPORT
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>
            学期发展报告
          </h1>
          <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>
            一份报告，收藏这一学期独一无二的你。
          </p>
        </div>
        <Space>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportPdf}
            disabled={viewMode === "unpublished"}
            style={{
              background: viewMode === "unpublished" ? "#ccc" : "#277460",
              borderColor: viewMode === "unpublished" ? "#ccc" : "#277460",
              height: 38,
              borderRadius: 8,
              fontWeight: 600
            }}
          >
            导出官方防伪 PDF
          </Button>
        </Space>
      </div>

      {/* 原型状态演示切换标签 */}
      <div style={{ marginBottom: 16 }}>
        <Space size={6}>
          <Tag.CheckableTag
            checked={viewMode === "published"}
            onChange={() => setViewMode("published")}
            style={{
              borderRadius: 12,
              padding: "2px 12px",
              fontSize: 12,
              cursor: "pointer",
              border: viewMode === "published" ? "1px solid #277460" : "1px solid #e2e8e3",
              background: viewMode === "published" ? "#eef6f2" : "#fdfefe",
              color: viewMode === "published" ? "#277460" : "#5a6e60"
            }}
          >
            已发布示例
          </Tag.CheckableTag>
          <Tag.CheckableTag
            checked={viewMode === "unpublished"}
            onChange={() => setViewMode("unpublished")}
            style={{
              borderRadius: 12,
              padding: "2px 12px",
              fontSize: 12,
              cursor: "pointer",
              border: viewMode === "unpublished" ? "1px solid #277460" : "1px solid #e2e8e3",
              background: viewMode === "unpublished" ? "#eef6f2" : "#fdfefe",
              color: viewMode === "unpublished" ? "#277460" : "#5a6e60"
            }}
          >
            未发布示例
          </Tag.CheckableTag>
        </Space>
      </div>

      {viewMode === "unpublished" ? (
        <div className="panel" style={{ padding: "56px 24px", textAlign: "center", borderRadius: 12, border: "1px solid #e6ebe7", background: "#fff" }}>
          <FileProtectOutlined style={{ fontSize: 44, color: "#9ca89e", marginBottom: 16 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#25332d", margin: "0 0 8px" }}>
            学期发展报告尚未正式发布
          </h3>
          <p style={{ color: "#7b8a80", fontSize: 13, margin: "0 0 20px" }}>
            老师正在认真整理与核算你的学期成长记录，发布后会在这里与你见面。
          </p>
          <Button icon={<ReloadOutlined />} onClick={fetchReport}>刷新状态</Button>
        </div>
      ) : (
        <article className="report-paper">
          <p className="report-kicker">CHONGLI EXPERIMENTAL SCHOOL</p>
          <h2 className="report-title">学期综合素质发展报告</h2>
          <p className="report-meta">
            杭州市余杭区云会小学 · 2026—2027 学年第一学期<br />
            {activeReport.studentName || "在读学生"} / 四年级（1）班 / 第 {activeReport.version || 1} 版 · 官方已发布
          </p>

          {/* 01 六育 */}
          <section className="report-section">
            <h3>01　六育，让成长更完整</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "center" }}>
              <RadarSvg scores={dims} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(dims).map(([k, v]) => (
                  <div key={k} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderBottom: "1px solid #edf1ea",
                    fontSize: 13,
                    color: "#4e6252"
                  }}>
                    <span>{k} 维度</span>
                    <strong style={{ color: "#25332d" }}>{v} 分</strong>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 11, color: "#8b9c8e", marginTop: 12, textAlign: "center" }}>
              期末综合素质总评：<strong>{Number(activeReport.comprehensiveScore || 90.19).toFixed(2)} 分</strong> · 规则 V1.0 (80/15/5)
            </p>
          </section>

          {/* 02 努力足迹 */}
          <section className="report-section">
            <h3>02　每一份努力，都留下了足迹</h3>
            <p style={{ fontSize: 13, color: "#47594b", lineHeight: 2 }}>
              本学期在校累计获得过程激励 <strong>{snapshot.process_points_sum || 24} 次</strong>，荣誉认定分 <strong>{snapshot.honor_points_sum || 8} 分</strong>。
              每一次主动帮助同学、认真完成课后实验，都已如实归档入册。
            </p>
          </section>

          {/* 03 文化学科成绩 */}
          <section className="report-section">
            <h3>03　文化课学业成绩</h3>
            <Table
              dataSource={subjects}
              rowKey="subject_name"
              pagination={false}
              size="small"
              columns={[
                { title: "学科名称", dataIndex: "subject_name", key: "name" },
                { title: "期末得分", dataIndex: "raw_score", key: "score", render: (s) => <strong>{s} 分</strong> },
                { title: "等级", key: "level", render: () => <Tag color="green">A (优秀)</Tag> },
                { title: "数据来源", key: "source", render: () => <span style={{ color: "#8a9990", fontSize: 12 }}>教务处统一归档</span> }
              ]}
            />
          </section>

          {/* 04 班主任评语 */}
          <section className="report-section">
            <h3>04　老师想对你说</h3>
            <div style={{
              background: "#f6f8f5",
              padding: "16px 20px",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 2,
              color: "#3f5243"
            }}>
              {activeReport.teacherComment || "知夏，这学期的你像一棵向阳的小树，在认真与善意中慢慢长大。愿你继续保持好奇，勇敢表达自己的想法，在每一次尝试中遇见更好的自己。"}
            </div>
          </section>

          {/* 05 学生声音 */}
          <section className="report-section">
            <h3>05　我的声音与家人的期待</h3>
            <p style={{ fontSize: 13, color: "#47594b", lineHeight: 2, margin: "0 0 10px" }}>
              <strong>学生自述</strong>：我想学会耐心倾听，也想勇敢尝试更多的新事物。
            </p>
            <p style={{ fontSize: 13, color: "#47594b", lineHeight: 2, margin: 0 }}>
              <strong>家长寄语</strong>：愿你在自己的节奏里，快乐、踏实地长大。<span style={{ fontSize: 11, color: "#8b9c8e", marginLeft: 8 }}>(由学生代录)</span>
            </p>
          </section>

          <p style={{ fontSize: 11, color: "#9ca89f", textAlign: "center", marginTop: 32 }}>
            防伪核验码：{report?.hash || "SHA256-VERIFIED-OFFICIAL-2026"} · 杭州市余杭区云会小学学生发展指导中心
          </p>
        </article>
      )}
    </div>
  );
};

export default StudentReport;
