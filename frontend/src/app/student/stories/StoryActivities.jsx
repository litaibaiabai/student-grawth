import React, { useCallback, useRef, useState } from 'react';
import ListeningStories from './ListeningStories';
import WrittenStories from './WrittenStories';
import StoryRecordings from './StoryRecordings';

export default function StoryActivities({ ctx }) {
  const [type, setType] = useState('LISTEN');
  const writeGuard = useRef(null);
  const registerGuard = useCallback(guard => { writeGuard.current = guard; }, []);
  return <>
    <header className="story-activity-heading"><p className="kicker">故事让成长有声</p><h2>云美故事</h2>
      <nav className="evaluation-tabs" aria-label="故事活动类型">
        {[
          ['LISTEN', '听故事'], ['WRITE', '写故事'], ['TELL', '讲故事'],
        ].map(([value, label]) => <button key={value} aria-pressed={type === value} className={type === value ? 'active' : ''} onClick={() => {
          if (value === type || writeGuard.current && !writeGuard.current()) return;
          setType(value);
        }}>{label}</button>)}
      </nav>
    </header>
    {type === 'WRITE' ? <WrittenStories key={ctx.termId} ctx={ctx} registerGuard={registerGuard}/> : type === 'LISTEN' ? <section className="panel story-activities"><ListeningStories key={ctx.termId} ctx={ctx}/></section> : <StoryRecordings key={ctx.termId} ctx={ctx} registerGuard={registerGuard}/>}
  </>;
}
export { StoryActivities };
