import React from "react";
import { Card, Typography } from "antd";
import s from "./index.module.less";

/**
 * 通用管理页面（示例）
 * 展示受 admin 角色的权限页面
 */
const Admin = () => {
  return (
    <div className={s.admin}>
      <h1 className={s.title}>系统管理</h1>
      <Card>
        <Typography.Text>
          此页面仅 admin 角色可以访问。你可以在此开发用户管理、配置管理等功能。
        </Typography.Text>
      </Card>
    </div>
  );
};

export default Admin;
