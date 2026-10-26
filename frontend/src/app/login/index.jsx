import React, { useState, useEffect } from "react";
import { Form, Input, Button, message, Typography, Card, Tag, Space } from "antd";
import { UserOutlined, LockOutlined, BankOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { post } from "@/util/request";
import token from "@/util/token.js";
import {claimReturnPath} from "@/util/claimIntent";
import * as urls from "@/constant/urls";
import s from "./index.module.less";

const BotanicalIllustration = () => (
  <svg style={{ width: 220, height: 130, margin: "20px 0" }} viewBox="0 0 220 140" fill="none">
    <ellipse cx="123" cy="132" rx="76" ry="4" fill="#dfe8dc" />
    <path
      d="M113 129c0-37-3-76 15-114M114 97c-14-16-27-22-40-25m41 1c14-13 31-20 45-20"
      stroke="#97b094"
      strokeWidth="1.7"
    />
    <path d="M115 96C77 97 66 80 69 61c23 0 41 8 46 35z" fill="#b4c6aa" />
    <path d="M115 72c2-31 23-42 45-37 1 20-17 36-45 37z" fill="#c5d2b9" />
    <path d="M120 39c-18-12-17-28-7-35 13 4 18 17 7 35z" fill="#9fb596" />
    <path d="M123 33c2-21 17-30 29-25-1 17-12 26-29 25z" fill="#d1d9bd" />
    <path d="M114 114c23-5 41-2 50 11-16 8-35 4-50-11z" fill="#ced8c5" />
    <circle cx="178" cy="22" r="14" fill="#e3e9d6" />
    <path d="M46 120h15m-8-8v16M181 89h9m-5-5v9" stroke="#bdcbb6" strokeWidth="1.2" />
    <circle cx="49" cy="44" r="3" fill="#ccd5c0" />
  </svg>
);

const PRESET_ROLES = [
  { key: "student", label: "学生端", username: "student1", pass: "123456" },
  { key: "teacher", label: "教师端", username: "teacher1", pass: "123456" },
  { key: "manager", label: "管理端", username: "admin", pass: "admin123" }
];

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState("student");
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const handleSelectPreset = (preset) => {
    setActivePreset(preset.key);
    form.setFieldsValue({
      username: preset.username,
      password: preset.pass
    });
  };

  useEffect(() => {
    handleSelectPreset(PRESET_ROLES[0]);
  }, []);

  const handleFinish = async (values) => {
    setLoading(true);
    try {
      const res = await post(urls.API_LOGIN, {
        username: values.username.trim(),
        password: values.password
      });

      if (res.code === 200 && res.data?.token) {
        token.set(res.data.token);
        token.saveUser(res.data.user);

        window.dispatchEvent(
          new CustomEvent("auth-change", {
            detail: {
              isAuthenticated: true,
              user: res.data.user
            }
          })
        );

        message.success(`欢迎回来，${res.data.user.real_name || res.data.user.username}！`);
        navigate(claimReturnPath(), { replace: true });
      } else {
        message.error(res.message || "用户名或密码错误");
      }
    } catch (err) {
      if (!err.handled) message.error(err.message || "登录请求异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.login}>
      <Card className={s.loginCard} bordered={false}>
        <div className={s.loginLayout}>
          {/* 左侧学术插画与愿景 */}
          <div className={s.leftPanel}>
            <div className={s.brandWrap}>
              <svg className={s.brandLogo} viewBox="0 0 40 40" fill="none">
                <path
                  d="M20 33V18m0 8C10 26 7 19 9 12c8 0 11 6 11 14zm0-6C20 9 25 5 32 6c2 9-3 15-12 14z"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path d="M20 33h10M10 33h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <span className={s.brandText}>六育</span>
            </div>

            <BotanicalIllustration />

            <h1 className={s.leftTitle}>
              看见成长，
              <br />
              也看见每一个你。
            </h1>
            <p className={s.leftDesc}>
              学生学期综合素质评价系统
              <br />
              让记录更轻松，让反馈更及时，让成长更清晰。
            </p>
          </div>

          {/* 右侧表单 */}
          <div className={s.rightPanel}>
            <div className={s.formHeader}>
              <div className={s.eyebrow}>WELCOME TO LIUYU</div>
              <h2 className={s.formTitle}>欢迎回来</h2>
              <p className={s.formTip}>使用学校分配的账号，进入你的成长空间。</p>
            </div>

            {/* 快速角色预设 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#7b8a80", marginBottom: 6 }}>演示账号快速切换：</div>
              <div className={s.rolePresetList}>
                {PRESET_ROLES.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`${s.rolePresetCard} ${activePreset === p.key ? s.active : ""}`}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: "#8a9990", marginTop: 2 }}>{p.username}</div>
                  </button>
                ))}
              </div>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleFinish}
              initialValues={{ school: "杭州市余杭区云会小学" }}
            >
              <Form.Item name="school" label="所属学校">
                <Input
                  prefix={<BankOutlined style={{ color: "#9ca89f" }} />}
                  readOnly
                  disabled
                  style={{ background: "#f8faf9", color: "#55675b" }}
                />
              </Form.Item>

              <Form.Item
                name="username"
                label="账号 (学号 / 教师工号)"
                rules={[{ required: true, message: "请输入账号" }]}
              >
                <Input prefix={<UserOutlined style={{ color: "#9ca89f" }} />} placeholder="请输入学号或教师工号" />
              </Form.Item>

              <Form.Item name="password" label="登录密码" rules={[{ required: true, message: "请输入密码" }]}>
                <Input.Password prefix={<LockOutlined style={{ color: "#9ca89f" }} />} placeholder="请输入登录密码" />
              </Form.Item>

              <Form.Item style={{ marginTop: 24 }}>
                <Button type="primary" htmlType="submit" block loading={loading}>
                  进入系统 <ArrowRightOutlined />
                </Button>
              </Form.Item>
            </Form>

            <div className={s.footerNote}>密码经高强度单向散列加密存储 · 杭州市余杭区云会小学网络与信息安全中心</div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Login;
