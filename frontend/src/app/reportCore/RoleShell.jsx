import React from 'react';
import { navigation, roleNames } from './navigation';
import './tokens.css';
export default function RoleShell({ actor, term, route, onNavigate, onLogout, children, header }) {
  const links = navigation[actor.role] || [];
  return <div className={`core-app role-${actor.role}`}>
    <a className="skip-link" href="#core-content">跳到主要内容</a>
    <aside className="core-sidebar"><div className="brand-mark">云美<span>学期评价工作台</span></div>
      <div className="role-label">{roleNames[actor.role]}工作区</div>
      <nav aria-label="核心业务导航">{links.map(([id,label], i) => <button key={id} aria-label={label} aria-current={route.page === id ? 'page' : undefined} className={route.page === id ? 'active' : ''} onClick={() => onNavigate(id)}><span aria-hidden="true">{String(i+1).padStart(2,'0')}</span>{label}</button>)}</nav>
      <div className="sidebar-note">有故事的学校<br/>有温度的教育<br/>有精彩的童年</div><button className="logout" onClick={onLogout}>退出登录</button>
    </aside>
    <main className="core-main" id="core-content" tabIndex={-1}>
      <header className="core-header"><div><p className="kicker">云美少年 · 综合素质发展</p><h1>{links.find(([id]) => id === route.page)?.[1]}</h1></div><div className="identity"><span>{actor.real_name || roleNames[actor.role]} · {roleNames[actor.role]}</span>{header || <span>{term?.term_name}</span>}</div></header>
      {children}<footer className="core-footer">每一个孩子，都有自己的成长轨迹。</footer>
    </main>
  </div>;
}
