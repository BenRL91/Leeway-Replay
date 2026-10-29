const {test}=require('node:test'); const assert=require('node:assert/strict');
const core=require('../core.js'); global.YouTutorCore=core;
const worker=import('../server/worker.mjs');
class Bucket {
 constructor(){this.data=new Map();this.seq=0;}
 async get(key,options){const o=this.data.get(key);if(!o)return null;const bytes=options?.range?o.bytes.slice(options.range.offset,options.range.offset+options.range.length):o.bytes;return {...o,body:bytes,json:async()=>JSON.parse(new TextDecoder().decode(o.bytes))};}
 async head(key){return this.data.get(key)||null;}
 async put(key,body,opts={}){const old=this.data.get(key);if(opts.onlyIf?.etagMatches && old?.etag!==opts.onlyIf.etagMatches)return null;if(opts.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(await new Response(body).arrayBuffer());const o={key,bytes,size:bytes.length,etag:String(++this.seq),uploaded:new Date(),customMetadata:opts.customMetadata,httpMetadata:opts.httpMetadata};this.data.set(key,o);return o;}
 async list({prefix}){return {objects:[...this.data.values()].filter(o=>o.key.startsWith(prefix)),truncated:false};}
}
function req(path,method='GET',body,user='alice',extra={}){const headers={'Origin':'https://test.local',...extra};if(user)headers['oai-authenticated-user-id']=user;return new Request('https://test.local'+path,{method,headers,body});}
const id='11111111-1111-4111-8111-111111111111';
test('uploaded file range playback, safe MIME, ownership and rejected inputs',async()=>{
 const {default:w,MAX_FILE}=await worker;const env={LEEWAY_CLOUD_UPLOADS:'enabled',BUCKET:new Bucket()};const path='/api/files/'+id;
 assert.equal((await w.fetch(req('/api/files','GET',undefined,null),env)).status,401);
 assert.equal((await w.fetch(req(path,'PUT','hello','alice',{'X-File-Name':'notes.txt','Content-Length':'5'}),env)).status,201);
 const list=await (await w.fetch(req('/api/files'),env)).json();assert.equal(list.files[0].name,'notes.txt');
 const range=await w.fetch(req(path,'GET',undefined,'alice',{Range:'bytes=1-3'}),env);assert.equal(range.status,206);assert.equal(await range.text(),'ell');assert.equal(range.headers.get('Content-Range'),'bytes 1-3/5');assert.equal(range.headers.get('Content-Type'),'text/plain');
 assert.equal((await w.fetch(req(path,'GET',undefined,'bob'),env)).status,404);
 assert.equal((await w.fetch(req(path,'GET',undefined,'alice',{Range:'bytes=90-'}),env)).status,416);
 assert.equal((await w.fetch(req(path,'PUT','x','alice',{'X-File-Name':'bad.html','Content-Length':'1'}),env)).status,400);
 assert.equal((await w.fetch(req(path,'PUT','x','alice',{'X-File-Name':'large.mp4','Content-Length':String(MAX_FILE+1)}),env)).status,413);
 assert.equal((await w.fetch(req('/api/library','POST','{}','alice',{Origin:'https://other.local'}),env)).status,403);
});
test('cloud file notes become tutorial steps, concurrent saves survive and stale edits fail',async()=>{
 const {default:w}=await worker;const env={LEEWAY_CLOUD_UPLOADS:'enabled',BUCKET:new Bucket()};
 const send=async action=>w.fetch(req('/api/library','POST',JSON.stringify(action)),env);
 await w.fetch(req('/api/files/'+id,'PUT','hi','alice',{'X-File-Name':'guide.txt','Content-Length':'2'}),env);
 const source={id,title:'guide.txt',kind:'file',media:'text'};
 await Promise.all([send({type:'note.save',video:source,at:0,body:'File note'}),send({type:'note.save',video:{id:'M7lc1UVf-VE',title:'Video'},at:12,body:'Video note'})]);
 let state=(await (await w.fetch(req('/api/library'),env)).json()).state;assert.equal(state.notes.length,2);
 const note=state.notes.find(n=>n.video.kind==='file');
 state=(await (await send({type:'tutorial.create',title:'Mixed tutorial'})).json()).state;
 const t=state.tutorials[0];state=(await (await send({type:'step.add',id:t.id,expectedRevision:1,noteId:note.id})).json()).state;
 assert.deepEqual(state.tutorials[0].steps[0].video,source);
 assert.equal((await send({type:'note.save',id:note.id,expectedRevision:9,at:0,body:'stale'})).status,400);
 assert.equal((await send({type:'note.save',video:{...source,id:'22222222-2222-4222-8222-222222222222'},at:0,body:'Missing'})).status,400);
 const legacy=core.empty();legacy.schemaVersion=1;assert.equal(core.validate(legacy).schemaVersion,2);
 const loaded=await (await w.fetch(req('/api/library'),env)).json();assert.match(loaded.accountKey,/^[a-f0-9]{64}$/);
});
test('range syntax accepts suffix and open ranges and rejects multirange',async()=>{const {parseRange}=await worker;assert.deepEqual(parseRange('bytes=-2',5),{offset:3,length:2});assert.deepEqual(parseRange('bytes=2-',5),{offset:2,length:3});assert.throws(()=>parseRange('bytes=0-1,3-4',5));});
test('local video notes persist and seek references survive tutorials; cloud video writes disabled by default',async()=>{
 const {default:w}=await worker,env={BUCKET:new Bucket()},source={kind:'file',local:true,media:'video',id:'local_'+'a'.repeat(64),title:'My local game.mp4'};
 const send=action=>w.fetch(req('/api/library','POST',JSON.stringify(action)),env);
 let response=await send({type:'note.save',video:source,at:123,body:'Local coaching note'});assert.equal(response.status,200);
 const note=(await response.json()).state.notes[0];assert.deepEqual(note.video,source);assert.equal(note.at,123);
 let state=(await (await send({type:'tutorial.create',title:'Practice'})).json()).state;const t=state.tutorials[0];
 state=(await (await send({type:'step.add',id:t.id,expectedRevision:1,noteId:note.id})).json()).state;
 const loaded=(await (await w.fetch(req('/api/library'),env)).json()).state;assert.deepEqual(loaded,state);assert.deepEqual(loaded.tutorials[0].steps[0].video,source);
 assert.equal([...env.BUCKET.data.keys()].some(k=>k.includes('/files/')),false);
 for(const path of ['/api/uploads','/api/uploads/'+id+'/parts/1','/api/uploads/'+id+'/complete'])assert.equal((await w.fetch(req(path,path.endsWith('/1')?'PUT':'POST','{}'),env)).status,403);
 assert.equal((await w.fetch(req('/api/files/'+id,'PUT','abc','alice',{'Content-Length':'3','X-File-Name':'a.mp4'}),env)).status,403);
 assert.equal((await send({type:'note.save',video:{...source,id},at:1,body:'Invalid local alias'})).status,400);
});
