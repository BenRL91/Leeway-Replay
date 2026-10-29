const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.listeners={};this.currentTime=0;this.duration=100;this.value='0';}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}remove(){}pause(){}load(){}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}dispatch(type){for(const fn of this.listeners[type]||[])fn({target:this});}
}
function find(root,predicate){if(predicate(root))return root;for(const n of root.children||[]){const r=find(n,predicate);if(r)return r;}return null;}
function harness(){let timer;const context={document:{createElement:t=>new Element(t),head:new Element('head')},location:{origin:'https://test.local',pathname:'/replay/view/review'},YouTutorCore:require('../core.js'),setInterval:fn=>{timer=fn;return 1;},clearInterval(){},setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../web/playback.js'),'utf8'),context);return {context,tick:()=>timer?.()};}
test('touch-style native scrubbing and note seeking keep a stable player and never navigate',async()=>{const {context,tick}=harness();const container=new Element('div');const seen=[];const p=context.YouTutorPlayback.mount(container,{onTime:t=>seen.push(t)});await p.load({kind:'file',id:'file'},'/media');const stage=container.children[0],video=stage.children[0],controls=container.children[1],slider=controls.children[1];
 video.dispatch('loadedmetadata');assert.equal(slider.disabled,false);assert.equal(slider.max,'100');slider.value='70';slider.dispatch('input');tick();assert.equal(slider.value,'70');assert.equal(video.currentTime,0);slider.dispatch('change');assert.equal(video.currentTime,70);assert.equal(stage.children[0],video);assert.equal(context.location.pathname,'/replay/view/review');
 p.seek(45);assert.equal(video.currentTime,45);p.seek(-10);assert.equal(video.currentTime,0);p.seek(999);assert.equal(video.currentTime,100);assert.ok(seen.includes(45));p.destroy();assert.equal(stage.children.length,0);
});
test('YouTube selected note seeks immediately or queues until ready without reloading iframe',async()=>{const {context}=harness();let instance,options;class Player{constructor(target,opts){options=opts;instance=this;this.at=0;this.duration=120;this.seeks=[];}getCurrentTime(){return this.at;}getDuration(){return this.duration;}seekTo(at){this.at=at;this.seeks.push(at);}playVideo(){}destroy(){this.destroyed=true;}}context.YT={Player};const container=new Element('div');const p=context.YouTutorPlayback.mount(container);await p.load({kind:'youtube',id:'M7lc1UVf-VE'});const target=container.children[0].children[0];p.seek(33);assert.deepEqual(instance.seeks,[]);options.events.onReady();assert.deepEqual(instance.seeks,[33]);p.seek(78);assert.deepEqual(instance.seeks,[33,78]);assert.equal(container.children[0].children[0],target);assert.equal(instance.destroyed,undefined);p.destroy();});
test('mobile layout guards root refresh gestures and gives controls 48px touch targets',()=>{const css=fs.readFileSync(require.resolve('../web/replay.css'),'utf8');assert.match(css,/html,body\{[^}]*overflow:hidden;overscroll-behavior:none/);assert.match(css,/\.replay-scroll\{[^}]*overflow:auto;overscroll-behavior:none/);assert.match(css,/min-height:48px/);assert.match(css,/\.playback-controls input\{[^}]*height:48px/);assert.match(css,/@media\(max-width:820px\)\{\.columns\{grid-template-columns:1fr/);});
test('opening the same YouTube source retains playback, exposes pause/buffering states and allows retry after errors',async()=>{
 const {context}=harness();let instance,options,count=0;const states=[];context.LeewayPlaybackReport={mount:()=>({record(){},state:s=>states.push(s),destroy(){}})};
 context.YT={Player:class{constructor(target,opts){options=opts;instance=this;count++;this.at=20;}getCurrentTime(){return this.at;}getDuration(){return 120;}seekTo(){}playVideo(){}destroy(){this.destroyed=true;}}};
 const container=new Element('div'),p=context.YouTutorPlayback.mount(container),source={kind:'youtube',id:'M7lc1UVf-VE'};await p.load(source);options.events.onReady();await p.load({...source});assert.equal(count,1);assert.equal(instance.destroyed,undefined);assert.equal(p.currentTime(),20);
 options.events.onStateChange({data:2});assert.equal(states.at(-1),'Paused');assert.match(container.children[2].textContent,/YouTube is paused/);options.events.onStateChange({data:3});assert.equal(states.at(-1),'Buffering');options.events.onAutoplayBlocked();assert.equal(states.at(-1),'Browser blocked playback');
 options.events.onError({data:150});await p.load(source);assert.equal(count,2);p.destroy();
});
test('frame controls pause and step both sources without autoplay/reload; native YouTube controls remain enabled',async()=>{
 for(const kind of ['file','youtube']){
  const {context}=harness(),container=new Element('div');let instance,options,pauses=0,plays=0;
  context.YT={Player:class{constructor(target,opts){options=opts;instance=this;this.at=10;}getCurrentTime(){return this.at;}getDuration(){return 100;}seekTo(at){this.at=at;}pauseVideo(){pauses++;}playVideo(){plays++;}destroy(){}}};
  const p=context.YouTutorPlayback.mount(container);await p.load({kind,id:kind==='youtube'?'M7lc1UVf-VE':'local'},'/media');const stage=container.children[0],media=stage.children[0];if(kind==='file'){media.currentTime=10;media.pause=()=>pauses++;media.dispatch('loadedmetadata');}else{options.events.onReady();assert.equal(options.playerVars.controls,1);assert.equal(options.playerVars.fs,1);}
  const bar=find(container,n=>n.className==='frame-controls compact-transport'),rate=find(bar,n=>n.attributes['aria-label']==='Footage frame rate');rate.value='60';rate.dispatch('change');p.stepFrame(1);assert.ok(Math.abs(p.currentTime()-(10+1/60))<1e-8);p.stepFrame(-1);assert.ok(Math.abs(p.currentTime()-10)<1e-8);assert.equal(pauses,2);assert.equal(plays,0);assert.equal(stage.children[0],media);p.destroy();
 }
});
test('native controls stay enabled without app overlays or background playback commands',async()=>{
 for(const kind of ['file','youtube']){
  const {context,tick}=harness(),container=new Element('div');let options,plays=0,pauses=0;
  context.YT={Player:class{constructor(target,opts){options=opts;}getCurrentTime(){return 10;}getDuration(){return 100;}playVideo(){plays++;}pauseVideo(){pauses++;}destroy(){}}};
  const p=context.YouTutorPlayback.mount(container);await p.load({kind,id:kind==='youtube'?'M7lc1UVf-VE':'file'},'/media');const stage=container.children[0],media=stage.children[0];assert.equal(stage.children.length,1);
  if(kind==='file'){assert.equal(media.controls,true);media.play=()=>plays++;media.pause=()=>pauses++;media.dispatch('loadedmetadata');}else{assert.equal(options.playerVars.controls,1);assert.equal(options.playerVars.fs,1);assert.equal(options.playerVars.disablekb,0);options.events.onReady();}
  tick();tick();assert.equal(plays,0);assert.equal(pauses,0);assert.equal(stage.children[0],media);p.destroy();
 }
});
test('selecting pause/play notes works for both sources, including queued zero timestamps; polling never resumes',async()=>{
 for(const kind of ['file','youtube']){
  const {context,tick}=harness(),container=new Element('div');let options,instance,pauses=0,plays=0;
  context.YT={Player:class{constructor(t,o){options=o;instance=this;this.at=0;}getCurrentTime(){return this.at;}getDuration(){return 100;}seekTo(at){this.at=at;}pauseVideo(){pauses++;}playVideo(){plays++;}destroy(){}}};
  const p=context.YouTutorPlayback.mount(container);await p.load({kind,id:kind==='file'?'local':'M7lc1UVf-VE'},'/media');const media=container.children[0].children[0];if(kind==='file'){media.pause=()=>pauses++;media.play=()=>{plays++;return Promise.resolve();};}
  p.openNote({at:0,pauseOnOpen:true});assert.equal(pauses,0);if(kind==='file')media.dispatch('loadedmetadata');else options.events.onReady();assert.equal(pauses,1);assert.equal(plays,0);
  p.openNote({at:12.125,pauseOnOpen:true});assert.equal(p.currentTime(),12.125);assert.equal(pauses,2);tick();tick();assert.equal(plays,0);assert.equal(pauses,2);
  p.openNote({at:20});assert.equal(p.currentTime(),20);assert.equal(plays,1);assert.equal(container.children[0].children[0],media);p.destroy();
 }
});
test('untouched YouTube pause timestamps load a visible frame silently, pause after async start and allow native Play',async()=>{
 for(const muted of [false,true]){
  const {context,tick}=harness(),container=new Element('div');let options,instance;
  context.YT={Player:class{
   constructor(t,o){options=o;instance=this;this.state=-1;this.at=0;this.calls=[];this.muted=muted;this.frame=false;}
   getCurrentTime(){return this.at;}getDuration(){return 120;}getPlayerState(){return this.state;}
   isMuted(){return this.muted;}mute(){this.muted=true;this.calls.push(['mute']);}unMute(){this.muted=false;this.calls.push(['unmute']);}
   loadVideoById(value){this.calls.push(['load',value.startSeconds]);this.target=value.startSeconds;this.state=3;}
   seekTo(at){this.calls.push(['seek',at]);this.at=at;if(this.state!==2)this.state=1;}
   playVideo(){this.calls.push(['play']);this.state=1;}pauseVideo(){this.calls.push(['pause']);}destroy(){}
  }};
  const p=context.YouTutorPlayback.mount(container);await p.load({kind:'youtube',id:'M7lc1UVf-VE'});p.openNote({at:45.125,pauseOnOpen:true});options.events.onReady();assert.deepEqual(instance.calls,[['mute'],['load',45.125]]);assert.equal(instance.muted,true);tick();assert.equal(instance.calls.length,2);
  // Model YouTube's asynchronous frame download and state transition.
  instance.at=instance.target;instance.frame=true;instance.state=1;options.events.onStateChange({data:1});assert.deepEqual(instance.calls.at(-1),['pause']);assert.equal(instance.muted,true);instance.state=2;options.events.onStateChange({data:2});assert.equal(instance.at,45.125);assert.equal(instance.frame,true);assert.equal(instance.state,2);assert.equal(instance.muted,muted);assert.equal(p.currentTime(),45.125);
  const count=instance.calls.length;tick();tick();assert.equal(instance.calls.length,count);instance.state=1;options.events.onStateChange({data:1});assert.equal(instance.calls.length,count);
  p.openNote({at:60,pauseOnOpen:true});assert.deepEqual(instance.calls.at(-1),['pause']);assert.equal(instance.at,45.125);instance.state=2;options.events.onStateChange({data:2});assert.deepEqual(instance.calls.at(-1),['seek',60]);assert.equal(instance.state,2);
  instance.state=1;p.openNote({at:70,pauseOnOpen:true});p.openNote({at:80});const finalCount=instance.calls.length;instance.state=2;options.events.onStateChange({data:2});assert.equal(instance.calls.length,finalCount);assert.equal(instance.at,80);p.destroy();
 }
});
test('consolidated icon controls jump and step the mounted video, and readiness disables frame actions',async()=>{
 const {context}=harness(),container=new Element('div');const p=context.YouTutorPlayback.mount(container);const back=find(container,n=>n.attributes['aria-label']==='Back 10 seconds'),forward=find(container,n=>n.attributes['aria-label']==='Forward 10 seconds'),previous=find(container,n=>n.attributes['aria-label']==='Previous frame'),next=find(container,n=>n.attributes['aria-label']==='Next frame');assert.equal(previous.disabled,true);assert.equal(next.disabled,true);await p.load({kind:'file',id:'local'},'/media');const video=container.children[0].children[0];let pauses=0;video.pause=()=>pauses++;video.dispatch('loadedmetadata');assert.equal(next.disabled,false);video.currentTime=40;back.dispatch('click');assert.equal(video.currentTime,30);forward.dispatch('click');assert.equal(video.currentTime,40);next.dispatch('click');assert.ok(Math.abs(video.currentTime-(40+1/30))<1e-8);previous.dispatch('click');assert.ok(Math.abs(video.currentTime-40)<1e-8);assert.equal(pauses,2);assert.equal(container.children[0].children[0],video);p.destroy();
});
