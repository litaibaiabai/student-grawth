import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../core/api';
import { eligibleCardCodes, buildCardTree, updateCardPath } from '../cards/cardModel';
import './directScore.css';

const empty = () => ({ studentIds: [], section: '', primary: '', categoryCode: '' });
const dimensionNames = {
  conduct: '德美',
  wisdom: '智美',
  health: '健美',
  art: '艺美',
  labor: '劳美',
};

function useCompactSize() {
  const read = () => ({
    students: innerWidth < 700 ? (innerHeight < 760 ? 3 : 6) : 12,
    targets: innerWidth < 700 && innerHeight < 700 ? 4 : 6,
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () => setSize(read());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

export default function DirectScore({ ctx }) {
  const { setLeaveGuard } = ctx,
    scopeClass = ctx.teacherScope?.classKey,
    size = useCompactSize();
  const [path, setPath] = useState(empty),
    [keyword, setKeyword] = useState(''),
    [cls, setCls] = useState(scopeClass || ''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [targetPage, setTargetPage] = useState(0),
    state = useRef(null);
  state.current = { path, reason };
  useEffect(() => {
    setLeaveGuard?.(
      () =>
        (!state.current.path.studentIds.length &&
          !state.current.reason.trim()) ||
        window.confirm('本次直评尚未提交，是否离开？'),
    );
    return () => setLeaveGuard?.(null);
  }, [setLeaveGuard]);
  const classRef = useRef(cls);
  classRef.current = cls;
  useEffect(() => {
    if (scopeClass && scopeClass !== classRef.current) {
      setCls(scopeClass);
      setPath(empty());
      setPage(0);
    }
  }, [scopeClass]);
  const students = ctx.students.filter(
      (s) =>
        (!cls || `${s.grade_snapshot}:${s.class_no_snapshot}` === cls) &&
        (!keyword ||
          s.student_name_snapshot.includes(keyword) ||
          String(s.student_number || s.student_id).includes(keyword)),
    ),
    classes = [
      ...new Set(
        ctx.students.map((s) => `${s.grade_snapshot}:${s.class_no_snapshot}`),
      ),
    ];
  const allowed = new Set(
    eligibleCardCodes({
      catalog: ctx.catalog,
      assignments: ctx.assignments,
      studentRows: ctx.students,
      selectedStudentIds: path.studentIds,
    }),
  );
  const tree = buildCardTree(
      ctx.catalog,
      ctx.catalog.cardCatalog.map((c) => c.code),
    ),
    section = tree.find((s) => s.id === path.section) || tree[0],
    targets =
      section?.children.flatMap((group) =>
        group.children.map((leaf) => ({
          ...leaf,
          primary: group.id,
          groupLabel: group.label,
        })),
      ) || [],
    leaf = targets.find((t) => t.id === path.categoryCode);
  const dimensions = Object.keys(dimensionNames).map(
    (id) => tree.find((s) => s.id === id) || { id, children: [] },
  );
  const names = path.studentIds
      .map(
        (id) =>
          ctx.students.find((s) => String(s.student_id) === id)
            ?.student_name_snapshot,
      )
      .filter(Boolean),
    currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(students.length / size.students) - 1),
    ),
    currentTargetPage = Math.min(
      targetPage,
      Math.max(0, Math.ceil(targets.length / size.targets) - 1),
    );
  const selectStudents = (ids) => {
    setPath((p) => updateCardPath(p, 'studentIds', ids));
    setTargetPage(0);
  };
  const score = async () => {
    if (!leaf || !allowed.has(leaf.id) || !path.studentIds.length || busy)
      return;
    setBusy(true);
    try {
      await api('/report-core/direct-scores', {
        termId: ctx.termId,
        studentIds: path.studentIds,
        categoryCode: leaf.id,
        reason,
      });
      ctx.notify(`已为${path.studentIds.length}名学生各记1分`);
      setPath(empty());
      setReason('');
      ctx.refresh();
    } catch (e) {
      ctx.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="direct-workbench"
      aria-label="无卡直评工作台"
      aria-busy={busy}
    >
      <header className="direct-intro">
        <div>
          <span className="direct-eyebrow">CLASSROOM / 课堂评价</span>
          <h2>把每一次进步，及时记下。</h2>
        </div>
        <span className="direct-point">
          <b>＋1</b> 分 / 人
        </span>
      </header>
      <div className="direct-work-area">
        <section
          className="direct-roster"
          aria-labelledby="direct-roster-title"
        >
          <div className="direct-step-title">
            <h3 id="direct-roster-title">
              <em>01</em>选择学生
            </h3>
            <span>
              已选 <b>{path.studentIds.length}</b> 人
            </span>
          </div>
          <div className="direct-filters">
            <label>
              <span className="sr-only">直评班级</span>
              <select
                aria-label="直评班级"
                value={cls}
                disabled={busy}
                onChange={(e) => {
                  if (
                    path.studentIds.length &&
                    !window.confirm(
                      '切换班级会清空已选学生和评价项目，是否切换？',
                    )
                  )
                    return;
                  setCls(e.target.value);
                  setPath(empty());
                  setPage(0);
                }}
              >
                <option value="">全部负责班级</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(':', '年级 ')}班
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">查找直评学生</span>
              <input
                aria-label="查找直评学生"
                value={keyword}
                disabled={busy}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setPage(0);
                }}
                placeholder="搜索姓名 / 编号"
              />
            </label>
          </div>
          <div className="direct-roster-tools">
            <span>共 {students.length} 人</span>
            <div>
              <button
                disabled={busy || !students.length}
                onClick={() =>
                  selectStudents([
                    ...new Set([
                      ...path.studentIds,
                      ...students.map((s) => String(s.student_id)),
                    ]),
                  ])
                }
              >
                全选筛选结果
              </button>
              <button
                disabled={busy || !path.studentIds.length}
                onClick={() => selectStudents([])}
              >
                清空
              </button>
            </div>
          </div>
          <div className="direct-name-grid">
            {students
              .slice(
                currentPage * size.students,
                (currentPage + 1) * size.students,
              )
              .map((s) => (
                <label
                  className={
                    path.studentIds.includes(String(s.student_id))
                      ? 'is-selected'
                      : ''
                  }
                  key={s.student_id}
                  title={`${s.student_name_snapshot} · ${s.student_number ? `学号 ${s.student_number}` : `内部编号 ${s.student_id}`}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`${s.student_name_snapshot} · ${s.grade_snapshot}年级${s.class_no_snapshot}班`}
                    disabled={busy}
                    checked={path.studentIds.includes(String(s.student_id))}
                    onChange={(e) =>
                      selectStudents(
                        e.target.checked
                          ? [...path.studentIds, String(s.student_id)]
                          : path.studentIds.filter(
                              (id) => id !== String(s.student_id),
                            ),
                      )
                    }
                  />
                  <span>
                    <b>{s.student_name_snapshot}</b>
                    <small>{s.student_number ? `学号 ${s.student_number}` : `内部编号 ${s.student_id}`}</small>
                  </span>
                </label>
              ))}
          </div>
          {!students.length && (
            <p className="direct-empty">
              没有匹配的学生，请调整搜索条件。
            </p>
          )}
          <div className="direct-pagination">
            <span>
              {currentPage + 1} /{' '}
              {Math.max(1, Math.ceil(students.length / size.students))} 页
            </span>
            <div>
              <button
                aria-label="学生上一页"
                disabled={busy || currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                ‹
              </button>
              <button
                aria-label="学生下一页"
                disabled={
                  busy ||
                  (currentPage + 1) * size.students >= students.length
                }
                onClick={() => setPage(currentPage + 1)}
              >
                ›
              </button>
            </div>
          </div>
        </section>
        <section
          className="direct-targets"
          aria-labelledby="direct-target-title"
        >
          <div className="direct-step-title">
            <h3 id="direct-target-title">
              <em>02</em>选择评价项目
            </h3>
            <span>每次选择一项</span>
          </div>
          <div className="direct-dimensions" aria-label="评价方向">
            {dimensions.map((s) => (
              <button
                key={s.id}
                title={
                  s.children.length
                    ? ''
                    : '本学期未配置该方向的过程评价项目'
                }
                disabled={
                  !s.children.length ||
                  busy ||
                  (path.studentIds.length > 0 &&
                    !s.children.some((g) =>
                      g.children.some((c) => allowed.has(c.id)),
                    ))
                }
                aria-pressed={section?.id === s.id}
                onClick={() => {
                  setPath((p) => ({
                    ...p,
                    section: s.id,
                    primary: '',
                    categoryCode: '',
                  }));
                  setTargetPage(0);
                }}
              >
                {dimensionNames[s.id] || s.label}
              </button>
            ))}
          </div>
          <p className="direct-target-hint">
            {path.studentIds.length
              ? '按共同任教权限选择，教师评价与学业等级另行录入。'
              : '先选学生，再选择本次要记录的表现。'}
          </p>
          <div className="direct-target-grid">
            {targets
              .slice(
                currentTargetPage * size.targets,
                (currentTargetPage + 1) * size.targets,
              )
              .map((c) => (
                <button
                  key={c.id}
                  title={`${c.groupLabel} · ${c.label}`}
                  aria-label={c.label.replace(/·过程表现$/, '')}
                  disabled={busy || !allowed.has(c.id)}
                  aria-pressed={leaf?.id === c.id}
                  onClick={() =>
                    setPath((p) => ({
                      ...p,
                      section: section.id,
                      primary: c.primary,
                      categoryCode: c.id,
                    }))
                  }
                >
                  <span>
                    {c.label === '过程表现'
                      ? '日常行为'
                      : c.label.replace(/·过程表现$/, '')}
                  </span>
                  <small>{leaf?.id === c.id ? '✓ 已选择' : '+1'}</small>
                </button>
              ))}
          </div>
          <div className="direct-pagination">
            <span>
              {targets.length} 个项目
              {targets.length > size.targets
                ? ` · ${currentTargetPage + 1}/${Math.ceil(targets.length / size.targets)} 页`
                : ''}
            </span>
            {targets.length > size.targets && (
              <div>
                <button
                  aria-label="项目上一页"
                  disabled={busy || !currentTargetPage}
                  onClick={() => setTargetPage(currentTargetPage - 1)}
                >
                  ‹
                </button>
                <button
                  aria-label="项目下一页"
                  disabled={
                    busy ||
                    (currentTargetPage + 1) * size.targets >= targets.length
                  }
                  onClick={() => setTargetPage(currentTargetPage + 1)}
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
      <footer className="direct-submit">
        <label className="direct-reason">
          <span>
            <em>03</em>评价说明{' '}
            <small>
              {ctx.catalog.schemaVersion === 'SIX_EDU_V2'
                ? '必填'
                : '选填'}
            </small>
          </span>
          <textarea
            aria-label="直评说明"
            rows={2}
            disabled={busy}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：主动完成值日，整理好班级工具。"
          />
        </label>
        <div className="direct-confirm">
          <div className="direct-receipt" role="status">
            <strong title={names.join('、')}>
              {path.studentIds.length
                ? `${path.studentIds.length} 人 · ${names.join('、')}`
                : '尚未选择学生'}
            </strong>
            <span>
              {leaf
                ? `${dimensionNames[section.id]} / ${leaf.label.replace(/·过程表现$/, '')}`
                : '尚未选择评价项目'}{' '}
              · 每人 +1 分
            </span>
          </div>
          <button
            className="primary"
            aria-label="确认记分"
            disabled={
              busy ||
              !path.studentIds.length ||
              !leaf ||
              !allowed.has(leaf.id) ||
              (ctx.catalog.schemaVersion === 'SIX_EDU_V2' &&
                !reason.trim())
            }
            onClick={score}
          >
            {busy ? '正在记分…' : '确认记分'}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </footer>
    </section>
  );
}
