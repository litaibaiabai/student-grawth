import React, { useEffect, useId, useRef } from 'react';
export function StarPicker({ label, value, onChange, disabled }) {
  const name = useId();
  return <fieldset className="core-stars" disabled={disabled}><legend>{label}</legend>{[1,2,3].map(n => <label key={n}><input name={name} type="radio" checked={Number(value) === n} onChange={() => onChange(n)} aria-label={`${label} ${n}星`}/><span aria-hidden="true">{'★'.repeat(n)}</span></label>)}</fieldset>;
}
export const StatusBadge = ({ children }) => <span className="core-badge">{children}</span>;
export const EmptyState = ({ title, children }) => <section className="panel empty"><h2>{title}</h2><p>{children}</p></section>;
export function ConfirmDialog({ open, title, children, onConfirm, onCancel, busy = false, returnFocusRef }) {
  const ref = useRef(null), titleId = useId();
  useEffect(() => {
    const previous = document.activeElement, returnTarget = returnFocusRef?.current || previous, dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); returnTarget?.focus(); };
  }, [open, returnFocusRef]);
  return <dialog ref={ref} className="core-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}><h2 id={titleId}>{title}</h2>{children}<div className="actions"><button disabled={busy} onClick={onCancel}>取消</button><button className="primary" disabled={busy} onClick={onConfirm}>{busy ? '正在处理…' : '确认'}</button></div></dialog>;
}

// Shared module API intentionally includes this non-component export.
// eslint-disable-next-line react-refresh/only-export-components
export function useDraftGuard(ctx, dirty, message) {
  const { setLeaveGuard } = ctx;
  const latest = useRef(dirty);
  latest.current = dirty;
  useEffect(() => {
    setLeaveGuard?.(
      () =>
        !latest.current ||
        window.confirm(
          message || '有未提交的输入，离开会放弃本次填写。是否离开？',
        ),
    );
    const protect = (e) => {
      if (latest.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => {
      setLeaveGuard?.(null);
      window.removeEventListener('beforeunload', protect);
    };
  }, [setLeaveGuard, message]);
}
