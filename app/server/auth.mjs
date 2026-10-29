import {createClient} from '@supabase/supabase-js';
import {COACH_ID} from './replay.mjs';
export const ACCESS='__Host-yoututor-access', REFRESH='__Host-yoututor-refresh';
// Replay-specific owner allowlist, checked against two independent identities.
// Sites' dispatcher supplies a site-scoped ID (not the ChatGPT account ID)
// and a verified email. These reserved headers are controlled by dispatch.
// The second email comes from Supabase getUser, never browser metadata.
const COACH_EMAIL='leeohsunshine@gmail.com';
function verifiedSiteOwner(request,user){
 return !!request.headers.get('oai-authenticated-user-id') &&
  (request.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase()===COACH_EMAIL &&
  typeof user.email==='string' && user.email.trim().toLowerCase()===COACH_EMAIL &&
  typeof user.email_confirmed_at==='string' && Number.isFinite(Date.parse(user.email_confirmed_at));
}
const pendingRefresh=new Map();
class AuthFault extends Error { constructor(message,status=401){super(message);this.status=status;} }
function confirmedEmail(user){return typeof user.email==='string'&&typeof user.email_confirmed_at==='string'&&Number.isFinite(Date.parse(user.email_confirmed_at))?user.email.trim().toLowerCase():'';}
function admission(user,env){
 if(env.LEEWAY_ACCESS_MODE!=='allowlist')return;
 const approved=new Set([env.LEEWAY_APPROVED_EMAILS,env.LEEWAY_ADDITIONAL_APPROVED_EMAILS,env.REPLAY_BETA_APPROVED_EMAILS].filter(Boolean).join(',').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean));
 if(!confirmedEmail(user)||!approved.has(confirmedEmail(user)))throw new AuthFault('This app is available only to approved testers. Contact Coach Lee for access.',403);
}
export function authFailure(error){return error instanceof AuthFault?error.status:503;}
export function cookies(request,name){return (request.headers.get('Cookie')||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(name+'='))?.slice(name.length+1)||'';}
export function sessionHeaders(session){const headers=new Headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});for(const [name,value,age]of [[ACCESS,session?.access_token||'',session?.expires_in||0],[REFRESH,session?.refresh_token||'',session?2592000:0]])headers.append('Set-Cookie',`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`);return headers;}
function json(data,status=200,headers=new Headers()){headers.set('Content-Type','application/json');headers.set('Cache-Control','private, no-store');headers.set('Referrer-Policy','no-referrer');return new Response(JSON.stringify(data),{status,headers});}
function config(env){const url=new URL(env.SUPABASE_URL||'https://invalid.local');if(url.protocol!=='https:'||!env.SUPABASE_PUBLISHABLE_KEY||!env.LEEWAY_WEB_ORIGIN)throw new AuthFault('Sign-in is not configured.',503);return {url:url.origin,key:env.SUPABASE_PUBLISHABLE_KEY,origin:new URL(env.LEEWAY_WEB_ORIGIN).origin};}
function client(env){const c=config(env);return createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>(env.AUTH_FETCH||fetch)(input,{...init,signal:AbortSignal.timeout(10000)})}});}
function validUser(user){if(!user||!/^[-\w]{1,128}$/.test(user.id)||user.is_anonymous)throw new AuthFault('Sign in to LeewayPB.');return user;}
async function verified(token,env){if(!token||token.length>16384||/\s|;/.test(token))throw new AuthFault('Sign in to LeewayPB.');const {data,error}=await client(env).auth.getUser(token);if(error)throw new AuthFault('Sign in to LeewayPB.',error.status&&error.status<500?401:503);return validUser(data.user);}
function nearExpiry(token){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp*1000-Date.now()<120000;}catch{return false;}}
async function renew(token,env){if(!token||token.length>16384||/\s|;/.test(token))throw new AuthFault('Sign in to LeewayPB.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');const namespace=config(env).url+':'+hash;const now=Date.now();for(const [k,v]of pendingRefresh)if(v.until<now)pendingRefresh.delete(k);const existing=pendingRefresh.get(namespace);if(existing){const value=await existing.promise;await verified(value.session.access_token,env);return value;}
 const promise=(async()=>{const {data,error}=await client(env).auth.refreshSession({refresh_token:token});if(error||!data.session)throw new AuthFault('Sign in to LeewayPB.',error?.status&&error.status<500?401:503);const user=await verified(data.session.access_token,env);return {user,session:data.session};})();pendingRefresh.set(namespace,{promise,until:now+10000});try{return await promise;}catch(e){pendingRefresh.delete(namespace);throw e;}}
