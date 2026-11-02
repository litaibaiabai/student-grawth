import React from 'react';
import ManagerWorkspace from './releases/ManagerWorkspace';
import V2Administration from './releases/V2Administration';
import AdminRoster from './roster/AdminRoster';
import AdminClasses from './classes/AdminClasses';
import AdminAudit from './audit/AdminAudit';
import AdminQuota from './quota/AdminQuota';
import SubjectCardQuota from './quota/SubjectCardQuota';
import AdminTermSettings from './config/AdminTermSettings';
import AdminStatistics from './statistics/AdminStatistics';

export {
  ManagerWorkspace,
  V2Administration,
  AdminRoster,
  AdminClasses,
  AdminAudit,
  AdminQuota,
  SubjectCardQuota,
  AdminTermSettings,
  AdminStatistics,
};

export function ManagerView({ tab, ctx }) {
  const isV2 = ctx.catalog?.schemaVersion === 'SIX_EDU_V2';
  return (
    <>
      {tab === 'statistics' && <AdminStatistics ctx={ctx} />}
      {tab === 'releases' && (
        <>
          <ManagerWorkspace ctx={ctx} />
          {isV2 && <V2Administration ctx={ctx} />}
        </>
      )}
      {tab === 'roster' && <AdminRoster ctx={ctx} />}
      {tab === 'classes' && <AdminClasses ctx={ctx} />}
      {tab === 'audit' && <AdminAudit ctx={ctx} />}
      {tab === 'quota' && (isV2 ? <SubjectCardQuota ctx={ctx} /> : <AdminQuota ctx={ctx} />)}
      {tab === 'config' && <AdminTermSettings ctx={ctx} />}
    </>
  );
}

// Shared module API intentionally includes this non-component export.
// eslint-disable-next-line react-refresh/only-export-components
export const ManagerModule = {
  role: 'manager',
  Component: ManagerView,
  views: {
    releases: ManagerWorkspace,
    statistics: AdminStatistics,
    roster: AdminRoster,
    classes: AdminClasses,
    audit: AdminAudit,
    quota: AdminQuota,
    config: AdminTermSettings,
  },
};

export default ManagerModule;
