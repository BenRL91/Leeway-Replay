const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.listeners={};this.dataset={};this.currentTime=0;this.duration=100;this.value='0';}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}remove(){}pause(){}load(){}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}dispatch(type){for(const fn of this.listeners[type]||[])fn({target:this});}
}
function choose(section,index){const chooser=section.children[1].children[0].children[1];chooser.value=chooser.children[index+1].attributes.value;chooser.dispatch('change');}
const notes=[{id:'one',at:10,body:'Coach feedback',authorLabel:'Coach Lee'},{id:'two',at:30,body:'Student question',authorLabel:'Jeff'},{id:'three',at:30,body:'Same moment reply',authorLabel:'Coach Lee'}];
function harness(saved=new Map()){let timer;const context={document:{createElement:t=>new Element(t),head:new Element('head')},location:{origin:'https://test.local'},YouTutorCore:require('../core.js'),localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},setInterval:fn=>{timer=fn;return 1;},clearInterval(){},setTimeout,clearTimeout};vm.createContext(context);for(const file of ['note-follow','playback'])vm.runInContext(fs.readFileSync(require.resolve('../web/'+file+'.js'),'utf8'),context);return {context,tick:()=>timer?.(),saved};}
function displayed(container){return container.children[0].children[2].children.map(n=>n.children?.[1]?.textContent||n.textContent);}
test('automatic notes follow forward/backward scrubbing, group shared timestamps and keep media stable',async()=>{
 const {context,tick}=harness(),container=new Element('div'),mediaContainer=new Element('div');let follow;const p=context.YouTutorPlayback.mount(mediaContainer,{onTime:at=>follow.tick(at)});follow=context.LeewayNoteFollow.mount(container,{seek:at=>p.seek(at)});follow.setNotes(notes);await p.load({kind:'file',id:'local'},'blob:device');const video=mediaContainer.children[0].children[0];video.dispatch('loadedmetadata');
 video.currentTime=15;tick();assert.deepEqual(displayed(container),['Coach feedback']);video.currentTime=35;tick();assert.deepEqual(displayed(container),['Student question','Same moment reply']);
 const slider=mediaContainer.children[1].children[1];slider.value='12';slider.dispatch('input');slider.dispatch('change');assert.deepEqual(displayed(container),['Coach feedback']);assert.equal(mediaContainer.children[0].children[0],video);
 slider.value='0';slider.dispatch('change');assert.equal(displayed(container)[0],'Select a timestamp, or play to the first note.');p.destroy();
});
test('follow-off preserves selection while playback advances, timestamp buttons still seek, preference survives reload',()=>{
 const {context,saved}=harness(),container=new Element('div'),jumps=[];const f=context.LeewayNoteFollow.mount(container,{seek:at=>jumps.push(at)});f.setNotes(notes);f.tick(12);const section=container.children[0],toggle=section.children[0].children[1].children[1].children[0];toggle.checked=false;toggle.dispatch('change');f.tick(35);assert.deepEqual(displayed(container),['Coach feedback']);choose(section,1);assert.deepEqual(jumps,[30]);assert.deepEqual(displayed(container),['Student question','Same moment reply']);f.tick(0);assert.equal(displayed(container).length,2);
 const another=new Element('div'),h=harness(saved);h.context.LeewayNoteFollow.mount(another).setNotes(notes);assert.equal(another.children[0].children[0].children[1].children[1].children[0].checked,false);
 toggle.checked=true;toggle.dispatch('change');f.tick(12);assert.deepEqual(displayed(container),['Coach feedback']);
});
test('crossing timestamps never pauses, seeks or reloads local video or YouTube playback',async()=>{
 for(const kind of ['file','youtube']){
  const {context,tick}=harness(),container=new Element('div'),mediaContainer=new Element('div');let follow,yt,ready;const calls={pause:0,seek:0,reload:0,play:0};
  context.YT={Player:class{constructor(target,options){yt=this;ready=options.events.onReady;this.at=0;}getCurrentTime(){return this.at;}getDuration(){return 100;}seekTo(){calls.seek++;}pauseVideo(){calls.pause++;}playVideo(){calls.play++;}destroy(){calls.reload++;}}};
  const p=context.YouTutorPlayback.mount(mediaContainer,{onTime:at=>follow.tick(at)});follow=context.LeewayNoteFollow.mount(container,{seek:at=>p.seek(at)});follow.setNotes(notes);await p.load({kind,id:kind==='file'?'local':'M7lc1UVf-VE'},'blob:device');
  const media=mediaContainer.children[0].children[0];let nativeAt=0;
  if(kind==='file'){media.pause=()=>calls.pause++;media.load=()=>calls.reload++;Object.defineProperty(media,'currentTime',{get:()=>nativeAt,set:value=>{nativeAt=value;calls.seek++;}});media.dispatch('loadedmetadata');}else ready();
  for(const at of [9,10,11,29,30,31,40]){if(kind==='file')nativeAt=at;else yt.at=at;tick();}
  assert.deepEqual(displayed(container),['Student question','Same moment reply']);assert.deepEqual(calls,{pause:0,seek:0,reload:0,play:0},kind);assert.equal(mediaContainer.children[0].children[0],media);
  p.destroy();
 }
});
test('compact review notes expose context actions without duplicate navigation or playback commands',()=>{
 const {context}=harness(),container=new Element('div'),jumps=[],replies=[];const f=context.LeewayNoteFollow.mount(container,{compact:true,seek:at=>jumps.push(at),actions:n=>[{label:'Reply',run:()=>replies.push(n.id)}]});f.setNotes(notes);f.tick(12);const section=container.children[0];assert.equal(section.children.length,4);const reply=section.children[2].children[0].children[2].children[0];assert.equal(reply.textContent,'Reply');reply.dispatch('click');assert.deepEqual(replies,['one']);assert.deepEqual(jumps,[]);choose(section,1);assert.deepEqual(jumps,[30]);assert.deepEqual(displayed(container),['Student question','Same moment reply']);
});
test('context end clears followed feedback without falling back or issuing a playback command',()=>{
 const {context}=harness(),container=new Element('div'),jumps=[];const f=context.LeewayNoteFollow.mount(container,{seek:at=>jumps.push(at)});f.setNotes([{id:'old',at:1,body:'Older feedback'},{id:'range',at:10.125,endAt:12.5,body:'This rally'}]);f.tick(11);assert.deepEqual(displayed(container),['This rally']);f.tick(12.5);assert.equal(displayed(container).includes('This rally'),false);assert.equal(displayed(container).includes('Older feedback'),false);assert.deepEqual(jumps,[]);f.tick(10.2);assert.deepEqual(displayed(container),['This rally']);
});
test('selected range loops only when enabled, respects pause and move-on, retains player-independent selection',()=>{
 const {context}=harness(),container=new Element('div'),seeks=[],loops=[];let playing=true;const f=context.LeewayNoteFollow.mount(container,{seek:at=>seeks.push(at),loopSeek:at=>loops.push(at),playing:()=>playing});f.setNotes([{id:'r',at:10,endAt:12,body:'Loop this'},{id:'inside',at:11,body:'Another moment'},{id:'next',at:20,body:'Move on'}]);const section=container.children[0],loop=section.children[0].children[1].children[2].children[0];
 choose(section,0);f.tick(11.9);f.tick(12.1);assert.deepEqual(loops,[]);
 loop.checked=true;loop.dispatch('change');choose(section,0);f.tick(10.1);f.tick(11);assert.deepEqual(displayed(container),['Loop this']);f.tick(11.8);f.tick(12.1);assert.deepEqual(loops,[10]);f.tick(12.1);assert.deepEqual(loops,[10]);f.tick(10.1);f.tick(11.9);f.tick(12.1);assert.deepEqual(loops,[10,10]);
 f.tick(10.1);f.notifySeek(25);f.tick(25);assert.equal(loops.length,2);choose(section,0);f.tick(11.8);playing=false;f.tick(12.1);assert.equal(loops.length,2);
 playing=true;choose(section,0);choose(section,2);f.tick(20.5);assert.equal(loops.length,2);
 choose(section,0);loop.checked=false;loop.dispatch('change');f.tick(11.9);f.tick(12.1);assert.equal(loops.length,2);
});
test('moment navigator groups shared timestamps, moves chronologically and passes paused-note intent without background seeks',()=>{
 const {context}=harness(),container=new Element('div'),seeks=[];const f=context.LeewayNoteFollow.mount(container,{compact:true,seek:(at,n)=>seeks.push([at,!!n.pauseOnOpen])});f.setNotes([{id:'a',at:10,body:'Reset here',category:'Technique',pauseOnOpen:true},{id:'b',at:30,body:'Student question'},{id:'c',at:30,body:'Coach response'}]);const nav=container.children[0].children[1].children[0],previous=nav.children[0],chooser=nav.children[1],next=nav.children[2];assert.equal(chooser.children.length,3);assert.equal(previous.disabled,true);next.dispatch('click');assert.deepEqual(seeks,[[10,true]]);assert.deepEqual(displayed(container),['Reset here']);next.dispatch('click');assert.deepEqual(displayed(container),['Student question','Coach response']);assert.equal(next.disabled,true);previous.dispatch('click');assert.equal(chooser.value,'a');const count=seeks.length;f.tick(35);assert.equal(chooser.value,'b');assert.equal(seeks.length,count);
});
test('review moment navigation and feedback share one surface without duplicate player controls',()=>{
 const {context}=harness(),container=new Element('div'),media=new Element('div'),seeks=[];
 const player=context.YouTutorPlayback.mount(media);
 const follow=context.LeewayNoteFollow.mount(container,{navigationContainer:player.navigationContainer,seek:(at,n)=>seeks.push([at,!!n.pauseOnOpen])});
 follow.setNotes([{id:'feedback',at:0,body:'Coach feedback',pauseOnOpen:true},{id:'question',at:5,body:'Student question'}]);
 assert.equal(container.children[0].children.length,4);
 assert.equal(player.navigationContainer.children.some(n=>n.attributes.class==='playback-moments'),false);
 const group=container.children[0].children[1];
 const nav=group.children[0];nav.children[2].dispatch('click');
 assert.deepEqual(seeks,[[5,false]]);nav.children[0].dispatch('click');assert.deepEqual(seeks,[[5,false],[0,true]]);
 nav.children[1].value='question';nav.children[1].dispatch('change');assert.deepEqual(displayed(container),['Student question']);
 const before=seeks.length;follow.tick(6);assert.equal(seeks.length,before);player.destroy();
});
test('arrow and dropdown loops survive stale playhead samples while the selected seek settles',()=>{
 for(const navigation of ['next','previous','dropdown']){
  const {context}=harness(new Map([['leeway-replay.loop-section.v1','on']])),container=new Element('div'),jumps=[],loops=[];
  const f=context.LeewayNoteFollow.mount(container,{seek:(at,n)=>jumps.push([at,n.id]),loopSeek:at=>loops.push(at),playing:()=>true});
  f.setNotes([{id:'before',at:0,body:'Before'},{id:'loop',at:10,endAt:12,body:'Loop this'},{id:'after',at:30,body:'After'}]);
  f.tick(navigation==='previous'?30:0);const section=container.children[0],nav=section.children[1].children[0];
  if(navigation==='dropdown')choose(section,1);else nav.children[navigation==='next'?2:0].dispatch('click');
  assert.deepEqual(jumps,[[10,'loop']]);
  f.tick(navigation==='previous'?30:0);f.tick(navigation==='previous'?30:0); // player still reports the old frame
  assert.deepEqual(displayed(container),['Loop this']);
  f.tick(10.1);f.tick(11.9);f.tick(12.1);assert.deepEqual(loops,[10],navigation);
  f.tick(10.1);f.tick(11.9);f.tick(12.1);assert.deepEqual(loops,[10,10],navigation);
 }
});
test('rapid arrow navigation arms only the newest range and manual seeking cancels a pending loop',()=>{
 const {context}=harness(new Map([['leeway-replay.loop-section.v1','on']])),container=new Element('div'),loops=[];let playing=false;
 const f=context.LeewayNoteFollow.mount(container,{seek(){},loopSeek:at=>loops.push(at),playing:()=>playing});
 f.setNotes([{id:'zero',at:0,endAt:2,body:'Zero',pauseOnOpen:true},{id:'ten',at:10,endAt:12,body:'Ten'},{id:'twenty',at:20,endAt:22,body:'Twenty'}]);f.tick(0);
 const nav=container.children[0].children[1].children[0];nav.children[2].dispatch('click');nav.children[2].dispatch('click');
 f.tick(0);f.tick(10);f.tick(20);assert.deepEqual(displayed(container),['Twenty']);assert.deepEqual(loops,[]);
 playing=true;f.tick(21.9);f.tick(22.1);assert.deepEqual(loops,[20]);
 nav.children[0].dispatch('click');f.notifySeek(50);f.tick(50);assert.deepEqual(loops,[20]);
 choose(container.children[0],0);playing=false;f.tick(0);assert.deepEqual(loops,[20]);playing=true;f.tick(1.9);f.tick(2.1);assert.deepEqual(loops,[20,0]);
});

