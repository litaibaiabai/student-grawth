function redactCardUrl(value){
  try{
    const url=new URL(value,'http://local');
    for(const key of [...url.searchParams.keys()]) if(['token','cardtoken'].includes(key.toLowerCase())) url.searchParams.set(key,'[redacted]');
    return url.pathname+url.search;
  }catch{return '[invalid-url]';}
}
module.exports={redactCardUrl};
