import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import token from "@/util/token";
import { post } from "@/util/request";
import * as urls from "@/constant/urls";
import { getFlattenMenusByRole } from "@/constant/menu";
import { Modal, Button, Tooltip } from "antd";
import { LogoutOutlined, BellOutlined } from "@ant-design/icons";

const Topbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const user = token.loadUser();
  const role = user?.role || "student";
  const allItems = getFlattenMenusByRole(role);
  const currentItem = allItems.find((i) => i.path === location.pathname);

  const roleNameMap = {
    student: "在读学生",
    teacher: "任课教师",
    manager: "学校管理员"
  };

  const handleLogout = async () => {
    try {
      await post(urls.API_LOGOUT);
    } catch {
      // 容错
    }
    token.clear();
    window.dispatchEvent(
      new CustomEvent("auth-change", {
        detail: { isAuthenticated: false }
      })
    );
    navigate("/login", { replace: true });
    setLogoutModalOpen(false);
  };

  const displayName = user?.real_name || user?.username || "演示用户";
  const avatarLetter = displayName.slice(0, 1);

  return (
    <header className="app-topbar">
      {/* 面包屑 */}
      <div className="topbar-breadcrumbs">
        <span>学生综合素质评价</span>
        <span>/</span>
        <strong>{currentItem?.label || "工作台"}</strong>
      </div>

      {/* 右侧信息 */}
      <div className="topbar-right-pane">
        <span className="term-tag-label">2026—2027 学年　第一学期</span>

        <Tooltip title="系统通知">
          <Button type="text" shape="circle" icon={<BellOutlined style={{ fontSize: 16, color: "#6e8074" }} />} />
        </Tooltip>

        <div className="user-identity-box">
          <span className={`avatar-circle ${role}`}>{avatarLetter}</span>
          <div className="user-text-info">
            <div className="user-name-text">{displayName}</div>
            <div className="user-role-text">{roleNameMap[role] || role}</div>
          </div>
        </div>

        <Tooltip title="退出登录">
          <Button
            type="text"
            shape="circle"
            icon={<LogoutOutlined style={{ fontSize: 16, color: "#c45757" }} />}
            onClick={() => setLogoutModalOpen(true)}
          />
        </Tooltip>
      </div>

      <Modal
        title="确认退出系统？"
        open={logoutModalOpen}
        onOk={handleLogout}
        onCancel={() => setLogoutModalOpen(false)}
        okText="退出登录"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p style={{ color: "#64748b", margin: "12px 0 4px" }}>退出后将清除本机会话凭据，需要重新验证身份登录。</p>
      </Modal>
    </header>
  );
};

export default Topbar;
