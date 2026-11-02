import React from "react";
import { api } from "../../core/api";
import { statusName } from "../../core/materialStatus";

// Shared module API intentionally includes this non-component export.
// eslint-disable-next-line react-refresh/only-export-components
export const storyLabels = { READ: '我爱读故事', LISTEN: '我爱听故事', TELL: '我爱讲故事' };

export function SourceList({ ctx, types }) {
  const rows = ctx.sources.filter((s) => types.includes(s.source_type));
  return (
    <section className="panel">
      <h2>提交与处理记录</h2>
      {!rows.length ? (
        <p className="empty">还没有材料记录</p>
      ) : (
        rows.map((s) => (
          <div className="source-row" key={s.id}>
            <div>
              <strong>
                {s.source_type === "STORY"
                  ? storyLabels[s.payload.category] || "整月故事"
                  : s.source_type === "SELF" ? (s.payload.action === "INVALIDATE_NO_AWARD" ? "奖状撤回记录" : "自评保存记录") : s.payload.facts?.title || "奖状材料"}{" "}
                <small>#{s.id}</small>
              </strong>
              <p>
                {s.month_key}{" "}
                {s.payload.score?.total !== undefined
                  ? `评分 ${s.payload.score.total} 分 · ${s.payload.score.feedback}`
                  : s.payload.lastError || ""}
              </p>
            </div>
            <span className={`status ${s.status === "FAILED" ? "warn" : ""}`}>
              {statusName[s.status] || s.status}
            </span>
            {s.source_type === "CERTIFICATE" &&
              ctx.actor.role === "student" &&
              s.status !== "REVOKED" && (
                <button
                  onClick={() =>
                    ctx.run(async () => {
                      await api(`/report-core/certificates/${s.id}/revoke`, {
                        reason: "本人撤回",
                      });
                      ctx.refresh();
                      ctx.notify("已撤回并重新汇总");
                    })
                  }
                >
                  撤回
                </button>
              )}
          </div>
        ))
      )}
    </section>
  );
}
export default SourceList;
