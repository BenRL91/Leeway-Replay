/* Device-local, bounded diagnostics: no video titles, notes, URLs or account credentials. */
(function(root){
 'use strict';
 function mount(container,{position=()=>0}={}){
  const events=[];let state='Not started';
  function record(event,detail){const at=position();events.push({time:new Date().toISOString(),event,detail,position:Number.isFinite(at)?Math.round(at*10)/10:0,visible:document.visibilityState||'visible',focus:document.activeElement?.tagName||null});if(events.length>80)events.shift();}
  const details=document.createElement('details');details.className='playback-report';details.hidden=true;const summary=document.createElement('summary');summary.textContent='Playback troubleshooting';const status=document.createElement('p');status.textContent=state;const copy=document.createElement('button');copy.type='button';copy.className='secondary';copy.textContent='Copy playback report';const output=document.createElement('textarea');output.readOnly=true;output.hidden=true;output.setAttribute('aria-label','Playback report');const result=document.createElement('p');result.setAttribute('role','status');details.append(summary,status,copy,output,result);container.append(details);
  function report(){return JSON.stringify({version:1,playerState:state,browser:root.navigator?.userAgent||'',viewport:{width:root.innerWidth,height:root.innerHeight},events},null,2);}
  copy.addEventListener('click',async()=>{const text=report();try{await root.navigator.clipboard.writeText(text);result.textContent='Playback report copied. Paste it into this chat.';}catch{output.value=text;output.hidden=false;output.select();result.textContent='Select and copy the playback report below.';}});
  const visibility=()=>record('visibility',document.visibilityState),blur=()=>record('window-blur'),focus=()=>record('window-focus');document.addEventListener('visibilitychange',visibility);root.addEventListener('blur',blur);root.addEventListener('focus',focus);
  return {record,state(value){state=value;status.textContent=value;record('player-state',value);},report,destroy(){document.removeEventListener('visibilitychange',visibility);root.removeEventListener('blur',blur);root.removeEventListener('focus',focus);details.remove();}};
 }
 root.LeewayPlaybackReport={mount};
})(globalThis);
