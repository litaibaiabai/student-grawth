import React, { useEffect, useState } from 'react';
import { api } from '../../core/api';
import { useDraftGuard } from '../../core/ui';
import { UIIcon } from '../../core/illustrations';
import '../../teacher/cards/courseCards.css';

export default function SubjectCardQuota({ ctx }) {
  const { termId, error:onError, notify } = ctx;
  const [settings,setSettings]=useState(null), [values,setValues]=useState({});
  const [defaultValue,setDefaultValue]=useState('');
  const [dirty,setDirty]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState(''), [revision,setRevision]=useState(0);
  useDraftGuard(ctx,dirty);
  useEffect(()=>{
    const controller=new AbortController();
    setSettings(null);setDirty(false);setError('');
    api(`/report-core/course-card-settings?termId=${termId}`,undefined,undefined,{signal:controller.signal})
      .then(result=>{setSettings(result);setDefaultValue(String(result.defaultMonthlyTotal));setValues(Object.fromEntries(result.subjects.map(s=>[s.subjectCode,s.monthlyTotal??''])));})
      .catch(e=>{if(e.name!=='AbortError'){setError(e.message);if(e.status===401)onError(e);}});
    return()=>controller.abort();
  },[termId,onError,revision]);
  const isQuota=value=>/^\d+$/.test(String(value)) && Number(value)<=10000;
  const valid=settings && isQuota(defaultValue) && Object.values(values).every(value=>value==='' || isQuota(value));
  const save=async()=>{
    if(!valid||busy||!dirty||!settings.canEdit)return;
    setBusy(true);setError('');
    try{
      const quotas=Object.fromEntries(Object.entries(values).filter(([,v])=>v!=='').map(([key,v])=>[key,Number(v)]));
      await api('/report-core/course-card-settings',{termId,expectedRevision:settings.revision,defaultMonthlyTotal:Number(defaultValue),quotas},'PUT');
      setDirty(false);notify('学科月额度已保存');setRevision(n=>n+1);
    }catch(e){setError(e.message);if(e.status===401)onError(e);}finally{setBusy(false);}
  };
  const effectiveTotal=subjectCode=>Number(values[subjectCode]==='' ? defaultValue : values[subjectCode]);
  const projected=valid ? settings.subjects.reduce((n,s)=>n+effectiveTotal(s.subjectCode)*s.courseCount,0) : null;
  return <section className="panel subject-quota-page">
    <div className="subject-quota-heading"><div><span className="course-eyebrow">课程积分卡 · 自动月配</span><h2>按学科设置每班月额度</h2><p>配置一次，系统根据教师任教课程，为每个班级分别准备学科积分卡。</p></div><div className="subject-quota-estimate"><strong>{projected===null?'—':projected.toLocaleString()}</strong><span>张 / 月 · 按当前任教课程预计</span></div></div>
    <div className="subject-quota-example"><UIIcon name="book" /><p>例如：语文设置 <b>60 张</b>，同一教师任教三个语文班，则<b>每班各生成 60 张，共 180 张</b>。</p></div>
    {error && <div className="feedback error" role="alert">{error}<button disabled={busy} onClick={()=>{if(!dirty||window.confirm('重新读取会放弃未保存的额度，是否继续？'))setRevision(n=>n+1);}}>重新读取</button></div>}
    {!settings ? <p role="status">{error?'暂时无法读取学科配置。':'正在读取学科月额度…'}</p> : <>
      {!settings.canEdit && <p className="feedback">当前学期已停止采集或正在发布，额度暂时只读。</p>}
      <label className="subject-quota-item"><div><strong>默认月额度</strong><span>学科留空时，每班每月使用此数量</span></div><div className="subject-quota-input"><input aria-label="默认每班月额度" type="number" min="0" max="10000" step="1" required value={defaultValue} disabled={busy||!settings.canEdit} onChange={e=>{setDefaultValue(e.target.value);setDirty(true);}}/><span>张 / 班 / 月</span></div></label>
      <div className="subject-quota-grid">{settings.subjects.map(s=><label className="subject-quota-item" key={s.subjectCode}><div><strong>{s.subjectName}</strong><span>{s.courseCount} 门任教课程 · {s.teacherCount} 位教师</span><span>有效额度：{isQuota(values[s.subjectCode]===''?defaultValue:values[s.subjectCode])?effectiveTotal(s.subjectCode):'—'} 张 / 班 / 月</span></div><div className="subject-quota-input"><input aria-label={`${s.subjectName}每班月额度`} type="number" min="0" max="10000" step="1" placeholder={`默认 ${defaultValue || '—'}`} value={values[s.subjectCode]??''} disabled={busy||!settings.canEdit} onChange={e=>{setValues(v=>({...v,[s.subjectCode]:e.target.value}));setDirty(true);}}/><span>张 / 班 / 月</span></div></label>)}</div>
      <div className="subject-quota-save"><p>学科留空继承默认额度，填写 0 暂停该学科新卡生成。默认额度必填，允许 0–10000 的整数。<br/><span>修改默认不影响学科覆盖值；已生成批次保持原张数，新额度用于尚未生成的课程及下月新批次。</span></p><button className="primary" disabled={!dirty||!valid||busy||!settings.canEdit} onClick={save}><UIIcon name="check" />{busy?'正在保存…':'保存学科额度'}</button></div>
    </>}
  </section>;
}
