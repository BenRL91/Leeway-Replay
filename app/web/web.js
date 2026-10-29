(function () {
  'use strict';
  const core = YouTutorCore;
  const links = YouTutorLinks;
  const input = document.getElementById('video-link');
  const message = document.getElementById('player-message');
  const external = document.getElementById('open-youtube');
  const mount = document.getElementById('player-mount');
  const fileViewer = document.getElementById('file-viewer');
  const localFiles=LeewayLocalFiles.create();
  const localInput=document.getElementById('local-file-input');
  const localStatus=document.getElementById('local-file-status');
  const cancelLocalJump=document.getElementById('cancel-local-jump');
  document.getElementById('choose-youtube').addEventListener('click',()=>{const picker=document.querySelector('.source-picker');picker.open=true;picker.scrollIntoView({behavior:'smooth',block:'start'});input.focus({preventScroll:true});});
  document.getElementById('choose-local').addEventListener('click',()=>localInput.click());
  let pendingLocal=null;
  cancelLocalJump.addEventListener('click',()=>{pendingLocal=null;cancelLocalJump.hidden=true;localStatus.textContent='Choose a video to open locally. No upload.';});
  let activeMedia = null;
  const placeholder = document.getElementById('player-placeholder');
  let player = null; let ready = false; let current = null; let apiPromise; let generation = 0; let loading = false;
  let pendingNote=null,pausedSeek=null,previewMuted=null;
  function restorePreviewSound(){if(previewMuted===false)player?.unMute?.();previewMuted=null;}
  function applyNote(item){
    if(activeMedia){
      if(activeMedia.readyState<1){pendingNote=item;return;}
      pendingNote=null;if(item.pauseOnOpen)activeMedia.pause();seek(item.at);
      if(!item.pauseOnOpen)activeMedia.play?.().catch?.(()=>announce('Tap Play in the video to continue.'));
      return;
    }
    if(!ready){pendingNote=item;return;}
    pendingNote=null;pausedSeek=null;
    const at=YouTutorPlayback.targetTime(item.at,player.getDuration());followNotes.notifySeek(at);
    if(!item.pauseOnOpen){restorePreviewSound();player.seekTo(at,true);player.playVideo();return;}
    const state=player.getPlayerState?.();
    if((state===-1||state===5)&&player.loadVideoById){
      pausedSeek=at;if(previewMuted===null&&player.isMuted)previewMuted=player.isMuted();player.mute?.();
      player.loadVideoById({videoId:current.id,startSeconds:at});return;
    }
    if(state===2){player.seekTo(at,true);return;}
    if([0,1,3].includes(state)){pausedSeek=at;player.pauseVideo();return;}
    player.pauseVideo?.();player.seekTo(at,true);
  }
  function openSavedNote(item){
    followNotes.setNotes(app.playbackNotes(item.video));followNotes.showAt(item.at,item);
    if(item.video.kind==='file'){
      const file=item.video.local?localFiles.get(item.video.id):{id:item.video.id,name:item.video.title,media:item.video.media};
      if(file)openFile(file,item.at,item);
      else{pendingLocal=item;document.querySelector('.source-picker').open=true;cancelLocalJump.hidden=false;localStatus.textContent='Choose '+item.video.title+' to open this saved moment. No upload.';localInput.click();}
    }else loadVideo(item.video.id,item.at,item.video.title,item);
    document.getElementById('player-shell').scrollIntoView({behavior:'smooth',block:'center'});
  }
  function enableSeeking(enabled) { for (const id of ['seek-back', 'seek-forward', 'seek-go']) document.getElementById(id).disabled = !enabled; }
  function announce(text, error = false) { message.textContent = text; message.className = `player-message${error ? ' error' : ''}`; }
  function loadAPI() { return YouTutorPlayback.youtubeAPI(); }
  const playbackReport=LeewayPlaybackReport.mount(document.querySelector('.watch-column'),{position:()=>activeMedia?.currentTime ?? (ready?player?.getCurrentTime?.():0)});
  async function loadVideo(id, at = 0, title = '', note = null) {
    if(current?.kind!=='file'&&current?.id===id&&(ready||loading)){playbackReport.record('reuse-video');if(note)applyNote(note);else if(ready)seek(at);return;}
    restorePreviewSound();pausedSeek=null;pendingNote=note;followNotes.stopLoop();playbackReport.record('load-video');
    if (activeMedia) { activeMedia.pause(); activeMedia.removeAttribute('src'); activeMedia.load(); activeMedia = null; }
    fileViewer.replaceChildren(); fileViewer.hidden = true; document.getElementById('player-shell').hidden = false;
    const thisLoad = ++generation; ready = false; loading = true; enableSeeking(false);
    document.querySelector('.source-picker').open=false;
    current = { id, at, title: title || `YouTube video ${id}` }; app.prepareNote(current); input.value = core.videoURL(id, at);
    external.href = core.videoURL(id, at); external.hidden = false;
    announce('Loading the YouTube player…');
    try {
      await loadAPI(); if (thisLoad !== generation) return;
      if (player) player.destroy();
      mount.replaceChildren(); const target = document.createElement('div'); mount.append(target); mount.hidden = false; placeholder.hidden = true;
      player = new YT.Player(target, { width: '100%', height: '100%', videoId: id,
        playerVars: { playsinline: 1, controls: 1, fs: 1, disablekb: 0, origin: location.origin, start: Math.floor(at) },
        events: {
          onReady: () => { if (thisLoad !== generation) return; playbackReport.state('Ready');ready = true; loading = false; enableSeeking(true); announce(at ? `Video opened at ${core.formatTime(at)}. Tap play, then capture a moment or write your note.` : 'Tap play in the video. Then capture a moment in Notes.');if(pendingNote)applyNote(pendingNote); },
          onStateChange: event => {
            if (thisLoad !== generation || !ready) return;
            if(event.data===2&&pausedSeek!==null){const target=pausedSeek;pausedSeek=null;player.seekTo(target,true);restorePreviewSound();}
            if(event.data===1&&pausedSeek!==null){player.pauseVideo();return;}
            const label=({[-1]:'Not started',0:'Ended',1:'Playing',2:'Paused',3:'Buffering',5:'Cued'})[event.data]||'Unknown';playbackReport.state(label);
            if(event.data===2)announce('YouTube is paused. Press Play in the video to continue. If this was unexpected, copy the playback report below.');
            else if(event.data===3)announce('YouTube is buffering…');
            else if(event.data===1)announce('Playing. Notes follow the playhead without changing playback.');
            const data = player.getVideoData?.();
            if (data?.video_id === current.id && data.title) { current.title = data.title; }
          },
          onAutoplayBlocked:()=>{if(thisLoad!==generation)return;playbackReport.state('Browser blocked playback');announce('Your browser blocked playback. Tap Play inside the YouTube player.');},
          onError: (event) => {
            playbackReport.record('youtube-error',event.data);
            if (thisLoad !== generation) return;
            ready = false; loading = false; enableSeeking(false);
            announce([101, 150].includes(event.data) ? 'This video does not allow embedded playback. Open it on YouTube and enter timestamps manually.' : 'This video could not play here. Try another video, or open it on YouTube and enter timestamps manually.', true);
          }
        }
      });
      app.prepareNote(current);
    } catch (error) { if (thisLoad === generation) { loading = false; announce(error.message, true); } }
  }
  const app = YouTutorUI.mount(document.getElementById('app'), {
    mode: 'web',composerContainer:document.getElementById('moment-composer'),sourceContainer:document.getElementById('saved-video-picker'),
    context: () => {
      if (current?.kind === 'file') {
        if (!activeMedia) return { ...current, at: 0 };
        return Number.isFinite(activeMedia.currentTime) ? { ...current, at: activeMedia.currentTime } : null;
      }
      if (!ready || loading || !player || !current || player.getVideoData?.().video_id !== current.id) return null;
      const at = player.getCurrentTime();
      if (!Number.isFinite(at) || at < 0 || player.getPlayerState() === -1) return null;
      return { ...current, at };
    },
    createReplay:async(video,items)=>{
      if(items.length>300)throw Error('This video has more than 300 notes. Create a Replay and import a smaller selection.');
      const {review}=await YouTutorAPI('/api/replay/reviews',{method:'POST',body:JSON.stringify({kind:'personal'}),headers:{'Content-Type':'application/json'}});
      await YouTutorAPI('/api/replay/reviews/'+review.id+'/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:review.revision,content:{title:video.title,player:'',source:{...video,kind:video.kind||'youtube'},notes:items.map(n=>({id:crypto.randomUUID(),category:'Note',at:n.at,body:n.body,...(n.endAt!==undefined?{endAt:n.endAt}:{}),...(n.pauseOnOpen?{pauseOnOpen:true}:{})})),summary:'',priorities:[],drills:[]},viewers:[],viewerEmails:[]})});
      location.assign('/replay?review='+review.id);
    },
    play: openSavedNote
  });
  const followNotes=LeewayNoteFollow.mount(document.getElementById('playback-notes'),{heading:'Current moment',actions:n=>{const actions=app.noteActions?.(n.id);return actions?[{label:'Edit note / times',run:actions.edit},{label:'Delete note',run:actions.remove}]:[];},seek:(at,n)=>n?openSavedNote(n):seek(at),playing:()=>pausedSeek===null&&( activeMedia?(!activeMedia.paused||activeMedia.ended):[0,1].includes(player?.getPlayerState?.())),loopSeek:at=>{seek(at);if(activeMedia?.paused)activeMedia.play?.().catch?.(()=>{});else if(!activeMedia)player?.playVideo?.();}});
  let lastNoteVersion='';
  const followTimer=setInterval(()=>{const version=`${current?.kind||'youtube'}:${current?.id||''}:${app.playbackNoteVersion()}`;if(version!==lastNoteVersion){lastNoteVersion=version;followNotes.setNotes(app.playbackNotes(current));}const at=activeMedia?.currentTime ?? (ready?player?.getCurrentTime?.():0);if(Number.isFinite(at))followNotes.tick(at);},250);
  addEventListener('pagehide',()=>clearInterval(followTimer));
  document.getElementById('video-form').addEventListener('submit', event => {
    event.preventDefault();
    try { const shared = links.parse(input.value); loadVideo(shared.id, shared.at); }
    catch (error) { announce(error.message, true); }
  });
  function seek(at) {
    playbackReport.record('requested-seek',Math.floor(at));
    if (current?.kind === 'file' && activeMedia) {
      const target = YouTutorPlayback.targetTime(at, activeMedia.duration);followNotes.notifySeek(target);
      activeMedia.currentTime = target; document.getElementById('seek-time').value = core.formatTime(target); announce(`Moved to ${core.formatTime(target)}.`); return;
    }
    if (!ready || !player) return announce('Load a video and tap play first.', true);
    const duration = player.getDuration();
    const target = YouTutorPlayback.targetTime(at, duration);followNotes.notifySeek(target);
    player.seekTo(target, true); document.getElementById('seek-time').value = core.formatTime(target);
    announce(`Moved to ${core.formatTime(target)}. Capture the moment when you are ready.`);
  }
  const libraryFrames=YouTutorPlayback.frameControls(document.getElementById('seek-form'),{jumpButtons:[document.getElementById('seek-back'),document.getElementById('seek-forward')],position:()=>activeMedia?.currentTime??player?.getCurrentTime?.()??0,ready:()=>!!activeMedia||ready,pause:()=>{if(activeMedia)activeMedia.pause();else player?.pauseVideo?.();},seek});
  document.getElementById('seek-back').addEventListener('click', () => seek((activeMedia ? activeMedia.currentTime : player.getCurrentTime()) - 10));
  document.getElementById('seek-forward').addEventListener('click', () => seek((activeMedia ? activeMedia.currentTime : player.getCurrentTime()) + 10));
  document.getElementById('seek-form').addEventListener('submit', event => { event.preventDefault(); try { seek(core.parseTime(document.getElementById('seek-time').value)); } catch (error) { announce(error.message, true); } });
  const incoming = new URLSearchParams(location.search).get('video');
  if (incoming) {
    try { const shared = links.parse(incoming); input.value = shared.url; app.prepareNote({ ...shared, title: `YouTube video ${shared.id}` }); announce(`Video link received${shared.at ? ` at ${core.formatTime(shared.at)}` : ''}. Tap Load video to play it, or save a manual note.`); }
    catch (error) { announce(error.message, true); }
  }
  document.getElementById('example-video').addEventListener('click', () => loadVideo('M7lc1UVf-VE', 0, 'YouTube IFrame API example'));
  const fileStatus = document.getElementById('upload-status');
  const fileInput = document.getElementById('file-input');
  const progress = document.getElementById('upload-progress');
  let files = [];
  function node(tag, text, attrs = {}) {
    const n = document.createElement(tag); if (text) n.textContent = text;
    for (const [key,value] of Object.entries(attrs)) n.setAttribute(key,value);
    return n;
  }
  async function refreshFiles() {
    try {
      files = (await YouTutorAPI('/api/files')).files;
      const list = document.getElementById('file-list'); list.replaceChildren();
      if (!files.length) list.append(node('p', 'No files yet. Choose a file above to begin.', { class: 'muted' }));
      for (const file of files) {
        const row = node('div', '', { class: 'file-row' });
        row.append(node('strong', file.name), node('span', `${file.media} · ${(file.size / 1024 / 1024).toFixed(1)} MB`, { class: 'muted' }));
        const actions = node('div', '', { class: 'row' });
        const open = node('button', 'Open & take notes', { type: 'button', class: 'secondary' }); open.addEventListener('click', () => openFile(file));
        const download = node('a', 'Download', { href: `/api/files/${encodeURIComponent(file.id)}?download=1`, class: 'external-link', download: file.name });
        actions.append(open,download); row.append(actions); list.append(row);
      }
    } catch (error) { announce('Your file list could not be refreshed. '+error.message,true); }
  }
  async function openFile(file, at = 0, note = null) {
    if(current?.id!==file.id)followNotes.stopLoop();
    if(current?.kind==='file'&&current.id===file.id&&activeMedia){if(note)applyNote(note);else seek(at);return;}
    restorePreviewSound();pausedSeek=null;pendingNote=note;playbackReport.record('load-file');
    ++generation; ready = false; loading = false; enableSeeking(false);
    if (player) { player.destroy(); player = null; }
    if (activeMedia) { activeMedia.pause(); activeMedia.removeAttribute('src'); activeMedia.load(); activeMedia = null; }
    document.getElementById('player-shell').hidden = true; external.hidden = true;
    fileViewer.replaceChildren(); fileViewer.hidden = false;
    current = { kind: 'file', id: file.id, title: file.name, media: file.media, ...(file.local?{local:true}:{}), at };
    app.prepareNote(current);document.querySelector('.source-picker').open=false;
    const url = file.local?file.url:`/api/files/${encodeURIComponent(file.id)}`;
    fileViewer.append(node('h3',file.name));
    if (['video','audio'].includes(file.media)) {
      activeMedia = node(file.media, '', { controls: '', playsinline: '', preload: 'metadata', src: url });
      const media = activeMedia;
      media.addEventListener('loadedmetadata', () => { if (activeMedia !== media) return; enableSeeking(true); if (at) media.currentTime = Math.min(at, media.duration); announce('Use the player or seek buttons, then capture a moment in Notes.');if(pendingNote)applyNote(pendingNote); });
      media.addEventListener('error', () => { enableSeeking(false); announce('This file format could not play in this browser. Download it or try an MP4 video / MP3 audio file. You can still enter timestamps manually.',true); });
      fileViewer.append(media);
    } else if (file.media === 'image') fileViewer.append(node('img','', { src: url, alt: file.name }));
    else if (file.media === 'pdf') {
      fileViewer.append(node('iframe','', { src: url, title: file.name, class: 'pdf-viewer' }));
      fileViewer.append(node('a','Open PDF in a new tab', { href: url, target: '_blank', rel: 'noopener' }));
    } else if (file.media === 'text') {
      const pre = node('pre','Loading text…'); fileViewer.append(pre);
      try {
        const response = await fetch(url, { credentials: 'same-origin', headers: { Range: 'bytes=0-2097151' } });
        if (!response.ok) throw new Error('File could not be read.');
        pre.textContent = await response.text();
        if (Number(response.headers.get('Content-Range')?.split('/')[1]) > 2097152) fileViewer.append(node('p','Showing the first 2 MB. Download the file for the full text.'));
      } catch (error) { pre.textContent = error.message; }
    }
    announce(['video','audio'].includes(file.media) ? 'Loading media…' : 'Save notes with this file. A tutorial is optional.');
    fileViewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  localInput.addEventListener('change',async()=>{
    const file=localInput.files?.[0];if(!file)return;
    localInput.disabled=true;localStatus.textContent='Opening locally… No upload is taking place.';
    try{
      const attached=await localFiles.attach(file);
      if(pendingLocal&&attached.id!==pendingLocal.video.id){localStatus.textContent='This does not match the file for that note. Choose the original footage, or cancel the jump.';return;}
      const selectedNote=pendingLocal;const at=selectedNote?.at||0;pendingLocal=null;cancelLocalJump.hidden=true;
      await openFile(attached,at,selectedNote);localStatus.textContent=`${file.name} is open locally. Video/audio bytes stay on your device. Notes save to your library.`;
    }catch(e){localStatus.textContent=e.message;}
    finally{localInput.disabled=false;localInput.value='';}
  });
  addEventListener('pagehide',()=>{localFiles.clear();playbackReport.destroy();});
  const cancelUpload=document.getElementById('cancel-upload');
  const uploadPanel=document.getElementById('upload-panel');
  const uploadHeading=document.getElementById('upload-heading');
  const uploadName=document.getElementById('upload-name');
  const uploadMetrics=document.getElementById('upload-metrics');
  const uploadActivity=document.getElementById('upload-activity');
  const dismissUpload=document.getElementById('dismiss-upload');
  const openUpload=document.getElementById('open-upload');
  let activeUpload=null,savedUpload=null,lastActivity=0,uploadTimer=null,uploadPercent=0;
  const sizeText=bytes=>bytes>=1024**3?`${(bytes/1024**3).toFixed(2)} GB`:`${(bytes/1024**2).toFixed(1)} MB`;
  function uploadState(state,title,message) {
    uploadPanel.hidden=false;document.body.classList.add('upload-panel-visible');
    uploadPanel.dataset.state=state;uploadHeading.textContent=title;fileStatus.textContent=message;
  }
  dismissUpload.addEventListener('click',()=>{uploadPanel.hidden=true;document.body.classList.remove('upload-panel-visible');});
  openUpload.addEventListener('click',()=>{if(savedUpload)openFile(savedUpload);});
  cancelUpload.addEventListener('click',()=>{if(activeUpload?.cancel()){cancelUpload.disabled=true;uploadState('cancelling','Cancelling upload','Stopping the transfer. Your file has not been saved.');}});
  fileInput.addEventListener('change', async () => {
    const file=fileInput.files?.[0];if(!file)return;
    savedUpload=null;uploadName.textContent=file.name;openUpload.hidden=true;dismissUpload.hidden=true;cancelUpload.hidden=false;cancelUpload.disabled=false;
    progress.hidden=false;progress.value=0;uploadPercent=0;uploadActivity.textContent='';
    uploadMetrics.textContent=`0% · 0 MB of ${sizeText(file.size)}`;
    uploadState('starting','Starting upload','Preparing your private upload. No data has been sent yet.');
    function invalid(message){uploadState('failed','Upload did not start',message);cancelUpload.hidden=true;dismissUpload.hidden=false;progress.hidden=true;fileInput.value='';}
    if(!file.size||file.size>LeewayUploads.MAX_FILE){invalid('Choose a nonempty file up to 25 GB.');return;}
    if(!/\.(mp4|mov|webm|mp3|m4a|wav|ogg|jpe?g|png|webp|gif|pdf|txt|md|csv|json)$/i.test(file.name)){invalid('This file type is not supported yet.');return;}
    fileInput.disabled=true;lastActivity=Date.now();
    uploadTimer=setInterval(()=>{
      const seconds=Math.floor((Date.now()-lastActivity)/1000);
      if(seconds>=15)uploadActivity.textContent=`Waiting for a response · ${seconds} seconds since the last update. Keep this page open.`;
    },1000);
    try {
      activeUpload=LeewayUploads.uploadFile(file,{
        onProgress:value=>{if(uploadPanel.dataset.state==='retrying'&&value>uploadPercent){uploadPanel.dataset.state='uploading';uploadHeading.textContent='Uploading';}uploadPercent=value;progress.value=value;uploadMetrics.textContent=`${Math.floor(value)}% · ${sizeText(file.size*value/100)} of ${sizeText(file.size)} sent`;lastActivity=Date.now();uploadActivity.textContent='Transfer active. Keep this page open and your device awake.';},
        onStatus:(text,info={})=>{
          lastActivity=Date.now();uploadActivity.textContent='Keep this page open and your device awake.';
          const phase=info.phase||'uploading';
          uploadState(phase,phase==='starting'?'Starting upload':phase==='saving'?'Saving file':phase==='retrying'?'Retrying upload':phase==='failed'?'Upload failed':phase==='cancelled'?'Upload cancelled':'Uploading',text);
          cancelUpload.disabled=info.finishing===true;
          if(phase==='saving')uploadActivity.textContent='All bytes sent. Waiting for confirmation that your file is saved.';
        }
      });
      const result=await activeUpload.promise;savedUpload=result.file;
      uploadState('success','Upload complete','Your file is saved in your private library.');progress.value=100;
      uploadMetrics.textContent=`100% · ${sizeText(file.size)} saved`;uploadActivity.textContent='';openUpload.hidden=false;
      await refreshFiles();
    }catch(error){
      const cancelled=error.message==='Upload cancelled.';
      uploadState(cancelled?'cancelled':'failed',cancelled?'Upload cancelled':'Upload failed',cancelled?'Your file was not saved.':error.message+' Choose the file again to retry.');
      uploadActivity.textContent='';
    }finally{
      clearInterval(uploadTimer);activeUpload=null;fileInput.disabled=false;fileInput.value='';cancelUpload.hidden=true;dismissUpload.hidden=false;
    }
  });
  addEventListener('beforeunload',event=>{if(activeUpload){event.preventDefault();event.returnValue='';}});
  refreshFiles();
  if(globalThis.LeewayPlayerDock){
    const dock=LeewayPlayerDock.mount(document.querySelector('.watch-column'),[document.getElementById('player-shell'),fileViewer]);
    dock.panel('Footage','▻',document.querySelector('.source-picker'));
    dock.panel('Add note','+',document.querySelector('#moment-composer .note-composer-details'));
    dock.panel('Library','▤',document.querySelector('.library-browser'));
    dock.panel('Options','⚙',document.querySelector('#playback-notes .moment-options'));
    dock.panel('Frames','filmstrip',libraryFrames.options);dock.transport(libraryFrames.element);
  }
})();

