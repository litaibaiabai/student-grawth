import React, { useEffect, useState } from "react";
import { api } from "../../core/api";
import TermReport from "../../../component/TermReport";

export default function PublishedReport({ ctx }) {
  const [report, setReport] = useState(undefined);
  useEffect(() => {
    api(`/report-core/reports/current?termId=${ctx.termId}`)
      .then(setReport)
      .catch(ctx.error);
  }, [ctx.termId, ctx.refreshKey, ctx.sessionActive, ctx.error]);
  if (ctx.sessionActive === false)
    return <section className="panel">请重新登录后读取报告。</section>;
  return report ? (
    <TermReport html={report.html} />
  ) : (
    <section className="panel empty">
      <h2>期末报告尚未发布</h2>
      <p>完成材料与自我评价后，由学校统一发布。发布后可在这里阅读和打印。</p>
    </section>
  );
}
export { PublishedReport };
