import React from 'react';
import TeacherWorkspace from './workspace/TeacherWorkspace';
import DirectScore from './direct/DirectScore';
import ComprehensiveImport from './imports/ComprehensiveImport';
import ReviewMaterials from './reviews/ReviewMaterials';
import V2Reviews from './reviews/V2Reviews';
import TermComments from './comments/TermComments';
import CourseCards from './cards/CourseCards';
import ClassReports from './reports/ClassReports';
import Settlements from './reports/Settlements';

export function TeacherView({ tab, ctx }) {
  const isV2 = ctx.catalog?.schemaVersion === 'SIX_EDU_V2';
  return (
    <>
      {tab === 'workspace' && <TeacherWorkspace ctx={ctx} />}
      {['entry', 'direct'].includes(tab) && <DirectScore ctx={ctx} />}
      {tab === 'imports' && <ComprehensiveImport ctx={ctx} />}
      {tab === 'reviews' &&
        (isV2 ? <V2Reviews ctx={ctx} /> : <ReviewMaterials ctx={ctx} />)}
      {tab === 'comments' && <TermComments ctx={ctx} />}
      {tab === 'cards-manage' && <CourseCards ctx={ctx}/>}
      {tab === 'drafts' && <ClassReports ctx={ctx} />}
      {tab === 'settlements' && <Settlements ctx={ctx} />}
    </>
  );
}
