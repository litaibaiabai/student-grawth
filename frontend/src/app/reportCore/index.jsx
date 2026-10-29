import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, allStudents, resetApiSession } from "./api";
import RoleShell from "./RoleShell";
import SelfEvaluation from "./SelfEvaluation";
import DirectScore from "./DirectScore";
import AcademicImport from "./AcademicImport";
import CardLedger from "./CardLedger";
import ClassReports from "./ClassReports";
import AdminTermSettings from './AdminTermSettings';
import AdminRoster from './AdminRoster';
import AdminHealth from './AdminHealth';
import AdminQuota from './AdminQuota';
import ManagerWorkspace from './ManagerWorkspace';
import TeacherWorkspace from "./TeacherWorkspace";
import StudentHome, { StudentArchive } from "./StudentHome";
import { navigation as nav, parseCoreLocation, formatCoreLocation, routeForRole } from "./navigation";
import { Cards, AwardUpload, StoryForm } from "./Materials";
import {
  ReviewMaterials,
  Settlements,
} from "./Teacher";
import TermReport from "../../component/TermReport";
import "./style.css";
function Published({ ctx }) {
  const [report, setReport] = useState(undefined);
  useEffect(() => {
    api(`/report-core/reports/current?termId=${ctx.termId}`)
      .then(setReport)
      .catch(ctx.error);
  }, [ctx.termId, ctx.refreshKey, ctx.sessionActive,ctx.error]);
  if(ctx.sessionActive===false)return <section className="panel">请重新登录后读取报告。</section>;
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
    [scopeReady,setScopeReady] = useState(false),
    [teacherScope,setTeacherScope] = useState(null),
    [focusTask,setFocusTask] = useState(null),
    [refreshKey, setRefresh] = useState(0),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const leaveGuard = useRef(null);
  const loadedScope = useRef(null);
  const mayLeave = useCallback(() => !leaveGuard.current || leaveGuard.current(),[]);
  const registerLeaveGuard=useCallback(fn=>{leaveGuard.current=fn;},[]);
  const refresh = useCallback(() => setRefresh((n) => n + 1),[]);
  const notify = useCallback((message) => {
    setNotice(message);
    setError("");
  },[]);
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
  }, [actor,reportError]);
  useEffect(() => {
    if (!actor || !termId) return;
    const controller = new AbortController();
    const scopeKey = `${actor.id}:${termId}`;
    if (loadedScope.current !== scopeKey) { setScopeReady(false);setTeacherScope(null);setStudents([]); setSources([]); setAssignments([]); loadedScope.current = scopeKey; }
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
        setScopeReady(true);
      })
      .catch(e => { if (e.name !== "AbortError") reportError(e); });
    return () => controller.abort();
  }, [actor, termId, refreshKey,reportError]);
  useEffect(() => {
    if (!actor || !termId) return;
    const update = () => {
      const route = routeForRole(parseCoreLocation(location.hash), actor.role);
      if ((route.page !== tab && !(['entry','direct'].includes(route.page)&&['entry','direct'].includes(tab)) || route.termId && route.termId !== termId) && !mayLeave()) { location.hash = formatCoreLocation({role:actor.role,page:tab,termId}); return; }
      setTab(route.page);
      if (route.termId && terms.some(t => String(t.id) === route.termId)) setTermId(route.termId);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [actor, termId, terms, tab,mayLeave]);
  const navigate = useCallback(page => {
    if (page !== tab && !(['entry','direct'].includes(page)&&['entry','direct'].includes(tab))) { if (!mayLeave()) return; leaveGuard.current = null; }
    setTab(page); setError(''); setNotice('');
    location.hash = formatCoreLocation({ role: actor.role, page, termId });
  },[tab,actor?.role,termId,mayLeave]);
  useEffect(()=>{
    if(actor?.role!=='teacher'||!scopeReady)return;
    const key=`REPORT_SCOPE:${actor.schoolId}:${actor.id}:${termId}`;let stored;
    try{stored=JSON.parse(localStorage.getItem(key)||'null');}catch{stored=null;}
    const current=teacherScope||stored,chosen=assignments.find(a=>`${a.grade}:${a.class_no}`===current?.classKey&&a.subject_code===current?.subjectCode)||assignments[0];
    const next=chosen?{classKey:`${chosen.grade}:${chosen.class_no}`,subjectCode:chosen.subject_code}:null;
    if(next){if(next.classKey!==teacherScope?.classKey||next.subjectCode!==teacherScope?.subjectCode)setTeacherScope(next);localStorage.setItem(key,JSON.stringify(next));}
  },[actor?.id,actor?.role,actor?.schoolId,termId,assignments,scopeReady,teacherScope]);
  const changeScope=(classKey,subjectCode)=>{
    if(!mayLeave())return;
    const available=assignments.filter(a=>`${a.grade}:${a.class_no}`===classKey),chosen=available.find(a=>a.subject_code===subjectCode)||available[0];if(chosen)setTeacherScope({classKey,subjectCode:chosen.subject_code});
  };
  const ctx = {
    actor,
    selectScope:changeScope,
    termId,
    sessionActive: !expired,
    navigate,
    term: terms.find(t => String(t.id) === termId),
    setLeaveGuard: registerLeaveGuard,
    catalog,
    students,
    sources,
    assignments,
    teacherScope,
    selectedTask: focusTask,
    focusTask: setFocusTask,
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
        {!catalog ? <section className="panel" role="status">正在读取学期配置…</section> : !termId ? (
          <section className="panel">
            <h2>尚未配置学期</h2>
            <p>请先运行学校初始化脚本配置首个学期。</p>
          </section>
        ) : !scopeReady ? <section className="panel" role="status">正在读取学生、班级与任教范围…</section> : (
          <div className="content" key={`${actor.id}:${termId}`} aria-busy={busy}>
            {actor.role==='teacher'&&teacherScope&&<div className="context-bar"><div className="context-controls"><span className="context-label">当前工作范围</span><select aria-label="选择班级" value={teacherScope.classKey} onChange={e=>changeScope(e.target.value,teacherScope.subjectCode)}>{[...new Set(assignments.map(a=>`${a.grade}:${a.class_no}`))].map(c=><option key={c} value={c}>{c.replace(':','年级')}班</option>)}</select><select aria-label="选择任教学科" value={teacherScope.subjectCode} onChange={e=>changeScope(teacherScope.classKey,e.target.value)}>{[...new Set(assignments.filter(a=>`${a.grade}:${a.class_no}`===teacherScope.classKey).map(a=>a.subject_code))].map(code=><option key={code} value={code}>{({MORAL:'道德与法治',CHINESE:'语文',MATH:'数学',SCIENCE:'科学',ENGLISH:'英语',PE:'体育与健康',MUSIC:'音乐',FINE_ART:'美术',INFORMATION_TECHNOLOGY:'信息科技',LABOR:'劳动',INTEGRATED_PRACTICE:'综合实践活动',LOCAL_COURSE:'地方课程',STORY:'故事'})[code]||code}</option>)}</select></div><small>{tab==='drafts'?'班级报告可浏览全部负责班级':'下次打开会记住当前范围'}</small></div>}
            {tab==='workspace'&&<TeacherWorkspace ctx={ctx}/>}
            {actor.role==='teacher'&&['entry','direct','imports','reviews','settlements'].includes(tab)&&<nav className="evaluation-tabs" aria-label="评价录入分类">{[['direct','快速直评'],['imports','学业水平'],['reviews','材料认定'],['settlements','采集结算']].map(([id,label])=><button key={id} className={(tab==='entry'?'direct':tab)===id?'active':''} onClick={()=>navigate(id)}>{label}</button>)}</nav>}
            {actor.role==='student'&&['cards','awards','self','report'].includes(tab)&&<button className="text-action student-back" onClick={()=>navigate(['self','report'].includes(tab)?'archive':'home')}>← 返回{['self','report'].includes(tab)?'我的档案':'首页'}</button>}
            {tab === "home" && <StudentHome ctx={ctx} />}
            {tab === "archive" && <StudentArchive ctx={ctx} />}
            {tab === "cards" && <Cards ctx={ctx} />}{" "}
            {tab === "awards" && <AwardUpload ctx={ctx} />}{" "}
            {tab === "stories" && <StoryForm ctx={ctx} />}{" "}
            {tab === "self" && <SelfEvaluation ctx={ctx} />}{" "}
            {tab === "report" && <Published ctx={ctx} />}{" "}
            {["entry","direct"].includes(tab) && <DirectScore ctx={ctx} />}{" "}
            {tab === "imports" && actor.role === "teacher" && <AcademicImport ctx={ctx} />}
            {tab==='roster'&&<AdminRoster ctx={ctx}/>} {tab==='health'&&<AdminHealth ctx={ctx}/>}{" "}
            {tab === "reviews" && <ReviewMaterials ctx={ctx} />}{" "}
            {tab === "drafts" && <ClassReports ctx={ctx} />}{" "}
            {tab === "settlements" && <Settlements ctx={ctx} />}{" "}
            {tab === "cards-manage" && actor.role === "teacher" && <CardLedger ctx={ctx} />}
            {tab === "quota" && <AdminQuota ctx={ctx} />}{" "}
            {tab === "config" && <AdminTermSettings ctx={ctx} />}{" "}
            {tab === "releases" && <ManagerWorkspace ctx={ctx} />}
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
