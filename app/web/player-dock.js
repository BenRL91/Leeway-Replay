/* Move controls, never recreate the media element or its saved editors. */
(function(root){
 let nextId=0;
 function mount(host,stages){
  const wrap=document.createElement('div');wrap.className='player-dock';
  const media=document.createElement('div');media.className='player-dock-media';
  const rail=document.createElement('nav');rail.className='player-tool-rail';rail.setAttribute('aria-label','Player tools');
  const menuHome=document.createElement('div');menuHome.className='player-menu-home';const menu=document.createElement('div');menu.className='player-tool-menu';menuHome.append(menu);rail.append(menuHome);
  stages[0].before(wrap);wrap.append(media,rail);stages.forEach(stage=>media.append(stage));
  const panels=[];let active=null,inlineMode=false,transport=null;
  menu.setAttribute('role','tablist');menu.setAttribute('aria-label','Replay tools');
  const dialog=document.createElement('dialog');dialog.className='player-tool-panel player-reading-panel unified-tool-panel';dialog.id='player-tool-panel-'+(++nextId);dialog.setAttribute('aria-label','Replay tools');
  const head=document.createElement('div');head.className='player-panel-heading';const title=document.createElement('h2');
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.addEventListener('click',()=>dialog.close());head.append(title,close);dialog.append(head);host.append(dialog);
  dialog.addEventListener('keydown',event=>{if(!inlineMode&&event.key==='Escape'){event.preventDefault();dialog.close();}});
  dialog.addEventListener('close',()=>{if(inlineMode)return;menuHome.append(menu);for(const p of panels){p.button.setAttribute('aria-expanded','false');p.button.setAttribute('aria-selected','false');}active?.button.focus({preventScroll:true});});
  function action(label,symbol,run){
   const button=document.createElement('button');button.type='button';button.className='player-tool';button.title=label;button.setAttribute('aria-label',label);
   const icon=document.createElement('span');icon.className='tool-symbol';icon.setAttribute('aria-hidden','true');if(symbol==='filmstrip')icon.innerHTML='<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M7 12h10"/></svg>';else icon.textContent=symbol;
   const text=document.createElement('span');text.textContent=label;button.append(icon,text);button.addEventListener('click',run);menu.append(button);return button;
  }
  function panel(label,symbol,content){
   if(label==='Frames'||label==='Options'){label='Playback';symbol='filmstrip';}
   const existing=panels.find(p=>p.label===label);if(existing){existing.slot.append(content);content.classList.add('docked-content');if(content.tagName==='DETAILS')content.open=true;return existing.api;}
   const slot=document.createElement('section');slot.id='player-tool-content-'+(++nextId);slot.setAttribute('role','tabpanel');slot.hidden=true;slot.append(content);dialog.append(slot);content.classList.add('docked-content');
   const button=action(label,symbol,open);button.id=slot.id+'-tab';button.setAttribute('role','tab');button.setAttribute('aria-controls',slot.id);button.setAttribute('aria-selected','false');button.setAttribute('aria-expanded','false');slot.setAttribute('aria-labelledby',button.id);
   let ignoreToggle=false;const record={button,slot,content,label};panels.push(record);button.tabIndex=panels.length===1?0:-1;
   function open(){
    if(record.redirect){record.redirect();return;}
    active=record;title.textContent=label;
    for(const p of panels){const selected=p===record;p.slot.hidden=!selected;p.button.setAttribute('aria-selected',String(selected));p.button.setAttribute('aria-expanded',String(selected));p.button.tabIndex=selected?0:-1;}
    if(content.tagName==='DETAILS'&&!content.open){ignoreToggle=true;content.open=true;}
    if(!dialog.open){if(!inlineMode)head.append(menu);dialog.show();}
   }
   button.addEventListener('keydown',event=>{const index=panels.indexOf(record);let target;if(['ArrowRight','ArrowDown'].includes(event.key))target=(index+1)%panels.length;else if(['ArrowLeft','ArrowUp'].includes(event.key))target=(index+panels.length-1)%panels.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=panels.length-1;else return;event.preventDefault();panels[target].button.click();panels[target].button.focus({preventScroll:true});});
   if(content.tagName==='DETAILS')content.addEventListener('toggle',()=>{if(record.detached)return;if(ignoreToggle){ignoreToggle=false;return;}if(content.open&&active!==record)open();});
   record.api={open,close:()=>{if(!inlineMode&&active===record&&dialog.open)dialog.close();}};return record.api;
  }
  function consolidate({header,onAdd,canAdd=true}={}){
   const main=panels.find(p=>p.label==='Current moment');if(!main)return;
   main.api.open();if(transport)host.append(transport);menu.hidden=true;dialog.classList.add('moments-only');host.closest?.('.video-workspace')?.classList.add('unified-review-layout');
   const notes=panels.find(p=>p.label==='Notes'),questions=panels.find(p=>p.label==='Questions & replies');
   let destination=null,showMode=()=>{};const composer=document.createElement('details');composer.className='add-moment-workspace';const summary=document.createElement('summary');summary.textContent='Add moment';composer.append(summary);main.slot.append(composer);composer.hidden=!canAdd;
   if(notes){composer.append(notes.content);notes.content.querySelectorAll('.feedback-details').forEach(n=>n.open=true);notes.content.querySelectorAll('.all-feedback').forEach(n=>n.hidden=true);notes.redirect=()=>{showMode('add');composer.open=true;notes.content.hidden=false;if(destination)destination.value='draft';composer.querySelectorAll('.question-composer').forEach(n=>n.hidden=true);notes.content.querySelectorAll('.feedback-details').forEach(n=>n.open=true);};}
   if(questions){main.slot.append(questions.content);questions.redirect=()=>{showMode('moments');};}
   if(notes&&questions){destination=document.createElement('select');destination.setAttribute('aria-label','New moment destination');for(const [v,t]of [['draft','Draft note'],['shared','Shared question or note']]){const o=document.createElement('option');o.value=v;o.textContent=t;destination.append(o);}destination.value='draft';composer.prepend(destination);destination.addEventListener('change',()=>{notes.content.hidden=destination.value==='shared';composer.querySelectorAll('.question-composer').forEach(n=>n.hidden=destination.value!=='shared');if(destination.value==='shared')onAdd?.(composer);});}

   header?.querySelectorAll('button').forEach(b=>{if(['Share','Practice plan','How to use Replay'].includes(b.textContent))b.hidden=true;});
   const modes=[{key:'moments',label:'Moments',node:main.slot}];
   if(canAdd){dialog.append(composer);composer.open=true;modes.push({key:'add',label:'Add moment',node:composer});}
   for(const p of panels){if(['Playback','Review tools','Practice & help'].includes(p.label)){const content=document.createElement('section');content.className='workspace-mode-content';p.detached=true;while(p.slot.firstChild)content.append(p.slot.firstChild);content.querySelectorAll('details.docked-content').forEach(n=>n.open=true);dialog.append(content);const key=p.label==='Playback'?'playback':'review';modes.push({key,label:key==='playback'?'Playback':'Review details',node:content});p.redirect=()=>showMode(key);}}
   const nav=document.createElement('div');nav.className='workspace-mode-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Review workspace mode');
   showMode=key=>{for(const item of modes){const selected=item.key===key;item.node.hidden=!selected;item.button.setAttribute('aria-selected',String(selected));item.button.tabIndex=selected?0:-1;}if(key==='add'&&!notes&&!composer.querySelector?.('.question-composer'))onAdd?.(composer);};
   modes.forEach((item,index)=>{const b=document.createElement('button');b.type='button';b.textContent=item.label;b.id='workspace-mode-'+(++nextId);b.setAttribute('role','tab');item.node.id=b.id+'-panel';b.setAttribute('aria-controls',item.node.id);item.node.setAttribute('role','tabpanel');item.node.setAttribute('aria-labelledby',b.id);item.button=b;b.addEventListener('click',()=>showMode(item.key));b.addEventListener('keydown',event=>{let target;if(event.key==='ArrowRight')target=(index+1)%modes.length;else if(event.key==='ArrowLeft')target=(index+modes.length-1)%modes.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=modes.length-1;else return;event.preventDefault();showMode(modes[target].key);modes[target].button.focus({preventScroll:true});});nav.append(b);});
   dialog.parentNode.prepend(nav);showMode('moments');
   return {composer,showMode};
  }
  return {action,panel,consolidate,transport:content=>{transport=content;content.classList.add('docked-transport');rail.append(content);},inline:(container,navigation,current,guide)=>{
   inlineMode=true;wrap.classList.add('inline-player-dock');rail.hidden=true;head.hidden=true;dialog.classList.add('inline-tool-content');
   const currentPanel=document.createElement('div');currentPanel.append(current,guide);const currentTab=panel('Current moment','◷',currentPanel);
   const order=['Current moment','Notes','Questions & replies','Playback'];panels.sort((a,b)=>(order.includes(a.label)?order.indexOf(a.label):99)-(order.includes(b.label)?order.indexOf(b.label):99));panels.forEach(p=>menu.append(p.button));
   container.classList.add('inline-moment-workspace');container.replaceChildren(navigation,menu,dialog);
   if(transport)navigation.append(transport);
   currentTab.open();
  }};
 }
 root.LeewayPlayerDock={mount};
})(globalThis);
