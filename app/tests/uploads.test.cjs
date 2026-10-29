const {test}=require('node:test'),assert=require('node:assert/strict');
global.YouTutorCore=require('../core.js');const worker=import('../server/worker.mjs'),uploadModule=import('../server/uploads.mjs');
class Bucket{
 constructor(){this.data=new Map();this.uploads=new Map();this.seq=0;}
 async get(key,opt){const o=this.data.get(key);if(!o)return null;const bytes=opt?.range?o.bytes.slice(opt.range.offset,opt.range.offset+opt.range.length):o.bytes;return {...o,body:bytes,json:async()=>JSON.parse(new TextDecoder().decode(o.bytes))};}
 async head(key){return this.data.get(key)||null;}
 async put(key,body,opts={}){const old=this.data.get(key);if(opts.onlyIf?.etagMatches&&old?.etag!==opts.onlyIf.etagMatches)return null;const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(await new Response(body).arrayBuffer());const o={key,bytes,size:bytes.length,etag:String(++this.seq),uploaded:new Date(),customMetadata:opts.customMetadata};this.data.set(key,o);return o;}
 async list({prefix,limit=1000,cursor}){const all=[...this.data.values()].filter(o=>o.key.startsWith(prefix)).sort((a,b)=>a.key.localeCompare(b.key)),offset=Number(cursor||0),objects=all.slice(offset,offset+limit);return {objects,truncated:offset+limit<all.length,cursor:String(offset+limit)};}
 async createMultipartUpload(key,opts){const uploadId=crypto.randomUUID();this.uploads.set(uploadId,{key,opts,parts:new Map()});return this.resumeMultipartUpload(key,uploadId);}
 resumeMultipartUpload(key,uploadId){return {uploadId,
 uploadPart:async(n,bytes)=>{const u=this.uploads.get(uploadId);if(!u||u.key!==key)throw Error('Missing upload');const etag=String(++this.seq);u.parts.set(n,{bytes:new Uint8Array(bytes),etag});return {partNumber:n,etag};},
 abort:async()=>{this.uploads.delete(uploadId);},
 complete:async receipts=>{const u=this.uploads.get(uploadId);if(!u)throw Error('Missing upload');const pieces=receipts.map(r=>{const part=u.parts.get(r.partNumber);assert.equal(part.etag,r.etag);return part.bytes;});const size=pieces.reduce((n,b)=>n+b.length,0),bytes=new Uint8Array(size);let at=0;for(const b of pieces){bytes.set(b,at);at+=b.length;}const o=await this.put(key,bytes,u.opts);this.uploads.delete(uploadId);return o;}};}
}
async function fixture(){const {default:w}=await worker;const bucket=new Bucket();return {bucket,call:(path,method='GET',body,user='alice',headers={})=>w.fetch(new Request('https://test.local'+path,{method,body,headers:{Origin:'https://test.local','oai-authenticated-user-id':user,...headers}}),{LEEWAY_CLOUD_UPLOADS:'enabled',BUCKET:bucket})};}
const start=(f,size,name='match.mp4')=>f.call('/api/uploads','POST',JSON.stringify({name,size}));
test('25 GiB capacity, input enforcement and per-account multipart isolation',async()=>{
 const f=await fixture(),{MAX_FILE,PART_SIZE}=await uploadModule;assert.equal(MAX_FILE,25*1024**3);
 assert.equal((await start(f,MAX_FILE+1)).status,413);assert.equal((await start(f,0)).status,413);assert.equal((await start(f,10,'bad.html')).status,400);
 const init=await start(f,MAX_FILE);assert.equal(init.status,201);const s=await init.json();assert.equal(s.parts,3200);assert.equal(s.partSize,PART_SIZE);assert.equal(s.uploadId,undefined);
 const base='/api/uploads/'+s.id;
 assert.equal((await f.call(base+'/parts/1','PUT','x','bob')).status,404);
 assert.equal((await f.call(base+'/complete','POST',undefined,'bob')).status,404);
 assert.equal((await f.call(base,'DELETE',undefined,'bob')).status,404);
 assert.equal((await f.call(base+'/parts/1','PUT','x','alice',{Origin:'https://evil.local'})).status,403);
 assert.equal((await f.call(base+'/parts/3201','PUT','x')).status,400);
 assert.equal((await f.call(base+'/parts/1','PUT','x')).status,413);
 assert.equal((await f.call(base+'/parts/1','PUT','x','alice',{'Content-Length':String(PART_SIZE)})).status,413);
 assert.equal((await f.call(base+'/complete','POST')).status,409);
 assert.equal((await f.call(base,'DELETE')).status,200);assert.equal((await f.call(base+'/complete','POST')).status,410);
 assert.equal((await f.call('/api/files')).status,200);assert.equal((await (await f.call('/api/files')).json()).files.length,0);
});
test('multipart retries, final-byte integrity, persistence and range playback',async()=>{
 const f=await fixture(),{PART_SIZE}=await uploadModule,size=PART_SIZE+3;
 const s=await (await start(f,size)).json(),base='/api/uploads/'+s.id,part=new Uint8Array(PART_SIZE);part.fill(7);
 assert.equal((await f.call(base+'/parts/1','PUT',part)).status,200);
 // Reconstructing the worker API for each request models lost in-memory state / reload.
 assert.equal((await f.call(base+'/parts/1','PUT',part)).status,200);
 assert.equal((await f.call(base+'/parts/2','PUT','tail')).status,413); // oversized actual bytes are rejected, even without a header
 assert.equal((await f.call(base+'/parts/2','PUT','end')).status,200);
 assert.equal((await (await f.call('/api/files')).json()).files.length,0);
 const completed=await (await f.call(base+'/complete','POST')).json();assert.equal(completed.file.size,size);assert.equal(completed.file.id,s.id);
 assert.equal((await (await f.call(base+'/complete','POST')).json()).file.id,s.id); // lost completion response
 const file='/api/files/'+s.id;const range=await f.call(file,'GET',undefined,'alice',{Range:`bytes=${PART_SIZE-1}-${PART_SIZE+2}`});assert.equal(range.status,206);assert.deepEqual(new Uint8Array(await range.arrayBuffer()),new Uint8Array([7,101,110,100]));
 assert.equal((await f.call(file,'GET',undefined,'bob')).status,404);
 assert.equal((await (await f.call('/api/files')).json()).files.length,1);
});
test('expired uploads cannot add parts or complete; cancellation cleans provider upload',async()=>{
 const f=await fixture(),s=await (await start(f,3)).json(),key=`users/alice/uploads/${s.id}/session.json`,record=await f.bucket.get(key),data=await record.json();await f.bucket.put(key,JSON.stringify({...data,expiresAt:0}));
 assert.equal((await f.call(`/api/uploads/${s.id}/parts/1`,'PUT','abc')).status,410);assert.equal((await f.call(`/api/uploads/${s.id}/complete`,'POST')).status,410);
 assert.equal((await f.call(`/api/uploads/${s.id}`,'DELETE')).status,200);assert.equal(f.bucket.uploads.size,0);
});

