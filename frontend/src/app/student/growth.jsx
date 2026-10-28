import { createElement } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Skeleton } from 'antd';
import { ArrowRightOutlined, QrcodeOutlined, TrophyOutlined, ReadOutlined, FileTextOutlined, CompassOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useStudentGrowth } from '@/component/StudentLayout/growthContext';
import './growth.less';

const DIMENSIONS = [
  ['德', '德育', '把温暖带给身边的人', 'kind'], ['智', '智育', '对世界多问一个为什么', 'wisdom'],
  ['体', '体育', '在奔跑中积蓄能量', 'sport'], ['美', '美育', '发现生活里的小美好', 'art'],
  ['劳', '劳育', '用双手创造新可能', 'work'], ['叙', '生活故事', '写下属于自己的故事', 'story']
];
const STATUS_NAMES = { APPROVED: '已认定', REJECTED: '需修改', SUBMITTED: '已提交', DRAFT: '草稿', REVIEWED: '已终审', PENDING: '待审核' };

function ForestIllustration() {
  return <svg className="forest-illustration" viewBox="0 0 440 280" fill="none" role="img" aria-label="一株带着笑脸的小树，正在阳光下长大">
    <circle cx="333" cy="58" r="31" fill="#F3C65E" /><path d="M333 11V2m0 112v-9m-47-47h-9m112 0h-9m-80-33-7-7m80 80-7-7m-66 0-7 7m80-80-7 7" stroke="#DDB252" strokeWidth="3" strokeLinecap="round" />
    <path d="M18 224c74-50 133-18 193-21 64-3 99-50 209-10v79H18Z" fill="#DCE8C2" /><path d="M0 249c77-47 155 0 214-14 83-20 143-13 226 3v42H0Z" fill="#C7DBAC" />
    <ellipse cx="220" cy="255" rx="93" ry="13" fill="#A2BE89" opacity=".4" />
    <path d="M205 198h34l-4 47c-1 11-26 11-28 0Z" fill="#B88C60" /><path d="M220 208v29" stroke="#8D6A48" strokeWidth="3" strokeLinecap="round" />
    <path d="M137 147c-16-25 3-54 28-58-3-37 46-57 66-32 34-21 69 5 67 34 34 10 43 46 24 66 16 32-17 61-47 55-17 26-59 26-74 9-42 14-77-20-64-43-9-8-9-22 0-31Z" fill="#4C8054" />
    <path d="M158 124c-8-24 8-41 32-42 4-20 35-31 51-13 25-8 49 11 43 34 30 6 34 40 14 53 8 25-16 39-39 33-12 17-43 17-54 3-33 12-61-7-50-30-13-9-11-29 3-38Z" fill="#79A768" />
    <ellipse cx="191" cy="153" rx="9" ry="5" fill="#E8B5A0" /><ellipse cx="254" cy="153" rx="9" ry="5" fill="#E8B5A0" /><path d="M205 142v6m34-6v6m-28 13q11 11 22 0" stroke="#284E38" strokeWidth="4" strokeLinecap="round" />
    <path d="m108 209 4-14 4 14 14 4-14 4-4 14-4-14-14-4Zm241-71 3-10 3 10 10 3-10 3-3 10-3-10-10-3Z" fill="#E4B84D" />
    <path d="M68 249v-26m0 14c-17 1-22-9-19-16 12 0 19 5 19 16Zm0-8c1-15 11-21 20-17 0 10-8 17-20 17Z" fill="#76955D" /><path d="M367 253v-23m0 12c-13-1-17-9-14-14 10 1 14 6 14 14Zm0-6c0-13 9-19 17-16 0 9-7 16-17 16Z" fill="#72935A" />
    <path d="M301 263q7-11 15 0m-178-15q5-8 10 0" stroke="#F9F5DA" strokeWidth="4" strokeLinecap="round" /><path d="m90 78 9-5 9 5m-33 12 6-3 6 3" stroke="#86A17A" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

export default function StudentGrowthDashboard() {
  const { data, loading, error, reload } = useStudentGrowth();
  if (loading) return <div className="growth-loading" aria-label="正在加载成长记录"><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (error) return <Alert type="warning" showIcon message={error} description="请检查网络后再试一次，你的成长记录不会丢失。" action={<Button onClick={reload}>重新加载</Button>} />;
  const { studentProfile, currentPoints, timeline = [], evaluation, gameLevel } = data || {};
  const published = evaluation?.isPublished;
  return <div className="growth-home">
    <div className="growth-page-heading"><div><p className="eyebrow">MY GROWTH JOURNAL <span> / </span> 我的成长手册</p><h1>你好，{studentProfile?.name || '同学'}<span className="greeting-star" aria-hidden="true"> ✦</span></h1><p>今天，也来收集一点成长的快乐吧。</p></div><Link className="journal-link" to="/student/report"><FileTextOutlined /> 翻开学期报告 <ArrowRightOutlined /></Link></div>
    <section className="growth-hero" aria-label="成长森林">
      <div className="hero-copy"><span className="hero-label"><i /> 欢迎回到你的成长森林</span><h2>每一份努力，<br />都在悄悄长大。</h2><p>一次勇敢尝试，一点小小进步，<br />都是这片森林里，新长出的一片叶子。</p><Link className="growth-primary" to="/student/claim"><QrcodeOutlined /> 扫卡，收下这份鼓励 <ArrowRightOutlined /></Link><span className="hero-footnote">成长没有标准速度，向前一步就很好。</span></div>
      <div className="hero-art"><span className="art-caption">GROW AT YOUR OWN PACE</span><ForestIllustration /><span className="art-sticker">小小的我，大大的可能 <span aria-hidden="true">✿</span></span></div>
    </section>
    <div className="growth-middle">
      <section className="growth-points"><span className="section-kicker">一点一滴，都算数</span><div className="points-number">{currentPoints ?? '—'}<small>成长积分</small><span aria-hidden="true">✧</span></div><Link to="/student/ledger">看看积分从哪里来 <ArrowRightOutlined /></Link>{gameLevel?.levelName && <p className="level-note">趣味称号 · {gameLevel.levelName}<small>仅作成长鼓励，学校评价请查看正式报告。</small></p>}</section>
      <div className="growth-shortcuts">{[
        ['/student/honors', TrophyOutlined, '我的荣誉', '珍藏每一个闪光时刻', 'honey'],
        ['/student/stories', ReadOutlined, '生活故事', '把难忘的小事写下来', 'peach'],
        ['/student/report', FileTextOutlined, '学期报告', published ? '你的成长手册已发布' : '期待下一份成长答卷', 'sage']
      ].map(([path, Icon, title, subtitle, color]) => <Link className={`growth-shortcut ${color}`} to={path} key={path}><span className="shortcut-icon">{createElement(Icon)}</span><strong>{title}</strong><span>{subtitle}</span><ArrowRightOutlined className="shortcut-arrow" /></Link>)}</div>
    </div>
    <div className="growth-bottom">
      <section className="growth-panel dimensions-panel"><div className="panel-heading"><div><span className="section-kicker">SIX WAYS TO BLOOM</span><h2>成长，不止一种模样</h2></div><Link to="/student/evaluation" aria-label="查看六育评价"><ArrowRightOutlined /></Link></div><p className="panel-intro">在六个方向，发现不一样的自己。</p><div className="dimension-grid">{DIMENSIONS.map(([letter, name, caption, style]) => <Link to={style === 'story' ? '/student/stories' : '/student/evaluation'} className={`dimension-item ${style}`} key={name}><span>{letter}</span><div><strong>{name}</strong><small>{caption}</small></div></Link>)}</div><div className={`report-status ${published ? 'published' : ''}`}><CheckCircleOutlined /><div><strong>{published ? `学期报告已发布 · V${evaluation.version || 1}` : '学期报告尚未发布'}</strong><span>{published ? '去看看这学期收获了什么吧。' : '继续积累自己的成长故事，发布后就能在这里看到。'}</span></div><Link to="/student/report" aria-label="查看学期报告"><ArrowRightOutlined /></Link></div></section>
      <section className="growth-panel timeline-panel"><div className="panel-heading"><div><span className="section-kicker">LITTLE STEPS, BIG GROWTH</span><h2>最近的成长足迹</h2></div><Link to="/student/ledger">查看积分 <ArrowRightOutlined /></Link></div>{timeline.length ? <ol className="growth-timeline">{timeline.slice(0, 4).map(item => <li key={item.id}><span className={`timeline-icon type-${item.type}`} aria-hidden="true">{item.type === 'SCORE' ? <CompassOutlined /> : item.type === 'HONOR' ? <TrophyOutlined /> : <ReadOutlined />}</span><div><div className="timeline-title"><strong>{item.title}</strong>{item.delta != null && Number(item.delta) !== 0 && <span className={`timeline-delta ${Number(item.delta) < 0 ? 'negative' : ''}`}>{Number(item.delta) > 0 ? '+' : ''}{item.delta}</span>}</div><p>{item.detail}</p><time dateTime={item.createdAt}>{Number.isNaN(new Date(item.createdAt).getTime()) ? '日期待确认' : new Date(item.createdAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</time>{item.status && <small className="timeline-status">{STATUS_NAMES[item.status] || '处理中'}</small>}</div></li>)}</ol> : <div className="growth-empty"><CompassOutlined /><strong>第一片叶子，等你来点亮</strong><p>扫一张奖励卡，或写下一段生活故事，<br />属于你的成长足迹就从这里开始。</p><Link to="/student/stories">去写一个故事 <ArrowRightOutlined /></Link></div>}<div className="timeline-footer"><span aria-hidden="true">✳</span> 每一步小小的坚持，都有被好好记住。</div></section>
    </div>
  </div>;
}
