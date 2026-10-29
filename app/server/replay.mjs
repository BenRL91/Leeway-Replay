import {eventFor,deliver} from './notifications.mjs';
// Identity is provided and sanitized by the private Sites dispatcher, never a client field.
export const COACH_ID = 'f5e7080d-7d25-434f-b7b5-c41f00e36eb9';
const RID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const CATEGORIES = ['Note','Question','Technique','Positioning','Decision-making','Drill'];
const response = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
class ReviewError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function text(value,max=10000){if(typeof value!=='string'||value.length>max)throw new ReviewError('A field is missing or too long.');return value.trim();}
function noteOptions(n,at){
 if(n.pauseOnOpen!==undefined&&typeof n.pauseOnOpen!=='boolean')throw new ReviewError('Choose a valid timestamp playback action.');
 const end=n.endAt===undefined||n.endAt===null?null:Math.round(n.endAt*1000)/1000;
 if(end!==null&&(!Number.isFinite(n.endAt)||end<=at||end>604800))throw new ReviewError('The context end must be after the note timestamp.');
 return {...(end!==null?{endAt:end}:{}),...(n.pauseOnOpen?{pauseOnOpen:true}:{})};
}
export function reviewContent(input) {
 if(!input || !Array.isArray(input.notes)||input.notes.length>300)throw new ReviewError('Invalid review notes.');
 const source=input.source;
 let clean=null;
 if(source){
  if(source.kind==='youtube' && /^[\w-]{11}$/.test(source.id)) clean={kind:'youtube',id:source.id,title:text(source.title||'YouTube video',500)};
  else if(source.kind==='file'&&source.local===true&&/^local_[a-f0-9]{64}$/.test(source.id))clean={kind:'file',id:source.id,title:text(source.title||'Local video',500),local:true,media:['audio','video'].includes(source.media)?source.media:'video'};
  else if(source.kind==='file' && RID.test(source.id)) clean={kind:'file',id:source.id,title:text(source.title||'Uploaded video',500)};
  else throw new ReviewError('Choose a supported video source.');
 }
 if(!Array.isArray(input.priorities)||input.priorities.length>50||!Array.isArray(input.drills)||input.drills.length>50)throw new ReviewError('Use lists of up to 50 priorities and drills.');
 const ids=new Set();
 const notes=input.notes.map(n=>{if(!RID.test(n.id)||ids.has(n.id)||!CATEGORIES.includes(n.category)||!Number.isFinite(n.at)||n.at<0||n.at>604800)throw new ReviewError('Invalid coaching note.');ids.add(n.id);const at=Math.round(n.at*1000)/1000;return {id:n.id,category:n.category,at,...noteOptions(n,at),body:text(n.body)};});
 return {title:text(input.title,200),player:text(input.player,200),source:clean,summary:text(input.summary),priorities:input.priorities.map(p=>text(p,2000)),drills:input.drills.map(p=>text(p,4000)),notes};
}
const key=id=>`replay/reviews/${id}.json`;
async function load(bucket,id,includeDeleted=false){const o=await bucket.get(key(id));if(!o)throw new ReviewError('This breakdown is unavailable.',404);const record=await o.json();if(record.state==='deleted'&&!includeDeleted)throw new ReviewError('This breakdown is unavailable.',404);return {record,etag:o.etag};}
async function body(request){const reader=request.body?.getReader();if(!reader)throw new ReviewError('Invalid request.');let size=0;const chunks=[];while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>512*1024){await reader.cancel();throw new ReviewError('Review is too large.',413);}chunks.push(p.value);}const b=new Uint8Array(size);let at=0;for(const c of chunks){b.set(c,at);at+=c.length;}try{return JSON.parse(new TextDecoder().decode(b));}catch{throw new ReviewError('Invalid request.');}}
async function save(bucket,r,etag){
 for(let attempt=0;attempt<3;attempt++){
  try{const o=await bucket.put(key(r.id),JSON.stringify(r),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});if(!o)throw new ReviewError('This review changed in another tab. Reload before saving.',409);return;}
  catch(e){if(e instanceof ReviewError||attempt===2||!(/429|rate limit|too many requests/i.test(e.message)))throw e;await new Promise(resolve=>setTimeout(resolve,1100));}
 }
}
async function validateSource(bucket,r,content){if(content.source?.kind==='file'&&!content.source.local){const o=await bucket.head(`users/${encodeURIComponent(r.owner)}/files/${content.source.id}`);if(o?.customMetadata?.media!=='video')throw new ReviewError('Select an available uploaded video from your library.');}}
function email(value){return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())?value.trim().toLowerCase():'';}
function permitted(r,user,preview,verifiedEmail=''){return preview?user===r.owner:r.state==='released'&&(user===r.owner||r.viewers.includes(user)||(verifiedEmail&&r.viewerEmails?.includes(verifiedEmail)));}
function view(r,preview,user){return {kind:r.kind||'coaching',ownerLabel:r.ownerLabel||'Coach Lee',permissions:{canEdit:user===r.owner,canDiscuss:r.state==='released'},id:r.id,state:preview?'preview':'released',releasedAt:preview?null:r.releasedAt,content:preview?r.draft:r.released};}
function coachRecord(r,origin){const {notificationOutbox,...visible}=r;return {...visible,viewerUrl:r.state==='released'?`${origin}/replay/view/${r.id}`:null};}
const discussionPrefix=id=>`replay/discussions/${id}/`;
const sourceKey=source=>source?`${source.kind}:${source.id}`:'';
async function discussionItems(bucket,r,user,verifiedEmail=''){
 let cursor;const entries=[];
 do{const page=await bucket.list({prefix:discussionPrefix(r.id),limit:100,cursor});for(const object of page.objects){const item=await (await bucket.get(object.key)).json();if((item.thread?.kind!=='coaching'||r.released?.notes.some(n=>n.id===item.thread.id))&&item.sourceKey===sourceKey(r.released?.source)&&(user===r.owner||(item.audience.includes(user)||(verifiedEmail&&item.audienceEmails?.includes(verifiedEmail)))))entries.push(item);}cursor=page.truncated?page.cursor:undefined;}while(cursor);
 const roots=new Map(entries.map(n=>[n.id,n]));
 return entries.filter(n=>!n.deleted).map(n=>{const anchor=n.thread?.kind==='discussion'?roots.get(n.thread.id):null;if(anchor){const {endAt,pauseOnOpen,...rest}=n;n={...rest,at:anchor.at,...noteOptions(anchor,anchor.at),thread:{...n.thread,at:anchor.at,endAt:anchor.endAt,pauseOnOpen:!!anchor.pauseOnOpen,body:anchor.deleted?'This note was deleted.':anchor.body}};}return n;}).sort((a,b)=>a.at-b.at||a.createdAt.localeCompare(b.createdAt)).map(({sourceKey,audience,audienceEmails,notificationEvent,...item})=>({...item,canDelete:user===r.owner||item.authorId===user,canEditTiming:!item.thread&&(user===r.owner||item.authorId===user)}));
}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function updateSnapshot(bucket,r,user,verifiedEmail){
 const entries=await discussionItems(bucket,r,user,verifiedEmail),feedback={};
 if(user!==r.owner)for(const note of r.released?.notes||[])feedback[note.id]=await digest(note);
 const sections={};if(user!==r.owner&&r.released)for(const name of ['source','summary','priorities','drills'])sections[name]=await digest(r.released[name]);
 const snapshot={feedback,sections,discussion:entries.filter(n=>n.authorId!==user).map(n=>n.id).sort()};
 return {snapshot,entries,token:await digest(snapshot)};
}
export async function handleReplay(request,env,user,rangeParser,principal){
 const url=new URL(request.url);const bucket=env.BUCKET;const isCoach=user===COACH_ID;
 // Principal comes only from server-side getUser. Request headers/body are not email proof.
 const verifiedEmail=principal?.email_confirmed_at&&Number.isFinite(Date.parse(principal.email_confirmed_at))?email(principal.email):'';
 try {
  if(url.pathname==='/api/replay/identity' && request.method==='GET')return response({ok:true,userId:user,email:verifiedEmail,isCoach});
  if(url.pathname==='/api/replay/mine'&&request.method==='GET'){
   let cursor;const reviews=[];
   do{const page=await bucket.list({prefix:'replay/reviews/',limit:100,cursor});for(const object of page.objects){const {record:r}=await load(bucket,object.key.split('/').pop().replace('.json',''),true);if(r.state!=='deleted'&&r.owner!==user&&permitted(r,user,false,verifiedEmail))reviews.push({id:r.id,kind:r.kind||'coaching',ownerLabel:r.ownerLabel||'Coach Lee',title:r.released.title,player:r.released.player,releasedAt:r.releasedAt,viewerUrl:`${url.origin}/replay/view/${r.id}`});}cursor=page.truncated?page.cursor:undefined;}while(cursor);
   return response({ok:true,reviews:reviews.sort((a,b)=>b.releasedAt.localeCompare(a.releasedAt))});
  }
  if(url.pathname==='/api/replay/reviews'){
   if(request.method==='GET'){let cursor;const reviews=[];do{const p=await bucket.list({prefix:'replay/reviews/',limit:100,cursor});for(const o of p.objects){const {record:r}=await load(bucket,o.key.split('/').pop().replace('.json',''),true);if(r.owner===user&&r.state!=='deleted')reviews.push({id:r.id,kind:r.kind||'coaching',revision:r.revision,title:r.draft.title,player:r.draft.player,state:r.state,updatedAt:r.updatedAt});}cursor=p.truncated?p.cursor:undefined;}while(cursor);return response({ok:true,reviews:reviews.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});}
   if(request.method==='POST'){const input=await body(request);const kind=input.kind||(isCoach?'coaching':'personal');if(!['personal','coaching'].includes(kind)||kind==='coaching'&&!isCoach)throw new ReviewError('Coaching breakdown creation is limited to Coach Lee.',403);const now=new Date().toISOString();const r={id:crypto.randomUUID(),owner:user,kind,ownerSubject:RID.test(principal?.id||'')?principal.id:null,ownerLabel:kind==='coaching'?'Coach Lee':text(principal?.user_metadata?.full_name||principal?.user_metadata?.name||'Replay owner',200),revision:1,state:'draft',draft:{title:'',player:'',source:null,notes:[],summary:'',priorities:[],drills:[]},viewers:[],viewerEmails:[],released:null,releasedAt:null,createdAt:now,updatedAt:now};await save(bucket,r);return response({ok:true,review:coachRecord(r,url.origin)},201);}
  }
  const match=/^\/api\/replay\/(reviews|view)\/([^/]+)(?:\/(preview|media|release|revoke|draft|discussion|delete|updates|seen|discussion-delete|discussion-edit))?$/.exec(url.pathname);
  if(!match||!RID.test(match[2]))throw new ReviewError('Not found.',404);
  const [,scope,id,operation]=match;const {record:r,etag}=await load(bucket,id,scope==='reviews'&&operation==='delete');
  if(operation==='updates'||operation==='seen'){
   const owner=r.owner===user;
   if(scope==='reviews'&&!owner||!owner&&!permitted(r,user,false,verifiedEmail))throw new ReviewError('This breakdown is unavailable.',404);
   const seenKey=`replay/seen/${encodeURIComponent(user)}/${id}.json`,stored=await bucket.get(seenKey),baseline=stored?await stored.json():null;
   const {snapshot,entries,token}=await updateSnapshot(bucket,r,user,verifiedEmail);
   if(operation==='seen'){
    if(request.method!=='POST')throw new ReviewError('Method not allowed.',405);
    if((await body(request)).token!==token)throw new ReviewError('New updates arrived. Review them before marking them as seen.',409);
    const {record:latest}=await load(bucket,id);
    if(!owner&&!permitted(latest,user,false,verifiedEmail)||latest.releasedAt!==r.releasedAt)throw new ReviewError('Review access or content changed. Reload before continuing.',409);
    const committed=await bucket.put(seenKey,JSON.stringify(snapshot),{onlyIf:stored?{etagMatches:stored.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    if(!committed)throw new ReviewError('Seen state changed in another tab. Refresh and try again.',409);
    return response({ok:true});
   }
   if(request.method!=='GET')throw new ReviewError('Method not allowed.',405);
   const feedback={};for(const [noteId,hash]of Object.entries(snapshot.feedback))if(baseline?.feedback?.[noteId]!==hash)feedback[noteId]=baseline?.feedback?.[noteId]?'Updated':'New';
   const sections=Object.keys(snapshot.sections).filter(name=>baseline?.sections?.[name]!==snapshot.sections[name]);
   const discussion=snapshot.discussion.filter(entryId=>!baseline?.discussion?.includes(entryId));
   const removed=Object.keys(baseline?.feedback||{}).filter(noteId=>!snapshot.feedback[noteId]).length;
   return response({ok:true,updates:{feedback,sections,discussion,removed,threads:[...new Set(entries.filter(n=>discussion.includes(n.id)).map(n=>n.thread?.id||n.id))],firstVisit:!baseline,token,releaseId:r.releasedAt}});
  }
  if(operation==='delete'){
   if(scope!=='reviews'||r.owner!==user)throw new ReviewError('This breakdown is unavailable.',404);
   if(request.method!=='POST')throw new ReviewError('Method not allowed.',405);
   const input=await body(request);
   if(r.state!=='deleted'){
    if(input.expectedRevision!==r.revision)throw new ReviewError('This review changed. Reload before deleting.',409);
    // Keep only a deletion marker: conditional stale writes cannot recreate deleted content.
    await save(bucket,{id:r.id,owner:r.owner,revision:r.revision+1,state:'deleted'},etag);
   }
   try{let cursor;const keys=[];do{const page=await bucket.list({prefix:discussionPrefix(id),limit:100,cursor});keys.push(...page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined;}while(cursor);
   for(const entryKey of keys)await bucket.delete(entryKey);
   }catch{throw new ReviewError('Review access has been removed, but conversation cleanup was not confirmed. Retry deleting this review.',503);}
   return response({ok:true,deleted:true});
  }
  if(['discussion','discussion-delete','discussion-edit'].includes(operation)){
   // Each call enforces current review grants. Client names/roles/IDs are never trusted.
   const coachAccess=user===r.owner;
   if(scope==='reviews'&&!coachAccess)throw new ReviewError('This breakdown is unavailable.',404);
   if(!coachAccess&&!permitted(r,user,false,verifiedEmail))throw new ReviewError('This breakdown is unavailable.',404);
   if(operation!=='discussion'){
    if(request.method!=='POST')throw new ReviewError('Method not allowed.',405);
    const input=await body(request);if(!RID.test(input.id))throw new ReviewError('Invalid note.');
    const noteKey=discussionPrefix(id)+input.id+'.json',stored=await bucket.get(noteKey);if(!stored)throw new ReviewError('This note is unavailable.',404);
    let entry=await stored.json();
    const visible=await discussionItems(bucket,r,user,verifiedEmail);
    if(!visible.some(n=>n.id===entry.id)||!(coachAccess||entry.authorId===user))throw new ReviewError('This note is unavailable.',404);
    if(input.expectedUpdatedAt!==(entry.updatedAt||entry.createdAt))throw new ReviewError('This note changed. Refresh before trying again.',409);
    const changedAt=new Date(Math.max(Date.now(),Date.parse(entry.updatedAt||entry.createdAt)+1)).toISOString();
    if(operation==='discussion-delete'){entry={...entry,deleted:true,body:'',updatedAt:changedAt};delete entry.notificationEvent;}
    else{if(entry.thread)throw new ReviewError('Edit the original question to change this thread’s timing.',400);if(!Number.isFinite(input.at)||input.at<0||input.at>604800)throw new ReviewError('Choose a valid start time.');const at=Math.round(input.at*1000)/1000,options=noteOptions({...input,pauseOnOpen:!!entry.pauseOnOpen},at);const {endAt,pauseOnOpen,...rest}=entry;entry={...rest,at,...options,updatedAt:changedAt};}
    const {record:latest}=await load(bucket,id);if(!coachAccess&&!permitted(latest,user,false,verifiedEmail)||latest.releasedAt!==r.releasedAt)throw new ReviewError('Review access changed. Reload before trying again.',409);
    const committed=await bucket.put(noteKey,JSON.stringify(entry),{onlyIf:{etagMatches:stored.etag},httpMetadata:{contentType:'application/json'}});if(!committed)throw new ReviewError('This note changed. Refresh before trying again.',409);
    return response({ok:true,entries:await discussionItems(bucket,r,user,verifiedEmail)});
   }
   if(request.method==='GET')return response({ok:true,entries:await discussionItems(bucket,r,user,verifiedEmail)});
   if(request.method!=='POST')throw new ReviewError('Method not allowed.',405);
   if(r.state!=='released'||!permitted(r,user,false,verifiedEmail))throw new ReviewError('Release this review before starting a discussion.',409);
   const input=await body(request);
   if(sourceKey(input.source)!==sourceKey(r.released.source))throw new ReviewError('The footage changed. Reload before posting.',409);
   if(!Number.isFinite(input.at)||input.at<0||input.at>604800||!['Note','Question','Reply',...CATEGORIES].includes(input.category))throw new ReviewError('Choose a valid timestamp and note type.');
   const message=text(input.body);if(!message)throw new ReviewError('Write a note or question first.');
   const visible=await discussionItems(bucket,r,user,verifiedEmail);
   const existing=await discussionItems(bucket,r,r.owner);if(existing.length>=300)throw new ReviewError('This discussion has reached its 300-note limit.',413);
   let thread=null,parentId=null,at=Math.round(input.at*1000)/1000,category=input.category;let options=input.replyTo?{}:noteOptions(input,at);
   if(input.replyTo){
    const target=input.replyTo;
    if(!RID.test(target.id)||!['coaching','discussion'].includes(target.kind))throw new ReviewError('Invalid reply target.');
    if(target.kind==='coaching'){
     const note=r.released.notes.find(n=>n.id===target.id);if(!note)throw new ReviewError('This coaching note is no longer released.',409);
     thread={kind:'coaching',id:note.id,at:note.at,...noteOptions(note,note.at),body:note.body,category:note.category,authorLabel:r.ownerLabel||'Coach Lee'};
    }else{
     const parent=visible.find(n=>n.id===target.id);if(!parent)throw new ReviewError('This conversation is unavailable.',404);
     // Even the coach cannot attach a new recipient's reply to a previous recipient's history.
     const stored=await (await bucket.get(discussionPrefix(id)+parent.id+'.json')).json();
     if(JSON.stringify(stored.audience)!==JSON.stringify(r.viewers)||JSON.stringify(stored.audienceEmails||[])!==JSON.stringify(r.viewerEmails||[]))throw new ReviewError('This conversation belongs to an earlier release audience.',409);
     parentId=parent.id;thread=parent.thread||{kind:'discussion',id:parent.id,at:parent.at,...noteOptions(parent,parent.at),body:parent.body,category:parent.category,authorLabel:parent.authorLabel};
    }
    at=thread.at;category='Reply';options=noteOptions(thread,at);
   }
   const {record:latest}=await load(bucket,id);
   if(latest.releasedAt!==r.releasedAt||!permitted(latest,user,false,verifiedEmail)||sourceKey(latest.released?.source)!==sourceKey(r.released?.source)||JSON.stringify(latest.viewers)!==JSON.stringify(r.viewers)||JSON.stringify(latest.viewerEmails)!==JSON.stringify(r.viewerEmails))throw new ReviewError('Review access changed. Reload before posting.',409);
   const entry={id:crypto.randomUUID(),at,...options,category,thread,parentId,body:message,authorId:user,authorLabel:coachAccess?(r.ownerLabel||'Coach Lee'):(text(principal?.user_metadata?.full_name||principal?.user_metadata?.name||r.released.player||'Participant',200)),authorRole:coachAccess?'coach':'player',createdAt:new Date().toISOString(),sourceKey:sourceKey(r.released.source),audience:[...r.viewers],audienceEmails:[...(r.viewerEmails||[])]};
   const notificationEvent=eventFor(r,principal,{entry});if(notificationEvent)entry.notificationEvent=notificationEvent;
   const committed=await bucket.put(discussionPrefix(id)+entry.id+'.json',JSON.stringify(entry),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
   if(!committed)throw new ReviewError('This discussion changed. Try again.',409);
   try{await deliver(env,notificationEvent);}catch{/* source commit remains successful; reconciler retries */}
   return response({ok:true,entries:await discussionItems(bucket,r,user,verifiedEmail)},201);
  }
  if(scope==='view'){
   if(!['GET','HEAD'].includes(request.method)||!permitted(r,user,false,verifiedEmail))throw new ReviewError('This breakdown is unavailable.',404);
   if(!operation)return response({ok:true,review:view(r,false,user)});
   if(operation!=='media')throw new ReviewError('Not found.',404);
  } else {
   if(r.owner!==user)throw new ReviewError('This breakdown is unavailable.',404);
   if(request.method==='GET'&&!operation)return response({ok:true,review:coachRecord(r,url.origin)});
   if(request.method==='GET'&&operation==='preview')return response({ok:true,review:view(r,true,user)});
   if(operation!=='media'){
    if(request.method!=='POST')throw new ReviewError('Method not allowed.',405);
    const input=await body(request);if(input.expectedRevision!==r.revision)throw new ReviewError('This review changed. Reload before editing.',409);
    if(operation==='draft'||(operation==='release'&&input.content)){
     r.draft=reviewContent(input.content);await validateSource(bucket,r,r.draft);
     if(!Array.isArray(input.viewers)||input.viewers.length>20||input.viewers.some(v=>typeof v!=='string'||!/^[-\w]{1,128}$/.test(v)))throw new ReviewError('Enter valid viewer access IDs (up to 20).');
     const emails=input.viewerEmails??[];if(!Array.isArray(emails)||emails.length>20||emails.some(e=>!email(e))||input.viewers.length+emails.length>20||(input.viewers.length&&emails.length))throw new ReviewError('Choose up to 20 recipient emails or access IDs.');
     r.draftViewers=[...input.viewers];r.draftViewerEmails=emails.map(email);
    }
    if(operation==='draft'){
     // Published content and grants stay immutable until release.
    }else if(operation==='release'){
     const c=reviewContent(r.draft);await validateSource(bucket,r,c);
     if(!c.title||!c.source||!c.notes.length||c.notes.some(n=>!n.body)||(r.kind!=='personal'&&(!c.player||!c.summary||!c.priorities.length||!c.drills.length||c.priorities.some(p=>!p)||c.drills.some(p=>!p))))throw new ReviewError(r.kind==='personal'?'Add a title, video and at least one note before sharing.':'Complete the video, player, title, notes, summary, at least one priority and at least one drill before release.');
     if(!r.draftViewers?.length&&!r.draftViewerEmails?.length)throw new ReviewError('Choose an intended recipient email or access ID before release.');
     r.notificationFirstRelease=!r.releasedAt;r.released=structuredClone(c);r.viewers=[...(r.draftViewers||[])];r.viewerEmails=[...(r.draftViewerEmails||[])];r.state='released';r.releasedAt=new Date().toISOString();
    }else if(operation==='revoke'){r.state='revoked';r.viewers=[];r.viewerEmails=[];}
    else throw new ReviewError('Not found.',404);
    r.revision++;r.updatedAt=new Date().toISOString();let notificationEvent=null;if(operation==='release'){notificationEvent=eventFor(r,principal,{first:r.notificationFirstRelease});delete r.notificationFirstRelease;if(notificationEvent)r.notificationOutbox=[...(r.notificationOutbox||[]),notificationEvent];}await save(bucket,r,etag);try{await deliver(env,notificationEvent);}catch{/* notification delivery never rolls back a committed review */}return response({ok:true,review:coachRecord(r,url.origin)});
   }
   if(!['GET','HEAD'].includes(request.method))throw new ReviewError('Method not allowed.',405);
  }
  const content=scope==='view'?r.released:r.draft;
  if(content.source?.kind!=='file'||content.source.local)throw new ReviewError('Video unavailable.',404);
  const fileKey=`users/${encodeURIComponent(r.owner)}/files/${content.source.id}`;
  const head=await bucket.head(fileKey);if(!head)throw new ReviewError('Video unavailable.',404);
  let range;try{range=rangeParser(request.headers.get('Range'),head.size);}catch{return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`,'Cache-Control':'private, no-store'}});}
  const headers={'Content-Type':head.customMetadata.contentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Length':String(range?.length??head.size),'Referrer-Policy':'no-referrer'};
  if(range)headers['Content-Range']=`bytes ${range.offset}-${range.offset+range.length-1}/${head.size}`;
  return new Response(request.method==='HEAD'?null:(await bucket.get(fileKey,range?{range}:undefined)).body,{status:range?206:200,headers});
 }catch(e){if(!(e instanceof ReviewError))console.error('Replay storage failure',e.message);return response({ok:false,error:e instanceof ReviewError?e.message:'Review storage is unavailable. Your draft is still here; try again.'},e instanceof ReviewError?e.status:503);}
}
