import React, { useEffect, useRef, useState } from "react";
export default function TermReport({ html, onLayout }) {
  const ref = useRef(),
    observer = useRef();
  const [height, setHeight] = useState(1000);
  useEffect(() => () => observer.current?.disconnect(), []);
  function measure() {
    const d = ref.current?.contentDocument;
    if (!d) return;
    observer.current?.disconnect();
    const resize = () =>
      setHeight(Math.ceil(d.body.getBoundingClientRect().height) + 30);
    resize();
    observer.current = new ResizeObserver(resize);
    observer.current.observe(d.body);
    const probe = document.createElement("iframe");
    probe.style.cssText =
      "position:fixed;left:-10000px;top:0;width:1123px;height:900px;visibility:hidden";
    probe.sandbox = "allow-same-origin";
    probe.srcdoc = html;
    probe.onload = () => {
      const doc = probe.contentDocument;
      const style = doc.createElement("style");
      style.textContent = [...doc.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .filter((rule) => rule.type === 4 && rule.conditionText === "print")
        .flatMap((rule) => [...rule.cssRules].map((r) => r.cssText))
        .join("\n");
      doc.head.append(style);
      const pages = [...doc.querySelectorAll("[data-print-page]")];
      const overflow = pages.some(
        (p) => p.scrollHeight > Math.ceil(p.getBoundingClientRect().height) + 2,
      );
      onLayout?.(!overflow);
      probe.remove();
    };
    document.body.append(probe);
  }
  return (
    <div className="report-preview">
      <div className="report-toolbar">
        <span>报告预览 · 自评与他评分别呈现</span>
        <button onClick={() => ref.current?.contentWindow?.print()}>
          打印 / 保存 PDF
        </button>
      </div>
      <iframe
        title="六育评价报告"
        ref={ref}
        sandbox="allow-same-origin allow-modals"
        srcDoc={html}
        onLoad={measure}
        style={{ width: "100%", height, border: 0 }}
      />
    </div>
  );
}
