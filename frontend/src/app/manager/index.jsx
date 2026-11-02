import React from 'react';
import AdminRegistry from './roster/AdminRegistry';
import SemesterCardQuota from './quota/SemesterCardQuota';
import AdminStatistics from './statistics/AdminStatistics';
export {AdminRegistry,SemesterCardQuota,AdminStatistics};
export function ManagerView({tab,ctx}){return tab==='statistics'?<AdminStatistics ctx={ctx}/>:tab==='quota'?<SemesterCardQuota key={`${ctx.actor.id}:${ctx.termId}`} ctx={ctx}/>:<AdminRegistry ctx={ctx}/>;}
// eslint-disable-next-line react-refresh/only-export-components
export const ManagerModule={role:'manager',Component:ManagerView,views:{roster:AdminRegistry,quota:SemesterCardQuota,statistics:AdminStatistics}};
export default ManagerModule;
