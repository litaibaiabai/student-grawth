import React from 'react';
import StudentHome, { StudentArchive, V2Home } from './home/StudentHome';
import SelfEvaluation from './self/SelfEvaluation';
import AwardUpload from './awards/AwardUpload';
import Cards from './cards/Cards';
import StoryActivities from './stories/StoryActivities';
import StoryForm from './stories/StoryForm';
import PublishedReport from './report/PublishedReport';

export function StudentView({ tab, ctx }) {
  const isV2 = ctx.catalog?.schemaVersion === 'SIX_EDU_V2';
  return (
    <>
      {tab === 'home' && (isV2 ? <V2Home ctx={ctx} /> : <StudentHome ctx={ctx} />)}
      {tab === 'archive' && <StudentArchive ctx={ctx} />}
      {tab === 'cards' && <Cards ctx={ctx} />}
      {tab === 'awards' && <AwardUpload ctx={ctx} />}
      {tab === 'stories' && (isV2 ? <StoryActivities ctx={ctx} /> : <StoryForm ctx={ctx} />)}
      {tab === 'self' && <SelfEvaluation ctx={ctx} />}
      {tab === 'report' && <PublishedReport ctx={ctx} />}
    </>
  );
}
