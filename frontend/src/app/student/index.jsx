import React from 'react';
import StudentHome, { StudentArchive, V2Home } from './home/StudentHome';
import SelfEvaluation from './self/SelfEvaluation';
import AwardUpload from './awards/AwardUpload';
import Cards from './cards/Cards';
import StoryActivities from './stories/StoryActivities';
import StoryForm from './stories/StoryForm';
import PublishedReport from './report/PublishedReport';

export {
  StudentHome,
  StudentArchive,
  V2Home,
  SelfEvaluation,
  AwardUpload,
  Cards,
  StoryActivities,
  StoryForm,
  PublishedReport,
};

export function StudentView({ tab, ctx }) {
  const isV2 = ctx.catalog?.schemaVersion === 'SIX_EDU_V2';
  return (
    <>
      {tab === 'home' && (isV2 ? <V2Home ctx={ctx} /> : <StudentHome ctx={ctx} />)}
      {tab === 'archive' && <StudentArchive ctx={ctx} />}
      {tab === 'cards' && <Cards ctx={ctx} />}
      {tab === 'awards' && <AwardUpload ctx={ctx} />}
      {tab === 'stories' && (isV2 ? <StoryActivities ctx={ctx} /> : <StoryForm ctx={ctx} />)}
      {tab === 'self' && (
        <>
          <SelfEvaluation ctx={ctx} />
          <button onClick={() => ctx.navigate('report')}>六育报告</button>
        </>
      )}
      {tab === 'report' && <PublishedReport ctx={ctx} />}
    </>
  );
}

// Shared module API intentionally includes this non-component export.
// eslint-disable-next-line react-refresh/only-export-components
export const StudentModule = {
  role: 'student',
  Component: StudentView,
  views: {
    home: StudentHome,
    archive: StudentArchive,
    self: SelfEvaluation,
    awards: AwardUpload,
    cards: Cards,
    stories: StoryActivities,
    report: PublishedReport,
  },
};

export default StudentModule;
