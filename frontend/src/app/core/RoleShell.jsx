import React from 'react';
import {navigation,roleNames,mainPage,pageTitles} from './navigation';
import {UIIcon} from './illustrations';
import './tokens.css';
import './teacherAccount.css';
const icons={self:'star',awards:'award',cards:'scan',direct:'edit',imports:'upload',reviews:'check',comments:'edit',home:'home',stories:'book',report:'report',archive:'report',workspace:'home',entry:'edit','cards-manage':'cards',drafts:'report',statistics:'report',roster:'people',quota:'cards'};
function Brand({student=false}){return <div className="core-brand"><UIIcon name="cloud"/><div><strong>云美</strong><small>{student?'成长手账 · 学期评价':'综合素质发展评价'}</small></div></div>;}
function TeacherAccount({actor,onFaceSettings,onLogout}) {
 const name=actor.real_name||'教师';
 return <section className="side-account teacher-account" aria-label="教师账号菜单">
  <div className="teacher-account-identity"><span className="avatar-dot" aria-hidden="true">{name.slice(0,1)}</span><div className="teacher-account-name"><strong title={name}>{name}</strong><small>教师账号</small></div></div>
  <div className="teacher-account-actions">
   <button className="face-account-settings" type="button" aria-label="人脸登录设置" title="人脸登录设置" onClick={onFaceSettings}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="10" r="3"/><path d="M7 18c.7-3.3 9.3-3.3 10 0"/></svg><span>人脸登录设置</span><span className="teacher-account-chevron" aria-hidden="true">›</span></button>
   <button className="teacher-account-logout" type="button" aria-label="退出登录" title="退出登录" onClick={onLogout}><UIIcon name="logout"/><span>退出登录</span></button>
  </div>
 </section>;
}
export default function RoleShell({actor,route,onNavigate,onLogout,onFaceSettings,children,header}) {
 const selected=mainPage(actor.role,route.page),links=(navigation[actor.role]||[]).map(([id,label])=>[id,label]),label=roleNames[actor.role];
 const nav=kind=><nav className={kind} aria-label="核心业务导航">{links.map(([id,text])=><button aria-label={text} aria-current={selected===id?'page':undefined} className={selected===id?'active':''} onClick={()=>onNavigate(id)} key={id}><UIIcon name={icons[id]}/><span>{text}</span></button>)}</nav>;
 if(actor.role==='student')return <div className="core-app role-student"><a className="skip-link" href="#core-content" onClick={e=>{e.preventDefault();document.getElementById('core-content')?.focus();document.getElementById('core-content')?.scrollIntoView({block:'start'});}}>跳到主要内容</a><header className="student-header"><Brand student/>{nav('student-topnav')}<details className="student-account"><summary><span className="avatar-dot">{(actor.real_name||'同').slice(0,1)}</span><span>{actor.real_name||'同学'}</span></summary><div className="account-menu">{header}<button type="button" onClick={onFaceSettings}>人脸登录设置</button><button onClick={onLogout}><UIIcon name="logout"/>退出登录</button></div></details></header><main id="core-content" className="student-content" tabIndex={-1}>{children}<footer className="student-footer">每一个小小的进步，都值得被看见</footer></main>{nav('student-bottomnav')}</div>;
 return <div data-page={route.page} className={`core-app role-${actor.role} adult-shell`}><a className="skip-link" href="#core-content" onClick={e=>{e.preventDefault();document.getElementById('core-content')?.focus();document.getElementById('core-content')?.scrollIntoView({block:'start'});}}>跳到主要内容</a><aside className="core-sidebar"><Brand/><p className="side-caption">{label}工作空间</p>{nav('adult-navigation')}{!['reviews','comments'].includes(selected)&&<div className="sidebar-note">有故事的学校<br/>有温度的教育<br/>有精彩的童年</div>}{actor.role==='teacher'?<TeacherAccount actor={actor} onFaceSettings={onFaceSettings} onLogout={onLogout}/>:<div className="side-account"><span className="avatar-dot">{(actor.real_name||label).slice(0,1)}</span><div><strong>{actor.real_name||label}</strong><small>{label}账号</small><button className="face-account-settings" type="button" onClick={onFaceSettings}>人脸登录设置</button></div><button aria-label="退出登录" title="退出登录" onClick={onLogout}><UIIcon name="logout"/></button></div>}</aside><main className="core-main" id="core-content" tabIndex={-1}><header className="core-header"><div><p className="kicker">云美少年 · 学期评价</p><h1>{pageTitles[route.page]||'学期评价'}</h1></div><div className="identity">{header}</div></header>{children}{!['reviews','comments'].includes(selected)&&<footer className="core-footer">有故事的学校 · 有温度的教育 · 有精彩的童年</footer>}</main></div>;
}
