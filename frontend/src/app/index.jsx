import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, allStudents, resetApiSession } from "./core/api";
import {
  navigation as nav,
  parseCoreLocation,
  formatCoreLocation,
  routeForRole,
} from "./core/navigation";
import RoleShell from "./core/RoleShell";
import { StudentModule, StudentView } from "./student";
import { TeacherModule, TeacherView } from "./teacher";
import { ManagerModule, ManagerView } from "./manager";
import "./core/style.css";

export { StudentModule, TeacherModule, ManagerModule };

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
    [sourceNext, setSourceNext] = useState(null),
    [assignments, setAssignments] = useState([]),
    [scopeReady, setScopeReady] = useState(false),
    [teacherScope, setTeacherScope] = useState(null),
    [focusTask, setFocusTask] = useState(null),
    [refreshKey, setRefresh] = useState(0),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const termListRequest = useRef(null);
  const actorIdentity=useRef(actor?.id);
  actorIdentity.current=actor?.id;
  const leaveGuard = useRef(null);
  const loadedScope = useRef(null);
  const mayLeave = useCallback(
    () => !leaveGuard.current || leaveGuard.current(),
    [],
  );
  const registerLeaveGuard = useCallback((fn) => {
    leaveGuard.current = fn;
  }, []);
  const refresh = useCallback(() => setRefresh((n) => n + 1), []);
  const notify = useCallback((message) => {
    setNotice(message);
    setError("");
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const reportError = useCallback((e) => {
    setNotice("");
    setError(e.message);
    if (e.status === 401) {
      localStorage.removeItem("REPORT_CORE_TOKEN");
      sessionStorage.removeItem("pendingCard");
      resetApiSession("anonymous", { clear: true });
      leaveGuard.current = null;
      loadedScope.current = null;
      setActor(null);
      setPassword("");
      setCatalog(null);
      setTermId("");
      setStudents([]);
      setSources([]);
      setAssignments([]);
      setScopeReady(false);
      setTeacherScope(null);
      setFocusTask(null);
      setNotice("");
    }
  }, []);
  const reloadTerms = useCallback(async () => {
    const identity=actor?.id;
    if(!identity)return;
    termListRequest.current?.abort();
    const controller=new AbortController();
    termListRequest.current=controller;
    try {
      const rows=await api('/report-core/terms',undefined,undefined,{signal:controller.signal});
      if(!controller.signal.aborted && actorIdentity.current===identity)setTerms(rows);
    } catch(e) {
      if(e.name!=='AbortError' && actorIdentity.current===identity)reportError(e);
      throw e;
    }
  },[actor?.id,reportError]);
  useEffect(()=>()=>{termListRequest.current?.abort();},[actor?.id]);
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
        setTermId(
          String(
            t.find((x) => String(x.id) === incoming.termId)?.id ||
              t.find((x) => x.is_current)?.id ||
              t[0]?.id ||
              "",
          ),
        );
      })
      .catch(reportError);
  }, [actor, reportError]);
  useEffect(() => {
    if (!actor || !termId) return;
    const controller = new AbortController();
    const scopeKey = `${actor.id}:${termId}`;
    if (loadedScope.current !== scopeKey) {
      setScopeReady(false);
      setTeacherScope(null);
      setStudents([]);
      setSources([]);
      setAssignments([]);
      loadedScope.current = scopeKey;
    }
    Promise.all([
      allStudents(termId, { signal: controller.signal }),
      api(`/report-core/sources?termId=${termId}&page=1`, undefined, undefined, {
        signal: controller.signal,
      }),
      api(
        `/report-core/assignments?termId=${termId}`,
        undefined,
        undefined,
        { signal: controller.signal },
      ),
      api(`/report-core/config?termId=${termId}`, undefined, undefined, {
        signal: controller.signal,
      }),
    ])
      .then(([s, r, a, c]) => {
        if (controller.signal.aborted) return;
        setCatalog(c);
        setStudents(s);
        setSources(r.rows);
        setSourceNext(r.nextOffset);
        setAssignments(a);
        setScopeReady(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") reportError(e);
      });
    return () => controller.abort();
  }, [actor, termId, refreshKey, reportError]);
  useEffect(() => {
    if (!actor || !termId) return;
    const update = () => {
      const route = routeForRole(parseCoreLocation(location.hash), actor.role);
      if (
        (route.page !== tab &&
          !(
            ["entry", "direct"].includes(route.page) &&
            ["entry", "direct"].includes(tab)
          )) ||
        (route.termId && route.termId !== termId)
      ) {
        if (!mayLeave()) {
          location.hash = formatCoreLocation({
            role: actor.role,
            page: tab,
            termId,
          });
          return;
        }
      }
      setTab(route.page);
      if (route.termId && terms.some((t) => String(t.id) === route.termId))
        setTermId(route.termId);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [actor, termId, terms, tab, mayLeave]);
  const navigate = useCallback(
    (page) => {
      if (
        page !== tab &&
        !(
          ["entry", "direct"].includes(page) &&
          ["entry", "direct"].includes(tab)
        )
      ) {
        if (!mayLeave()) return;
        leaveGuard.current = null;
      }
      setTab(page);
      setError("");
      setNotice("");
      location.hash = formatCoreLocation({ role: actor.role, page, termId });
    },
    [tab, actor?.role, termId, mayLeave],
  );
  useEffect(() => {
    if (actor?.role !== "teacher" || !scopeReady) return;
    const key = `REPORT_SCOPE:${actor.schoolId}:${actor.id}:${termId}`;
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      stored = null;
    }
    const current = teacherScope || stored,
      chosen =
        assignments.find(
          (a) =>
            `${a.grade}:${a.class_no}` === current?.classKey &&
            a.subject_code === current?.subjectCode,
        ) || assignments[0];
    const next = chosen
      ? {
          classKey: `${chosen.grade}:${chosen.class_no}`,
          subjectCode: chosen.subject_code,
        }
      : null;
    if (next) {
      if (
        next.classKey !== teacherScope?.classKey ||
        next.subjectCode !== teacherScope?.subjectCode
      )
        setTeacherScope(next);
      localStorage.setItem(key, JSON.stringify(next));
    }
  }, [
    actor?.id,
    actor?.role,
    actor?.schoolId,
    termId,
    assignments,
    scopeReady,
    teacherScope,
  ]);
  const changeScope = (classKey, subjectCode) => {
    if (!mayLeave()) return;
    const available = assignments.filter(
        (a) => `${a.grade}:${a.class_no}` === classKey,
      ),
      chosen =
        available.find((a) => a.subject_code === subjectCode) || available[0];
    if (chosen)
      setTeacherScope({ classKey, subjectCode: chosen.subject_code });
  };
  const ctx = {
    actor,
    selectScope: changeScope,
    termId,
    sessionActive: Boolean(actor),
    navigate,
    term: terms.find((t) => String(t.id) === termId),
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
    reloadTerms,
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
    <>
      <div>
        <RoleShell
          schemaVersion={catalog?.schemaVersion}
          actor={actor}
          route={{ page: tab }}
          term={terms.find((t) => String(t.id) === termId)}
          onNavigate={navigate}
          header={
            <>
              <select
                aria-label="当前学期"
                value={termId}
                onChange={(e) => {
                  if (!mayLeave()) return;
                  leaveGuard.current = null;
                  setTermId(e.target.value);
                  location.hash = formatCoreLocation({
                    role: actor.role,
                    page: tab,
                    termId: e.target.value,
                  });
                }}
              >
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.term_name}
                  </option>
                ))}
              </select>
              {actor.role === "teacher" && tab === "comments" && <span id="term-comment-class-filter" />}
              <button onClick={refresh}>刷新</button>
            </>
          }
          onLogout={() => {
            if (!mayLeave()) return;
            return run(async () => {
              await api("/auth/logout", {});
              localStorage.removeItem("REPORT_CORE_TOKEN");
              sessionStorage.removeItem("pendingCard");
              resetApiSession("anonymous", { clear: true });
              setActor(null);
              setSources([]);
              setStudents([]);
              setTermId("");
            });
          }}
        >
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
            <div role="status" aria-live="polite" aria-atomic="true" className="feedback success app-toast">
              <span>{notice}</span>
              <button aria-label="关闭消息提示" onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              正在处理，请稍候…
            </div>
          )}
          {!catalog ? (
            <section className="panel" role="status">
              正在读取学期配置…
            </section>
          ) : !termId ? (
            <section className="panel">
              <h2>尚未配置学期</h2>
              <p>请先运行学校初始化脚本配置首个学期。</p>
            </section>
          ) : !scopeReady ? (
            <section className="panel" role="status">
              正在读取学生、班级与任教范围…
            </section>
          ) : (
            <div
              className="content"
              key={`${actor.id}:${termId}`}
              aria-busy={busy}
            >
              {actor.role === "teacher" && teacherScope && !['reviews', 'comments', 'cards-manage', 'drafts'].includes(tab) && (
                <div className="context-bar">
                  <div className="context-controls">
                    <span className="context-label">当前工作范围</span>
                    <select
                      aria-label="选择班级"
                      value={teacherScope.classKey}
                      onChange={(e) =>
                        changeScope(e.target.value, teacherScope.subjectCode)
                      }
                    >
                      {[
                        ...new Set(
                          assignments.map((a) => `${a.grade}:${a.class_no}`),
                        ),
                      ].map((c) => (
                        <option key={c} value={c}>
                          {c.replace(":", "年级")}班
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="选择任教学科"
                      value={teacherScope.subjectCode}
                      onChange={(e) =>
                        changeScope(teacherScope.classKey, e.target.value)
                      }
                    >
                      {[
                        ...new Set(
                          assignments
                            .filter(
                              (a) =>
                                `${a.grade}:${a.class_no}` ===
                                teacherScope.classKey,
                            )
                            .map((a) => a.subject_code),
                        ),
                      ].map((code) => (
                        <option key={code} value={code}>
                          {({
                            MORAL: "道德与法治",
                            CHINESE: "语文",
                            MATH: "数学",
                            SCIENCE: "科学",
                            ENGLISH: "英语",
                            PE: "体育与健康",
                            MUSIC: "音乐",
                            FINE_ART: "美术",
                            INFORMATION_TECHNOLOGY: "信息科技",
                            LABOR: "劳动",
                            INTEGRATED_PRACTICE: "综合实践活动",
                            CLASS_HEAD: "班级负责人",
                            LOCAL_COURSE: "地方课程",
                            STORY: "故事",
                          })[code] || code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <small>
                    {tab === "drafts"
                      ? "班级报告可浏览全部负责班级"
                      : "下次打开会记住当前范围"}
                  </small>
                </div>
              )}

              {actor.role === "student" && (
                <StudentView tab={tab} ctx={ctx} />
              )}
              {actor.role === "teacher" && (
                <TeacherView tab={tab} ctx={ctx} />
              )}
              {actor.role === "manager" && (
                <ManagerView tab={tab} ctx={ctx} />
              )}

              {sourceNext !== null && ["stories", "awards"].includes(tab) && catalog.schemaVersion !== 'SIX_EDU_V2' && (
                <div className="source-pagination"><button disabled={busy} onClick={ctx.loadMoreSources}>加载下一批记录</button></div>
              )}
            </div>
          )}
        </RoleShell>
      </div>
    </>
  );
}
