const KEY='PENDING_CARD_CLAIM';
const safeStore=()=>{try{return window.sessionStorage;}catch{return null;}};
export function extractCardToken(input){
 const text=String(input||'').trim();
 if(/^https?:\/\//i.test(text)){try{const url=new URL(text);const route=url.hash.slice(1);if(route.split('?')[0]!=='/student/claim')return '';return new URLSearchParams(route.split('?')[1]||'').get('token')||'';}catch{return '';}}
 return text.length<=256?text:'';
}
export function pendingClaimToken(storage=safeStore()){
 try{const value=JSON.parse(storage?.getItem(KEY)||'null');if(!value||Date.now()-value.at>30*60*1000){clearClaimIntent(storage);return '';}return extractCardToken(value.token);}catch{return '';}
}
export function clearClaimIntent(storage=safeStore()){try{storage?.removeItem(KEY);}catch{}}
export function claimReturnPath(storage=safeStore()){return pendingClaimToken(storage)?'/student/claim':'/dashboard';}
export function saveClaimToken(token,storage=safeStore()){try{if(token)storage?.setItem(KEY,JSON.stringify({token,at:Date.now()}));}catch{}}
export function captureClaimLocation(win=window){
 const route=win.location.hash.slice(1),[pathname,query]=route.split('?');
 if(pathname!=='/student/claim')return;
 const value=new URLSearchParams(query||'').get('token');
 if(value){const token=extractCardToken(value);if(token)saveClaimToken(token,win.sessionStorage);
 win.history.replaceState(win.history.state,'',`${win.location.pathname}${win.location.search}#/student/claim`);
 if(token&&win.dispatchEvent&&win.CustomEvent)win.dispatchEvent(new win.CustomEvent('card-claim-intent'));}
}
