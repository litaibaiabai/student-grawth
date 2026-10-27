import { Suspense, lazy, useState, useEffect, useCallback } from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Spin, ConfigProvider, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import token from "@/util/token";
import {captureClaimLocation,claimReturnPath} from "@/util/claimIntent";

// Capture before the authentication guard redirects an unopened claim page.
captureClaimLocation();
import { get } from "@/util/request";
import { API_AUTH_ME } from "@/constant/urls";
import Topbar from "@/component/Nav";
import Sidebar from "@/component/Sidebar";

dayjs.locale("zh-cn");
message.config({ maxCount: 2 });

// 懒加载页面视图
const Dashboard = lazy(() => import("./app/dashboard"));
const Login = lazy(() => import("./app/login"));

// 学生端视图
const StudentClaim = lazy(() => import("./app/student/claim"));
const StudentLedger = lazy(() => import("./app/student/ledger"));
const StudentHonors = lazy(() => import("./app/student/honors"));
const StudentStories = lazy(() => import("./app/student/stories"));
const StudentEvaluation = lazy(() => import("./app/student/evaluation"));
const StudentReport = lazy(() => import("./app/student/report"));

// 教师端视图
const TeacherClaims = lazy(() => import("./app/teacher/claims"));
const TeacherDirectScore = lazy(() => import("./app/teacher/directScore"));
const TeacherHonors = lazy(() => import("./app/teacher/honors"));
const TeacherStories = lazy(() => import("./app/teacher/stories"));
const TeacherReportDrafts = lazy(() => import("./app/teacher/reportDrafts"));

// 管理员端视图
const AdminTerms = lazy(() => import("./app/admin/terms"));
const AdminTeachingAssignments = lazy(() => import("./app/admin/teachingAssignments"));
const AdminCards = lazy(() => import("./app/admin/cards"));
const AdminCategories = lazy(() => import("./app/admin/categories"));
const AdminImport = lazy(() => import("./app/admin/import"));
const AdminRules = lazy(() => import("./app/admin/rules"));
const AdminReports = lazy(() => import("./app/admin/reports"));
const AdminAudits = lazy(() => import("./app/admin/audits"));
const AdminRoster = lazy(() => import("./app/admin/rosterImport"));
const AdminDevices = lazy(() => import("./app/admin/devices"));
const KioskIdentify = lazy(() => import("./app/kiosk/identify"));

const NotFound = lazy(() => import("./app/not-found"));
const Forbidden = lazy(() => import("./app/forbidden"));
const ServerError = lazy(() => import("./app/server-error"));
const FamilyFeedback = lazy(() => import("./app/family/feedback"));

const Loading = () => (
  <div
    style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#f5f7f6" }}
  >
    <Spin size="large" />
  </div>
);

