const day=v=>v instanceof Date?v.toISOString().slice(0,10):v?String(v).slice(0,10):null;
function monthsOf(t){const months=[],start=day(t.start_date)?.slice(0,7),end=day(t.end_date)?.slice(0,7);let current=start;while(current&&current<=end&&months.length<120){months.push(current);const[y,m]=current.split('-').map(Number);current=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;}return months;}
module.exports={day,monthsOf};
