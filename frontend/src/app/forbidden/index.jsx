import React from "react";
import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";
import s from "./index.module.less";

const Forbidden = () => {
  const navigate = useNavigate();
  return (
    <div className={s.container}>
      <Result
        status="403"
        title="403"
        subTitle="抱歉，您没有权限访问此页面"
        extra={
          <Button type="primary" onClick={() => navigate("/dashboard")}>
            返回首页
          </Button>
        }
      />
    </div>
  );
};

export default Forbidden;
