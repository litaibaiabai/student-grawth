import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, allStudents, resetApiSession } from "./api";
import RoleShell from "./RoleShell";
import SelfEvaluation from "./SelfEvaluation";
import StudentHome, { StudentArchive } from "./StudentHome";
import { navigation as nav, roleNames as roles, parseCoreLocation, formatCoreLocation, routeForRole } from "./navigation";
import { Cards, AwardUpload, StoryForm } from "./Materials";
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
    [expired, setExpired] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [tab, setTab] = useState(""),
    [catalog, setCatalog] = useState(null),
    [terms, setTerms] = useState([]),
    [termId, setTermId] = useState(""),
    [students, setStudents] = useState([]),
    [sources, setSources] = useState([]),
    [sourceNext, setSourceNext] = useState(null),
    [assignments, setAssignments] = useState([]),
    [refreshKey, setRefresh] = useState(0),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const leaveGuard = useRef(null);
  const loadedScope = useRef(null);
  const mayLeave = () => !leaveGuard.current || leaveGuard.current();
  const refresh = () => setRefresh((n) => n + 1);
  const notify = (message) => {
    setNotice(message);
    setError("");
  };
  const reportError = useCallback((e) => {
    setError(e.message);
    if (e.status === 401) {
      localStorage.removeItem("REPORT_CORE_TOKEN");
      setExpired(true);
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
    resetApiSession(actor.id);
    const incoming = routeForRole(parseCoreLocation(location.hash), actor.role);
    setTab(incoming.page);
    Promise.all([api("/report-core/config"), api("/report-core/terms")])
      .then(([c, t]) => {
        setCatalog(c);
        setTerms(t);
        setTermId(String(t.find(x => String(x.id) === incoming.termId)?.id || t.find((x) => x.is_current)?.id || t[0]?.id || ""));
      })
      .catch(reportError);
  }, [actor]);
  useEffect(() => {
    if (!actor || !termId) return;
    const controller = new AbortController();
    const scopeKey = `${actor.id}:${termId}`;
    if (loadedScope.current !== scopeKey) { setStudents([]); setSources([]); setAssignments([]); loadedScope.current = scopeKey; }
    Promise.all([
      allStudents(termId, { signal: controller.signal }),
      api(`/report-core/sources?termId=${termId}&page=1`, undefined, undefined, { signal: controller.signal }),
      api(`/report-core/assignments?termId=${termId}`, undefined, undefined, { signal: controller.signal }),
    ])
      .then(([s, r, a]) => {
        if (controller.signal.aborted) return;
        setStudents(s);
        setSources(r.rows);
        setSourceNext(r.nextOffset);
        setAssignments(a);
      })
      .catch(e => { if (e.name !== "AbortError") reportError(e); });
    return () => controller.abort();
  }, [actor, termId, refreshKey]);
  useEffect(() => {
    if (!actor || !termId) return;
    const update = () => {
      const route = routeForRole(parseCoreLocation(location.hash), actor.role);
      if ((route.page !== tab || route.termId && route.termId !== termId) && !mayLeave()) { location.hash = formatCoreLocation({role:actor.role,page:tab,termId}); return; }
      setTab(route.page);
      if (route.termId && terms.some(t => String(t.id) === route.termId)) setTermId(route.termId);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [actor, termId, terms, tab]);
  const navigate = page => {
    if (page !== tab) { if (!mayLeave()) return; leaveGuard.current = null; }
    setTab(page); setError(''); setNotice('');
    location.hash = formatCoreLocation({ role: actor.role, page, termId });
  };
  const ctx = {
    actor,
    termId,
    navigate,
    term: terms.find(t => String(t.id) === termId),
    setLeaveGuard: fn => { leaveGuard.current = fn; },
    catalog,
    students,
    sources,
    assignments,
    sourceNext,
    loadMoreSources: () =>
      run(async () => {
        const page = await api(
          `/report-core/sources?termId=${termId}&page=1&offset=${sourceNext}`,
        );
        setSources((rows) => [
          ...new Map(
            [...rows, ...page.rows].map((s) => [String(s.id), s]),
          ).values(),
        ]);
        setSourceNext(page.nextOffset);
      }),
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
  return <>
    {expired && <section className="reauth-overlay" role="dialog" aria-modal="true" aria-label="重新登录"><form className="panel" onSubmit={e => { e.preventDefault(); run(async () => {
      const data = await api('/auth/login', { username: username || actor.username, password });
      localStorage.setItem('REPORT_CORE_TOKEN', data.token); setPassword('');
      if (String(data.user.id) !== String(actor.id)) { sessionStorage.removeItem('pendingCard'); resetApiSession(data.user.id, { clear: true }); setTermId(''); setSources([]); setStudents([]); setAssignments([]); setActor(data.user); }
      setExpired(false); setError('');
    }); }}><h2>登录已过期</h2><p>使用原账号登录，继续填写当前内容。</p><label>账号<input aria-label="重新登录账号" value={username || actor.username || ''} onChange={e => setUsername(e.target.value)} required autoComplete="username"/></label><label>密码<input aria-label="重新登录密码" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/></label>{error && <p role="alert">{error}</p>}<button className="primary" disabled={busy}>重新登录</button></form></section>}
    <div inert={expired ? '' : undefined} aria-hidden={expired || undefined}>
    <RoleShell actor={actor} route={{ page: tab }} term={terms.find(t => String(t.id) === termId)} onNavigate={navigate} header={<><select aria-label="当前学期" value={termId} onChange={e => { if (!mayLeave()) return; leaveGuard.current = null; setTermId(e.target.value); location.hash = formatCoreLocation({ role: actor.role, page: tab, termId: e.target.value }); }}>{terms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}</select><button onClick={refresh}>刷新</button></>} onLogout={() => { if (!mayLeave()) return; return run(async () => {
      await api('/auth/logout', {}); localStorage.removeItem('REPORT_CORE_TOKEN'); sessionStorage.removeItem('pendingCard'); resetApiSession('anonymous', { clear: true }); setActor(null); setSources([]); setStudents([]); setTermId('');
    }); }}> 
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
          <div className="content" key={`${actor.id}:${termId}`} aria-busy={busy}>
            {tab === "home" && <StudentHome ctx={ctx} />}
            {tab === "archive" && <StudentArchive ctx={ctx} />}
            {tab === "cards" && <Cards ctx={ctx} />}{" "}
            {tab === "awards" && <AwardUpload ctx={ctx} />}{" "}
            {tab === "stories" && <StoryForm ctx={ctx} />}{" "}
            {tab === "self" && <SelfEvaluation ctx={ctx} />}{" "}
            {tab === "report" && <Published ctx={ctx} />}{" "}
            {tab === "direct" && <DirectScore ctx={ctx} />}{" "}
            {["imports", "roster", "health"].includes(tab) && <ImportData key={tab} ctx={ctx} initialKind={tab === "roster" ? "ROSTER" : tab === "health" ? "HEALTH" : "ACADEMIC"} />}{" "}
            {tab === "reviews" && <ReviewMaterials ctx={ctx} />}{" "}
            {tab === "drafts" && <ReportDrafts ctx={ctx} />}{" "}
            {tab === "settlements" && <Settlements ctx={ctx} />}{" "}
            {["cards-manage", "quota"].includes(tab) && <CardManagement ctx={ctx} />}{" "}
            {tab === "config" && <Configuration ctx={ctx} />}{" "}
            {tab === "releases" && <Releases ctx={ctx} />}
            {sourceNext !== null &&
              ["stories", "awards", "reviews", "direct"].includes(tab) && (
                <button onClick={ctx.loadMoreSources}>
                  加载更多材料与记录
                </button>
              )}
          </div>
        )}
    </RoleShell></div></>;
}
