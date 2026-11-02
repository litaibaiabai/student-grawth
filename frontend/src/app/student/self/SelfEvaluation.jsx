import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../core/api';
import { StarPicker } from '../../core/ui';
import { CloudMascot } from '../../core/illustrations';
import { buildSelfGroups, getSelfProgress, mergeSelfDraft } from './selfEvaluationModel';
import './selfEvaluation.css';

export default function SelfEvaluation({ ctx }) {
  const { setLeaveGuard, error: onError, termId } = ctx;
  const actorId = ctx.actor.id;
  const [view, setView] = useState(null),
    [step, setStep] = useState(0),
    [dirty, setDirty] = useState({}),
    [special, setSpecial] = useState([]),
    [saving, setSaving] = useState(false),
    [conflicts, setConflicts] = useState([]),
    [message, setMessage] = useState('');
  const current = useRef({ dirty, special });
  current.current = { dirty, special };
  useEffect(() => {
    setLeaveGuard?.(
      () =>
        (!Object.keys(current.current.dirty).length &&
          !current.current.special.length) ||
        window.confirm('还有未保存的评价，离开会放弃本次填写。是否离开？'),
    );
    return () => setLeaveGuard?.(null);
  }, [setLeaveGuard]);
  const read = useCallback(
    () => api(`/report-core/evaluations/${actorId}?termId=${termId}`),
    [actorId, termId],
  );
  useEffect(() => {
    let active = true;
    read()
      .then((v) => {
        if (active) setView(v);
      })
      .catch(onError);
    return () => {
      active = false;
    };
  }, [read, onError]);
  useEffect(() => {
    const handler = (e) => {
      if (
        Object.keys(current.current.dirty).length ||
        current.current.special.length
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  if (!view)
    return (
      <section className="panel" role="status">
        正在打开我的成长手册…
      </section>
    );
  const groups = buildSelfGroups(view, ctx.catalog),
    values = { ...view.values, ...dirty };
  const overlay = (array, collection) =>
    (array || []).map((x) => {
      const c = special.find(
        (s) => s.id === x.id && s.collection === collection,
      );
      return c ? { ...x, ...c.changes } : x;
    });
  const progress = getSelfProgress(
    {
      ...view,
      values,
      sportsSpecialties: overlay(view.sportsSpecialties, 'sports'),
      artSpecialties: overlay(view.artSpecialties, 'art'),
    },
    ctx.catalog,
  );
  const setValue = (column, value) =>
    setDirty((old) => ({ ...old, [column]: value }));
  const setStar = (collection, id, value) =>
    setSpecial((old) => [
      ...old.filter((x) => !(x.collection === collection && x.id === id)),
      { collection, id, changes: { self_star: value } },
    ]);
  const tooLong = Object.entries(values).some(
    ([k, v]) =>
      typeof v === 'string' &&
      [...v].length > (k === 'family_message' ? 1000 : 2000),
  );
  const save = async () => {
    const sent = current.current,
      base = view;
    setSaving(true);
    setMessage('');
    ctx.notify('');
    try {
      await api(
        `/report-core/forms/${actorId}`,
        {
          termId: termId,
          expectedRevision: view.revision,
          values: sent.dirty,
          specialtyChanges: sent.special,
        },
        'PATCH',
      );
      const fresh = await read();
      setDirty((now) =>
        Object.fromEntries(
          Object.entries(now).filter(
            ([k, v]) => !Object.hasOwn(sent.dirty, k) || sent.dirty[k] !== v,
          ),
        ),
      );
      setSpecial((now) =>
        now.filter(
          (x) =>
            !sent.special.some(
              (y) =>
                y.id === x.id &&
                y.collection === x.collection &&
                y.changes.self_star === x.changes.self_star,
            ),
        ),
      );
      setView(fresh);
      setMessage('');
      ctx.notify('评价已保存');
    } catch (error) {
      if (error.status === 409) {
        try {
          const fresh = await read();
          const merged = mergeSelfDraft({
            base,
            local: current.current.dirty,
            remote: fresh,
            specialtyChanges: current.current.special,
          });
          setView(fresh);
          setDirty(merged.merged);
          setSpecial(merged.specialtyChanges);
          setConflicts(merged.conflicts);
          setMessage(
            merged.removedSpecialtyIds.length
              ? '特长项目已撤回，相关修改已移除；其他输入保留。'
              : '内容有更新，请核对冲突后再次保存。',
          );
        } catch (e) {
          onError(e);
        }
      } else onError(error);
    } finally {
      setSaving(false);
    }
  };
  const resolve = (conflict, useLocal) => {
    if (!useLocal) {
      if (conflict.specialty)
        setStar(
          conflict.specialty.collection,
          conflict.specialty.id,
          conflict.remote,
        );
      else setValue(conflict.field, conflict.remote);
    }
    setConflicts((old) => old.filter((x) => x.field !== conflict.field));
  };
  const groupLabels = {
    conduct: '日常行为',
    health: '健康与运动',
    art: '音乐与美术',
    narrative: '成长记录',
  };
  const groupSpecialties = (key) => {
    if (ctx.catalog.schemaVersion === 'SIX_EDU_V2') return [];
    if (key === 'health') return overlay(view.sportsSpecialties, 'sports');
    if (key === 'art') return overlay(view.artSpecialties, 'art');
    return [];
  };
  const groupProgress = (group) => {
    const specialties = groupSpecialties(group.key);
    const complete = group.fields.filter((field) =>
      field.valueType === 'text'
        ? String(values[field.column] || '').trim()
        : [1, 2, 3].includes(Number(values[field.column])),
    ).length + specialties.filter((item) => [1, 2, 3].includes(Number(item.self_star))).length;
    return { complete, total: group.fields.length + specialties.length };
  };
  const goToGroup = (group, index) => {
    setStep(index);
    const section = document.getElementById(`self-group-${group.key}`);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'nearest',
    });
  };
  return (
    <section className="panel self-book self-overview">
      <div className="self-welcome">
        <CloudMascot />
        <div>
          <p className="kicker">我的成长手册</p>
          <h2>给自己点星星</h2>
          <p>所有方向都在这里，想一想自己的表现，给自己点星星。</p>
        </div>
        <div className="self-overall-progress" role="status" aria-live="polite">
          <span>已完成 <strong>{progress.complete}</strong> / {progress.total}</span>
          <progress aria-label="自我评价完成进度" value={progress.complete} max={progress.total || 1} />
        </div>
      </div>
      <nav className="self-directions" aria-label="自评方向定位">
        {groups.map((group, index) => {
          const count = groupProgress(group);
          return (
            <button
              key={group.key}
              aria-current={step === index ? 'location' : undefined}
              aria-controls={`self-group-${group.key}`}
              onClick={() => goToGroup(group, index)}
            >
              <span className="self-direction-number" aria-hidden="true">0{index + 1}</span>
              {groupLabels[group.key]}
              <small>{count.complete} / {count.total}</small>
            </button>
          );
        })}
      </nav>
      {!view.editable && <p className="self-lock-note" role="status">{view.lockReason}</p>}
      <div className="self-group-grid">
        {groups.map((group, index) => {
          const count = groupProgress(group);
          const specialties = groupSpecialties(group.key);
          const collection = group.key === 'health' ? 'sports' : 'art';
          return (
            <section
              key={group.key}
              id={`self-group-${group.key}`}
              className={`self-group self-group-${group.key}`}
              aria-labelledby={`self-heading-${group.key}`}
              tabIndex={-1}
            >
              <header className="self-group-heading">
                <span className="self-group-number" aria-hidden="true">0{index + 1}</span>
                <h3 id={`self-heading-${group.key}`}>{groupLabels[group.key]}</h3>
                <span className="self-group-count">{count.complete} / {count.total}</span>
              </header>
              <div className="self-fields">
                {group.fields.map((field, fieldIndex) =>
                  field.valueType === 'text' ? (
                    <details
                      className="self-text-panel"
                      key={field.column}
                      open={fieldIndex >= 5 || undefined}
                    >
                      <summary>
                        <span>{field.label}</span>
                        <small>{values[field.column]?.trim() ? '已填写' : '想一想，写下来'}</small>
                      </summary>
                      <label>
                        <span className="sr-only">{field.label}</span>
                        <textarea
                          aria-label={field.label}
                          rows={5}
                          disabled={!view.editable}
                          value={values[field.column] || ''}
                          onChange={(e) => setValue(field.column, e.target.value)}
                          placeholder="记录一件你做过的事，或一次让你开心的进步…"
                        />
                        <small>{[...(values[field.column] || '')].length} / 2000 字</small>
                      </label>
                    </details>
                  ) : (
                    <div
                      className={`self-star-card${[1, 2, 3].includes(Number(values[field.column])) ? ' is-rated' : ''}`}
                      key={field.column}
                    >
                      <StarPicker
                        label={field.label}
                        value={values[field.column]}
                        disabled={!view.editable}
                        onChange={(value) => setValue(field.column, value)}
                      />
                      <button
                        className="star-clear"
                        disabled={!view.editable || values[field.column] == null}
                        onClick={() => setValue(field.column, null)}
                        aria-label={`清除${field.label}`}
                      >重新想想</button>
                    </div>
                  ),
                )}
              </div>
              {ctx.catalog.schemaVersion !== 'SIX_EDU_V2' && ['health', 'art'].includes(group.key) && (
                <div className="self-specialties">
                  <h4>我的{group.key === 'health' ? '体育' : '艺术'}特长</h4>
                  {specialties.length === 0 ? (
                    <p>还没有已认定的特长项目，有了以后再来点星星。</p>
                  ) : specialties.map((item) => (
                    <div className={`self-star-card${item.self_star != null ? ' is-rated' : ''}`} key={item.id}>
                      <StarPicker
                        label={`${item.name} · 自评`}
                        value={item.self_star}
                        disabled={!view.editable}
                        onChange={(value) => setStar(collection, item.id, value)}
                      />
                      <button
                        className="star-clear"
                        disabled={!view.editable || item.self_star == null}
                        onClick={() => setStar(collection, item.id, null)}
                        aria-label={`清除${item.name}自评`}
                      >清除</button>
                    </div>
                  ))}
                </div>
              )}
              {group.key === 'narrative' && (
                <details className="self-text-panel">
                  <summary>家长寄语 <small>请家长协助 · 选填</small></summary>
                  <label>
                    家长寄语（可选）
                    <textarea
                      aria-label="家长寄语（家长协助填写，可选）"
                      value={values.family_message || ''}
                      disabled={!view.editable}
                      onChange={(e) => setValue('family_message', e.target.value)}
                    />
                    <small>{[...(values.family_message || '')].length} / 1000 字，不计入完成进度</small>
                  </label>
                </details>
              )}
              {count.total === 0 && <p className="self-group-empty">这个方向暂时没有需要填写的评价。</p>}
            </section>
          );
        })}
      </div>
      {conflicts.map((c) => (
        <div className="feedback error" key={c.field}>
          <p>
            {ctx.catalog.fields.find((f) => f.column === c.field)?.label ||
              '特长自评'}
            发生变化：本次 {String(c.local ?? '清除')}，已保存{' '}
            {String(c.remote ?? '清除')}
          </p>
          <button onClick={() => resolve(c, true)}>保留我的填写</button>
          <button onClick={() => resolve(c, false)}>采用已保存内容</button>
        </div>
      ))}
      {tooLong && (
        <p role="alert">文字超出上限，请按每段提示调整后保存。</p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="self-save">
        <p><strong>已完成 {progress.complete} / {progress.total}</strong><span>可先保存一部分，再回来继续填写。</span></p>
        <button
          className="primary"
          disabled={
            tooLong ||
            saving ||
            !view.editable ||
            conflicts.length > 0 ||
            (!Object.keys(dirty).length && !special.length)
          }
          onClick={save}
        >
          {saving ? '正在保存…' : '保存评价'}
        </button>
      </div>
    </section>
  );
}
