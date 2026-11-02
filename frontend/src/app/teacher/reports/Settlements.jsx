import React, { useState } from "react";
import { api, allStudents } from "../../core/api";
import TeacherSpecialties from "../direct/TeacherSpecialties";

const subjectFor = (column) =>
  ({
    conduct: "CONDUCT",
    moral: "MORAL",
    chinese: "CHINESE",
    math: "MATH",
    science: "SCIENCE",
    english: "ENGLISH",
    pe: "PE",
    fitness: "PE",
    music: "MUSIC",
    fine: "FINE_ART",
    information: "INFORMATION_TECHNOLOGY",
    labor: "LABOR",
    integrated: "INTEGRATED_PRACTICE",
    local: "LOCAL_COURSE",
    story: "STORY",
  })[column.split("_")[0]];

export default function Settlements({ ctx }) {
  const classes = [
    ...new Set(
      ctx.students.map((s) => `${s.grade_snapshot}:${s.class_no_snapshot}`),
    ),
  ];
  const [cls, setCls] = useState(classes[0] || ""),
    [kind, setKind] = useState("CARD_CLOSED");
  const [currentGrade, currentClass] = cls.split(":").map(Number);
  const myClass = ctx.assignments.filter(
    (a) => a.grade === currentGrade && a.class_no === currentClass,
  );
  const targets =
    kind === "CARD_CLOSED"
      ? ctx.catalog.fields
          .filter(
            (f) =>
              f.sourceType === "CARD" &&
              !f.jsonPath &&
              (subjectFor(f.column) === "CONDUCT" ||
                myClass.some(
                  (a) => a.subject_code === subjectFor(f.column),
                )),
          )
          .map((f) => f.column)
      : [
          ...ctx.catalog.fields
            .filter((f) => f.sourceType === "CERTIFICATE" && !f.jsonPath)
            .map((f) => f.column),
          "sports_specialties",
          "art_specialties",
        ].filter((column) =>
          myClass.some(
            (a) =>
              a.is_head_teacher ||
              a.subject_code === subjectFor(column) ||
              (column === "sports_specialties" && a.subject_code === "PE") ||
              (column === "art_specialties" &&
                ["MUSIC", "FINE_ART"].includes(a.subject_code)),
          ),
        );
  return (
    <>
      <div className="actions"><button onClick={() => ctx.navigate("drafts")}>返回六育综合情况</button></div>
      {ctx.catalog.schemaVersion !== "SIX_EDU_V2" && <TeacherSpecialties ctx={ctx} />}
      <section className="panel">
        <h2>采集结算</h2>
        <p>
          完成记录后再结算。真实零积分折为一星；暂无奖状保持空值，不虚构成果。
        </p>
        <label>
          班级
          <select
            aria-label="结算班级"
            value={cls}
            onChange={(e) => setCls(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c} value={c}>
                {c.replace(":", "年级")}班
              </option>
            ))}
          </select>
        </label>
        <label>
          结算内容
          <select
            aria-label="结算内容"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="CARD_CLOSED">本班所负责卡项目采集完成</option>
            <option value="NO_AWARD">本班成果材料已经全部处理</option>
          </select>
        </label>
        <button
          className="primary"
          onClick={() =>
            ctx.run(async () => {
              const [grade, classNo] = cls.split(":").map(Number);
              const currentStudents = await allStudents(ctx.termId);
              const expectedRevisions = Object.fromEntries(
                currentStudents
                  .filter(
                    (s) =>
                      s.grade_snapshot === grade &&
                      s.class_no_snapshot === classNo,
                  )
                  .map((s) => [s.student_id, s.revision]),
              );
              await api("/report-core/settlements", {
                termId: ctx.termId,
                grade,
                classNo,
                targetKeys: targets,
                settlement: kind,
                expectedRevisions,
              });
              ctx.refresh();
              ctx.notify("采集结算已完成");
            })
          }
        >
          确认结算
        </button>
      </section>
    </>
  );
}
export { Settlements };
