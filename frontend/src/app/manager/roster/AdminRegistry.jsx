import React from 'react';
import RegistryWorkbookImport from './RegistryWorkbookImport';
import RegistryRelations from './RegistryRelations';
import './registry.css';
export default function AdminRegistry({ctx}){return <div className="registry-workspace"><RegistryWorkbookImport key={`${ctx.actor.id}:${ctx.termId}`} ctx={ctx}/><RegistryRelations ctx={ctx}/></div>;}
