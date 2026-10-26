import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  Form,
  Select,
  Input,
  Button,
  Tag,
  Space,
  Alert,
  Row,
  Col,
  message,
  Modal,
  Typography,
  Checkbox,
  Spin,
  Divider
} from "antd";
import {
  FormOutlined,
  CheckCircleOutlined,
  UserOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined
} from "@ant-design/icons";
import { get, post } from "@/util/request";
import * as urls from "@/constant/urls";

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// 默认兜底预设六育维度与指标体系（对齐 SPEC V2.0 与 ui-prototype）
const DEFAULT_DIMENSIONS = [
  { code: "D", name: "德育" },
  { code: "Z", name: "智育" },
  { code: "T", name: "体育" },
  { code: "M", name: "美育" },
  { code: "L", name: "劳育" },
  { code: "G", name: "故事" }
];

const TeacherDirectScore = () => {
  const [categoriesTree, setCategoriesTree] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 筛选与选择状态
  const [selectedClass, setSelectedClass] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [studentRemarks, setStudentRemarks] = useState({});

  // 指标选择联动状态
  const [selectedDim, setSelectedDim] = useState("D");
  const [selectedL2, setSelectedL2] = useState(null);
  const [selectedL3, setSelectedL3] = useState(null);
  const [commonRemark, setCommonRemark] = useState("");

  // 获取指标树与学生名单
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [catRes, stuRes] = await Promise.allSettled([get(urls.API_CATEGORIES), get(urls.API_STUDENTS_LIST)]);

        if (
          catRes.status === "fulfilled" &&
          catRes.value?.code === 200 &&
          Array.isArray(catRes.value.data) &&
          catRes.value.data.length > 0
        ) {
          setCategoriesTree(catRes.value.data);
        }

        if (
          stuRes.status === "fulfilled" &&
          stuRes.value?.code === 200 &&
          Array.isArray(stuRes.value.data) &&
          stuRes.value.data.length > 0
        ) {
          setStudents(stuRes.value.data);
        } else {
          setStudents([]);
        }
      } catch {
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 二级指标列表
  const level2Options = useMemo(() => {
    if (categoriesTree.length > 0) {
      const rootNode = categoriesTree.find((n) => (n.code || n.category_code) === selectedDim);
      if (rootNode && Array.isArray(rootNode.children) && rootNode.children.length > 0) {
        return rootNode.children.map((c) => ({
          code: c.code || c.category_code,
          name: c.name || c.category_name,
          children: c.children || []
        }));
      }
    }
    return [];
  }, [categoriesTree, selectedDim]);

  // 当主维度变更时，二、三级由下方联动重置
  const handleDimChange = (dim) => {
    setSelectedDim(dim);
  };

  // 三级指标列表
  const level3Options = useMemo(() => {
    if (categoriesTree.length > 0 && selectedL2) {
      for (const root of categoriesTree) {
        for (const sub of root.children || []) {
          if ((sub.code || sub.category_code) === selectedL2) {
            return (sub.children || []).map((leaf) => ({
              id: leaf.id,
              code: leaf.code || leaf.category_code,
              name: leaf.name || leaf.category_name
            }));
          }
        }
      }
    }
    return [];
  }, [categoriesTree, selectedL2]);

  // 二、三级选项变化后，若当前选中项已不在列表中，则选中第一项
  useEffect(() => {
    if (!level2Options.some((o) => o.code === selectedL2)) setSelectedL2(level2Options[0]?.code ?? null);
  }, [level2Options, selectedL2]);

  useEffect(() => {
    if (!level3Options.some((o) => o.id === selectedL3)) setSelectedL3(level3Options[0]?.id ?? null);
  }, [level3Options, selectedL3]);

  // 当二级指标变更时，三级由上方联动重置
  const handleL2Change = (l2Code) => {
    setSelectedL2(l2Code);
  };

  // 过滤后的学生名单
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // 班级筛选
      if (selectedClass !== "all") {
        const classKey = `${s.grade || 4}-${s.class_no || 1}`;
        if (classKey !== selectedClass) return false;
      }
      // 关键字搜索
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const nameMatch = (s.real_name || s.username || "").toLowerCase().includes(kw);
        const codeMatch = String(s.id || s.code || "").includes(kw);
        return nameMatch || codeMatch;
      }
      return true;
    });
  }, [students, selectedClass, searchKeyword]);

  // 全选 / 取消全选当前列表
  const handleToggleSelectAll = (checked) => {
    if (checked) {
      const allIds = filteredStudents.map((s) => s.id);
      setSelectedStudentIds(Array.from(new Set([...selectedStudentIds, ...allIds])));
    } else {
      const filteredIdSet = new Set(filteredStudents.map((s) => s.id));
      setSelectedStudentIds(selectedStudentIds.filter((id) => !filteredIdSet.has(id)));
    }
  };

  const isAllSelected = filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.includes(s.id));

  // 单个学生选择
  const handleStudentCheck = (studentId, checked) => {
    if (checked) {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    } else {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    }
  };

  // 提交直评发分
  const handleConfirmSubmit = async () => {
    if (selectedStudentIds.length === 0) {
      return message.warning("请至少选择一位学生进行评价");
    }
    if (!selectedL3) {
      return message.warning("请选择具体三级成长指标");
    }

    const currentLeaf = level3Options.find((o) => o.id === selectedL3) || { id: selectedL3, name: "主动帮助同学" };

    Modal.confirm({
      title: "确认发起无卡直评？",
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <p>
            本次将为选中的 <strong>{selectedStudentIds.length}</strong> 位学生记入过程积分：
          </p>
          <div style={{ background: "#f6f8f5", padding: "10px 14px", borderRadius: 8, margin: "8px 0" }}>
            <div>
              <strong>评价指标</strong>：{currentLeaf.name} ({currentLeaf.code || "D03-01"})
            </div>
            <div>
              <strong>赋分标准</strong>：固定 <strong>+1 过程积分</strong>
            </div>
            {commonRemark && (
              <div>
                <strong>共同备注</strong>：{commonRemark}
              </div>
            )}
          </div>
          <p style={{ color: "#7a8a7e", fontSize: 12 }}>由系统规则加盖教师数字签名并写入不可逆过程账本。</p>
        </div>
      ),
      okText: "确认发分 (+1)",
      cancelText: "取消",
      okButtonProps: { style: { background: "#277460", borderColor: "#277460" } },
      onOk: async () => {
        setSubmitting(true);
        try {
          const res = await post(urls.API_DIRECT_SCORE, {
            studentIds: selectedStudentIds,
            student_ids: selectedStudentIds,
            categoryId: currentLeaf.id,
            category_id: currentLeaf.id,
            categoryCode: currentLeaf.code,
            category_code: currentLeaf.code,
            remark: commonRemark.trim() || undefined
          });

          if (res.code === 200) {
            message.success(
              `批量直评完成！已为 ${res.data?.count || selectedStudentIds.length} 名学生正式入账 +1 过程积分`
            );
            setSelectedStudentIds([]);
            setCommonRemark("");
          } else {
            message.error(res.message || "直评提交失败");
          }
        } catch (err) {
          if (!err.handled) message.error(err.message || "直评提交失败");
        } finally {
          setSubmitting(false);
        }
      }
    });
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{ fontSize: 10, letterSpacing: 1.5, color: "#8d9c90", fontWeight: 700, textTransform: "uppercase" }}
        >
          TEACHER DIRECT EVALUATION
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1e382b", margin: "6px 0 4px" }}>无卡直评</h1>
        <p style={{ color: "#748578", fontSize: 13, margin: 0 }}>选择学生与成长指标，每位学生本次固定记 +1。</p>
      </div>

      <Row gutter={24}>
        {/* 左侧面板：01 选择学生 */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <UserOutlined style={{ color: "#277460" }} />
                <span>01　选择学生</span>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            {/* 班级与搜索筛选 */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <Select value={selectedClass} onChange={setSelectedClass} style={{ width: 140 }}>
                <Option value="all">全部班级</Option>
                <Option value="4-1">四年级（1）班</Option>
                <Option value="4-2">四年级（2）班</Option>
                <Option value="5-1">五年级（1）班</Option>
              </Select>
              <Input
                placeholder="搜索姓名或学号"
                prefix={<SearchOutlined style={{ color: "#9aa69c" }} />}
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                allowClear
                style={{ flex: 1, borderRadius: 8 }}
              />
            </div>

            {/* 学生选择列表 */}
            <div
              style={{
                maxHeight: 420,
                overflowY: "auto",
                border: "1px solid #eef2ee",
                borderRadius: 8,
                padding: "4px 8px",
                background: "#fafcf9"
              }}
            >
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <Spin />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca89e" }}>未找到匹配的学生</div>
              ) : (
                filteredStudents.map((stu) => {
                  const isChecked = selectedStudentIds.includes(stu.id);
                  return (
                    <div
                      key={stu.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "10px 8px",
                        borderBottom: "1px solid #f0f3ef",
                        background: isChecked ? "#f0f7f3" : "transparent",
                        borderRadius: 6,
                        margin: "4px 0",
                        transition: "background 0.2s"
                      }}
                    >
                      <Checkbox
                        checked={isChecked}
                        onChange={(e) => handleStudentCheck(stu.id, e.target.checked)}
                        style={{ marginRight: 12 }}
                      />
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: isChecked ? "#277460" : "#d7e3da",
                          color: isChecked ? "#fff" : "#45594b",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 600,
                          marginRight: 10
                        }}
                      >
                        {(stu.real_name || stu.username || "生").slice(0, 1)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#25332d" }}>
                          {stu.real_name || stu.username}
                        </div>
                        <div style={{ fontSize: 11, color: "#8d9c90" }}>
                          {stu.grade}年级（{stu.class_no}）班 · 学号 2026040{stu.id}
                        </div>
                      </div>
                      <Input
                        placeholder="个人备注（可选）"
                        size="small"
                        value={studentRemarks[stu.id] || ""}
                        onChange={(e) => setStudentRemarks({ ...studentRemarks, [stu.id]: e.target.value })}
                        style={{ width: 130, borderRadius: 6, fontSize: 12 }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  );
                })
              )}
            </div>

            {/* 底部全选与计数栏 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 12,
                padding: "8px 4px",
                fontSize: 13,
                color: "#56675a"
              }}
            >
              <Checkbox checked={isAllSelected} onChange={(e) => handleToggleSelectAll(e.target.checked)}>
                全选当前班级
              </Checkbox>
              <span>
                已选 <strong style={{ color: "#277460", fontSize: 15 }}>{selectedStudentIds.length}</strong> 位学生
              </span>
            </div>
          </Card>
        </Col>

        {/* 右侧面板：02 选择评价指标 */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <FormOutlined style={{ color: "#277460" }} />
                <span>02　选择评价指标</span>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 12, border: "1px solid #e6ebe7" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* 六育维度 */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3a4a3e", marginBottom: 6 }}>
                  六育维度
                </label>
                <Select value={selectedDim} onChange={handleDimChange} style={{ width: "100%" }}>
                  {DEFAULT_DIMENSIONS.map((d) => (
                    <Option key={d.code} value={d.code}>
                      {d.name} ({d.code})
                    </Option>
                  ))}
                </Select>
              </div>

              {/* 二级指标 */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3a4a3e", marginBottom: 6 }}>
                  二级指标
                </label>
                <Select
                  value={selectedL2}
                  onChange={handleL2Change}
                  style={{ width: "100%" }}
                  placeholder="选择二级分类"
                >
                  {level2Options.map((l2) => (
                    <Option key={l2.code} value={l2.code}>
                      {l2.name} ({l2.code})
                    </Option>
                  ))}
                </Select>
              </div>

              {/* 三级成长指标 */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3a4a3e", marginBottom: 6 }}>
                  三级成长指标 (本次固定 +1 过程积分)
                </label>
                <Select
                  value={selectedL3}
                  onChange={setSelectedL3}
                  style={{ width: "100%" }}
                  placeholder="选择三级行为规则"
                >
                  {level3Options.map((l3) => (
                    <Option key={l3.id} value={l3.id}>
                      [{l3.code}] {l3.name}
                    </Option>
                  ))}
                </Select>
                <div style={{ fontSize: 12, color: "#8d9c90", marginTop: 4 }}>
                  正式版根据校方启用的六育三级指标树实时联动。
                </div>
              </div>

              {/* 共同备注 */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3a4a3e", marginBottom: 6 }}>
                  共同备注（选填）
                </label>
                <TextArea
                  rows={3}
                  value={commonRemark}
                  onChange={(e) => setCommonRemark(e.target.value)}
                  placeholder="记录这次值得肯定的集体表现或课堂事由…"
                  style={{ borderRadius: 8 }}
                />
                <div style={{ fontSize: 12, color: "#8d9c90", marginTop: 4 }}>
                  可以在左侧为每位学生单独补充个人备注。
                </div>
              </div>

              {/* 规范提示 */}
              <Alert
                message="赋分规则存证"
                description="本次评价固定每人 +1 过程积分，由系统规则记账并加盖教师数字签章，实时计入学生过程成长账本。"
                type="info"
                showIcon
                style={{ borderRadius: 8 }}
              />

              {/* 确认操作按钮 */}
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <Button
                  type="primary"
                  size="large"
                  onClick={handleConfirmSubmit}
                  loading={submitting}
                  disabled={selectedStudentIds.length === 0}
                  style={{
                    background: selectedStudentIds.length === 0 ? "#ccc" : "#277460",
                    borderColor: selectedStudentIds.length === 0 ? "#ccc" : "#277460",
                    borderRadius: 8,
                    fontWeight: 600,
                    padding: "0 28px",
                    height: 44
                  }}
                >
                  确认评价 ({selectedStudentIds.length} 位学生)
                </Button>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default TeacherDirectScore;
