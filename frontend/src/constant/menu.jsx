/**
 * 共享菜单配置 — 六育学生综合素质评价系统
 * 精确对齐 docs/ui-prototype 业务架构与分组规范
 */
import React from "react";
import {
  CompassOutlined,
  QrcodeOutlined,
  BookOutlined,
  TrophyOutlined,
  ReadOutlined,
  LineChartOutlined,
  FileProtectOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  FormOutlined,
  CalendarOutlined,
  CreditCardOutlined,
  CloudUploadOutlined,
  ExperimentOutlined,
  SendOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined
} from "@ant-design/icons";

export const menuGroups = {
  student: [
    {
      group: "我的成长",
      items: [
        { key: "/dashboard", path: "/dashboard", label: "成长首页", icon: <CompassOutlined /> },
        { key: "/student/claim", path: "/student/claim", label: "扫卡领取", icon: <QrcodeOutlined /> },
        { key: "/student/ledger", path: "/student/ledger", label: "积分账本", icon: <BookOutlined /> },
        { key: "/student/honors", path: "/student/honors", label: "荣誉申报", icon: <TrophyOutlined /> },
        { key: "/student/stories", path: "/student/stories", label: "月度故事", icon: <ReadOutlined /> }
      ]
    },
    {
      group: "我的学期",
      items: [
        { key: "/student/evaluation", path: "/student/evaluation", label: "综合评价", icon: <LineChartOutlined /> },
        { key: "/student/report", path: "/student/report", label: "学期报告", icon: <FileProtectOutlined /> }
      ]
    }
  ],
  teacher: [
    {
      group: "工作空间",
      items: [
        { key: "/dashboard", path: "/dashboard", label: "工作台", icon: <CompassOutlined /> },
        { key: "/teacher/claims", path: "/teacher/claims", label: "扫卡审核", icon: <CheckCircleOutlined /> },
        { key: "/teacher/direct-score", path: "/teacher/direct-score", label: "无卡直评", icon: <FormOutlined /> },
        { key: "/teacher/honors", path: "/teacher/honors", label: "荣誉审核", icon: <TrophyOutlined /> },
        { key: "/teacher/stories", path: "/teacher/stories", label: "故事评阅", icon: <ReadOutlined /> }
      ]
    },
    {
      group: "班级与学期",
      items: [
        { key: "/admin/import", path: "/admin/import", label: "学科成绩导入", icon: <CloudUploadOutlined /> },
        { key: "/admin/cards", path: "/admin/cards", label: "我的评价卡", icon: <CreditCardOutlined /> },
        { key: "/teacher/report-drafts", path: "/teacher/report-drafts", label: "报告草稿确认", icon: <FileProtectOutlined /> }
      ]
    }
  ],
  manager: [
    {
      group: "学校管理",
      items: [
        { key: "/dashboard", path: "/dashboard", label: "管理概览", icon: <CompassOutlined /> },
        { key: "/admin/terms", path: "/admin/terms", label: "学期与校历", icon: <CalendarOutlined /> },
        { key: "/admin/teaching-assignments", path: "/admin/teaching-assignments", label: "任教授权管理", icon: <TeamOutlined /> },
        { key: "/admin/categories", path: "/admin/categories", label: "六育指标树", icon: <AppstoreOutlined /> }
      ]
    },
    {
      group: "评价业务",
      items: [
        { key: "/admin/cards", path: "/admin/cards", label: "评价卡管理", icon: <CreditCardOutlined /> },
        { key: "/teacher/claims", path: "/teacher/claims", label: "评价卡审核", icon: <CheckCircleOutlined /> },
        { key: "/admin/import", path: "/admin/import", label: "成绩导入", icon: <CloudUploadOutlined /> }
      ]
    },
    {
      group: "核算与发布",
      items: [
        { key: "/admin/rules", path: "/admin/rules", label: "综合评分规则", icon: <ExperimentOutlined /> },
        { key: "/admin/reports", path: "/admin/reports", label: "报告批量发布", icon: <SendOutlined /> },
        { key: "/admin/audits", path: "/admin/audits", label: "审计与冲销", icon: <SafetyCertificateOutlined /> }
      ]
    }
  ]
};

export function getMenuGroupsByRole(role) {
  return menuGroups[role] || menuGroups.student;
}

export function getFlattenMenusByRole(role) {
  const groups = getMenuGroupsByRole(role);
  return groups.flatMap((g) => g.items);
}

export default menuGroups;