test('integrated YouTube arrow selection keeps loop armed until actual seek completion',async()=>{
 for(const direction of ['next','previous','dropdown']){
  const {context,tick}=harness(new Map([['leeway-replay.loop-section.v1','on']]));
  const container=new Element('div'),media=new Element('div');let yt,onReady,follow;const seeks=[];
  context.YT={Player:class{constructor(target,options){yt=this;onReady=options.events.onReady;this.at=direction==='previous'?30:0;}getCurrentTime(){return this.at;}getDuration(){return 100;}getPlayerState(){return 1;}seekTo(at){seeks.push(at);}playVideo(){}destroy(){}}};
  const player=context.YouTutorPlayback.mount(media,{onSeek:at=>follow.notifySeek(at),onTime:(at,sample)=>follow.tick(at,sample)});
  follow=context.LeewayNoteFollow.mount(container,{seek:(at,n)=>player.openNote(n),playing:()=>player.isPlaying(),loopSeek:at=>player.loopTo(at)});
  follow.setNotes([{id:'before',at:0,body:'Before'},{id:'loop',at:10,endAt:12,body:'Loop'},{id:'after',at:30,body:'After'}]);
  await player.load({kind:'youtube',id:'M7lc1UVf-VE'});onReady();tick();
  const section=container.children[0],nav=section.children[1].children[0];
  if(direction==='dropdown')choose(section,1);else nav.children[direction==='next'?2:0].dispatch('click');
  tick();tick(); // seek requested, iframe still reports previous position
  assert.deepEqual(displayed(container),['Loop'],direction);
  yt.at=10.1;tick();yt.at=11.9;tick();yt.at=12.1;tick();
  assert.deepEqual(seeks,[10,10],direction);
  yt.at=10.1;tick();yt.at=11.9;tick();yt.at=12.1;tick();assert.deepEqual(seeks,[10,10,10]);
  follow.notifySeek(50);yt.at=50;tick();assert.deepEqual(seeks,[10,10,10]);player.destroy();
 }
});
test('unified moment browser filters authors/types and selects a question sharing a note timestamp',()=>{
 const {context}=harness(),container=new Element('div'),seeks=[],selections=[];
 const follow=context.LeewayNoteFollow.mount(container,{navigationContainer:{controlDock:{panel(){},inline(){}}},seek:(at,n)=>seeks.push(n.id)});
 follow.onSelection(picked=>selections.push(picked.map(n=>n.id)));
 follow.setNotes([{id:'coach',at:10,body:'Reset',category:'Technique',authorLabel:'Lee'},{id:'student',at:10,body:'Where should I stand?',category:'Question',authorLabel:'Jeff'},{id:'other',at:20,body:'Move forward',category:'Question',authorLabel:'Lee'}]);
 const browser=container.children[0].children[1].children.find(n=>n.attributes.class==='moment-browser');
 const [,search,type,author,list]=browser.children;search.value='';type.value='question';type.dispatch('change');assert.equal(list.children.length,2);
 author.value='Jeff';author.dispatch('change');assert.equal(list.children.length,1);list.children[0].dispatch('click');assert.deepEqual(seeks,['student']);assert.equal(selections.at(-1)[0],'student');assert.equal(browser.open,false);
 follow.inspect({id:'coach'});follow.tick(25);assert.equal(selections.at(-1)[0],'coach');assert.deepEqual(seeks,['student']);
 follow.openBrowser();assert.equal(browser.open,true);search.value='not found';search.dispatch('input');assert.equal(list.children[0].textContent,'No matching moments.');
});
