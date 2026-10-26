// Own the identity of the preview, independently of editable input and request timing.
export function createCardClaimSession({fetchPreview,onPreview=()=>{},onError=()=>{},onLoading=()=>{}}) {
  let revision=0;
  let confirmed=null;
  return {
    invalidate(){revision++;confirmed=null;onLoading(false);},
    current(){return confirmed;},
    confirmedToken(){return confirmed?.token||null;},
    isCurrent(value){return value!==null&&value===confirmed;},
    async read(token){
      const request=++revision;confirmed=null;onLoading(true);
      try{
        const data=await fetchPreview(token);
        if(request!==revision)return;
        confirmed={token,data};onPreview(confirmed);
      }catch(error){if(request===revision)onError(error);}
      finally{if(request===revision)onLoading(false);}
    }
  };
}
