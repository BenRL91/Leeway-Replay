const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness({failPart=false,waitPart=false,failComplete=false}={}){
 const calls=[],payloads=[],progress=[];let failed=false,completeFailed=false,lastXHR;
 const context={AbortController,clearTimeout,setTimeout:(fn,ms)=>{if(ms>=10000)return setTimeout(fn,ms);queueMicrotask(fn);},YouTutorAPI:async(path,options)=>{calls.push([path,options?.method]);if(path==='/api/uploads')return {id:'session',parts:3,partSize:4};if(path.endsWith('/complete')){if(failComplete&&!completeFailed){completeFailed=true;throw Error('Lost response');}return {file:{id:'file'}};}return {ok:true};}};
 context.XMLHttpRequest=class{constructor(){this.upload={};lastXHR=this;}open(method,path){this.path=path;}setRequestHeader(){}send(blob){payloads.push([this.path,blob.size]);queueMicrotask(()=>{if(waitPart)return;if(failPart&&!failed&&this.path.endsWith('/2')){failed=true;this.onerror();return;}this.upload.onprogress?.({lengthComputable:true,loaded:blob.size,total:blob.size});this.status=200;this.responseText='{"ok":true}';this.onload();});}abort(){this.onabort();}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../web/uploads.js'),'utf8'),context);return {context,calls,payloads,progress,last:()=>lastXHR};
}
const file=()=>Object.assign(new Blob(['123456789']),{name:'match.mp4'});
test('browser retries only failed chunk, completes once and reports whole-file progress',async()=>{
 const h=harness({failPart:true,failComplete:true}),states=[];const job=h.context.LeewayUploads.uploadFile(file(),{onProgress:p=>h.progress.push(p),onStatus:(text,state)=>states.push(state)});assert.equal(states[0].phase,'starting');const result=await job.promise;assert.equal(result.file.id,'file');
 assert.deepEqual(h.payloads.map(p=>p[1]),[4,4,4,1]);assert.equal(h.calls.filter(c=>c[0]==='/api/uploads').length,1);assert.equal(h.calls.filter(c=>c[0].endsWith('/complete')).length,2);assert.equal(h.progress.at(-1),100);assert.ok(states.some(s=>s.phase==='retrying'));assert.ok(states.some(s=>s.phase==='saving'&&s.finishing));
});
test('cancel interrupts transfer, aborts server session and never completes',async()=>{
 const h=harness({waitPart:true});const job=h.context.LeewayUploads.uploadFile(file());while(!h.last())await Promise.resolve();assert.equal(job.cancel(),true);await assert.rejects(job.promise,/cancelled/);assert.ok(h.calls.some(c=>c[0]==='/api/uploads/session'&&c[1]==='DELETE'));assert.ok(!h.calls.some(c=>c[0].endsWith('/complete')));
});
