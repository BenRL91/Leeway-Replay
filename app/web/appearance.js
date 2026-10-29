(function(root){
 'use strict';
 const key='leeway-replay.appearance.v1',valid=value=>['system','light','dark'].includes(value);
 const media=root.matchMedia('(prefers-color-scheme: dark)');let preference='system';
 try{const saved=root.localStorage.getItem(key);if(valid(saved))preference=saved;}catch{}
 let control;
 function apply(){
  const resolved=preference==='system'?(media.matches?'dark':'light'):preference;
  document.documentElement.dataset.appearance=resolved;
  document.documentElement.dataset.appearancePreference=preference;
  if(control)control.value=preference;
 }
 function choose(value){if(!valid(value))return;preference=value;try{root.localStorage.setItem(key,value);}catch{}apply();}
 apply(); // Runs in the head so the saved appearance is applied before first paint.
 media.addEventListener('change',()=>{if(preference==='system')apply();});
 root.addEventListener('storage',event=>{if(event.key===key){preference=valid(event.newValue)?event.newValue:'system';apply();}});
 document.addEventListener('DOMContentLoaded',()=>{
  const header=document.querySelector('.replay-header, .preview-banner');if(!header)return;
  const label=document.createElement('label');label.className='appearance-control';
  const title=document.createElement('span');title.textContent='Appearance';
  control=document.createElement('select');control.setAttribute('aria-label','Appearance');
  for(const [value,text]of [['system','System'],['light','Light'],['dark','Dark']]){const option=document.createElement('option');option.value=value;option.textContent=text;control.append(option);}
  control.value=preference;control.addEventListener('change',()=>choose(control.value));label.append(title,control);header.append(label);
 });
 root.LeewayAppearance={choose,get:()=>preference};
})(globalThis);
