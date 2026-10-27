import React, { useState, useEffect } from "react";
import { Avatar, Dropdown, Space, Tag, Select, message } from "antd";
import { UserOutlined, SmileOutlined, LogoutOutlined, BgColorsOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import token from "@/util/token";
import { get, post } from "@/util/request";
import { API_GROWTH_THEME } from "@/constant/urls";
import "./index.less";

const THEME_OPTIONS = [
  { label: "经典蓝 (默认)", value: "default" },
  { label: "晴空海蓝", value: "ocean" },
  { label: "清新森林", value: "forest" },
  { label: "落日暖橙", value: "sunset" },
  { label: "梦幻童趣", value: "cartoon" }
];

const StudentLayout = ({ children, currentTheme = "default", onThemeChange, studentInfo }) => {
  const [theme, setTheme] = useState(currentTheme);
  const navigate = useNavigate();

  useEffect(() => {
    if (currentTheme) {
      setTheme(currentTheme);
    }
  }, [currentTheme]);

  const handleThemeSelect = async (newTheme) => {
    setTheme(newTheme);
    if (onThemeChange) {
      onThemeChange(newTheme);
    }
    try {
      await post(API_GROWTH_THEME, { themeId: newTheme });
      message.success("成长主题已切换");
    } catch (e) {
      // 本地预览仍然生效
    }
  };

  const handleLogout = () => {
    token.clear();
    navigate("/login");
  };

  return (
    <div className={`student-layout theme-${theme}`}>
      <header className="student-header">
        <div className="logo-badge">
          <SmileOutlined style={{ fontSize: 24 }} />
          <span>六育少年成长乐园</span>
          <Tag color="blue" style={{ borderRadius: 12, marginLeft: 8 }}>
            学生专属空间
          </Tag>
        </div>

        <div className="nav-actions">
          <Space size="middle">
            <Space size="small">
              <BgColorsOutlined style={{ color: "#64748b" }} />
              <Select
                value={theme}
                onChange={handleThemeSelect}
                options={THEME_OPTIONS}
                style={{ width: 130 }}
                size="small"
              />
            </Space>

            <Dropdown
              menu={{
                items: [
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    label: "退出登录",
                    onClick: handleLogout
                  }
                ]
              }}
            >
              <Space style={{ cursor: "pointer" }}>
                <Avatar icon={<UserOutlined />} style={{ backgroundColor: "var(--primary-color, #3b82f6)" }} />
                <span style={{ fontWeight: 500 }}>{studentInfo?.name || "同学"}</span>
              </Space>
            </Dropdown>
          </Space>
        </div>
      </header>

      <main className="student-content">{children}</main>

      <footer className="student-footer">
        六育学生综合素质评价系统 · 记录每一步成长足迹
      </footer>
    </div>
  );
};

export default StudentLayout;
