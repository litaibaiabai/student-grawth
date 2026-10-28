import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ConfigProvider, message } from 'antd';
import { HomeOutlined, QrcodeOutlined, TrophyOutlined, ReadOutlined, FileTextOutlined, FileProtectOutlined, LogoutOutlined, ArrowRightOutlined, CompassOutlined, LineChartOutlined, BookOutlined } from '@ant-design/icons';
import token from '@/util/token';
import { get, post } from '@/util/request';
import { API_GROWTH_MY, API_GROWTH_THEME } from '@/constant/urls';
import './index.less';

import { GrowthContext } from './growthContext';
const THEMES = [
  ['default', '成长原野'], ['forest', '清新森林'], ['ocean', '晴空海蓝'], ['sunset', '落日暖橙'], ['cartoon', '莓果童趣']
];
const LINKS = [
  ['/dashboard', '成长首页', HomeOutlined, 'home 成长首页'],
  ['/student/claim', '扫卡领取', QrcodeOutlined, 'qrcode 扫卡领取'],
  ['/student/ledger', '积分账本', BookOutlined, 'book 积分账本'],
  ['/student/honors', '荣誉申报', TrophyOutlined, 'trophy 荣誉申报'],
  ['/student/stories', '月度故事', ReadOutlined, 'read 月度故事'],
  ['/student/evaluation', '综合评价', LineChartOutlined, 'line-chart 综合评价'],
  ['/student/report', '学期报告', FileProtectOutlined, 'file-protect 学期报告']
];

export default function StudentLayout({ children }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('default');
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const loaded = useRef(false);
  const themeRequest = useRef(false);
  const themeRevision = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const user = token.loadUser();

  const endSession = useCallback((expectedToken = token.get()) => {
    if (token.get() !== expectedToken) return;
    token.clear();
    window.dispatchEvent(new CustomEvent('auth-change', { detail: { isAuthenticated: false } }));
    navigate('/login', { replace: true });
  }, [navigate]);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    const requestToken = token.get();
    const requestedThemeRevision = themeRevision.current;
    setLoading(true);
    setError('');
    try {
      const res = await get(API_GROWTH_MY, {}, { skipGlobalError: true });
      if (request !== generation.current) return;
      if (res.code !== 200 || !res.data) throw new Error('invalid growth response');
      setData(res.data);
      if (!themeRequest.current && requestedThemeRevision === themeRevision.current) setTheme(THEMES.some(([id]) => id === res.data.theme) ? res.data.theme : 'default');
    } catch (err) {
      if (err.response?.status === 401) { endSession(requestToken); return; }
      if (request === generation.current) setError('成长记录暂时没有加载成功');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [endSession]);
  useEffect(() => {
    if (!loaded.current || location.pathname === '/dashboard') {
      loaded.current = true;
      reload();
    }
  }, [location.pathname, reload]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);

  const changeTheme = async (nextTheme) => {
    if (themeRequest.current || nextTheme === theme) return;
    themeRequest.current = true;
    themeRevision.current++;
    const requestToken = token.get();
    const previous = theme;
    setTheme(nextTheme);
    setSaving(true);
    try {
      const res = await post(API_GROWTH_THEME, { themeId: nextTheme }, { skipGlobalError: true });
      if (res.code !== 200) throw new Error('theme save failed');
      message.success('成长主题已保存');
    } catch (err) {
      if (err.response?.status === 401) { endSession(requestToken); return; }
      setTheme(previous);
      message.error('主题保存失败，请重试');
    } finally {
      themeRevision.current++;
      themeRequest.current = false;
      setSaving(false);
    }
  };
  const logout = () => endSession();
  const profile = data?.studentProfile;
  const name = profile?.name || user?.real_name || user?.name || '同学';
  return <GrowthContext.Provider value={{ data, loading, error, reload }}>
    <ConfigProvider theme={{ token: { colorPrimary: '#28654c', borderRadius: 14, fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' } }}>
      <div className={`student-layout theme-${theme}`}>
        <a className="student-skip" href="#student-main" onClick={event => { event.preventDefault(); const main = document.getElementById("student-main"); main?.focus(); main?.scrollIntoView({ block: "start" }); }}>跳到主要内容</a>
        <aside className="student-sidebar no-print">
          <NavLink to="/dashboard" className="student-brand"><span className="brand-sprout" aria-hidden="true">✳</span><span>六育成长森林<small>MY LITTLE GROWING WORLD</small></span></NavLink>
          <div className="student-profile"><span className="student-avatar" aria-hidden="true">{name.slice(-2)}</span><div><strong>{name}</strong><small>{profile?.grade ? `${profile.grade}年级${profile.classNo ? ` · ${profile.classNo}班` : ''}` : '我的成长空间'}</small></div><span className="profile-dot" aria-hidden="true" /></div>
          <div className="student-nav-label">翻开我的成长手册</div>
          <nav aria-label="学生导航">{LINKS.map(([path, label, Icon, ariaName]) => <NavLink key={path} to={path} end aria-label={ariaName || label} className={({ isActive }) => `student-nav-link ${isActive ? 'is-active' : ''}`}>{createElement(Icon, { 'aria-hidden': true })}<span>{label}</span><ArrowRightOutlined className="nav-arrow" aria-hidden="true" /></NavLink>)}</nav>
          <section className="student-theme-picker" aria-label="成长主题"><span>给森林换个颜色</span><div>{THEMES.map(([id, label]) => <button key={id} type="button" className={`theme-swatch swatch-${id}`} title={label} aria-label={label} aria-pressed={theme === id} disabled={saving || loading} onClick={() => changeTheme(id)}>{theme === id ? '✓' : ''}</button>)}</div><small aria-live="polite">{saving ? '正在保存主题…' : '选一种你喜欢的心情'}</small></section>
          <div className="student-sidebar-bottom"><span>慢慢来，也会闪闪发光。</span><button aria-label="logout" onClick={logout}><LogoutOutlined /> 退出登录</button></div>
        </aside>
        <div className="student-workspace">
          <header className="student-topbar no-print"><span><i /> 我的成长空间</span><span className="student-topbar-note">每一种成长，都值得被看见 <span aria-hidden="true">✦</span></span></header>
          <main id="student-main" className="student-content" tabIndex={-1}>{children}</main>
          <footer className="student-footer no-print"><span>六育成长森林</span> 记录每一个认真长大的你 <span aria-hidden="true">✳</span></footer>
        </div>
      </div>
    </ConfigProvider>
  </GrowthContext.Provider>;
}
