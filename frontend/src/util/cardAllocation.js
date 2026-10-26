export const DIMENSIONS = ['D','Z','T','M','L','G'];
export const DIM_NAMES = {D:'德育',Z:'智育',T:'体育',M:'美育',L:'劳育',G:'故事'};
export function previewAllocation(total,ratios={}) {
  if(!Number.isSafeInteger(total)||total<0||total>100000)return null;
  const bps=DIMENSIONS.map(k=>Math.round(Number(ratios[k]||0)*100));
  if(bps.some(n=>!Number.isFinite(n)||n<0)||bps.reduce((a,b)=>a+b,0)!==10000)return null;
  const counts=bps.map(n=>Math.floor(total*n/10000));
  const order=bps.map((n,i)=>({i,remainder:total*n%10000})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let i=0,missing=total-counts.reduce((a,b)=>a+b,0);i<missing;i++)counts[order[i].i]++;
  return Object.fromEntries(DIMENSIONS.map((k,i)=>[k,counts[i]]));
}
