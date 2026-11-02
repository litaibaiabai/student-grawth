import React, { useEffect, useState, useRef } from "react";
import { api } from "../../core/api";
import SourceList from "../../shared/materials/SourceList";

export default function LegacyAwardUpload({ ctx }) {
  const [file, setFile] = useState(null), [preview, setPreview] = useState(''), [fileError, setFileError] = useState('');
  const fileInput = useRef(null);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <>
      <section className="panel">
        <h2>上传奖状</h2>
        <p>
          {ctx.catalog.schemaVersion === 'SIX_EDU_V2'
            ? '支持PNG、JPEG或10页以内PDF，最大10MiB，教师审核后形成荣誉记录。'
            : '上传清晰的PNG/JPEG图片，最大5MB。识别或人工确认后形成特长与成果记录。'}
        </p>
        <input
          ref={fileInput}
          aria-label="奖状文件"
          type="file"
          accept={
            ctx.catalog.schemaVersion === 'SIX_EDU_V2'
              ? 'image/png,image/jpeg,application/pdf'
              : 'image/png,image/jpeg'
          }
          onChange={(e) => {
            const next = e.target.files?.[0];
            setFileError('');
            if (!next) return;
            if (
              ![
                'image/png',
                'image/jpeg',
                ...(ctx.catalog.schemaVersion === 'SIX_EDU_V2'
                  ? ['application/pdf']
                  : []),
              ].includes(next.type) ||
              next.size >
                (ctx.catalog.schemaVersion === 'SIX_EDU_V2' ? 10 : 5) *
                  1024 *
                  1024
            ) {
              setFile(null);
              setFileError(
                ctx.catalog.schemaVersion === 'SIX_EDU_V2'
                  ? '请选择10MiB以内的PNG、JPEG或10页以内PDF'
                  : '请选择5MB以内的PNG或JPEG图片',
              );
              e.target.value = '';
              return;
            }
            setFile(next);
          }}
        />
        {fileError && <p role="alert">{fileError}</p>}
        {preview && file && (
          <div className="award-preview">
            {file.type === 'application/pdf' ? (
              <object
                data={preview}
                type="application/pdf"
                aria-label="待提交奖状PDF预览"
              />
            ) : (
              <img src={preview} alt="待提交奖状预览" />
            )}
            <div>
              <strong>{file.name}</strong>
              <p>请检查姓名、奖项和日期是否清晰。</p>
              <button onClick={() => fileInput.current?.click()}>
                重新选择图片
              </button>
            </div>
          </div>
        )}
        <button
          className="primary"
          disabled={!file}
          onClick={() =>
            ctx.run(async () => {
              const data = new FormData();
              data.set("file", file);
              data.set("termId", ctx.termId);
              data.set("requestKey", crypto.randomUUID());
              await api("/report-core/certificates", data);
              setFile(null);
              if (fileInput.current) fileInput.current.value = '';
              ctx.refresh();
              ctx.notify("奖状已提交，等待识别与认定");
            })
          }
        >
          提交奖状
        </button>
      </section>
      <SourceList ctx={ctx} types={["CERTIFICATE"]} />
    </>
  );
}
export { LegacyAwardUpload };
