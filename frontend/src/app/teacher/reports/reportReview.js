export function currentReviewRoute(route,detail){
 return detail?.viewVersion==='published'&&detail.permissions?.canReadFull
  ? {...route,reportVersion:'current',reportScope:'full',reportSection:undefined}:null;
}