// 主工作台布局组件 (严格对齐 ui-prototype 结构)
const Layout = ({ children }) => (
  <div className="app-shell">
    <Sidebar />
    <div className="app-workspace">
      <Topbar />
      <main className="app-content">{children}</main>
      <p className="footer-note">六育 · 学生综合素质评价系统　 /　 记录成长的每一种可能</p>
    </div>
  </div>
);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const capture=()=>captureClaimLocation();
    window.addEventListener("hashchange",capture);
    return ()=>window.removeEventListener("hashchange",capture);
  },[]);

  // 检查登录状态
  const getAuthState = useCallback(() => {
    const user = token.loadUser();
    const tok = token.get();
    const isAuthed = !!(user && tok);
    return {
      isAuthenticated: isAuthed,
      role: isAuthed ? user?.role || null : null
    };
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const state = getAuthState();
      setIsAuthenticated(state.isAuthenticated);
      setUserRole(state.role);

      // 仅在本地已存在登录态时才向服务端校验 Token 有效性；首次打开未登录时直接通过，避免触发 401 报警弹窗
      if (state.isAuthenticated) {
        try {
          await get(API_AUTH_ME, {}, { skipGlobalError: true });
        } catch {
          token.clear();
          setIsAuthenticated(false);
          setUserRole(null);
        }
      }
      setChecked(true);
    };
    checkAuth();
  }, [getAuthState]);

  useEffect(() => {
    const handleAuthChange = (event) => {
      const next = event?.detail?.isAuthenticated;
      if (!next) {
        setIsAuthenticated(false);
        setUserRole(null);
      } else {
        const state = getAuthState();
        setIsAuthenticated(state.isAuthenticated);
        setUserRole(state.role);
      }
    };
    window.addEventListener("auth-change", handleAuthChange);
    return () => window.removeEventListener("auth-change", handleAuthChange);
  }, [getAuthState]);

  if (!checked) {
    return <Loading />;
  }

  const RequireAuth = ({ children }) => {
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return <Layout>{children}</Layout>;
  };

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#277460",
          colorLink: "#277460",
          colorSuccess: "#277460",
          colorWarning: "#b77a27",
          colorError: "#c45757",
          colorTextBase: "#25332d",
          colorBorder: "#e6ebe7",
          colorBgBase: "#ffffff",
          borderRadius: 8,
          fontFamily: '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
        }
      }}
    >
      <Router>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* 登录页与外部家长免登录填写页、公共终端免登录识别页 */}
            <Route path="/login" element={isAuthenticated ? <Navigate to={claimReturnPath()} replace /> : <Login />} />
            <Route path="/family/feedback" element={<FamilyFeedback />} />
            <Route path="/kiosk/identify" element={<KioskIdentify />} />

            {/* 首页仪表盘 */}
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />

            {/* 学生端路由 */}
            <Route
              path="/student/claim"
              element={
                <RequireAuth>
                  <StudentClaim />
                </RequireAuth>
              }
            />
            <Route
              path="/student/ledger"
              element={
                <RequireAuth>
                  <StudentLedger />
                </RequireAuth>
              }
            />
            <Route
              path="/student/honors"
              element={
                <RequireAuth>
                  <StudentHonors />
                </RequireAuth>
              }
            />
            <Route
              path="/student/stories"
              element={
                <RequireAuth>
                  <StudentStories />
                </RequireAuth>
              }
            />
            <Route
              path="/student/evaluation"
              element={
                <RequireAuth>
                  <StudentEvaluation />
                </RequireAuth>
              }
            />
            <Route
              path="/student/report"
              element={
                <RequireAuth>
                  <StudentReport />
                </RequireAuth>
              }
            />

            {/* 教师端路由 */}
            <Route
              path="/teacher/claims"
              element={
                <RequireAuth>
                  <TeacherClaims />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/direct-score"
              element={
                <RequireAuth>
                  <TeacherDirectScore />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/honors"
              element={
                <RequireAuth>
                  <TeacherHonors />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/stories"
              element={
                <RequireAuth>
                  <TeacherStories />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/report-drafts"
              element={
                <RequireAuth>
                  <TeacherReportDrafts />
                </RequireAuth>
              }
            />

            {/* 管理员端路由 */}
            <Route
              path="/admin/terms"
              element={
                <RequireAuth>
                  <AdminTerms />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/teaching-assignments"
              element={
                <RequireAuth>
                  <AdminTeachingAssignments />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/devices"
              element={
                <RequireAuth>
                  <AdminDevices />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/roster"
              element={
                <RequireAuth>
                  <AdminRoster />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/cards"
              element={
                <RequireAuth>
                  <AdminCards />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/categories"
              element={
                <RequireAuth>
                  <AdminCategories />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/import"
              element={
                <RequireAuth>
                  <AdminImport />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/rules"
              element={
                <RequireAuth>
                  <AdminRules />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <RequireAuth>
                  <AdminReports />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/audits"
              element={
                <RequireAuth>
                  <AdminAudits />
                </RequireAuth>
              }
            />

            {/* 兼容旧重定向 */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/403" element={<Forbidden />} />
            <Route path="/500" element={<ServerError />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </ConfigProvider>
  );
}

export default App;
