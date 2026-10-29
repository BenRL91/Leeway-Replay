(function(root){
 'use strict';
 const MAX_FILE=25*1024*1024*1024;
 async function timedAPI(path,options,timeout=45000){
  const controller=new AbortController();let timer;
  try{return await Promise.race([YouTutorAPI(path,{...options,signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('The server did not respond in time. Please try again.'));},timeout);})]);}
  finally{clearTimeout(timer);}
 }
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function uploadFile(file,{onProgress=()=>{},onStatus=()=>{}}={}){
  let cancelled=false,xhr=null,id=null,finishing=false;
  const stopped=()=>{if(cancelled)throw new Error('Upload cancelled.');};
  async function retry(task){
   for(let attempt=0;;attempt++){
    stopped();try{return await task();}catch(e){stopped();if(attempt===3||[400,401,403,404,410,413].includes(e.status))throw e;onStatus(`Connection interrupted. Retry ${attempt+1} of 3…`,{phase:'retrying',finishing});await pause(1000*(attempt+1));}
   }
  }
  function part(number,blob,done){return new Promise((resolve,reject)=>{
   const request=new XMLHttpRequest();xhr=request;request.open('PUT',`/api/uploads/${id}/parts/${number}`);request.setRequestHeader('Content-Type','application/octet-stream');request.timeout=180000;
   request.upload.onprogress=e=>{if(e.lengthComputable)onProgress((done+Math.min(e.loaded,blob.size))/file.size*100);};
   request.onload=()=>{try{const data=JSON.parse(request.responseText);if(request.status>=200&&request.status<300&&data.ok)resolve(data);else{const e=new Error(data.error||'Upload failed.');e.status=request.status;reject(e);}}catch{reject(new Error('Upload interrupted. Check your sign-in and retry.'));}};
   request.onerror=request.ontimeout=()=>reject(new Error('Upload interrupted. Check your connection and retry.'));
   request.onabort=()=>reject(new Error('Upload cancelled.'));request.send(blob);
  });}
  const promise=(async()=>{
   if(!file.size||file.size>MAX_FILE)throw new Error('Choose a nonempty file up to 25 GB.');
   try{
    // Do not retry initialization: a lost response must not create duplicate sessions.
    onStatus('Preparing your private upload…',{phase:'starting'});
    const session=await timedAPI('/api/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,size:file.size})});id=session.id;stopped();
    for(let n=1;n<=session.parts;n++){
     stopped();const start=(n-1)*session.partSize,blob=file.slice(start,Math.min(file.size,start+session.partSize));
     onStatus(`Sending part ${n} of ${session.parts}…`,{phase:'uploading'});
     await retry(()=>{onProgress(start/file.size*100);return part(n,blob,start);});onProgress(Math.min(n*session.partSize,file.size)/file.size*100);
    }
    stopped();finishing=true;onStatus('All data sent. Confirming your saved file…',{phase:'saving',finishing:true});
    const result=await retry(()=>timedAPI(`/api/uploads/${id}/complete`,{method:'POST'}));
    return result;
   }catch(e){onStatus(e.message,{phase:cancelled?'cancelled':'failed',finishing:true});if(id&&!finishing)await timedAPI(`/api/uploads/${id}`,{method:'DELETE'},10000).catch(()=>{});throw e;}
  })();
  return {promise,cancel(){if(finishing)return false;cancelled=true;xhr?.abort();return true;}};
 }
 root.LeewayUploads={MAX_FILE,uploadFile};
})(globalThis);
