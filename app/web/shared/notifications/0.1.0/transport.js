/** Browser-safe. The host owns sign-in, refresh and admission. Tokens are never persisted here. */
export function createTransport({baseUrl='/api/notifications',getAccessToken,fetcher=globalThis.fetch,headers={}}={}){
 const base=baseUrl.replace(/\/$/,'');if(!base.startsWith('/')&&!/^https:\/\//.test(base))throw new Error('Use a relative route or HTTPS service URL.');
 return async function request(path,{method='GET',body,signal}={}){
  const token=getAccessToken?await getAccessToken():null;
  if(getAccessToken&&!token){const e=new Error('Sign in to view notifications.');e.status=401;throw e;}
  const r=await fetcher(base+path,{method,credentials:'same-origin',cache:'no-store',signal,headers:{...headers,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  let data;try{data=await r.json();}catch{throw new Error('Notifications are temporarily unavailable.');}
  if(!r.ok){const e=new Error(r.status===401?'Sign in to view notifications.':r.status===409?'This changed in another app. Refresh and try again.':r.status===404?'This notification is no longer available.':'Notifications are temporarily unavailable.');e.status=r.status;e.code=data.error;throw e;}return data;
 };
}
