import React, { useState, useEffect } from "react";
import {
  Card, Table, Tag, Typography, Space, Select, Input,
  Row, Col, Button, Spin, message, Alert
} from "antd";
import {
  BookOutlined, SearchOutlined, ReloadOutlined,
  CheckCircleOutlined, ArrowUpOutlined, ArrowDownOutlined
} from "@ant-design/icons";
import { get } from "@/util/request";
import * as urls from "@/constant/urls";

const { Title, Text } = Typography;
const { Option } = Select;

const DIMS = [
  { code: "D", name: "德育", letter: "德" },
  { code: "Z", name: "智育", letter: "智" },
  { code: "T", name: "体育", letter: "体" },
  { code: "M", name: "美育", letter: "美" },
  { code: "L", name: "劳育", letter: "劳" },
  { code: "G", name: "故事", letter: "叙" }
];

const StudentLedger = () => {
  const [loading, setLoading] = useState(true);
  const [scoreData, setScoreData] = useState(null);
  const [filterDim, setFilterDim] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await get(urls.API_STUDENT_SCORES);
      if (res.code === 200) {
        setScoreData(res.data);
      }
    } catch (err) {
      message.error("获取积分账本失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const dimSummary = scoreData?.summary?.dimensions || {};
  const totalProcess = scoreData?.summary?.total_process_score || 0;

  // 过滤记录
  const records = (scoreData?.records || []).filter((r) => {
    if (filterDim && r.dimension_code !== filterDim) return false;
    if (filterSource && r.source !== filterSource) return false;
    if (searchKeyword) {
      const text = `${r.category_name || ""} ${r.category_code || ""} ${r.remark || ""}`;
      if (!text.toLowerCase().includes(searchKeyword.toLowerCase())) return false;
    }
    return true;
  });

  const columns = [
    {
      title: "记账时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (t) => t ? new Date(t).toLocaleString("zh-CN") : "--"
    },
    {
      title: "成长指标",
      key: "category",
      render: (_, r) => (
        <Space>
          <Tag color="cyan">{r.dimension_code}</Tag>
          <span style={{ fontWeight: 600, color: "#25332d" }}>
            {r.category_name || r.category_code}
          </span>
        </Space>
      )
    },
    {
      title: "评价维度",
      dataIndex: "dimension_code",
      key: "dim",
      width: 110,
      render: (d) => {
        const item = DIMS.find(x => x.code === d);
        return <Tag color="green">{item ? `${item.name} (${d})` : d}</Tag>;
      }
    },
    {
      title: "赋分来源",
      dataIndex: "source",
      key: "source",
      width: 140,
      render: (src) => {
        if (src === "A_DIRECT") return <Tag color="blue">无卡直评 (A模式)</Tag>;
        if (src === "B_CARD") return <Tag color="geekblue">扫卡核销 (B模式)</Tag>;
        if (src === "REVERSAL") return <Tag color="red">受控冲销 (审计)</Tag>;
        return <Tag>{src}</Tag>;
      }
    },
    {
      title: "积分变动",
      dataIndex: "delta",
      key: "delta",
      width: 110,
      render: (delta) => {
        const isPos = Number(delta) >= 0;
        return (
          <span style={{
            fontSize: 16,
            fontWeight: 700,
            color: isPos ? "#277460" : "#c45757",
            fontVariantNumeric: "tabular-nums"
          }}>
            {isPos ? `+${delta}` : delta}
          </span>
        );
      }
    },
    {
      title: "考评事由 / 批注",
      dataIndex: "remark",
      key: "remark",
      render: (rmk) => <span style={{ color: "#64748b", fontSize: 13 }}>{rmk || "日常表现激励"}</span>
    }
  ];

  return (
    <div>
      {/* 标题 */}
      <div className="student-page-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}>
            IMMUTABLE PROCESS LEDGER
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>
            积分账本
          </h1>
          <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>
            每一份肯定都有来处，每一次变动都有记录。
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchLedger}>
          刷新流水
        </Button>
      </div>

      {/* 六育过程分总览卡片 */}
      <div className="summary-grid">
        {DIMS.map((d) => {
          const val = dimSummary[d.code] || 0;
          return (
            <div className="dimension-tile" key={d.code}>
              <span className="dimension-letter">{d.letter}</span>
              <div className="value">{val}</div>
              <div className="label">{d.name} · 过程净分</div>
            </div>
          );
        })}
      </div>

      <Card
        title={
          <Space>
            <BookOutlined style={{ color: "#277460" }} />
            <span>过程评价明细流水 (累计净积分: {totalProcess} 分)</span>
          </Space>
        }
        bordered={false}
        extra={
          <Space>
            <Select
              placeholder="维度筛选"
              allowClear
              value={filterDim || undefined}
              onChange={(v) => setFilterDim(v || "")}
              style={{ width: 120 }}
            >
              {DIMS.map(d => (
                <Option key={d.code} value={d.code}>{d.name}</Option>
              ))}
            </Select>

            <Select
              placeholder="来源筛选"
              allowClear
              value={filterSource || undefined}
              onChange={(v) => setFilterSource(v || "")}
              style={{ width: 140 }}
            >
              <Option value="A_DIRECT">无卡直评</Option>
              <Option value="B_CARD">扫卡入账</Option>
              <Option value="REVERSAL">受控冲销</Option>
            </Select>

            <Input
              placeholder="搜索指标或评语"
              prefix={<SearchOutlined style={{ color: "#9aa59e" }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 180 }}
            />
          </Space>
        }
        style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
      >
        <Table
          dataSource={records}
          columns={columns}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: "暂无符合条件的积分流水记录" }}
        />
      </Card>
    </div>
  );
};

export default StudentLedger;
