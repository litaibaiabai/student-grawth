import React, { useState, useEffect } from "react";
import {
  Card,
  Input,
  Button,
  Form,
  Checkbox,
  message,
  Typography,
  Alert,
  Space
} from "antd";
import { HeartOutlined, CheckCircleOutlined, SendOutlined } from "@ant-design/icons";
import { post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

const FamilyFeedbackPage = () => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 从 URL 参数提取 token 与 studentId
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    let urlToken = searchParams.get("token");
    let urlStudentId = searchParams.get("studentId");

    if (!urlToken && hash.includes("?")) {
      const hashParams = new URLSearchParams(hash.split("?")[1]);
      urlToken = hashParams.get("token");
      urlStudentId = hashParams.get("studentId");
    }

    if (urlToken || urlStudentId) {
      form.setFieldsValue({
        token: urlToken || "",
        studentId: urlStudentId || ""
      });
    }
  }, [form]);

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      const res = await post(urls.API_FAMILY_COMMENT, {
        token: values.token,
        studentId: Number(values.studentId),
        commentText: values.commentText,
        proxyByStudent: !!values.proxyByStudent
      });

      if (res && res.code === 200) {
        message.success("家长寄语提交成功！");
        setSubmitted(true);
      } else {
        message.error(res?.message || "提交失败，请检查凭证有效性");
      }
    } catch (err) {
      if (err?.status === 403 || err?.response?.status === 403) {
        message.error("凭证与学生不匹配，禁止跨学生填写！");
      } else if (err?.status === 401 || err?.response?.status === 401) {
        message.error("家长访问凭证已过期或无效，请联系班主任重新获取！");
      } else {
        message.error(err?.message || "提交失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "40px 16px", maxWidth: "680px", margin: "0 auto" }}>
      <Card style={{ borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <HeartOutlined style={{ fontSize: "36px", color: "#eb2f96", marginBottom: "12px" }} />
          <Title level={3} style={{ marginBottom: "8px" }}>学期成长报告 — 家长寄语与鼓励</Title>
          <Paragraph type="secondary">
            陪伴孩子每一步成长。您的肯定与寄语将纳入孩子的学期评价报告。
          </Paragraph>
        </div>

        {submitted ? (
          <Alert
            message="提交成功"
            description="您的学期寄语已成功保存！感谢您对孩子成长的陪伴与支持。"
            type="success"
            showIcon
            action={
              <Button type="primary" onClick={() => setSubmitted(false)}>
                再次编辑 / 补填
              </Button>
            }
          />
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              name="token"
              label="访问授权凭证 (Token)"
              rules={[{ required: true, message: "请输入有效的家长授权凭证" }]}
            >
              <Input placeholder="输入由学校或班主任签发的安全凭证" />
            </Form.Item>

            <Form.Item
              name="studentId"
              label="学生 ID"
              rules={[{ required: true, message: "请输入学生ID" }]}
            >
              <Input placeholder="学生唯一身份编号" />
            </Form.Item>

            <Form.Item
              name="commentText"
              label="家长寄语内容"
              rules={[{ required: true, message: "请输入对孩子的学期寄语与鼓励" }]}
            >
              <TextArea
                rows={5}
                placeholder="写下对孩子本学期在德智体美劳各方面表现的肯定、进步与新学期期望..."
                maxLength={500}
                showCount
              />
            </Form.Item>

            <Form.Item name="proxyByStudent" valuePropName="checked">
              <Checkbox>由学生协助代录 (如家长口述、学生协助提交)</Checkbox>
            </Form.Item>

            <Form.Item style={{ marginTop: "24px" }}>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                size="large"
                block
                loading={submitting}
              >
                确认提交寄语
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
};

export default FamilyFeedbackPage;
