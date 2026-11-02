import React,{useEffect,useState} from 'react';
import {api} from '../../core/api';
import TermReport from '../../../component/TermReport';
import {publishedDocumentKey,reportEmptyMessage} from './publishedReportModel.js';
export default function PublishedReport({ctx}){
 const {termId,actor,refreshKey,sessionActive,error:onError}=ctx,identity=`${actor.id}:${termId}`;
 const [state,setState]=useState(null),[failure,setFailure]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const c=new AbortController();setFailure('');setState(null);if(sessionActive!==false)api(`/report-core/reports/current?termId=${termId}`,undefined,undefined,{signal:c.signal}).then(report=>{if(!c.signal.aborted)setState({identity,report});}).catch(e=>{if(e.name!=='AbortError'){setFailure(e.message);if(e.status===401)onError(e);}});return()=>c.abort();},[termId,identity,refreshKey,sessionActive,onError,retry]);
 const report=state?.identity===identity?state.report:undefined;
 if(sessionActive===false)return <section className="panel">请重新登录后读取报告。</section>;
 if(failure)return <section className="panel feedback error" role="alert">{failure}<button onClick={()=>setRetry(n=>n+1)}>重新读取</button></section>;
 if(report===undefined)return <section className="panel" role="status">正在读取本学期已发布报告…</section>;
 return report?<TermReport key={publishedDocumentKey(report)} html={report.html}/>:<section className="panel empty"><h2>{reportEmptyMessage()}</h2><p>班主任确认后，你就可以在这里阅读和打印本学期的六育报告。</p></section>;
}
export {PublishedReport};
