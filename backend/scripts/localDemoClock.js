// Only the localhost demo launcher imports this opt-in clock. Audit timestamps
// and database timestamps continue to record real time.
function localDemoClock(value,{environment=process.env.NODE_ENV,realNow=Date.now}={}){
 if(!value)return undefined;
 if(environment==='production')throw Error('Demo clock is forbidden in production');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Demo clock requires an ISO UTC timestamp');
 const offset=Date.parse(value)-realNow();return()=>new Date(realNow()+offset);
}
module.exports={localDemoClock};