test('15 and 25 GiB upload sessions supported; large completion manifest uses four pages and ordered metadata',async()=>{
 const f=await fixture(),{PART_SIZE,loadPartReceipts}=await uploadModule;
 const fifteen=await start(f,15*1024**3);assert.equal(fifteen.status,201);assert.equal((await fifteen.json()).parts,1920);
 const s=await (await start(f,25*1024**3)).json();assert.equal(s.parts,3200);
 const prefix='users/alice/';
 for(let n=1;n<=s.parts;n++)await f.bucket.put(`${prefix}uploads/${s.id}/parts/${n}`,JSON.stringify({partNumber:n,etag:`etag-${n}`}),{customMetadata:{partNumber:String(n),partEtag:`etag-${n}`}});
 let lists=0,gets=0;const list=f.bucket.list.bind(f.bucket),get=f.bucket.get.bind(f.bucket);f.bucket.list=async o=>{lists++;return list(o);};f.bucket.get=async k=>{gets++;return get(k);};
 const receipts=await loadPartReceipts(f.bucket,prefix,s);assert.equal(receipts.length,3200);assert.equal(lists,4);assert.equal(gets,0);
 assert.equal(receipts[9].partNumber,10);assert.equal(receipts[3199].etag,'etag-3200');
 assert.equal(await loadPartReceipts(f.bucket,'users/bob/',s),null);
});
test('uploads begun before this upgrade retain compatible receipts',async()=>{
 const f=await fixture(),{loadPartReceipts}=await uploadModule,s=await (await start(f,3)).json();
 await f.bucket.put(`users/alice/uploads/${s.id}/parts/1`,JSON.stringify({partNumber:1,etag:'legacy'}));
 assert.deepEqual(await loadPartReceipts(f.bucket,'users/alice/',s),[{partNumber:1,etag:'legacy'}]);
});
