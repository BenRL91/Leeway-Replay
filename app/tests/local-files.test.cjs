const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){const revoked=[];let sequence=0;const context={crypto,TextEncoder,URL:{createObjectURL:()=>`blob:local-${++sequence}`,revokeObjectURL:url=>revoked.push(url)},fetch:()=>{throw Error('Local media must never use fetch');}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../web/local-files.js'),'utf8'),context);return {api:context.LeewayLocalFiles,revoked};}
const file=(name='match.mp4',body='footage')=>Object.assign(new Blob([body],{type:'video/mp4'}),{name});
test('local media never uploads; reselecting after reload restores the source reference and releases blob URLs',async()=>{
 const h=harness(),session=h.api.create(),f=file(),first=await session.attach(f);assert.match(first.id,/^local_[a-f0-9]{64}$/);assert.equal(first.local,true);assert.equal(first.url,'blob:local-1');
 const again=await session.attach(f);assert.equal(again.id,first.id);assert.ok(h.revoked.includes(first.url));
 session.clear();assert.equal(session.get(first.id),undefined);assert.ok(h.revoked.includes(again.url));
 const restored=await h.api.create().attach(file('renamed.mp4'));assert.equal(restored.id,first.id);
 assert.notEqual((await h.api.identify(file('match.mp4','different footage'))).id,first.id);
});
test('15 GB local footage reads only small on-device samples',async()=>{
 const h=harness(),reads=[],size=15*1024**3,f={name:'big.mov',type:'video/quicktime',size,slice:(start,end)=>{reads.push([start,end]);return new Blob(['sample']);}};
 const info=await h.api.identify(f);assert.equal(info.size,size);assert.equal(reads.length,2);for(const [a,b]of reads)assert.ok(b-a<=1048576);
});
