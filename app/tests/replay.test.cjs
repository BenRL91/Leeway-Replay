const {test}=require('node:test');const assert=require('node:assert/strict');
global.YouTutorCore=require('../core.js');const worker=import('../server/worker.mjs');const replay=import('../server/replay.mjs');
class Bucket {
 constructor(){this.data=new Map();this.seq=0;}
 async get(key,opt){const o=this.data.get(key);if(!o)return null;const bytes=opt?.range?o.bytes.slice(opt.range.offset,opt.range.offset+opt.range.length):o.bytes;return {...o,body:bytes,json:async()=>JSON.parse(new TextDecoder().decode(o.bytes))};}
 async delete(key){this.data.delete(key);}
 async head(key){return this.data.get(key)||null;}
 async put(key,body,opts={}){const old=this.data.get(key);if(opts.onlyIf?.etagMatches&&old?.etag!==opts.onlyIf.etagMatches)return null;if(opts.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(await new Response(body).arrayBuffer());const o={key,bytes,size:bytes.length,etag:String(++this.seq),uploaded:new Date(),customMetadata:opts.customMetadata};this.data.set(key,o);return o;}
 async list({prefix}){return {objects:[...this.data.values()].filter(o=>o.key.startsWith(prefix)),truncated:false};}
}
function request(path,user,method='GET',data,origin='https://test.local'){const headers={Origin:origin};if(user)headers['oai-authenticated-user-id']=user;return new Request('https://test.local'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});}
const videoId='11111111-1111-4111-8111-111111111111', noteId='22222222-2222-4222-8222-222222222222';
async function fixture(){const {default:w}=await worker;const {COACH_ID:coach}=await replay;const env={BUCKET:new Bucket()};const call=(path,user=coach,method='GET',data,origin)=>w.fetch(request(path,user,method,data,origin),env);const res=await call('/api/replay/reviews',coach,'POST',{});const r=(await res.json()).review;return {w,coach,env,call,r,content:{title:'Match review',player:'Player A',source:{kind:'youtube',id:'M7lc1UVf-VE',title:'Footage'},summary:'Takeaway',priorities:['One','Two','Three'],drills:['Drill one','Drill two'],notes:[{id:noteId,at:45,category:'Positioning',body:'Recover to the kitchen line.'}]}};}
test('draft isolation, coach-only editing and previews, CSRF and complete release requirements',async()=>{const {call,r,coach,content}=await fixture();const path='/api/replay/reviews/'+r.id;
 assert.equal((await call('/api/replay/reviews','viewer')).status,200);
 assert.equal((await call(path+'/preview','viewer')).status,404);
 assert.equal((await call('/api/replay/view/'+r.id,'viewer')).status,404);
 assert.equal((await call(path,null)).status,401);
 assert.equal((await call(path+'/draft','viewer','POST',{expectedRevision:1,content,viewers:['viewer']})).status,404);
 assert.equal((await call(path+'/draft',coach,'POST',{expectedRevision:1,content,viewers:['viewer']},'https://other.local')).status,403);
 assert.equal((await call(path+'/release',coach,'POST',{expectedRevision:1})).status,400);
 let saved=(await (await call(path+'/draft',coach,'POST',{expectedRevision:1,content,viewers:['viewer']})).json()).review;
 assert.equal(saved.revision,2);assert.equal(saved.viewerUrl,null);
 assert.equal((await call('/api/replay/view/'+r.id,'viewer')).status,404);
 assert.equal((await call('/api/replay/view/'+r.id,coach)).status,404);
 const preview=(await (await call(path+'/preview')).json()).review;assert.equal(preview.content.notes[0].at,45);
});
test('released snapshot stays isolated from later draft edits; grant changes require release; revoke works after reload',async()=>{const {call,r,coach,content,env,w}=await fixture();const path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 await call(path+'/draft',coach,'POST',{expectedRevision:1,content,viewers:['viewer']});
 const released=(await (await call(path+'/release',coach,'POST',{expectedRevision:2})).json()).review;
 assert.equal(released.viewerUrl,'https://test.local/replay/view/'+r.id);
 let data=(await (await call(view,'viewer')).json()).review;assert.equal(data.content.summary,'Takeaway');assert.equal(data.draft,undefined);assert.equal(data.viewers,undefined);assert.equal(data.owner,undefined);
 assert.equal((await call(view,'stranger')).status,404);
 await call(path+'/draft',coach,'POST',{expectedRevision:3,content:{...content,summary:'SECRET NEW DRAFT'},viewers:['other']});
 assert.equal((await (await call(view,'viewer')).json()).review.content.summary,'Takeaway');assert.equal((await call(view,'other')).status,404);
 assert.equal((await call(path+'/release',coach,'POST',{expectedRevision:3})).status,409);
 const loaded=await w.fetch(request(path,coach),{BUCKET:env.BUCKET});assert.equal((await loaded.json()).review.draft.summary,'SECRET NEW DRAFT');
 await call(path+'/revoke',coach,'POST',{expectedRevision:4});assert.equal((await call(view,'viewer')).status,404);assert.equal((await call(view,coach)).status,404);assert.equal((await call(path+'/preview')).status,200);
 const rerelease=(await (await call(path+'/release',coach,'POST',{expectedRevision:5})).json()).review;assert.equal(rerelease.state,'released');assert.equal((await call(view,'viewer')).status,404);assert.equal((await call(view,'other')).status,200);
});
test('uploaded video ranges use review ACL, never the viewer account, and are blocked after revocation',async()=>{const {call,r,coach,content,env,w}=await fixture();const path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 await env.BUCKET.put(`users/${coach}/files/${videoId}`,'abcdefghij',{customMetadata:{media:'video',contentType:'video/mp4',name:'game.mp4'}});
 await call(path+'/draft',coach,'POST',{expectedRevision:1,content:{...content,source:{kind:'file',id:videoId,title:'Game'}},viewers:['viewer']});
 const media=()=>w.fetch(new Request('https://test.local'+view+'/media',{headers:{'oai-authenticated-user-id':'viewer',Range:'bytes=2-5'}}),env);
 assert.equal((await media()).status,404);await call(path+'/release',coach,'POST',{expectedRevision:2});
 const res=await media();assert.equal(res.status,206);assert.equal(res.headers.get('Content-Range'),'bytes 2-5/10');assert.equal(await res.text(),'cdef');assert.equal(res.headers.get('Cache-Control'),'private, no-store');
 assert.equal((await call(`/api/files/${videoId}`,'viewer')).status,404);assert.equal((await call(view+'/media','stranger')).status,404);assert.equal((await call(path+'/media','viewer')).status,404);
 await call(path+'/revoke',coach,'POST',{expectedRevision:3});assert.equal((await media()).status,404);
});
test('new reviews and release changes preserve general YouTutor data; foreign sources and invalid notes rejected',async()=>{const {call,r,coach,content}=await fixture();
 await call('/api/library',coach,'POST',{type:'note.save',video:{id:'M7lc1UVf-VE',title:'Existing note'},at:1,body:'Keep this'});
 const path='/api/replay/reviews/'+r.id+'/draft';
 assert.equal((await call(path,coach,'POST',{expectedRevision:1,content:{...content,source:{kind:'file',id:videoId,title:'Foreign file'}},viewers:['viewer']})).status,400);
 assert.equal((await call(path,coach,'POST',{expectedRevision:1,content:{...content,notes:[{...content.notes[0],category:'<script>'}]},viewers:['viewer']})).status,400);
 assert.equal((await call(path,coach,'POST',{expectedRevision:1,content,viewers:Array.from({length:21},(_,i)=>'viewer'+i)})).status,400);
 const library=(await (await call('/api/library')).json()).state;assert.equal(library.notes[0].body,'Keep this');
 const list=(await (await call('/api/replay/reviews')).json()).reviews;assert.equal(list.length,1);
});
test('release can save and publish a complete review in one conditional write',async()=>{const {call,r,coach,content,env}=await fixture();const before=env.BUCKET.seq;const released=await call('/api/replay/reviews/'+r.id+'/release',coach,'POST',{expectedRevision:1,content,viewers:['viewer']});assert.equal(released.status,200);assert.equal(env.BUCKET.seq,before+1);const data=(await released.json()).review;assert.equal(data.revision,2);assert.equal(data.state,'released');assert.equal((await call('/api/replay/view/'+r.id,'viewer')).status,200);});
test('variable practice plans persist and release without fixed slots; empty and invalid plans cannot release',async()=>{
 const {call,r,coach,content}=await fixture();const path='/api/replay/reviews/'+r.id;assert.deepEqual(r.draft.priorities,[]);assert.deepEqual(r.draft.drills,[]);
 const plan={...content,priorities:['One focus'],drills:['Drill A','Drill B','Drill C','Drill D']};
 const release=await call(path+'/release',coach,'POST',{expectedRevision:1,content:plan,viewers:['viewer']});assert.equal(release.status,200);
 const shown=(await (await call('/api/replay/view/'+r.id,'viewer')).json()).review.content;assert.deepEqual(shown.priorities,plan.priorities);assert.deepEqual(shown.drills,plan.drills);
 for(const invalid of [{...plan,priorities:[]},{...plan,drills:[]},{...plan,drills:Array(51).fill('Too many')},{...plan,priorities:['']}])assert.equal((await call(path+'/release',coach,'POST',{expectedRevision:2,content:invalid,viewers:['viewer']})).status,400);
 assert.equal((await (await call('/api/replay/view/'+r.id,'viewer')).json()).review.content.drills.length,4);
});
test('discussion enforces release grants, stamps authors, persists both users, isolates draft edits and revokes',async()=>{
 const {call,r,coach,content,env,w}=await fixture();const path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id,discussion=view+'/discussion';
 const payload={source:content.source,at:28,category:'Question',body:'Should I move forward here?',authorId:coach,authorLabel:'Coach Lee',authorRole:'coach'};
 assert.equal((await call(discussion,'viewer','POST',payload)).status,404);
 assert.equal((await call(discussion,'viewer')).status,404);
 await call(path+'/release',coach,'POST',{expectedRevision:1,content,viewers:['viewer']});
 assert.equal((await call(discussion,'stranger','POST',payload)).status,404);
 assert.equal((await call(discussion,null,'POST',payload)).status,401);
 assert.equal((await call(discussion,'viewer','POST',payload,'https://evil.local')).status,403);
 assert.equal((await call(path+'/discussion','viewer')).status,404);
 assert.equal((await call(discussion,'viewer','POST',{...payload,at:-1})).status,400);
 let data=await (await call(discussion,'viewer','POST',payload)).json();assert.equal(data.entries[0].authorId,'viewer');assert.equal(data.entries[0].authorLabel,'Player A');assert.equal(data.entries[0].authorRole,'player');assert.equal(data.entries[0].audience,undefined);
 await call(path+'/discussion',coach,'POST',{source:content.source,at:30,category:'Reply',body:'Yes, after your return lands.'});
 const reloaded=await w.fetch(request(discussion,'viewer'),{BUCKET:env.BUCKET});data=await reloaded.json();assert.equal(data.entries.length,2);assert.equal(data.entries[1].authorLabel,'Coach Lee');
 // Conversation writes must never conflict with content revision or release draft edits.
 await call(path+'/draft',coach,'POST',{expectedRevision:2,content:{...content,summary:'Private edit'},viewers:['other']});
 assert.equal((await (await call(view,'viewer')).json()).review.content.summary,'Takeaway');assert.equal((await call(discussion,'other')).status,404);
 await call(path+'/revoke',coach,'POST',{expectedRevision:3});assert.equal((await call(discussion,'viewer')).status,404);assert.equal((await call(discussion,'viewer','POST',payload)).status,404);assert.equal((await call(path+'/discussion',coach,'POST',payload)).status,409);
 // A newly granted viewer must not inherit another player's questions or coach replies.
 await call(path+'/release',coach,'POST',{expectedRevision:4});data=await (await call(discussion,'other')).json();assert.equal(data.entries.length,0);assert.equal((await call(discussion,'viewer')).status,404);
 // Coach retains history for the same footage.
 assert.equal((await (await call(path+'/discussion',coach)).json()).entries.length,2);
});
test('conversation from different footage is not mixed into a replacement video',async()=>{
 const {call,r,coach,content}=await fixture();const path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 await call(path+'/release',coach,'POST',{expectedRevision:1,content,viewers:['viewer']});await call(view+'/discussion','viewer','POST',{source:content.source,at:5,category:'Note',body:'Old match note'});
 await call(path+'/release',coach,'POST',{expectedRevision:2,content:{...content,source:{...content.source,id:'abcdefghijk'}},viewers:['viewer']});
 assert.equal((await (await call(view+'/discussion','viewer')).json()).entries.length,0);assert.equal((await call(view+'/discussion','viewer','POST',{source:content.source,at:5,category:'Question',body:'Old video question'})).status,409);
});
test('threads bind replies to released coaching notes and questions, preserve context and reject inaccessible parents',async()=>{
 const {call,r,coach,content}=await fixture();const path='/api/replay/reviews/'+r.id,discussion='/api/replay/view/'+r.id+'/discussion';
 await call(path+'/release',coach,'POST',{expectedRevision:1,content,viewers:['viewer']});
 const payload={source:content.source,at:999,category:'Question',body:'How should I recover?',replyTo:{kind:'coaching',id:noteId},thread:{body:'Forged'}};
 let res=await call(discussion,'viewer','POST',payload);assert.equal(res.status,201);let entries=(await res.json()).entries;const reply=entries[0];assert.equal(reply.at,45);assert.equal(reply.category,'Reply');assert.equal(reply.thread.body,content.notes[0].body);
 res=await call(path+'/discussion',coach,'POST',{...payload,body:'Take two small steps.',replyTo:{kind:'discussion',id:reply.id}});assert.equal(res.status,201);entries=(await res.json()).entries;assert.equal(entries[1].parentId,reply.id);assert.deepEqual(entries[1].thread,reply.thread);
 res=await call(discussion,'viewer','POST',{...payload,replyTo:undefined,at:72,body:'A different question'});const question=(await res.json()).entries.find(n=>n.body==='A different question');
 res=await call(path+'/discussion',coach,'POST',{...payload,replyTo:{kind:'discussion',id:question.id},body:'Try a reset.'});assert.equal(res.status,201);const answer=(await res.json()).entries.find(n=>n.body==='Try a reset.');assert.equal(answer.at,72);assert.equal(answer.thread.id,question.id);assert.equal(answer.thread.body,question.body);
 assert.equal((await call(discussion,'viewer','POST',{...payload,replyTo:{kind:'coaching',id:videoId}})).status,409);
 assert.equal((await call(discussion,'viewer','POST',{...payload,replyTo:{kind:'discussion',id:videoId}})).status,404);
 await call(path+'/draft',coach,'POST',{expectedRevision:2,content:{...content,notes:[{...content.notes[0],body:'PRIVATE DRAFT'}]},viewers:['other']});
 assert.equal((await (await call(discussion,'viewer')).json()).entries[0].thread.body,content.notes[0].body);
 await call(path+'/revoke',coach,'POST',{expectedRevision:3});assert.equal((await call(discussion,'viewer','POST',payload)).status,404);
 await call(path+'/release',coach,'POST',{expectedRevision:4});assert.equal((await (await call(discussion,'other')).json()).entries.length,0);
 assert.equal((await call(discussion,'other','POST',{...payload,replyTo:{kind:'discussion',id:question.id}})).status,404);
 assert.equal((await call(path+'/discussion',coach,'POST',{...payload,replyTo:{kind:'discussion',id:question.id}})).status,409);
});
test('coach deletion removes drafts/releases/discussion, rejects stale or unauthorized deletes and preserves source/library',async()=>{
 const {call,r,coach,content,env}=await fixture();const path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 await env.BUCKET.put(`users/${coach}/files/${videoId}`,'footage',{customMetadata:{media:'video',contentType:'video/mp4'}});
 await call('/api/library',coach,'POST',{type:'note.save',video:{id:content.source.id,title:'Library footage'},at:1,body:'Keep my library note'});
 assert.equal((await call(path+'/delete','viewer','POST',{expectedRevision:1})).status,404);
 assert.equal((await call(path+'/delete',null,'POST',{expectedRevision:1})).status,401);
 assert.equal((await call(path+'/delete',coach,'POST',{expectedRevision:1},'https://evil.local')).status,403);
 assert.equal((await call(path+'/delete',coach,'POST',{expectedRevision:0})).status,409);
 assert.equal((await call(path)).status,200);
 await call(path+'/release',coach,'POST',{expectedRevision:1,content:{...content,source:{kind:'file',id:videoId,title:'Match'}},viewers:['viewer']});
 await call(view+'/discussion','viewer','POST',{source:{kind:'file',id:videoId},at:10,category:'Question',body:'Question'});
 assert.equal((await call(path+'/delete',coach,'POST',{expectedRevision:1})).status,409);
 assert.equal((await call(path+'/delete',coach,'POST',{expectedRevision:2})).status,200);
 for(const route of [path,path+'/preview',path+'/discussion',view,view+'/media',view+'/discussion'])assert.equal((await call(route,route.startsWith(view)?'viewer':coach)).status,404,route);
 assert.equal((await (await call('/api/replay/reviews')).json()).reviews.length,0);assert.equal((await (await call('/api/replay/mine','viewer')).json()).reviews.length,0);
 assert.equal((await env.BUCKET.list({prefix:'replay/discussions/'+r.id+'/'})).objects.length,0);
 assert.ok(await env.BUCKET.head(`users/${coach}/files/${videoId}`));assert.equal((await (await call('/api/library')).json()).state.notes[0].body,'Keep my library note');
 assert.equal((await call(path+'/draft',coach,'POST',{expectedRevision:2,content,viewers:['viewer']})).status,404);
 assert.equal((await call(path+'/delete',coach,'POST',{expectedRevision:2})).status,200);
 const marker=await (await env.BUCKET.get('replay/reviews/'+r.id+'.json')).json();assert.deepEqual(Object.keys(marker).sort(),['id','owner','revision','state']);
 const created=(await (await call('/api/replay/reviews',coach,'POST',{})).json()).review;assert.equal((await call('/api/replay/reviews/'+created.id+'/delete',coach,'POST',{expectedRevision:1})).status,200);
});
test('failed discussion cleanup leaves content inaccessible and deletion retry completes cleanup',async()=>{
 const {call,r,coach,content,env}=await fixture();const path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 await call(path+'/release',coach,'POST',{expectedRevision:1,content,viewers:['viewer']});await call(view+'/discussion','viewer','POST',{source:content.source,at:10,category:'Question',body:'Test'});
 const original=env.BUCKET.delete.bind(env.BUCKET);let fail=true;env.BUCKET.delete=async key=>{if(fail){fail=false;throw new Error('Temporary storage outage');}return original(key);};
 assert.equal((await call(path+'/delete',coach,'POST',{expectedRevision:2})).status,503);assert.equal((await call(view,'viewer')).status,404);assert.equal((await call(path+'/delete',coach,'POST',{expectedRevision:2})).status,200);assert.equal((await env.BUCKET.list({prefix:'replay/discussions/'+r.id+'/'})).objects.length,0);
});
test('fractional context ranges persist, isolate draft edits and validate before release',async()=>{
 const {call,r,coach,content}=await fixture();const path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 const ranged={...content,notes:[{...content.notes[0],at:45.125,endAt:49.5}]};assert.equal((await call(path+'/release',coach,'POST',{expectedRevision:1,content:ranged,viewers:['viewer']})).status,200);
 const note=(await (await call(view,'viewer')).json()).review.content.notes[0];assert.equal(note.at,45.125);assert.equal(note.endAt,49.5);
 for(const endAt of [44,45.125,{},'49',604801])assert.equal((await call(path+'/draft',coach,'POST',{expectedRevision:2,content:{...ranged,notes:[{...note,endAt}]},viewers:['viewer']})).status,400);
 await call(path+'/draft',coach,'POST',{expectedRevision:2,content:{...ranged,notes:[{...note,endAt:55}]},viewers:['viewer']});assert.equal((await (await call(view,'viewer')).json()).review.content.notes[0].endAt,49.5);
});
test('pause action and question ranges persist, validate, inherit in threads and respect release isolation',async()=>{
 const {call,r,coach,content}=await fixture();const path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 const ranged={...content,notes:[{...content.notes[0],pauseOnOpen:true,endAt:50}]};await call(path+'/release',coach,'POST',{expectedRevision:1,content:ranged,viewers:['viewer']});assert.equal((await (await call(view,'viewer')).json()).review.content.notes[0].pauseOnOpen,true);
 const payload={source:content.source,at:12.125,endAt:18.5,pauseOnOpen:true,category:'Decision-making',body:'What should I do?'};
 let res=await call(view+'/discussion','viewer','POST',payload);assert.equal(res.status,201);const q=(await res.json()).entries[0];assert.equal(q.at,12.125);assert.equal(q.endAt,18.5);assert.equal(q.pauseOnOpen,true);
 const persisted=(await (await call(view+'/discussion','viewer')).json()).entries[0];assert.deepEqual(persisted,q);
 res=await call(path+'/discussion',coach,'POST',{...payload,endAt:undefined,pauseOnOpen:false,body:'Reset.',replyTo:{kind:'discussion',id:q.id}});const reply=(await res.json()).entries.find(n=>n.body==='Reset.');assert.equal(reply.pauseOnOpen,true);assert.equal(reply.endAt,18.5);assert.equal(reply.thread.pauseOnOpen,true);
 for(const changes of [{endAt:12.125},{endAt:'18'},{pauseOnOpen:'true'}])assert.equal((await call(view+'/discussion','viewer','POST',{...payload,...changes})).status,400);
 assert.equal((await call(view+'/discussion','stranger','POST',payload)).status,404);
 await call(path+'/draft',coach,'POST',{expectedRevision:2,content:{...content,notes:[{...content.notes[0],pauseOnOpen:false}]},viewers:['viewer']});assert.equal((await (await call(view,'viewer')).json()).review.content.notes[0].pauseOnOpen,true);
});
test('notification outbox commits with release/discussion, survives drafts and delivery failure, excludes private content',async()=>{
 const f=await fixture(),{handleReplay}=await replay;const {reconcile}=await import('../server/notifications.mjs');const principal={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'leeohsunshine@gmail.com',email_confirmed_at:'2026-10-01T00:00:00Z'};
 const path='/api/replay/reviews/'+f.r.id;
 const call=(suffix,data,who=f.coach,p=principal)=>handleReplay(request(suffix,who,'POST',data),f.env,who,()=>null,p);
 await call(path+'/release',{expectedRevision:1,content:f.content,viewers:[],viewerEmails:['benlee.eelned@gmail.com']});
 let stored=await (await f.env.BUCKET.get('replay/reviews/'+f.r.id+'.json')).json();assert.equal(stored.notificationOutbox.length,1);assert.equal(stored.notificationOutbox[0].type,'replay.review.released');assert.equal(JSON.stringify(stored.notificationOutbox).includes('Takeaway'),false);
 await call(path+'/draft',{expectedRevision:2,content:{...f.content,summary:'PRIVATE'},viewers:[],viewerEmails:['other@example.com']});stored=await (await f.env.BUCKET.get('replay/reviews/'+f.r.id+'.json')).json();assert.equal(stored.notificationOutbox.length,1);
 const student={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',email:'benlee.eelned@gmail.com',email_confirmed_at:'2026-10-01T00:00:00Z'};
 const post=await call('/api/replay/view/'+f.r.id+'/discussion',{source:f.content.source,at:5,category:'Question',body:'Question secret'},'supabase_'+student.id,student);assert.equal(post.status,201);const visible=await post.json();assert.equal(visible.entries[0].notificationEvent,undefined);
 let entry=(await f.env.BUCKET.list({prefix:'replay/discussions/'})).objects[0];entry=await (await f.env.BUCKET.get(entry.key)).json();assert.equal(entry.notificationEvent.actorSubject,student.id);assert.deepEqual(entry.notificationEvent.recipients,[{verifiedEmail:'leeohsunshine@gmail.com'}]);
 f.env.REPLAY_NOTIFICATIONS_ENABLED='enabled';f.env.REPLAY_PRODUCER_SECRET='test-only-secret-with-at-least-thirty-two-characters';let calls=0;f.env.NOTIFICATIONS_FETCH=async()=>{calls++;throw Error('Network lost');};await reconcile(f.env);assert.equal(calls,2);assert.equal((await (await f.env.BUCKET.get('replay/reviews/'+f.r.id+'.json')).json()).notificationOutbox.length,1);
 // Losing the HTTP acknowledgement replays the exact logical event; a service duplicate ack completes it.
 for(const o of (await f.env.BUCKET.list({prefix:'replay/notification-delivery/'})).objects)await f.env.BUCKET.delete(o.key);
 const ids=[];f.env.NOTIFICATIONS_FETCH=async(_,init)=>{ids.push(JSON.parse(init.body).eventId);return Response.json({accepted:true,duplicate:true});};await reconcile(f.env);await reconcile(f.env);assert.equal(ids.length,2);assert.equal(new Set(ids).size,2);
 const response=await call(path+'/release',{expectedRevision:3});assert.equal(response.status,200);stored=await (await f.env.BUCKET.get('replay/reviews/'+f.r.id+'.json')).json();assert.equal(stored.notificationOutbox.length,2);assert.equal(stored.notificationOutbox[1].type,'replay.review.updated');assert.deepEqual(stored.notificationOutbox[1].recipients,[{verifiedEmail:'other@example.com'}]);
});
test('failed conditional commits generate no notification and removed coaching threads stop being visible',async()=>{
 const f=await fixture(),{handleReplay}=await replay;const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'leeohsunshine@gmail.com',email_confirmed_at:'2026-10-01T00:00:00Z'};const path='/api/replay/reviews/'+f.r.id;
 const call=(path,data)=>handleReplay(request(path,f.coach,'POST',data),f.env,f.coach,()=>null,actor);
 await call(path+'/release',{expectedRevision:1,content:f.content,viewers:[],viewerEmails:['benlee.eelned@gmail.com']});
 assert.equal((await call(path+'/release',{expectedRevision:1})).status,409);let stored=await (await f.env.BUCKET.get('replay/reviews/'+f.r.id+'.json')).json();assert.equal(stored.notificationOutbox.length,1);
 await call(path+'/discussion',{source:f.content.source,at:45,category:'Reply',body:'Follow up',replyTo:{kind:'coaching',id:noteId}});
 stored.released.notes=[];await f.env.BUCKET.put('replay/reviews/'+f.r.id+'.json',JSON.stringify(stored));const res=await handleReplay(request(path+'/discussion',f.coach),f.env,f.coach,()=>null,actor);assert.equal((await res.json()).entries.length,0);
});
test('account update baselines persist, isolate drafts and accounts, reject stale acknowledgements and revoked grants',async()=>{
 const {call,r,coach,content,env,w}=await fixture(),path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 assert.equal((await call(view+'/updates','viewer')).status,404);
 await call(path+'/draft',coach,'POST',{expectedRevision:1,content,viewers:['viewer']});await call(path+'/release',coach,'POST',{expectedRevision:2});
 const updates=async user=>(await (await call(view+'/updates',user)).json()).updates;
 let first=await updates('viewer');assert.equal(first.feedback[noteId],'New');assert.equal((await call(view+'/updates','stranger')).status,404);
 assert.equal((await call(view+'/seen','viewer','POST',{token:first.token})).status,200);
 const after=(await (await w.fetch(request(view+'/updates','viewer'),{BUCKET:env.BUCKET})).json()).updates;assert.deepEqual(after.feedback,{});assert.deepEqual(after.sections,[]);
 await call(path+'/draft',coach,'POST',{expectedRevision:3,content:{...content,notes:[{...content.notes[0],body:'PRIVATE DRAFT'}]},viewers:['viewer']});assert.deepEqual((await updates('viewer')).feedback,{});
 await call(path+'/release',coach,'POST',{expectedRevision:4});let changed=await updates('viewer');assert.equal(changed.feedback[noteId],'Updated');assert.equal((await call(view+'/seen','viewer','POST',{token:first.token})).status,409);
 await call(view+'/discussion','viewer','POST',{source:content.source,at:46,category:'Question',body:'Where should I move?'});
 assert.deepEqual((await updates('viewer')).discussion,[]);
 const coachUpdates=(await (await call(path+'/updates',coach)).json()).updates;assert.equal(coachUpdates.discussion.length,1);assert.deepEqual(coachUpdates.feedback,{});
 await call(path+'/seen',coach,'POST',{token:coachUpdates.token});assert.equal((await updates('viewer')).feedback[noteId],'Updated');
 await call(path+'/revoke',coach,'POST',{expectedRevision:5});assert.equal((await call(view+'/updates','viewer')).status,404);assert.equal((await call(view+'/seen','viewer','POST',{token:changed.token})).status,404);
});
test('note deletion and timing edits enforce authorship, persist, preserve replies without deleted text and reject revoked access',async()=>{
 const {call,r,coach,content,env,w}=await fixture(),path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 await call(path+'/draft',coach,'POST',{expectedRevision:1,content,viewers:['viewer']});await call(path+'/release',coach,'POST',{expectedRevision:2});
 const created=await (await call(view+'/discussion','viewer','POST',{source:content.source,at:12,endAt:18,category:'Question',body:'Original private question'})).json(),note=created.entries[0];
 assert.equal(note.canDelete,true);assert.equal(note.canEditTiming,true);
 const replied=await (await call(path+'/discussion',coach,'POST',{source:content.source,at:12,category:'Reply',body:'Keep this answer',replyTo:{kind:'discussion',id:note.id}})).json(),reply=replied.entries.find(n=>n.thread);
 assert.equal((await call(view+'/discussion-delete','viewer','POST',{id:reply.id,expectedUpdatedAt:reply.createdAt})).status,404);
 assert.equal((await call(view+'/discussion-edit','stranger','POST',{id:note.id,expectedUpdatedAt:note.createdAt,at:22,endAt:28})).status,404);
 assert.equal((await call(view+'/discussion-edit','viewer','POST',{id:note.id,expectedUpdatedAt:note.createdAt,at:22,endAt:21})).status,400);
 const edited=await (await call(view+'/discussion-edit','viewer','POST',{id:note.id,expectedUpdatedAt:note.createdAt,at:22.125,endAt:28.5})).json();assert.equal(edited.ok,true);assert.ok(edited.entries.every(n=>n.at===22.125&&n.endAt===28.5));const updated=edited.entries.find(n=>n.id===note.id);
 assert.equal((await call(view+'/discussion-delete','viewer','POST',{id:note.id,expectedUpdatedAt:note.createdAt})).status,409);
 const reload=await (await w.fetch(request(view+'/discussion','viewer'),{BUCKET:env.BUCKET})).json();assert.equal(reload.entries.find(n=>n.id===note.id).at,22.125);
 const deleted=await (await call(view+'/discussion-delete','viewer','POST',{id:note.id,expectedUpdatedAt:updated.updatedAt})).json();assert.equal(deleted.entries.length,1);assert.equal(deleted.entries[0].body,'Keep this answer');assert.equal(deleted.entries[0].thread.body,'This note was deleted.');assert.ok(!JSON.stringify(deleted).includes('Original private question'));
 assert.equal((await call(view+'/discussion','viewer','POST',{source:content.source,at:22,category:'Reply',body:'No resurrection',replyTo:{kind:'discussion',id:note.id}})).status,404);
 await call(path+'/revoke',coach,'POST',{expectedRevision:3});assert.equal((await call(view+'/discussion-delete','viewer','POST',{id:reply.id,expectedUpdatedAt:reply.createdAt})).status,404);
 assert.equal((await call(path+'/discussion-delete',coach,'POST',{id:reply.id,expectedUpdatedAt:reply.createdAt})).status,200);
 assert.deepEqual((await (await call(path+'/discussion',coach)).json()).entries,[]);
});
test('ordinary owners create, privately edit, share and revoke personal Replays; global coach role grants no foreign editing',async()=>{
 const {call,coach,env,w}=await fixture(),owner='ordinary-owner',guest='invited-person';
 const made=await call('/api/replay/reviews',owner,'POST',{kind:'personal'});assert.equal(made.status,201);
 const r=(await made.json()).review,path='/api/replay/reviews/'+r.id,view='/api/replay/view/'+r.id;
 const content={title:'My rally',player:'',source:{kind:'youtube',id:'M7lc1UVf-VE',title:'Footage'},notes:[{id:noteId,category:'Note',at:0,endAt:2.66,pauseOnOpen:true,body:'Inspect this frame'}],summary:'',priorities:[],drills:[]};
 assert.equal((await call('/api/replay/reviews',owner,'POST',{kind:'coaching'})).status,403);
 assert.equal((await call(path+'/draft',owner,'POST',{expectedRevision:1,content,viewers:[guest,coach]})).status,200);
 for(const stranger of [guest,coach]){
  assert.equal((await call(path,stranger)).status,404);assert.equal((await call(path+'/preview',stranger)).status,404);
  assert.equal((await call(view,stranger)).status,404);
  assert.equal((await call(path+'/draft',stranger,'POST',{expectedRevision:2,content,viewers:[stranger]})).status,404);
 }
 assert.equal((await call(path+'/release',owner,'POST',{expectedRevision:2})).status,200);
 const shared=(await (await call(view,guest)).json()).review;assert.equal(shared.kind,'personal');assert.equal(shared.ownerLabel,'Replay owner');assert.equal(shared.permissions.canEdit,false);assert.equal(shared.content.notes[0].pauseOnOpen,true);
 assert.equal((await (await call(view,owner)).json()).review.permissions.canEdit,true);
 assert.ok((await (await call('/api/replay/mine',guest)).json()).reviews.some(n=>n.id===r.id));
 assert.ok(!(await (await call('/api/replay/mine',owner)).json()).reviews.some(n=>n.id===r.id));
 assert.deepEqual((await (await call('/api/replay/reviews',guest)).json()).reviews,[]);
 await call(path+'/draft',owner,'POST',{expectedRevision:3,content:{...content,summary:'PRIVATE CHANGE'},viewers:[guest]});
 assert.equal((await (await call(view,guest)).json()).review.content.summary,'');
 const question=await call(view+'/discussion',guest,'POST',{source:content.source,at:10,category:'Question',body:'Why?',authorId:owner});assert.equal(question.status,201);
 const entry=(await question.json()).entries[0];assert.equal(entry.authorId,guest);assert.equal(entry.authorLabel,'Participant');
 const replied=await call(path+'/discussion',owner,'POST',{source:content.source,at:0,category:'Reply',body:'Here is why',replyTo:{kind:'coaching',id:noteId}});
 assert.equal(replied.status,201);assert.equal((await replied.json()).entries[0].thread.authorLabel,'Replay owner');
 assert.equal((await call(path+'/delete',coach,'POST',{expectedRevision:4})).status,404);
 const reloaded=await w.fetch(request(path,owner),{BUCKET:env.BUCKET});assert.equal((await reloaded.json()).review.draft.summary,'PRIVATE CHANGE');
 assert.equal((await call(path+'/revoke',owner,'POST',{expectedRevision:4})).status,200);
 assert.equal((await call(view,guest)).status,404);assert.equal((await call(view+'/discussion',guest)).status,404);
});
test('local Replays persist only file references and notes, allow sharing without server video, and preserve legacy coaching records',async()=>{
 const {call,r,coach,env}=await fixture(),owner='local-owner';
 const local=(await (await call('/api/replay/reviews',owner,'POST',{kind:'personal'})).json()).review,path='/api/replay/reviews/'+local.id;
 const source={kind:'file',local:true,id:'local_'+'a'.repeat(64),title:'Large local match.mp4',media:'video'};
 const content={title:'Local analysis',player:'',source,notes:[{id:noteId,category:'Note',at:1.125,body:'Note'}],summary:'',priorities:[],drills:[]};
 assert.equal((await call(path+'/release',owner,'POST',{expectedRevision:1,content,viewers:['viewer']})).status,200);
 assert.equal((await (await call('/api/replay/view/'+local.id,'viewer')).json()).review.content.source.local,true);
 assert.equal((await call('/api/replay/view/'+local.id+'/media','viewer')).status,404);
 assert.equal([...env.BUCKET.data.keys()].some(key=>key.includes('/files/')),false);
 const stored=await env.BUCKET.get('replay/reviews/'+r.id+'.json'),legacy=await stored.json();delete legacy.kind;delete legacy.ownerLabel;await env.BUCKET.put(stored.key,JSON.stringify(legacy));
 assert.equal((await call('/api/replay/reviews/'+r.id,coach)).status,200);
 assert.equal((await call('/api/replay/reviews/'+r.id+'/release',coach,'POST',{expectedRevision:1,content,viewers:['viewer']})).status,400);
});
test('personal discussion events target the actual owner and never the fixed coaching inbox',async()=>{
 const {eventFor}=await import('../server/notifications.mjs');
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',visitor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const r={id:videoId,kind:'personal',owner:'supabase_'+owner,ownerSubject:owner,revision:3,releasedAt:'2026-10-10T00:00:00Z',viewers:['supabase_'+visitor],viewerEmails:[]};
 const event=eventFor(r,{id:visitor},{entry:{id:noteId,at:0,category:'Question',authorRole:'player',createdAt:r.releasedAt}});
 assert.deepEqual(event.recipients,[{subject:owner}]);assert.equal(JSON.stringify(event).includes('leeohsunshine'),false);
 const ownerEvent=eventFor(r,{id:owner},{first:true});assert.deepEqual(ownerEvent.recipients,[{subject:visitor}]);
});
