import {sendEvent} from './notification-producer.mjs';
const SERVICE='https://leewaypb-library.leeohsunshine.chatgpt.site';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const ackKey=id=>'replay/notification-delivery/'+encodeURIComponent(id)+'.json';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
export function audience(r){return [...(r.viewerEmails||[]).map(verifiedEmail=>({verifiedEmail})),...(r.viewers||[]).filter(v=>v.startsWith('supabase_')&&UUID.test(v.slice(9))).map(v=>({subject:v.slice(9)}))];}
export function eventFor(r,principal,{entry,first=false}={}){
 if(!UUID.test(principal?.id||''))return null;
 const ownerRecipient=r.ownerSubject?[{subject:r.ownerSubject}]:r.owner?.startsWith('supabase_')&&UUID.test(r.owner.slice(9))?[{subject:r.owner.slice(9)}]:r.owner==='f5e7080d-7d25-434f-b7b5-c41f00e36eb9'?[{verifiedEmail:'leeohsunshine@gmail.com'}]:[];
 const recipients=entry?.authorRole==='player'?ownerRecipient:audience(r);
 const filtered=recipients.filter(v=>(!v.subject||v.subject!==principal.id)&&(!v.verifiedEmail||v.verifiedEmail!==principal.email?.trim().toLowerCase()));
 if(!filtered.length)return null;
 if(entry&&!['Question','Reply'].includes(entry.category))return null;
 return {contract:'leewaypb.notifications.event',version:1,app:'replay',eventId:entry?`discussion:${entry.id}:created`:`review:${r.id}:release:${r.revision}`,type:entry?(entry.category==='Reply'?'replay.reply.created':'replay.question.created'):first?'replay.review.released':'replay.review.updated',occurredAt:entry?.createdAt||r.releasedAt,actorSubject:principal.id,recipients:filtered,target:{reviewId:r.id,releaseId:r.releasedAt,...(entry?{entryId:entry.id,at:entry.at,...(entry.thread?{threadId:entry.thread.id}:{})}:{})}};
}
export async function deliver(env,event){
 if(!event)return {state:'skipped'};
 const key=ackKey(event.eventId),old=await env.BUCKET.get(key),state=old?await old.json():null;
 if(state?.delivered||state?.permanent||state?.nextAttempt>Date.now())return state;
 if(env.REPLAY_NOTIFICATIONS_ENABLED!=='enabled'||!env.REPLAY_PRODUCER_SECRET)return {state:'blocked'};
 const attempts=(state?.attempts||0)+1;
 try{const result=await sendEvent({serviceUrl:SERVICE,secret:env.REPLAY_PRODUCER_SECRET,event,fetcher:env.NOTIFICATIONS_FETCH||fetch});if(result.accepted!==true)throw Error('Invalid ingestion acknowledgement');const done={delivered:true,attempts,deliveredAt:new Date().toISOString()};await env.BUCKET.put(key,JSON.stringify(done));return done;}
 catch(error){const permanent=!!error.status&&error.status<500&&error.status!==429;const failed={delivered:false,attempts,permanent,status:error.status||0,nextAttempt:Date.now()+Math.min(3600000,1000*2**Math.min(attempts,12))*(.8+Math.random()*.4)};await env.BUCKET.put(key,JSON.stringify(failed));return failed;}
}
// Immutable events are part of source commits; acknowledgements never rewrite source/revisions.
export async function reconcile(env,{limit=25,cursor}={}){
 const pending=[];let examined=0;const page=await env.BUCKET.list({prefix:'replay/',limit:100,cursor});
 for(const object of page.objects){if(!/^replay\/(reviews|discussions)\//.test(object.key))continue;const o=await env.BUCKET.get(object.key);if(!o)continue;const r=await o.json();for(const event of [...(r.notificationOutbox||[]),...(r.notificationEvent?[r.notificationEvent]:[])]){examined++;try{const state=await deliver(env,event);if(!state?.delivered)pending.push({eventId:event.eventId,state:state?.permanent?'needs-attention':state?.state||'retry',status:state?.status||0});}catch{pending.push({eventId:event.eventId,state:'retry',status:0});}}}
 return {pending,nextCursor:page.truncated?page.cursor:null};
}
export async function proxyNotifications(request,env,auth){
 const url=new URL(request.url),path=url.pathname.slice('/api/notifications'.length);
 if(path==='/status'&&request.method==='GET')return json({enabled:env.REPLAY_NOTIFICATIONS_ENABLED==='enabled'&&!!env.REPLAY_PRODUCER_SECRET,email:false,push:false});
 if(path==='/reconcile'&&auth.isCoach&&request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin||request.headers.get('x-leeway-session')!=='1')return json({error:'Same-origin confirmation required'},403);
  return json(await reconcile(env,{cursor:url.searchParams.get('cursor')||undefined}));
 }
 if(env.REPLAY_NOTIFICATIONS_ENABLED!=='enabled'||!env.REPLAY_PRODUCER_SECRET)return json({error:'Notifications await service activation.'},503);
 const read=/^\/notifications\/[^/]{1,512}\/(read|open)$/.exec(path);
 const allowed=request.method==='GET'&&(path==='/inbox'||path==='/preferences'||read?.[1]==='open')||request.method==='PUT'&&(path==='/preferences'||read?.[1]==='read');
 if(!allowed)return json({error:'Not found'},404);
 if(request.method==='PUT'&&(request.headers.get('Origin')!==url.origin||request.headers.get('x-leeway-session')!=='1'))return json({error:'Same-origin confirmation required'},403);
 if(!auth.accessToken)return json({error:'Sign in required'},401);
 let body;if(request.method==='PUT'){if(Number(request.headers.get('Content-Length'))>4096)return json({error:'Request too large'},413);const reader=request.body?.getReader(),chunks=[];let size=0;if(!reader)return json({error:'Invalid request'},400);while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();return json({error:'Request too large'},413);}chunks.push(part.value);}body=new Uint8Array(size);let offset=0;for(const part of chunks){body.set(part,offset);offset+=part.length;}}
 if(path==='/preferences'&&request.method==='PUT'){
  let preference;try{preference=JSON.parse(new TextDecoder().decode(body));}catch{return json({error:'Invalid preference'},400);}
  if(!preference||Array.isArray(preference)||typeof preference.inApp!=='boolean'||!Number.isSafeInteger(preference.version)||preference.version<1||Object.keys(preference).some(key=>!['inApp','version'].includes(key)))return json({error:'Only the v1 in-app badge preference is supported. Email and push are inactive.'},400);
 }
 const upstream=new URL(SERVICE+'/v1'+path);if(path==='/inbox'&&url.searchParams.has('cursor')){const cursor=url.searchParams.get('cursor');if(cursor.length>2048)return json({error:'Invalid cursor'},400);upstream.searchParams.set('cursor',cursor);}
 try{const r=await (env.NOTIFICATIONS_FETCH||fetch)(upstream.href,{method:request.method,redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+auth.accessToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{})});if(r.status>=300&&r.status<400)return json({error:'Notification service unavailable'},503);const raw=await r.text();if(raw.length>262144||!r.headers.get('Content-Type')?.includes('application/json'))return json({error:'Notification service unavailable'},503);return new Response(raw,{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch{return json({error:'Notification service unavailable'},503);}
}

export async function reconcileSweep(env){
 if(env.REPLAY_NOTIFICATIONS_ENABLED!=='enabled'||!env.REPLAY_PRODUCER_SECRET)return;
 const key='replay/notification-sweep.json',object=await env.BUCKET.get(key),state=object?await object.json():{};
 if(state.after>Date.now())return;
 const claim=await env.BUCKET.put(key,JSON.stringify({...state,after:Date.now()+60000}),{onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'}});if(!claim)return;
 const result=await reconcile(env,{cursor:state.cursor||undefined});
 await env.BUCKET.put(key,JSON.stringify({cursor:result.nextCursor,after:Date.now()+60000,pending:result.pending}));
}