async function mapping(env){const stored=await env.BUCKET.get('auth/owner-link.json');return stored?await stored.json():null;}
export async function resolveAuth(request,env){const token=cookies(request,ACCESS),refresh=cookies(request,REFRESH);let user,activeToken=token,headers=new Headers();
 if(refresh&&(!token||nearExpiry(token))){const renewed=await renew(refresh,env);user=renewed.user;activeToken=renewed.session.access_token;headers=sessionHeaders(renewed.session);}else {try{user=await verified(token,env);}catch(e){if(!refresh)throw e;const renewed=await renew(refresh,env);user=renewed.user;activeToken=renewed.session.access_token;headers=sessionHeaders(renewed.session);}}
 admission(user,env);const link=await mapping(env);const linked=link?.subject===user.id&&link.issuer===config(env).url+'/auth/v1';const direct=env.LEEWAY_ACCESS_MODE==='allowlist';const coach=direct?confirmedEmail(user)===COACH_EMAIL:linked||verifiedSiteOwner(request,user);return {user,headers,accessToken:activeToken,storageId:coach?COACH_ID:`supabase_${user.id}`,isCoach:coach,linkRequired:!direct&&!coach&&!link&&request.headers.get('oai-authenticated-user-id')===COACH_ID};
}
export async function handleAuth(request,env){const url=new URL(request.url);try{
 if(request.method!=='GET'&&(request.headers.get('Origin')!==url.origin||request.headers.get('x-leeway-session')!=='1'))return json({ok:false,error:'Same-origin confirmation required.'},403);
 if(url.pathname==='/api/auth/config'&&request.method==='GET'){const c=config(env);const origins=new Set([c.origin,...(env.LEEWAY_ALLOWED_ORIGINS||'').split(',').map(origin=>origin.trim())]);const origin=origins.has(url.origin)?url.origin:c.origin;const res=await (env.AUTH_FETCH||fetch)(c.url+'/auth/v1/settings',{headers:{apikey:c.key},signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('Sign-in is temporarily unavailable.');const settings=await res.json();return json({ok:true,url:c.url,publishableKey:c.key,redirectTo:origin+'/auth/return',accountId:'yoututor',mode:'supabase',providers:{email:settings.external?.email===true,google:settings.external?.google===true,apple:settings.external?.apple===true}});}
 if(url.pathname==='/api/auth/session'){
  if(request.method==='GET'){try{const a=await resolveAuth(request,env);if(a.user.email?.trim().toLowerCase()===COACH_EMAIL)console.info('Replay owner access check',JSON.stringify({siteIdentityPresent:!!request.headers.get('oai-authenticated-user-id'),platformOwnerEmailMatch:(request.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase()===COACH_EMAIL,leewayEmailConfirmed:typeof a.user.email_confirmed_at==='string'&&Number.isFinite(Date.parse(a.user.email_confirmed_at)),coach:a.isCoach}));return json({ok:true,signedIn:true,user:{id:a.user.id,email:a.user.email||''},userId:a.storageId,isCoach:a.isCoach,linkRequired:a.linkRequired},200,a.headers);}catch(e){const code=authFailure(e);return json({ok:false,error:code===401?'Sign in to LeewayPB.':code===403?e.message:'Sign-in is temporarily unavailable. Your work is safe; try again.',code:code===401?'SIGN_IN_REQUIRED':code===403?'ACCESS_DENIED':'AUTH_UNAVAILABLE'},code);}}
  if(request.method==='POST'){const raw=await request.text();if(raw.length>20000)return json({ok:false,error:'Invalid request.'},400);const input=JSON.parse(raw);
   if(input.action==='signout'){const token=cookies(request,ACCESS);if(token){try{const c=config(env);await (env.AUTH_FETCH||fetch)(c.url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:c.key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});}catch{/* local cookie removal still proceeds */}}pendingRefresh.clear();return json({ok:true,signedOut:true},200,sessionHeaders());}
   if(!['signin','refresh'].includes(input.action))return json({ok:false,error:'Invalid request.'},400);
   const {session,user}=await renew(input.action==='signin'?input.refreshToken:cookies(request,REFRESH),env);admission(user,env);return json({ok:true,user:{id:user.id,email:user.email||''}},200,sessionHeaders(session));
  }
 }
 if(url.pathname==='/api/auth/link'&&request.method==='POST'){
  if(request.headers.get('oai-authenticated-user-id')!==COACH_ID||request.headers.get('x-confirm-link')!=='link-my-yoututor-account')return json({ok:false,error:'Only the current Leeway Replay owner may link this library.'},403);
  const a=await resolveAuth(request,env);const record={subject:a.user.id,issuer:config(env).url+'/auth/v1',storageId:COACH_ID,linkedAt:new Date().toISOString()};const existing=await mapping(env);
  if(existing){if(existing.subject!==record.subject||existing.issuer!==record.issuer)return json({ok:false,error:'This library is already linked to a different LeewayPB account. Sign in with that account.'},409);return json({ok:true,linked:true},200,a.headers);}
  const saved=await env.BUCKET.put('auth/owner-link.json',JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});if(!saved)return json({ok:false,error:'The account link changed. Reload before confirming.'},409);
  return json({ok:true,linked:true},200,a.headers);
 }
 return json({ok:false,error:'Not found.'},404);
 }catch(error){const status=authFailure(error);return json({ok:false,error:status===403?error.message:'Sign-in could not complete. Retry or sign in again; your library is safe.'},status);}}
export function mergeAuthHeaders(response,headers){const out=new Headers(response.headers);for(const cookie of headers.getSetCookie())out.append('Set-Cookie',cookie);out.set('Cache-Control','private, no-store');return new Response(response.body,{status:response.status,headers:out});}
