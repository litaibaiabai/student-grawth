import React,{useEffect,useMemo,useRef,useState} from 'react';
export default function TermReport({html,documentKey,printScope='FULL',onLayout,onReady}) {
 const frame=useRef(null),callbacks=useRef({onLayout,onReady}),latest=useRef(null);
 callbacks.current={onLayout,onReady};
 const token=useMemo(()=>({id:crypto.randomUUID(),source:html,scope:printScope,key:documentKey||crypto.randomUUID(),active:true,probe:null,observer:null}),[html,documentKey,printScope]);latest.current=token;
 const [height,setHeight]=useState(1000),[ready,setReady]=useState(null),[hint,setHint]=useState('');
 useEffect(()=>{token.active=true;setReady(null);setHint('');return()=>{token.active=false;token.probe?.remove();token.observer?.disconnect();};},[token]);
 const current=(t,f)=>t.active&&latest.current===t&&frame.current===f;
 const measure=async element=>{
  const t=token;if(!current(t,element))return;const d=element.contentDocument;if(!d)return;
  // Screen preview grows with its contents; the original print CSS and frozen HTML stay intact.
  const screenStyle=d.createElement('style');screenStyle.media='screen';screenStyle.textContent='.paper{height:auto}';d.head.append(screenStyle);
  const resize=()=>{if(current(t,element))setHeight(Math.ceil(d.body.getBoundingClientRect().bottom+(d.defaultView?.scrollY||0))+30);};resize();t.observer?.disconnect();t.observer=new ResizeObserver(resize);t.observer.observe(d.body);
  const probe=document.createElement('iframe');t.probe?.remove();t.probe=probe;probe.setAttribute('aria-hidden','true');probe.tabIndex=-1;probe.style.cssText='position:fixed;left:-10000px;top:0;width:1123px;height:900px;visibility:hidden';probe.sandbox='allow-same-origin';
  probe.onload=async()=>{
   try {
    if(!current(t,element))return;const doc=probe.contentDocument;const style=doc.createElement('style');
    style.textContent=[...doc.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules];}catch{return [];}}).filter(rule=>rule.type===4&&rule.conditionText==='print').flatMap(rule=>[...rule.cssRules].map(r=>r.cssText)).join('\n');doc.head.append(style);await doc.fonts.ready;
    if(!current(t,element))return;
    const pages=[...doc.querySelectorAll('[data-print-page]')],sections=pages.map((page,i)=>{const body=page.querySelector('.continuation-body'),footer=page.querySelector('footer'),overlap=body&&footer&&getComputedStyle(footer).display!=='none'&&body.getBoundingClientRect().bottom>footer.getBoundingClientRect().top-2;return {page:i+1,type:page.classList.contains('report-continuation')?'continuation':page.classList.contains('report-front')?'front':'detail',overflow:page.scrollHeight>Math.ceil(page.getBoundingClientRect().height)+2||!!overlap,sections:[...page.querySelectorAll('[data-section]')].map(s=>s.dataset.section)};});
    const result={documentKey:t.key,renderScope:printScope,overflow:sections.some(s=>s.overflow),sections,pageCount:pages.length||null};
    const print=()=>{if(!current(t,element)||result.overflow)return false;element.contentWindow?.print();return true;};
    setReady({key:t.key,print,pageCount:result.pageCount,overflow:result.overflow});callbacks.current.onLayout?.(result);callbacks.current.onReady?.({documentKey:t.key,print,pageCount:result.pageCount});
   }catch {if(current(t,element))callbacks.current.onLayout?.({documentKey:t.key,renderScope:printScope,overflow:true,sections:[],pageCount:null});}
   finally{probe.remove();if(t.probe===probe)t.probe=null;}
  };
  probe.srcdoc=html;document.body.append(probe);
 };
 const usable=ready?.key===token.key&&token.active;
 return <div className="report-preview"><div className="report-toolbar"><span>{printScope==='FULL'?'完整报告':'六育明细'} · {usable?(ready.pageCount?`共 ${ready.pageCount} 页`:'历史版式，页数以打印面板为准'):'正在核对打印版面…'}</span><div className="actions"><button disabled={!usable||ready.overflow} onClick={()=>ready.print()}>打印</button><button disabled={!usable||ready.overflow} onClick={()=>{setHint('请在打印面板中选择“另存为 PDF”。');ready.print();}}>导出PDF</button></div></div>{usable&&ready.overflow&&<p role="alert">版面超出纸张，请调整后再打印。</p>}{hint&&<p role="status">{hint}</p>}<iframe key={token.id} title="六育评价报告" ref={frame} sandbox="allow-same-origin allow-modals" srcDoc={html} onLoad={event=>measure(event.currentTarget)} style={{width:'100%',height,border:0}}/></div>;
}
