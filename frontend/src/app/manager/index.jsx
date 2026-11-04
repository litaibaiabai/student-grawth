import React from 'react';
import AdminRegistry from './roster/AdminRegistry';
import SemesterCardQuota from './quota/SemesterCardQuota';
import AdminStatistics from './statistics/AdminStatistics';
export function ManagerView({tab,ctx}){return tab==='statistics'?<AdminStatistics ctx={ctx}/>:tab==='quota'?<SemesterCardQuota key={`${ctx.actor.id}:${ctx.termId}`} ctx={ctx}/>:<AdminRegistry ctx={ctx}/>;}
