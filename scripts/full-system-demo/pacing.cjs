// Pause after visible actions, so the resulting screen can be read before the next action.
// Keep queries and readiness assertions at normal speed; they do not represent user actions.
function pace(surface,speed=1,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const cache=new WeakMap(),actions=new Set(['click','dblclick','fill','press','check','uncheck','selectOption','setInputFiles','setFiles','goto','reload','close']);
 function wrap(target){
  if(!target||typeof target!=='object'||!(typeof target.getByRole==='function'||typeof target.waitForEvent==='function'||typeof target.setFiles==='function'))return target;
  if(cache.has(target))return cache.get(target);
  const proxy=new Proxy(target,{get(object,key){const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
   return (...args)=>{const result=value.apply(object,args);
    if(actions.has(key))return Promise.resolve(result).then(async value=>{await sleep(2500/speed);return wrap(value)});
    return result&&typeof result.then==='function'?result.then(wrap):wrap(result);
   };
  }});cache.set(target,proxy);return proxy;
 }
 return wrap(surface);
}
module.exports={pace};
