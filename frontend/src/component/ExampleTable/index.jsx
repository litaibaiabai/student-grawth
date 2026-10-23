import React from "react";
import { Card, Space, Tag, Table } from "antd";

/**
 * 示例表格组件
 * 展示 Antd Table 的通用用法，模板使用者可参考此组件编写表格页面
 */
const ExampleTable = () => {
  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 80
    },
    {
      title: "用户名",
      dataIndex: "username",
      key: "username"
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      render: (role) => {
        const colorMap = { admin: "red", user: "blue", guest: "default" };
        return <Tag color={colorMap[role] || "default"}>{role}</Tag>;
      }
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt"
    }
  ];

  const data = [
    { id: 1, username: "admin", role: "admin", createdAt: "2024-01-01" },
    { id: 2, username: "张三", role: "user", createdAt: "2024-01-15" },
    { id: 3, username: "李四", role: "user", createdAt: "2024-02-01" }
  ];

  return (
    <Card title="示例表格">
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        pagination={false}
      />
    </Card>
  );
};

export default ExampleTable;
