import React, { useState, useEffect } from "react";
import {
  Card, Tree, Tag, Typography, Space, Row, Col,
  Button, Spin, message, Alert, Divider
} from "antd";
import {
  AppstoreOutlined, ReloadOutlined, CheckCircleOutlined,
  BranchesOutlined, InfoCircleOutlined
} from "@ant-design/icons";
import { get } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text, Paragraph } = Typography;

const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_CATEGORIES);
      if (res.code === 200) {
        setCategories(res.data || []);
        // 默认选中第一个叶子
        if (res.data?.[0]?.children?.[0]?.children?.[0]) {
          setSelectedNode(res.data[0].children[0].children[0]);
        }
      }
    } catch (err) {
      message.error("获取指标树失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // 将后端三级树转换为 Antd Tree 格式
  const formatTreeData = (nodes) => {
    return nodes.map((n) => ({
      title: (
        <Space>
          <Tag color={n.level === 1 ? "green" : n.level === 2 ? "blue" : "cyan"}>
            {n.category_code}
          </Tag>
          <span style={{ fontWeight: n.level === 1 ? 600 : 400 }}>{n.category_name}</span>
        </Space>
      ),
      key: n.category_code,
      dataRef: n,
      children: n.children && n.children.length > 0 ? formatTreeData(n.children) : undefined
    }));
  };

  const handleSelect = (selectedKeys, info) => {
    if (info.node?.dataRef) {
      setSelectedNode(info.node.dataRef);
    }
  };

  return (
    <div>
      {/* 标题 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}>
            EVALUATION CATEGORY TAXONOMY
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>
            六育指标字典
          </h1>
          <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>
            三级指标统一管理，已使用的历史版本保留可追溯。
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchCategories}>
          刷新指标树
        </Button>
      </div>

      <Row gutter={24}>
        <Col span={13}>
          <Card
            title={
              <Space>
                <BranchesOutlined style={{ color: "#277460" }} />
                <span>105项三级行为评价指标体系 (标准字典树)</span>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7", minHeight: 600 }}
          >
            {loading ? (
              <div style={{ textAlign: "center", padding: "50px 0" }}><Spin /></div>
            ) : (
              <Tree
                showLine
                defaultExpandAll
                treeData={formatTreeData(categories)}
                onSelect={handleSelect}
              />
            )}
          </Card>
        </Col>

        <Col span={11}>
          <Card
            title={
              <Space>
                <InfoCircleOutlined style={{ color: "#277460" }} />
                <span>指标详情与规约属性</span>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            {selectedNode ? (
              <div>
                <div style={{
                  background: "#f8faf9",
                  padding: "16px 20px",
                  borderRadius: 8,
                  border: "1px solid #e8eee9",
                  marginBottom: 16
                }}>
                  <div style={{ fontSize: 12, color: "#748578", marginBottom: 4 }}>指标代码</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#1e382b" }}>
                    {selectedNode.category_code}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#277460", marginTop: 4 }}>
                    {selectedNode.category_name}
                  </div>
                </div>

                <div style={{ fontSize: 13, color: "#3d4e42", lineHeight: 2.2 }}>
                  <div><strong>层级属性</strong>：第 {selectedNode.level || 3} 级指标</div>
                  <div><strong>归属六育主维度</strong>：<Tag color="green">{selectedNode.dimension_code || "标准维度"}</Tag></div>
                  <div><strong>标准赋分额度</strong>：固定 <Tag color="blue">+1.00 过程分</Tag></div>
                  <div><strong>指标有效性</strong>：<Tag color="cyan">生效中 (ACTIVE)</Tag></div>
                  <div><strong>版本控制</strong>：V1.0 (不可篡改冻结版本)</div>
                </div>

                <Divider style={{ margin: "16px 0" }} />

                <Alert
                  message="系统不变量约束"
                  description="三级指标一旦在生产环境中被任课教师直评或通过实体卡扫码入账，该指标节点即被永久加锁。停用仅影响新增业务，绝不篡改历史积分流水与期末汇算快照。"
                  type="info"
                  showIcon
                  style={{ borderRadius: 8 }}
                />
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#8d9c90" }}>
                请点击左侧树节点查看详情
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AdminCategories;
