// Account-scoped multipart uploads. Provider IDs and part receipts remain server-side.
export const MAX_FILE = 25 * 1024 * 1024 * 1024;
export const PART_SIZE = 8 * 1024 * 1024;
export const SINGLE_MAX = 50 * 1024 * 1024;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail=(error,status=400)=>reply({ok:false,error},status);
export async function boundedBody(request,max){
 const reader=request.body?.getReader();if(!reader)throw Object.assign(new Error('Empty request.'),{status:400});
 const chunks=[];let size=0;
 for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>max){await reader.cancel();throw Object.assign(new Error('Request is too large.'),{status:413});}chunks.push(p.value);}
 const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.length;}return bytes;
}
const fileInfo=(s,o)=>({id:s.id,name:s.name,media:s.media,contentType:s.contentType,size:o.size,createdAt:o.uploaded});
export async function handleUploads(request,bucket,prefix,fileType){
 const path=new URL(request.url).pathname;
 try{
  if(path==='/api/uploads'&&request.method==='POST'){
   const input=JSON.parse(new TextDecoder().decode(await boundedBody(request,2048)));
   if(!Number.isSafeInteger(input.size)||input.size<1||input.size>MAX_FILE)return fail('Choose a nonempty file up to 25 GB.',413);
   const name=input.name;if(typeof name!=='string'||!name||name.length>200||/[\x00-\x1f/\\]/.test(name))return fail('Invalid filename.');
   const type=fileType(name);if(!type)return fail('This file type is not supported.');
   const id=crypto.randomUUID(),key=`${prefix}files/${id}`;
   const upload=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:type[1]},customMetadata:{name,media:type[0],contentType:type[1]}});
   const s={id,key,uploadId:upload.uploadId,name,media:type[0],contentType:type[1],size:input.size,partSize:PART_SIZE,parts:Math.ceil(input.size/PART_SIZE),expiresAt:Date.now()+24*60*60*1000,status:'active'};
   try{await bucket.put(`${prefix}uploads/${id}/session.json`,JSON.stringify(s));}catch(e){await upload.abort().catch(()=>{});throw e;}
   return reply({ok:true,id,partSize:PART_SIZE,parts:s.parts},201);
  }
  const m=/^\/api\/uploads\/([^/]+)(?:\/(complete|parts\/(\d+)))?$/.exec(path);
  if(!m||!UUID.test(m[1]))return fail('Not found.',404);
  const sessionKey=`${prefix}uploads/${m[1]}/session.json`,stored=await bucket.get(sessionKey);
  if(!stored)return fail('Upload not found.',404);
  let s=await stored.json();const upload=bucket.resumeMultipartUpload(s.key,s.uploadId);
  if(request.method==='DELETE'&&!m[2]){
   if(s.status==='aborted')return reply({ok:true});
   if(s.status!=='active')return fail('This upload is already being saved.',409);
   const saved=await bucket.put(sessionKey,JSON.stringify({...s,status:'aborted'}),{onlyIf:{etagMatches:stored.etag}});
   if(!saved)return fail('Upload changed. Try cancelling again.',409);
   await upload.abort();return reply({ok:true});
  }
  if(s.status==='aborted')return fail('This upload was cancelled.',410);
  if(request.method==='POST'&&m[2]==='complete'){
   const existing=await bucket.head(s.key);
   if(existing)return reply({ok:true,file:fileInfo(s,existing)});
   if(Date.now()>s.expiresAt)return fail('This upload expired. Choose the file again.',410);
   const receipts=await loadPartReceipts(bucket,prefix,s);
   if(!receipts)return fail('Some parts are missing. Retry the upload.',409);
   if(s.status==='active'){
    const locked=await bucket.put(sessionKey,JSON.stringify({...s,status:'completing'}),{onlyIf:{etagMatches:stored.etag}});
    if(!locked)return fail('Upload changed. Retry saving.',409);
   }
   let object;
   try{object=await upload.complete(receipts);}catch(e){object=await bucket.head(s.key);if(!object)throw e;}
   if(object.size!==s.size)throw new Error('Uploaded size did not match.');
   // Keeping the completing marker makes lost completion responses safe to retry.
   return reply({ok:true,file:fileInfo(s,object)},201);
  }
  if(s.status!=='active')return fail('This upload is already being saved.',409);
  if(Date.now()>s.expiresAt)return fail('This upload expired. Choose the file again.',410);
  if(request.method==='PUT'&&m[3]){
   const n=Number(m[3]);if(!Number.isInteger(n)||n<1||n>s.parts)return fail('Invalid upload part.');
   const expected=n===s.parts?s.size-(n-1)*PART_SIZE:PART_SIZE;
   const declared=request.headers.get('Content-Length');if(declared!==null&&Number(declared)!==expected)return fail('Upload part has the wrong size.',413);
   const bytes=await boundedBody(request,expected);if(bytes.length!==expected)return fail('Upload part has the wrong size.',413);
   const part=await upload.uploadPart(n,bytes);
   await bucket.put(`${prefix}uploads/${s.id}/parts/${n}`,JSON.stringify({partNumber:n,etag:part.etag}),{customMetadata:{partNumber:String(n),partEtag:part.etag}});
   return reply({ok:true,partNumber:n});
  }
  return fail('Method not allowed.',405);
 }catch(e){if(e.status)return fail(e.message,e.status);if(e instanceof SyntaxError)return fail('Invalid upload request.',400);console.error('Multipart upload failed',e.message);return fail('Upload could not finish. Check your connection and try again.',503);}
}

// Paginated metadata avoids one storage request per part when finishing long footage.
export async function loadPartReceipts(bucket,prefix,session){
 const base=`${prefix}uploads/${session.id}/parts/`,byNumber=new Map();let cursor;
 do{
  const page=await bucket.list({prefix:base,include:['customMetadata'],limit:1000,cursor});
  for(const object of page.objects){
   const n=Number(object.key.slice(base.length));
   if(!Number.isInteger(n)||n<1||n>session.parts)continue;
   const metadata=object.customMetadata;
   let part;
   if(metadata?.partNumber===String(n)&&metadata.partEtag)part={partNumber:n,etag:metadata.partEtag};
   else{const saved=await bucket.get(object.key);part=saved?await saved.json():null;} // pre-upgrade receipts
   if(part?.partNumber===n&&typeof part.etag==='string'&&part.etag)byNumber.set(n,part);
  }
  cursor=page.truncated?page.cursor:undefined;
 }while(cursor);
 if(byNumber.size!==session.parts)return null;
 return Array.from({length:session.parts},(_,i)=>byNumber.get(i+1));
}
