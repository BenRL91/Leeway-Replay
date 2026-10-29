/* Playback notes are a view of saved records. Ticking never recreates the player/editor. */
(function(root){
 'use strict';
 function activeNotes(notes,at){let latest=-1;for(const n of notes)if(n.at<=at&&n.at>latest)latest=n.at;return latest<0?[]:notes.filter(n=>n.at===latest&&(n.endAt===undefined||at<n.endAt));}
 function mount(container,{seek=()=>{},preferenceKey='leeway-replay.follow-notes.v1',compact=false,navigationContainer=null,heading='At this moment',actions=()=>[],playing=()=>false,loopSeek=seek}={}){
  function el(tag,text='',attrs={}){const n=document.createElement(tag);n.textContent=text;for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
  let follow=true;try{follow=root.localStorage.getItem(preferenceKey)!=='off';}catch{}
  let selectionListener=()=>{};let notes=[],signature='',selected=[],at=0,loopEnabled=false,loopNote=null,rewinding=false,lastAt=null,landing=null;try{loopEnabled=root.localStorage.getItem('leeway-replay.loop-section.v1')==='on';}catch{}
  const section=el('section','',{class:'note-focus','aria-label':'Notes at this moment'});
  const bar=el('div','',{class:'note-focus-bar'}),title=el('h2',heading);
  const label=el('label','',{class:'follow-toggle'}),toggle=el('input','',{type:'checkbox'});toggle.checked=follow;toggle.title='Update displayed notes as the video plays. Turn off to keep the selected note; crossing timestamps never pauses playback.';label.append(toggle,el('span','Follow playhead'));
  const loopLabel=el('label','',{class:'follow-toggle'}),loopToggle=el('input','',{type:'checkbox'});loopToggle.checked=loopEnabled;loopToggle.title='Repeat a selected start–end section while playing. Turn off or move to another timestamp to stop.';loopLabel.append(loopToggle,el('span','Loop selected section'));const loopStatus=el('span','',{class:'loop-status',role:'status'});
  const browser=el('details','',{class:'moment-browser'}),browserList=el('div','',{class:'moment-browser-list'}),search=el('input','',{type:'search',placeholder:'Search moments','aria-label':'Search moments'}),kind=el('select','',{'aria-label':'Moment type'}),author=el('select','',{'aria-label':'Moment author'});for(const [v,t]of [['all','All types'],['note','Notes'],['question','Questions']])kind.append(el('option',t,{value:v}));kind.value='all';author.value='all';browser.append(el('summary','All moments'),search,kind,author,browserList);
  function browse(){browserList.replaceChildren();const matches=notes.filter(n=>(kind.value==='all'||(n.category==='Question'?'question':'note')===kind.value)&&(author.value==='all'||(n.authorLabel||'Your note')===author.value)&&`${n.body} ${n.category||''} ${n.authorLabel||''}`.toLowerCase().includes((search.value||'').toLowerCase()));for(const n of matches){const b=button(`${YouTutorCore.formatPreciseTime(n.at)} · ${n.authorLabel||'Your note'} · ${n.category||'Note'} — ${n.body.slice(0,100)}`,()=>{pick(n);browser.open=false;});browserList.append(b);}if(!matches.length)browserList.append(el('p','No matching moments.',{class:'muted'}));}
  search.addEventListener('input',browse);kind.addEventListener('change',browse);author.addEventListener('change',browse);
  const current=el('div','',{class:'current-notes'}),timeline=el('div','',{class:'note-timeline','aria-label':'Available timestamps'});
  const chooser=el('select','',{'aria-label':'Choose a timestamp'}),position=el('span','',{class:'moment-position'});
  function button(text,fn){const n=el('button',text,{type:'button',class:'secondary'});n.addEventListener('click',fn);return n;}
  function select(ids){selected=ids;render();}
  function arm(n){loopNote=loopEnabled&&Number.isFinite(n?.endAt)&&n.endAt>n.at?n:null;rewinding=false;lastAt=null;landing=loopNote?{from:at,until:Date.now()+10000}:null;loopStatus.textContent=loopNote?`Looping ${YouTutorCore.formatPreciseTime(loopNote.at)} – ${YouTutorCore.formatPreciseTime(loopNote.endAt)}`:loopEnabled?'Select a note with an end time to loop.':'';}
  function pick(n){arm(n);at=n.at;select([n.id,...notes.filter(o=>o.at===n.at&&o.id!==n.id).map(o=>o.id)]);seek(n.at,n);}
  function move(direction){const times=[...new Set(notes.map(n=>n.at))];const selectedAt=notes.find(n=>selected.includes(n.id))?.at;let target;if(direction>0)target=times.find(t=>t>(selectedAt??at));else target=[...times].reverse().find(t=>t<(selectedAt??at));if(target!==undefined)pick(notes.find(n=>n.at===target));}
  const previous=button('‹',()=>move(-1)),next=button('›',()=>move(1));previous.setAttribute('aria-label','Previous moment');previous.title='Previous moment';next.setAttribute('aria-label','Next moment');next.title='Next moment';timeline.className='timestamp-navigator';timeline.append(previous,chooser,next,position);chooser.addEventListener('change',()=>{const n=notes.find(n=>n.id===chooser.value);if(n)pick(n);});
  const preferences=el('details','',{class:'moment-options'});preferences.append(el('summary','Playback options'),label,loopLabel,loopStatus);
  bar.append(title,preferences);
  const navigation=el('div','',{class:'playback-moments'});
  navigation.append(timeline);
  const guide=el('details','',{class:'moment-guide'});guide.append(el('summary','How moments work'),el('p','Use the arrows or timestamp list to select saved notes and questions. Follow playhead updates the note as you watch without pausing. Loop repeats a selected section with an end time.',{class:'timestamp-help'}));
  section.append(bar,navigation,current,guide);container.append(section);
  if(navigationContainer){chooser.setAttribute('aria-label','Choose a feedback or question timestamp');previous.title='Previous feedback or question timestamp';next.title='Next feedback or question timestamp';}

  if(navigationContainer?.controlDock){const dock=navigationContainer.controlDock;dock.panel('Options','⚙',preferences);dock.inline?.(section,navigation,current,guide);navigation.append(browser);navigation.append(label,loopLabel,loopStatus);label.children[1].textContent='Follow video';}
  function render(){
   current.replaceChildren();current.scrollTop=0;const picked=notes.filter(n=>selected.includes(n.id));
   if(!picked.length)current.append(el('p',notes.length?'Select a timestamp, or play to the first note.':'Saved notes for this video will appear here.',{class:'muted'}));
   for(const n of picked){const card=el('article','',{class:'current-note'});card.append(el('p',`${YouTutorCore.formatPreciseTime(n.at)}${n.endAt!==undefined?' – '+YouTutorCore.formatPreciseTime(n.endAt):''} · ${n.authorLabel||'Your note'}${n.category?' · '+n.category:''}`,{class:'note-meta'}),el('p',n.body,{class:'note-body'}));if(n.updateLabel){card.setAttribute('data-unseen','true');card.append(el('span',n.updateLabel,{class:'update-badge'}));}const controls=el('div','',{class:'row'});for(const action of actions(n))controls.append(button(action.label,action.run));if(controls.children.length)card.append(controls);current.append(card);}
   const times=[...new Set(notes.map(n=>n.at))],chosenNote=picked[0];chooser.value=chosenNote?notes.find(n=>n.at===chosenNote.at).id:'';chooser.disabled=!notes.length;position.textContent=chosenNote?`${times.indexOf(chosenNote.at)+1} of ${times.length} moments`:`${times.length} moments`;
   selectionListener(selected.map(id=>notes.find(n=>n.id===id)).filter(Boolean));const chosen=picked[0]?.at;previous.disabled=!notes.some(n=>n.at<(chosen??at));next.disabled=!notes.some(n=>n.at>(chosen??at));
  }
  loopToggle.addEventListener('change',()=>{loopEnabled=loopToggle.checked;try{root.localStorage.setItem('leeway-replay.loop-section.v1',loopEnabled?'on':'off');}catch{}arm(notes.find(n=>selected.includes(n.id)));if(loopNote){at=loopNote.at;seek(loopNote.at);}});
  toggle.addEventListener('change',()=>{follow=toggle.checked;try{root.localStorage.setItem(preferenceKey,follow?'on':'off');}catch{}if(follow)select(activeNotes(notes,at).map(n=>n.id));});
  function setNotes(value){const nextNotes=[...value].sort((a,b)=>a.at-b.at||(a.createdAt||'').localeCompare(b.createdAt||''));const key=JSON.stringify(nextNotes);if(key===signature)return;signature=key;notes=nextNotes;const previousAuthor=author.value;author.replaceChildren(el('option','All authors',{value:'all'}));for(const name of [...new Set(notes.map(n=>n.authorLabel||'Your note'))])author.append(el('option',name,{value:name}));author.value=[...new Set(notes.map(n=>n.authorLabel||'Your note'))].includes(previousAuthor)?previousAuthor:'all';browse();if(loopNote){const updated=notes.find(n=>n.id===loopNote.id);if(!updated||updated.at!==loopNote.at||updated.endAt!==loopNote.endAt)arm(null);}chooser.replaceChildren(el('option','Choose a moment…',{value:''}));const seen=new Set();for(const n of notes){if(seen.has(n.at))continue;seen.add(n.at);const group=notes.filter(o=>o.at===n.at);const option=el('option',`${YouTutorCore.formatPreciseTime(n.at)}${n.endAt!==undefined?' – '+YouTutorCore.formatPreciseTime(n.endAt):''} · ${n.category||'Note'}${group.length>1?' · '+group.length+' notes':''}${group.some(o=>o.updateLabel)?' · '+(group.some(o=>o.updateLabel==='New')?'New':'Updated'):''} · ${n.body.slice(0,64)}${n.pauseOnOpen?' · Opens paused':''}`,{value:n.id});chooser.append(option);}if(loopNote)selected=[loopNote.id];else if(follow)selected=activeNotes(notes,at).map(n=>n.id);else selected=selected.filter(id=>notes.some(n=>n.id===id));render();}
  function tick(time,{requested=false}={}){
   // A requested position is UI feedback, not confirmation that the media seek landed.
   if(requested&&loopNote)return;
   // YouTube/native media can report the previous frame until a requested seek lands.
   // Keep the selected loop through that transition; an explicit outside seek still cancels it.
   if(loopNote&&landing){
    const oldOutside=landing.from<loopNote.at-.1||landing.from>=loopNote.endAt;
    const landed=time>=loopNote.at-.1&&time<loopNote.endAt+.75&&!(oldOutside&&time===landing.from);
    if(!landed&&Date.now()<landing.until)return;
    landing=null;lastAt=null;
    if(!landed)arm(null);
   }
   at=time;if(loopNote){if(rewinding){if(time>=loopNote.at-.1&&time<loopNote.endAt)rewinding=false;else return;}const jumped=lastAt!==null&&Math.abs(time-lastAt)>1.5;lastAt=time;if(time<loopNote.at-.1||(time>=loopNote.endAt&&(jumped||!playing()))){arm(null);}else if(time>=loopNote.endAt){rewinding=true;lastAt=loopNote.at;loopSeek(loopNote.at);return;}else{if(selected.join('|')!==loopNote.id)select([loopNote.id]);return;}}if(!follow)return;const ids=activeNotes(notes,time).map(n=>n.id);if(ids.join('|')!==selected.join('|'))select(ids);}
  setNotes([]);render();return {setNotes,tick,inspect:note=>{follow=false;toggle.checked=false;select([note.id]);},openBrowser:type=>{kind.value=type||'all';browse();browser.open=true;},onSelection:fn=>{selectionListener=fn;fn(notes.filter(n=>selected.includes(n.id)));},showAt:(time,note)=>{arm(note||activeNotes(notes,time)[0]);at=time;select(activeNotes(notes,time).map(n=>n.id));},stopLoop:()=>arm(null),notifySeek:time=>{if(loopNote&&(time<loopNote.at||time>=loopNote.endAt))arm(null);}};
 }
 root.LeewayNoteFollow={mount,activeNotes};if(typeof module!=='undefined')module.exports=root.LeewayNoteFollow;
})(globalThis);
