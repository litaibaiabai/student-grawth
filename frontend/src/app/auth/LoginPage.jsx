import React from 'react';
import { UIIcon } from '../core/illustrations';
import FaceLogin from './face/FaceLogin';
import './loginPage.css';

const modes = [['password', '账号密码'], ['face', '人脸登录']];
const dimensions = ['德美', '智美', '健美', '艺美', '劳美', '故事美'];

function GrowthBook() {
  return <svg className="login-book" viewBox="0 0 460 250" fill="none" aria-hidden="true">
    <path d="M74 218V118a156 156 0 0 1 312 0v100" stroke="#91aa922a"/>
    <path d="M104 218V118a126 126 0 0 1 252 0v100" stroke="#91aa922a"/>
    <circle cx="333" cy="65" r="27" fill="#dcc591"/>
    <path d="M229 106c-49-28-105-29-156-10v118c57-14 108-9 156 13V106Z" fill="#e9e3ce"/>
    <path d="M231 106c49-28 105-29 156-10v118c-57-14-108-9-156 13V106Z" fill="#fff9e8"/>
    <path d="M73 214v8c57-14 108-9 156 13m158-21v8c-57-14-108-9-156 13M230 107v127" stroke="#b8b99b" strokeWidth="2"/>
    <path d="m94 124 109 6m-109 15 109 6m-109 15 109 6m-109 15 74 4M254 132l108-10m-108 31 108-10m-108 31 108-10m-108 31 67-6" stroke="#b8b99b" strokeWidth="1.2"/>
    <path d="M230 99c-2-31 9-54 24-74-1 27-4 51-24 74Z" fill="#91a887"/>
    <path d="M230 99c-4-24-21-38-41-47 5 23 18 40 41 47Z" fill="#b3bd93"/>
    <path d="M230 111V74" stroke="#789775" strokeWidth="2"/>
    <circle cx="57" cy="165" r="4" fill="#a9b996"/><circle cx="400" cy="153" r="3" fill="#dfc18c"/>
    <path d="m119 62 3-8 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#e9d6aa"/>
    <path d="M42 240h376" stroke="#8fa88b55"/>
  </svg>;
}

export default function LoginPage({ mode, onMode, username, onUsername, password, onPassword, error, busy, onPasswordLogin, onLogin }) {
  const switchWithKeyboard = event => {
    const current = modes.findIndex(([value]) => value === mode);
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (current + 1) % modes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = modes.length - 1;
    else return;
    event.preventDefault();
    onMode(modes[next][0]);
    document.getElementById(`login-tab-${modes[next][0]}`)?.focus();
  };
  return <main className="core-login school-login" aria-label="云美登录">
    <section className="login-cover" aria-label="云美六育评价">
      <header className="login-brand"><UIIcon name="cloud"/><div><strong>云美</strong><span>六育学生评价系统</span></div></header>
      <div className="login-cover-content">
        <p className="login-cover-eyebrow">THE BEAUTY OF GROWING</p>
        <h1>看见成长，<br/>记录每一种美。</h1>
        <p className="login-cover-description">从课堂里的小小进步，到成长中的闪光时刻。<br/>让每个孩子，都拥有自己的成长记录。</p>
        <GrowthBook/>
      </div>
      <div className="login-dimensions" aria-label="六育成长维度">{dimensions.map((name, index) => <div key={name}><span>0{index + 1}</span><strong>{name}</strong></div>)}</div>
      <footer className="login-cover-footer"><span>云美少年 · 成长档案</span><span>每一种美，都被看见</span></footer>
    </section>
    <section className="login-access" aria-labelledby="login-title">
      <div className="login-access-inner">
        <div className="login-welcome"><span/>欢迎来到云美</div>
        <h2 id="login-title">{mode === 'password' ? '账号登录' : '人脸登录'}</h2>
        <p className="login-description">学生、教师及管理员均可使用学校账号登录。</p>
        <div className="face-login-tabs" role="tablist" aria-label="登录方式" onKeyDown={switchWithKeyboard}>
          {modes.map(([value, label]) => <button type="button" key={value} role="tab" id={`login-tab-${value}`} aria-controls={`login-panel-${value}`} aria-selected={mode === value} tabIndex={mode === value ? 0 : -1} disabled={busy} onClick={() => onMode(value)}>{label}</button>)}
        </div>
        <div role="tabpanel" id={`login-panel-${mode}`} aria-labelledby={`login-tab-${mode}`}>
          {mode === 'face' ? <FaceLogin username={username} onUsername={onUsername} onLogin={onLogin}/> : <form aria-busy={busy} onSubmit={event => { event.preventDefault(); onPasswordLogin(); }}>
            <label htmlFor="login-username">账号</label>
            <div className="login-input-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg><input id="login-username" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-label="账号" placeholder="请输入学校账号" value={username} onChange={event => onUsername(event.target.value)} required/></div>
            <label htmlFor="login-password">密码</label>
            <div className="login-input-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></svg><input id="login-password" autoComplete="current-password" type="password" aria-label="密码" placeholder="请输入密码" value={password} onChange={event => onPassword(event.target.value)} required/></div>
            {error && <p role="alert" className="feedback error">{error}</p>}
            <button className="primary login-submit" disabled={busy} type="submit"><span>{busy ? '正在登录…' : '登录'}</span><span aria-hidden="true">→</span></button>
          </form>}
        </div>
        <p className="login-help">账号由学校统一分配。如需帮助，请联系学校管理员。</p>
      </div>
      <footer className="login-access-footer"><span/>综合素质发展评价 · 学期成长记录</footer>
    </section>
  </main>;
}
