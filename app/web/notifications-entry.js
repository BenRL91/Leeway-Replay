import {mountNotifications} from '/replay-notification-island.js';
import {createTransport} from '/shared/notifications/0.1.0/transport.js';
let island=null,identity=null,epoch=0;
const descriptions=new Map();
function describe(item){return descriptions.get(item.id)||{title:item.title,context:'',action:item.target?.entryId?'Open conversation':'Open breakdown'};}
async function enrichInbox(data,signal,generation){
 if(!Array.isArray(data.items))return data;descriptions.clear();
 const ids=[...new Set(data.items.map(n=>n.target?.reviewId).filter(id=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))];
 for(let offset=0;offset<ids.length;offset+=4){await Promise.all(ids.slice(offset,offset+4).map(async id=>{try{const response=await fetch('/api/replay/view/'+id,{credentials:'same-origin',cache:'no-store',signal});if(!response.ok)return;const result=await response.json();if(generation!==epoch)return;const review=result.review;if(!review?.content)return;let entries=[];if(data.items.some(n=>n.target?.reviewId===id&&n.target?.entryId)){const discussion=await fetch('/api/replay/view/'+id+'/discussion',{credentials:'same-origin',cache:'no-store',signal});if(discussion.ok)entries=(await discussion.json()).entries||[];}if(generation!==epoch)return;for(const item of data.items.filter(n=>n.target?.reviewId===id)){const entry=entries.find(n=>n.id===item.target.entryId);descriptions.set(item.id,{title:entry?`${entry.authorLabel} ${entry.category==='Reply'?'replied':'added a question or note'}`:(review.ownerLabel||'Replay owner')+' · Replay updated',context:review.content.title+(review.content.player?' · '+review.content.player:''),action:entry?'Open conversation':'Open breakdown'});}}catch(e){if(e.name==='AbortError')throw e;}}));}return data;
}
function teardown(){epoch++;descriptions.clear();island?.destroy();island=null;identity=null;}
window.addEventListener('leeway-session-changing',teardown);
window.addEventListener('pagehide',teardown);
async function setup(){
 const generation=++epoch;
 try{const session=await YouTutorSession.check();if(generation!==epoch)return;
  const r=await fetch('/api/notifications/status',{credentials:'same-origin',cache:'no-store'});const config=await r.json();if(!r.ok||!config.enabled||generation!==epoch)return;
  identity=session.user.id;
  const transport=createTransport({baseUrl:'/api/notifications',headers:{'x-leeway-session':'1'}});
  island=mountNotifications(document.getElementById('notifications'),{appearance:'host',describe,request:async(path,options)=>{const current=await YouTutorSession.check();if(current.user.id!==identity){teardown();throw new DOMException('Account changed','AbortError');}const requestEpoch=epoch;const data=await transport(path,options);if(path.startsWith('/inbox'))await enrichInbox(data,options?.signal,requestEpoch);if(requestEpoch!==epoch)throw new DOMException('Account changed','AbortError');return data;},onNavigate:async item=>{if(window.LeewayReplayNotifications){island?.close();try{await window.LeewayReplayNotifications.open(item);}catch(e){island?.open();throw e;}}else{const destination=new URL(item.destination,location.href);if(destination.origin!=='https://replay.leewaypb.com'&&destination.origin!==location.origin)throw Error('Invalid destination');if(!/^\/replay\/view\/[a-f0-9-]+$/.test(destination.pathname))throw Error('Invalid destination');location.assign(destination.href);}}});
 }catch{/* Disabled or unavailable notifications do not interrupt Replay. */}
}
window.addEventListener('pageshow',event=>{if(event.persisted)setup();});setup();
