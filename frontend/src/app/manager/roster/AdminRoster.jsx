import React, { useRef, useState } from 'react';
import AccountMaintenance from './AccountMaintenance';
import { Pager, ImportHistory, ImportReview } from './AdminDataImport';
import { useAdminRows, readRows, writeTemplate, useDraftGuard } from './adminData';

const subjects = {
  MORAL: '道法',
  CHINESE: '语文',
  MATH: '数学',
  SCIENCE: '科学',
  ENGLISH: '英语',
  PE: '体育',
  MUSIC: '音乐',
  FINE_ART: '美术',
  LABOR: '劳动',
  STORY: '故事',
};

export default function AdminRoster({ ctx }) {
  const [maintenanceDirty,setMaintenanceDirty]=useState(false);
  const [maintenance,setMaintenance]=useState(null),[maintenanceMessage,setMaintenanceMessage]=useState('');
  const [role, setRole] = useState('student'),
    [q, setQ] = useState(''),
    [grade, setGrade] = useState(''),
    [classNo, setClass] = useState(''),
    [status, setStatus] = useState(''),
    [filters, setFilters] = useState({ role: 'student' }),
    [rows, setRows] = useState([]),
    [fileName, setFileName] = useState(''),
    [error, setError] = useState('');
  const version = useRef(0),
    [inputVersion, setInputVersion] = useState(0),
    [fileReading, setFileReading] = useState(false);
  const markInput = () => {
    version.current++;
    setInputVersion(version.current);
    return version.current;
  };
  const view = useAdminRows(ctx, 'accounts', filters);
  useDraftGuard(ctx, rows.length > 0 || fileReading || maintenanceDirty);
  const template = () =>
    writeTemplate(
      [
        role === 'student'
          ? {
              '学号/账号': '',
              姓名: '',
              年级: '',
              班级: '',
              初始密码: '',
            }
          : { 教师账号: '', 姓名: '', 初始密码: '' },
      ],
      role === 'student' ? '学生学籍模板' : '教师账号模板',
    );
  const load = async (file) => {
    const readVersion = markInput();
    setFileReading(true);
    try {
      setError('');
      const raw = await readRows(file);
      if (version.current !== readVersion) return;
      const known = new Set([
        '学号/账号',
        '教师账号',
        '姓名',
        '年级',
        '班级',
        '初始密码',
        'username',
        'real_name',
        'grade',
        'classNo',
        'password',
      ]);
      const unknown = Object.keys(raw[0] || {}).filter((k) => !known.has(k));
      if (unknown.length)
        throw Error('未识别列：' + unknown.join('、') + '，请使用当前模板');
      if (raw.length > 1000) throw Error('每批最多1000行，请拆分文件');
      setRows(
        raw.map((r) => ({
          username: String(
            r['学号/账号'] || r['教师账号'] || r.username || '',
          ),
          real_name: r['姓名'] || r.real_name || '',
          role,
          grade: role === 'student' ? Number(r['年级'] || r.grade) : null,
          classNo: role === 'student' ? Number(r['班级'] || r.classNo) : null,
          password: r['初始密码'] || r.password || '',
        })),
      );
      setFileName(file.name);
    } catch (e) {
      if (version.current === readVersion) setError(e.message);
    } finally {
      if (version.current === readVersion) setFileReading(false);
    }
  };
  const switchRole = (next) => {
    if (
      (rows.length || fileReading || maintenanceDirty) &&
      !window.confirm('切换模板类型会放弃当前文件，是否切换？')
    )
      return;
    markInput();
    setFileReading(false);
    setRole(next);
    setMaintenance(null);setMaintenanceDirty(false);
    setRows([]);
    setFileName('');
    setFilters({ role: next });
  };
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>学籍与账号</h2>
            <p>
              按模板批量维护，教师账号无需填写班级。已有账号密码保持不变。学籍更正可能使班主任确认失效并重算班级排名，提交前请核对差异。
            </p>
          </div>
        </div>
        <nav className="evaluation-tabs" aria-label="账号类型">
          {[
            ['student', '学生学籍'],
            ['teacher', '教师账号'],
          ].map(([id, label]) => (
            <button
              className={role === id ? 'active' : ''}
              onClick={() => switchRole(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="actions admin-template-actions"><button onClick={template}>下载{role === 'student' ? '学生学籍' : '教师账号'}模板</button></div>
      <section className="admin-import" aria-label="批量导入账号">
        <div className="section-heading">
          <h2>批量导入{role === 'student' ? '学生学籍' : '教师账号'}</h2>
          <small>上传 → 预览差异 → 确认导入</small>
        </div>
        <label className="upload-zone">
          选择填写好的模板
          <input
            aria-label="学籍账号文件"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              if (e.target.files?.[0]) load(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <small>
            {fileName
              ? `${fileName} · ${rows.length} 行`
              : '支持Excel或CSV，每批最多1000行；不会显示或导出密码。'}
          </small>
        </label>
        {error && <p role="alert">{error}</p>}
        <ImportReview
          ctx={ctx}
          kind="ROSTER"
          rows={rows}
          inputVersion={inputVersion}
          inputBusy={fileReading}
          onCommitted={(sentRows, sentVersion) => {
            if (version.current !== sentVersion) return;
            markInput();
            setRows([]);
          }}
        />
      </section>

        <div className="admin-filterbar">
          <label>
            姓名或账号
            <input
              aria-label="查找账号"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="支持姓名或完整账号"
            />
          </label>
          {role === 'student' && (
            <>
              <label>
                年级
                <input
                  aria-label="学籍年级"
                  value={grade}
                  type="number"
                  min="1"
                  onChange={(e) => setGrade(e.target.value)}
                />
              </label>
              <label>
                班级
                <input
                  aria-label="学籍班级"
                  value={classNo}
                  type="number"
                  min="1"
                  onChange={(e) => setClass(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            账号状态
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部状态</option>
              <option value="0">启用</option>
              <option value="1">停用</option>
            </select>
          </label>
          <button
            onClick={() =>
              setFilters({
                role,
                q,
                grade: role === 'student' ? grade : '',
                classNo: role === 'student' ? classNo : '',
                status,
              })
            }
          >
            查询账号
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>账号</th>
                <th>姓名</th>
                <th>{role === 'student' ? '学期班级' : '任教职责'}</th>
                <th>状态</th><th>维护</th>
              </tr>
            </thead>
            <tbody>
              {view.state?.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.username}</td>
                  <td>{r.name || r.realName}</td>
                  <td>
                    {role === 'student'
                      ? `${r.grade}年级${r.classNo}班`
                      : r.assignments.length
                        ? r.assignments
                            .map(
                              (a) =>
                                `${a.grade}年级${a.classNo}班 ${subjects[a.subjectCode] || a.subjectCode}${a.isHeadTeacher ? '（班主任）' : ''}`,
                            )
                            .join('；')
                        : '尚未配置任教，请到班级管理维护'}
                  </td>
                  <td>
                    <span className="badge">
                      {r.status === 0 ? '启用' : '停用'}
                    </span>
                  </td>
                  <td><div className="actions"><button onClick={()=>{if(maintenance?.account.id===r.id&&maintenance.mode==="account")return;if(!maintenanceDirty||window.confirm('切换账号会放弃当前输入，是否继续？')){setMaintenance({account:r,mode:"account"});setMaintenanceDirty(false);setMaintenanceMessage('');}}}>维护账号</button>{role==='student'&&ctx.catalog.schemaVersion==='SIX_EDU_V2'&&<button onClick={()=>{if(maintenance?.account.id===r.id&&maintenance.mode==="transfer")return;if(!maintenanceDirty||window.confirm('切换维护会放弃当前输入，是否继续？')){setMaintenance({account:r,mode:"transfer"});setMaintenanceDirty(false);setMaintenanceMessage('');}}}>调班</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.error && <p role="alert">{view.error}</p>}
        <Pager view={view} />
        {maintenanceMessage&&<p role="status" className="feedback success">{maintenanceMessage}</p>}
        {maintenance&&<AccountMaintenance key={`${ctx.termId}:${maintenance.account.id}:${maintenance.mode}`} ctx={ctx} {...maintenance} onDirty={setMaintenanceDirty} onClose={()=>{setMaintenance(null);setMaintenanceDirty(false);}} onDone={message=>{setMaintenance(null);setMaintenanceDirty(false);setMaintenanceMessage(message);}}/>}
      </section>
      <ImportHistory ctx={ctx} kind="ROSTER" />
    </>
  );
}
