import React from "react";
import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";
import s from "./index.module.less";

const ServerError = () => {
  const navigate = useNavigate();
  return (
    <div className={s.container}>
      <Result
        status="500"
        title="500"
        subTitle="服务器出了点问题，请稍后重试"
        extra={
          <Button type="primary" onClick={() => navigate("/dashboard")}>
            返回首页
          </Button>
        }
      />
    </div>
  );
};

export default ServerError;
