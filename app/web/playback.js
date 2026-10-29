/* Shared stable Leeway Replay playback surface: no navigation or DOM replacement while seeking. */
(function(root){
 'use strict';let apiPromise;
 function youtubeAPI(){if(root.YT?.Player)return Promise.resolve();if(apiPromise)return apiPromise;apiPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');let timeout;const fail=()=>{clearTimeout(timeout);s.remove();apiPromise=null;reject(new Error('YouTube could not load. Try again.'));};root.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve();};s.src='https://www.youtube.com/iframe_api';s.onerror=fail;timeout=setTimeout(fail,15000);document.head.append(s);});return apiPromise;}
 function targetTime(value,duration){return Math.max(0,Math.min(Number.isFinite(value)?value:0,Number.isFinite(duration)&&duration>0?duration:604800));}
 function controlIcon(button,label,kind){
  button.setAttribute('aria-label',label);button.title=label;button.className='transport-icon';
  const paths={back:'<path d="M9 4 4 8l5 4M4 8h9a7 7 0 0 1 6 10"/><text x="7" y="21">10</text>',forward:'<path d="m15 4 5 4-5 4m5-4h-9a7 7 0 0 0-6 10"/><text x="7" y="21">10</text>',previous:'<path d="M7 5v14m11-14-9 7 9 7Z"/>',next:'<path d="M17 5v14M6 5l9 7-9 7Z"/>'};
  button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
 }
 function frameControls(container,{position,ready=()=>true,pause,seek,jumpButtons=null}){
  const bar=document.createElement('div');bar.className='frame-controls';bar.setAttribute('aria-label',jumpButtons?'Playback navigation':'Frame stepping');if(jumpButtons){bar.className+=' compact-transport';bar.setAttribute('role','group');}const rate=document.createElement('select');rate.setAttribute('aria-label','Footage frame rate');rate.title='Match the footage’s frame rate. YouTube seeking may land on a nearby frame.';for(const fps of [24,25,30,50,60,120]){const option=document.createElement('option');option.value=String(fps);option.textContent=`${fps} fps`;rate.append(option);}rate.value='30';try{const stored=root.localStorage?.getItem('leeway-replay.frame-rate');if([24,25,30,50,60,120].includes(Number(stored)))rate.value=stored;}catch{}
  let cursor=null;function step(direction){if(!ready())return;const fps=Number(rate.value)||30,at=position();if(cursor===null||Math.abs(at-cursor)>.15)cursor=at;cursor=Math.max(0,cursor+direction/fps);pause();seek(cursor);}
  const frameButtons=[];if(jumpButtons){controlIcon(jumpButtons[0],'Back 10 seconds','back');controlIcon(jumpButtons[1],'Forward 10 seconds','forward');bar.append(jumpButtons[0]);}
  for(const [label,direction]of [['Previous frame',-1],['Next frame',1]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.title=direction<0?'Pause and move back one frame interval.':'Pause and move forward one frame interval.';button.addEventListener('click',()=>step(direction));if(jumpButtons)controlIcon(button,label,direction<0?'previous':'next');frameButtons.push(button);bar.append(button);}if(jumpButtons)bar.append(jumpButtons[1]);else bar.append(rate);rate.addEventListener('change',()=>{cursor=null;try{root.localStorage?.setItem('leeway-replay.frame-rate',rate.value);}catch{}});
  const info=document.createElement('details'),summary=document.createElement('summary'),help=document.createElement('p');summary.textContent=jumpButtons?'⚙':'Frame stepping';if(jumpButtons){summary.setAttribute('aria-label','Playback options');summary.title='Playback options and frame rate';}help.textContent='Choose the footage’s frame rate. Buttons pause and seek by 1 frame interval. YouTube and some video formats may land on a nearby frame; exact frame accuracy is not guaranteed.';info.append(summary);if(jumpButtons){const label=document.createElement('label');label.textContent='Footage frame rate';label.append(rate);info.append(label);}info.append(help);bar.append(info);container.append(bar);return {element:bar,options:info,step,setEnabled:value=>frameButtons.forEach(b=>b.disabled=!value),reset:()=>{cursor=null;}};
 }
 function mount(container,{onTime=()=>{},onSeek=()=>{}}={}){
  const stage=document.createElement('div');stage.className='replay-stage';
  const controls=document.createElement('div');controls.className='playback-controls';
  const status=document.createElement('p');status.className='playback-status';status.setAttribute('role','status');
  const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='0';slider.step='1';slider.value='0';slider.disabled=true;slider.setAttribute('aria-label','Video position');slider.title='Drag to a moment in the video; release to seek.';
  const time=document.createElement('span');time.textContent='0:00';time.className='playback-time';
  function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;}
  const back=button('−10 sec',()=>seek(currentTime()-10));const forward=button('+10 sec',()=>seek(currentTime()+10));back.disabled=forward.disabled=true;
  controls.append(time,slider);container.replaceChildren(stage,controls,status);
  let player=null,media=null,ready=false,generation=0,pending=0,pendingSeek=false,pendingResume=true,pendingLocalPlay=false,scrubbing=false,sourceKey=null,videoId=null,pausedSeek=null,previewMuted=null;
  const report=root.LeewayPlaybackReport?.mount(container,{position:currentTime});
  const frames=frameControls(controls,{jumpButtons:[back,forward],position:currentTime,ready:()=>ready,pause:()=>{},seek:value=>seek(value,{resume:false})});
  function enable(value){ready=value;back.disabled=forward.disabled=slider.disabled=!value;frames.setEnabled(value);}
  frames.setEnabled(false);
  if(root.LeewayPlayerDock){controls.controlDock=root.LeewayPlayerDock.mount(container,[stage]);controls.controlDock.panel('Frames','filmstrip',frames.options);controls.controlDock.transport(frames.element);}
  function currentTime(){return ready?(media?media.currentTime:pausedSeek??player?.getCurrentTime?.()??0):pending;}
  function duration(){return media?media.duration:player?.getDuration?.()||0;}
  function restorePreviewSound(){if(previewMuted===false)player?.unMute?.();previewMuted=null;}
  function youtubeSeek(resume){
   pausedSeek=null;
   if(resume){restorePreviewSound();player.seekTo(pending,true);player.playVideo?.();return;}
   const state=player.getPlayerState?.();
   // Cue only displays a thumbnail. Load the target silently, then pause on Playing.
   if((state===-1||state===5)&&player.loadVideoById){
    pausedSeek=pending;if(previewMuted===null&&player.isMuted)previewMuted=player.isMuted();player.mute?.();
    player.loadVideoById({videoId,startSeconds:pending});return;
   }
   if(state===2){player.seekTo(pending,true);return;}
   if(state===1||state===3||state===0){pausedSeek=pending;player.pauseVideo();return;}
   // Compatibility fallback for adapters without state reporting.
   player.pauseVideo?.();player.seekTo(pending,true);
  }
  function seek(value,{resume=true,playLocal=false}={}){report?.record('requested-seek',Math.floor(value));pendingResume=resume;pendingLocalPlay=playLocal;pendingSeek=true;pending=targetTime(value,duration());onSeek(pending);if(!ready){status.textContent='Loading video. Your selected moment will open when it is ready.';return;}if(media){if(!resume)media.pause();media.currentTime=pending;if(resume&&playLocal)media.play?.().catch?.(()=>{});}else youtubeSeek(resume);slider.value=String(pending);time.textContent=YouTutorCore.formatPreciseTime(pending);status.textContent=pausedSeek!==null?`Preparing paused frame at ${YouTutorCore.formatPreciseTime(pending)}…`:`Moved to ${YouTutorCore.formatTime(pending)}. Tap play if needed.`;onTime(pending,{requested:true});}
  slider.addEventListener('input',()=>{scrubbing=true;time.textContent=YouTutorCore.formatTime(Number(slider.value));});
  slider.addEventListener('change',()=>{const at=Number(slider.value);scrubbing=false;seek(at);});
  slider.addEventListener('blur',()=>{scrubbing=false;});
  function clear(){frames.reset();sourceKey=null;generation++;enable(false);if(player){restorePreviewSound();player.destroy();player=null;}if(media){media.pause();media.removeAttribute('src');media.load();media=null;}stage.replaceChildren();slider.max='0';slider.value='0';pending=0;pendingSeek=false;pendingResume=true;pendingLocalPlay=false;videoId=null;pausedSeek=null;previewMuted=null;}
  async function load(source,mediaURL){const key=source?`${source.kind}:${source.id}:${mediaURL||''}`:null;if(key&&key===sourceKey){report?.record('reuse-video');return;}report?.record('load-video');clear();sourceKey=key;const token=generation;status.textContent=source?'Loading video…':'Choose a video source to begin.';if(!source)return;
   try{
    if(source.kind==='file'){
     media=document.createElement('video');const v=media;v.controls=true;v.playsInline=true;v.preload='metadata';v.src=mediaURL;stage.append(v);
     v.addEventListener('seeking',()=>onSeek(v.currentTime));
     v.addEventListener('loadedmetadata',()=>{if(token!==generation)return;slider.max=String(Number.isFinite(v.duration)?Math.floor(v.duration):604800);enable(true);report?.state('Ready');status.textContent='Tap play. Select a coaching note to jump to that moment.';if(pendingSeek)seek(pending,{resume:pendingResume,playLocal:pendingLocalPlay});});
     v.addEventListener('error',()=>{if(token!==generation)return;sourceKey=null;enable(false);status.textContent='This video is unavailable or its format is unsupported. MP4 is usually the best choice on iPhone and iPad.';});
    }else{
     await youtubeAPI();if(token!==generation)return;videoId=source.id;const target=document.createElement('div');stage.append(target);
     player=new root.YT.Player(target,{width:'100%',height:'100%',videoId:source.id,playerVars:{playsinline:1,controls:1,fs:1,disablekb:0,origin:location.origin},events:{onReady:()=>{if(token!==generation)return;slider.max=String(Math.floor(player.getDuration()||604800));enable(true);report?.state('Ready');status.textContent='Tap play. Select a coaching note to jump to that moment.';if(pendingSeek)seek(pending,{resume:pendingResume,playLocal:pendingLocalPlay});},onStateChange:event=>{if(token!==generation)return;
      if(event.data===2&&pausedSeek!==null){const at=pausedSeek;pausedSeek=null;player.seekTo(at,true);restorePreviewSound();}
      if(event.data===1){if(pausedSeek!==null){player.pauseVideo();return;}}
      const label=({[-1]:'Not started',0:'Ended',1:'Playing',2:'Paused',3:'Buffering',5:'Cued'})[event.data]||'Unknown';report?.state(label);status.textContent=event.data===2?'YouTube is paused. Press Play to continue.':event.data===3?'YouTube is buffering…':event.data===1?'Playing. Notes follow without interrupting playback.':label;},onAutoplayBlocked:()=>{if(token!==generation)return;report?.state('Browser blocked playback');status.textContent=pausedSeek!==null?'Tap Play inside the video to prepare the selected paused frame.':'Your browser blocked playback. Tap Play inside the video.';},onError:event=>{if(token!==generation)return;report?.record('youtube-error',event?.data);restorePreviewSound();pausedSeek=null;sourceKey=null;enable(false);status.textContent='This video cannot play here. Coach Lee may need to choose footage that permits embedded playback.';}}});
    }
   }catch(e){if(token===generation){sourceKey=null;status.textContent=e.message;}}
  }
  const interval=setInterval(()=>{if(!ready)return;const at=currentTime();if(!Number.isFinite(at))return;const d=duration();if(Number.isFinite(d)&&d>0)slider.max=String(Math.floor(d));if(!scrubbing){slider.value=String(Math.floor(at));time.textContent=YouTutorCore.formatPreciseTime(at);}onTime(at);},500);
  return {navigationContainer:controls,load,seek,openNote:note=>seek(note.at,{resume:!note.pauseOnOpen,playLocal:true}),currentTime,isPlaying:()=>ready&&pausedSeek===null&&(media?(!media.paused||media.ended):[0,1].includes(player?.getPlayerState?.())),loopTo:value=>{seek(value);if(media?.paused)media.play?.().catch?.(()=>{});},stepFrame:frames.step,destroy(){clearInterval(interval);clear();report?.destroy();},clear};
 }
 root.YouTutorPlayback={mount,targetTime,youtubeAPI,frameControls};
})(globalThis);
