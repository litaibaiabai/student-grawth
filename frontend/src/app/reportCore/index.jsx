import React, { useEffect, useState, useCallback } from "react";
import { api, allStudents } from "./api";
import { Cards, AwardUpload, StoryForm, EvaluationForm } from "./Materials";
import {
  DirectScore,
  ImportData,
  ReviewMaterials,
  ReportDrafts,
  Settlements,
} from "./Teacher";
import { CardManagement, Configuration, Releases } from "./Administration";
import TermReport from "../../component/TermReport";
import "./style.css";
const nav = {
  student: [
    ["cards", "扫码领取"],
    ["stories", "月度故事"],
    ["awards", "上传奖状"],
    ["self", "自我评价"],
    ["report", "我的期末报告"],
  ],
  teacher: [
    ["direct", "无卡直评"],
    ["cards-manage", "卡片管理"],
    ["imports", "学业导入"],
    ["reviews", "材料认定"],
    ["settlements", "采集结算"],
    ["drafts", "班级报告确认"],
  ],
  manager: [
    ["config", "学期与任教"],
    ["imports", "数据导入"],
    ["cards-manage", "卡额度下发"],
    ["releases", "全校发布"],
  ],
};
const roles = { student: "学生", teacher: "教师", manager: "管理员" };
function Published({ ctx }) {
  const [report, setReport] = useState(undefined);
  useEffect(() => {
    api(`/report-core/reports/current?termId=${ctx.termId}`)
      .then(setReport)
      .catch(ctx.error);
  }, [ctx.termId, ctx.refreshKey]);
  return report ? (
    <TermReport html={report.html} />
  ) : (
    <section className="panel empty">
      <h2>期末报告尚未发布</h2>
      <p>完成材料与自我评价后，由学校统一发布。发布后可在这里阅读和打印。</p>
    </section>
  );
}
export default function ReportCoreApp() {
  const [actor, setActor] = useState(null),
    [boot, setBoot] = useState(true),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [tab, setTab] = useState(""),
    [catalog, setCatalog] = useState(null),
    [terms, setTerms] = useState([]),
    [termId, setTermId] = useState(""),
    [students, setStudents] = useState([]),
    [sources, setSources] = useState([]),
    [assignments, setAssignments] = useState([]),
    [refreshKey, setRefresh] = useState(0),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () => setRefresh((n) => n + 1);
  const notify = (message) => {
    setNotice(message);
    setError("");
  };
  const reportError = useCallback((e) => {
    setError(e.message);
    if (e.status === 401) {
      localStorage.removeItem("REPORT_CORE_TOKEN");
      setActor(null);
    }
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const match = location.hash.match(/[?&]card=([^&]+)/);
    if (match)
      sessionStorage.setItem("pendingCard", decodeURIComponent(match[1]));
    if (localStorage.getItem("REPORT_CORE_TOKEN"))
      api("/me")
        .then(setActor)
        .catch(() => localStorage.removeItem("REPORT_CORE_TOKEN"))
        .finally(() => setBoot(false));
    else setBoot(false);
  }, []);
  useEffect(() => {
    if (!actor) return;
    setTab(nav[actor.role][0][0]);
    Promise.all([api("/report-core/config"), api("/report-core/terms")])
      .then(([c, t]) => {
        setCatalog(c);
        setTerms(t);
        setTermId(String(t.find((x) => x.is_current)?.id || t[0]?.id || ""));
      })
      .catch(reportError);
  }, [actor]);
  useEffect(() => {
    if (!actor || !termId) return;
    Promise.all([
      allStudents(termId),
      api(`/report-core/sources?termId=${termId}`),
      api(`/report-core/assignments?termId=${termId}`),
    ])
      .then(([s, r, a]) => {
        setStudents(s);
        setSources(r);
        setAssignments(a);
      })
      .catch(reportError);
  }, [actor, termId, refreshKey]);
  const ctx = {
    actor,
    termId,
    catalog,
    students,
    sources,
    assignments,
    refreshKey,
    refresh,
    notify,
    error: reportError,
    run,
  };
  if (boot) return <div className="core-loading">正在读取学期档案…</div>;
  if (!actor)
    return (
      <div className="core-login">
        <section className="login-story">
          <span className="brand-mark">
            云美<span>六育评价</span>
          </span>
          <p className="kicker">成长有迹 · 学期有声</p>
          <h1>
            让每一份成长
            <br />
            都有记录
          </h1>
          <p>
            从日常的善意，到一次阅读的感悟。
            <br />
            共同写下这个学期的成长答卷。
          </p>
          <div className="six-pills">
            {["德美", "智美", "健美", "艺美", "劳美", "故事美"].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
          <footer>学校期末综合素质评价</footer>
        </section>
        <section className="login-form">
          <p className="kicker">欢迎回到学期评价</p>
          <h2>账号登录</h2>
          <p>学生、教师及管理员使用学校分配的账号。</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const data = await api("/auth/login", { username, password });
                localStorage.setItem("REPORT_CORE_TOKEN", data.token);
                setCatalog(null);
                setSources([]);
                setStudents([]);
                setAssignments([]);
                setTab(nav[data.user.role][0][0]);
                setActor(data.user);
                setPassword("");
              });
            }}
          >
            <label>
              账号
              <input
                autoComplete="username"
                aria-label="账号"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label>
              密码
              <input
                autoComplete="current-password"
                type="password"
                aria-label="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <p role="alert" className="feedback error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy} type="submit">
              登录
            </button>
          </form>
        </section>
      </div>
    );
  return (
    <div className="core-app">
      <aside className="core-sidebar">
        <div className="brand-mark">
          云美<span>学期评价工作台</span>
        </div>
        <div className="role-label">{roles[actor.role]}工作区</div>
        <nav aria-label="核心业务导航">
          {nav[actor.role].map(([id, label], i) => (
            <button
              key={id}
              aria-label={label}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setError("");
                setNotice("");
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          有故事的学校
          <br />
          有温度的教育
          <br />
          有精彩的童年
        </div>
        <button
          className="logout"
          onClick={() =>
            run(async () => {
              await api("/auth/logout", {});
              localStorage.removeItem("REPORT_CORE_TOKEN");
              setActor(null);
              setSources([]);
              setStudents([]);
            })
          }
        >
          退出登录
        </button>
      </aside>
      <main className="core-main">
        <header className="core-header">
          <div>
            <p className="kicker">云美少年 · 综合素质发展</p>
            <h1>{nav[actor.role].find(([id]) => id === tab)?.[1]}</h1>
          </div>
          <div className="identity">
            <span>
              {actor.real_name || roles[actor.role]} · {roles[actor.role]}
            </span>
            <select
              aria-label="当前学期"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.term_name}
                </option>
              ))}
            </select>
            <button onClick={refresh}>刷新</button>
          </div>
        </header>
        {error && (
          <div role="alert" className="feedback error">
            {error}
            {error.includes("已变化") && (
              <button onClick={refresh}>
                刷新最新数据（保留输入前请复制草稿）
              </button>
            )}
          </div>
        )}
        {notice && (
          <div role="status" className="feedback success">
            {notice}
          </div>
        )}
        {busy && (
          <div className="working" role="status">
            正在处理，请稍候…
          </div>
        )}
        {!catalog || !termId ? (
          <section className="panel">
            <h2>尚未配置学期</h2>
            <p>请先运行学校初始化脚本配置首个学期。</p>
          </section>
        ) : (
          <div className="content" aria-busy={busy}>
            {tab === "cards" && <Cards ctx={ctx} />}{" "}
            {tab === "awards" && <AwardUpload ctx={ctx} />}{" "}
            {tab === "stories" && <StoryForm ctx={ctx} />}{" "}
            {tab === "self" && <EvaluationForm ctx={ctx} />}{" "}
            {tab === "report" && <Published ctx={ctx} />}{" "}
            {tab === "direct" && <DirectScore ctx={ctx} />}{" "}
            {tab === "imports" && <ImportData ctx={ctx} />}{" "}
            {tab === "reviews" && <ReviewMaterials ctx={ctx} />}{" "}
            {tab === "drafts" && <ReportDrafts ctx={ctx} />}{" "}
            {tab === "settlements" && <Settlements ctx={ctx} />}{" "}
            {tab === "cards-manage" && <CardManagement ctx={ctx} />}{" "}
            {tab === "config" && <Configuration ctx={ctx} />}{" "}
            {tab === "releases" && <Releases ctx={ctx} />}
          </div>
        )}
        <footer className="core-footer">
          每一个孩子，都有自己的成长轨迹。
        </footer>
      </main>
    </div>
  );
}
