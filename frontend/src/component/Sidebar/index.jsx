import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import token from "@/util/token";
import { getMenuGroupsByRole } from "@/constant/menu";
import { BankOutlined, DownOutlined, HeartOutlined } from "@ant-design/icons";

const BotanicalLogo = () => (
  <svg
    className="brand-logo-svg"
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M20 33V18m0 8C10 26 7 19 9 12c8 0 11 6 11 14zm0-6C20 9 25 5 32 6c2 9-3 15-12 14z"
      stroke="#277460"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <path
      d="M20 33h10M10 33h5"
      stroke="#277460"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = token.loadUser();
  const role = user?.role || "student";
  const groups = getMenuGroupsByRole(role);

  return (
    <aside className="prototype-sidebar">
      {/* 品牌标识 */}
      <div className="brand-section" onClick={() => navigate("/dashboard")}>
        <BotanicalLogo />
        <div>
          <div className="brand-title">六育</div>
          <div className="brand-subtitle">GROWTH & POSSIBILITIES</div>
        </div>
      </div>

      {/* 学校与学期标识 */}
      <div className="school-badge">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BankOutlined style={{ color: "#277460" }} />
          <span>杭州市余杭区云会小学</span>
        </span>
        <DownOutlined style={{ fontSize: 10, color: "#95a397" }} />
      </div>

      {/* 菜单树 */}
      <nav className="nav-container">
        {groups.map((grp, gIdx) => (
          <div key={gIdx}>
            <div className="nav-section-title">{grp.group}</div>
            {grp.items.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.key}
                  className={`nav-menu-button ${isActive ? "active" : ""}`}
                  onClick={() => navigate(item.path)}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge && <span className="nav-badge-pill">{item.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 底部校训与学期 */}
      <div className="sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#277460", fontWeight: 500 }}>
          <HeartOutlined />
          <span>让每一种成长，都被看见</span>
        </div>
        <div style={{ fontSize: 11, color: "#9aa59e", marginTop: 4 }}>
          2026—2027 学年 · 第一学期
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
