(function (root) {
  'use strict';
  const core = root.YouTutorCore;
  const api = root.YouTutorTransport || root.browser || root.chrome;
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat()) if (child != null) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    return node;
  }
  const button = (label, onclick, klass = 'secondary') => el('button', { type: 'button', class: klass, onclick }, label);
  const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);
  async function request(type, action) {
    const result = await api.runtime.sendMessage({ namespace: 'yoututor', type, action });
    if (!result?.ok) throw new Error(result?.error || 'Leeway Replay disconnected. Reload this page and try again.');
    return result;
  }
  function mount(container, options = {}) {
    const compact = options.mode === 'panel';
    let state = core.empty(); let tab = 'notes'; let selected = ''; let editingNote = null; let draftVideo = null; let editingStep = null;
    let busy = false; let loaded = false; let tutorialDraft = null; let activeVideo = ''; let libraryGeneration=0;
    const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const flash = (message, error = false) => { status.textContent = message; status.className = `status${error ? ' error' : ''}`; };
    async function run(task) {
      if (busy) return;
      busy = true; app.setAttribute('aria-busy', 'true');
      try { await task(); } catch (error) { flash(error.message || 'Something went wrong.', true); }
      finally { busy = false; app.removeAttribute('aria-busy'); }
    }
    async function write(action) {
      if (!loaded) throw new Error('Library has not loaded. Reload before making changes.');
      const result = await request('library.write', action); state = result.state; render();
    }
    const headerActions = el('div', { class: 'row' });
    if (compact) {
      headerActions.append(button('Library ↗', () => run(() => request('library.open'))));
      headerActions.append(button('Close', () => options.close?.(), 'icon-button'));
    }
    const header = el('header', { class: 'masthead' }, el('div', {}, el('span', { class: 'eyebrow' }, 'YOUR PERSONAL LEARNING SPACE'), el('h1', {class:'library-brand'}, el('img',{class:'brand-icon',src:options.mode==='web'?'/brand-mark.svg':'brand-mark.svg',alt:''}), 'Leeway ', el('span', { class: 'accent' }, 'Replay')), el('p', { class: 'subtitle' }, 'Watch. Understand. Improve.')), headerActions);
    const nav = el('nav', { class: 'tabs', 'aria-label': 'Library sections' });
    const views = {};
    const tabButtons = {};
    function show(next) {
      tab = next;
      for (const [key, view] of Object.entries(views)) { view.hidden = key !== tab; tabButtons[key].setAttribute('aria-current', key === tab ? 'page' : 'false'); }
    }
    for (const [key, title] of [['notes', 'Notes'], ['tutorials', 'Tutorials'], ['backup', 'Backup']]) {
      views[key] = el('section', { class: 'view' }); tabButtons[key] = button(title, () => show(key), 'tab'); nav.append(tabButtons[key]);
    }
    const app = el('div', { class: `yt-app ${compact ? 'compact' : ''}` }, header, nav, status, Object.values(views), el('footer', {}, options.mode === 'web' ? 'Private saved library' : 'Private on this device · No account needed'));
    container.append(app);

    // Note composer stays mounted during storage updates, preserving unsaved drafts.
    const sourceLabel = el('p', { class: 'source-label' }, compact ? 'Open a YouTube video to capture a moment.' : 'Paste a YouTube link to start a note.');
    const videoInput = el('input', { type: 'url', placeholder: 'https://www.youtube.com/watch?v=…', 'aria-label': 'YouTube video URL', required: true });
    const videoTitle = el('input', { maxlength: 500, placeholder: 'Optional video title', 'aria-label': 'Video title' });
    const timeInput = el('input', { value: '0:00', placeholder: '0:00', inputmode: 'text', 'aria-label': 'Timestamp', required: true });
    function playbackChoice(paused=false){const choice=el('select',{'aria-label':'When this timestamp is selected'},el('option',{value:'play'},'Play from this moment'),el('option',{value:'pause'},'Pause at this moment'));choice.value=paused?'pause':'play';return choice;}
    const notePlayback=playbackChoice();
    const endInput=el('input',{placeholder:'Optional','aria-label':'Context end'});
    const noteBody = el('textarea', { rows: compact ? 3 : 4, maxlength: 10000, required: true, placeholder: 'What do you want to remember?', 'aria-label': 'Note text' });
    const saveLabel = el('button', { type: 'submit', class: 'primary' }, 'Save note');
    const cancelNote = button('Cancel edit', () => resetNote()); cancelNote.hidden = true;
    const capture = button('Capture current moment', () => {
      const current = options.context?.();
      if (!current) return flash(options.mode === 'web' ? 'Play the embedded video first, or enter the timestamp manually.' : 'Wait for a video to load and any ad to finish.', true);
      if (editingNote && editingNote.video.id !== current.id) return flash('Cancel this edit before capturing a different video.', true);
      draftVideo = { ...current }; if (!compact) { videoInput.disabled = current.kind === 'file'; videoInput.required = current.kind !== 'file'; videoInput.value = current.kind === 'file' ? '' : core.videoURL(current.id); videoTitle.value = current.title; } timeInput.value = core.formatPreciseTime(current.at); sourceLabel.textContent = draftVideo.title; noteBody.focus(); flash('Timestamp captured. Add your note.');
    });
    function resetNote() {
      notePlayback.value='play'; editingNote = null; draftVideo = null; noteBody.value = '';endInput.value=''; timeInput.value = '0:00'; videoInput.value = ''; videoTitle.value = '';
      videoInput.disabled = false; videoInput.required = true; videoTitle.disabled = false; cancelNote.hidden = true; saveLabel.textContent = 'Save note';
      if(sourceDetails)sourceDetails.open=true;sourceLabel.textContent = compact ? 'Capture a moment to attach your note.' : 'Paste a YouTube link to start a note.';
    }
    const sourceDetails=options.mode==='web'?el('details',{class:'note-source-details',open:true},el('summary',{},'Video details'),field('YouTube video',videoInput),field('Video title',videoTitle)):null;
    const noteForm = el('form', { class: 'card composer', onsubmit: (event) => {
      event.preventDefault(); run(async () => {
        let source = editingNote?.video || draftVideo;
        if (!compact && !editingNote && source?.kind !== 'file') {
          const id = core.parseVideo(videoInput.value);
          if (!id) throw new Error('Enter a valid YouTube video URL.');
          source = { id, title: videoTitle.value.trim() || `YouTube video ${id}` };
        }
        if (!source) throw new Error('Capture the current moment first.');
        await write({ type: 'note.save', id: editingNote?.id, expectedRevision: editingNote?.revision, video: source, at: source.kind === 'file' && !['video','audio'].includes(source.media) ? 0 : core.parsePreciseTime(timeInput.value),endAt:endInput.value.trim()?core.parsePreciseTime(endInput.value):null, pauseOnOpen:notePlayback.value==='pause', body: noteBody.value });
        const lastSource = source; resetNote(); if (lastSource.kind === 'file') { draftVideo = lastSource; videoInput.disabled = true; videoInput.required = false; videoTitle.value = lastSource.title; sourceLabel.textContent = lastSource.title; } flash(options.mode === 'web' ? 'Note saved.' : 'Note saved on this device.');
      });
    } }, el('h2', {}, 'Keep a moment'), sourceLabel,
      compact ? capture : [sourceDetails||[field('YouTube video', videoInput),field('Video title',videoTitle)],options.context ? capture : null],
      field('Timestamp', timeInput),field('Context end (optional)',endInput),options.context?button('Set end here',()=>{const current=options.context();if(!current||current.id!==draftVideo?.id)return flash('Open the note’s video before capturing its end.',true);endInput.value=core.formatPreciseTime(current.at);}):null,button('Clear context end',()=>{endInput.value='';}), field('When this timestamp is selected',notePlayback),el('p',{class:'help'},'Choose whether selecting this note plays the video or holds its frame. Following notes during playback never pauses the video.'),field('Your note', noteBody), el('div', { class: 'row wrap' }, saveLabel, cancelNote, options.mode === 'web' ? button('New YouTube note', () => { if (noteBody.value.trim() && !window.confirm('Discard this unsaved note?')) return; resetNote(); videoInput.focus(); }) : null));
    const search = el('input', { type: 'search', placeholder: 'Search your notes…', 'aria-label': 'Search notes', oninput: () => renderNotes() });
    const noteCount = el('span', { class: 'pill' });
    const videoSet = el('select', { 'aria-label':'Saved video notes', onchange:()=>{activeVideo=videoSet.value;renderNotes();const n=state.notes.find(n=>sourceKey(n.video)===activeVideo);if(n)play(n);} });
    function canReplay(v){return v.kind!=='file'||v.media==='video'||v.local&&v.media==='audio';}
    function sourceKey(v){return `${v.kind==='file'?'file':'youtube'}:${v.id}`;}
    function renderSets(){videoSet.replaceChildren(el('option',{value:''},'All saved notes'));const sets=new Map();for(const n of state.notes){const k=sourceKey(n.video);if(!sets.has(k))sets.set(k,{video:n.video,count:0});sets.get(k).count++;}for(const [key,{video,count}]of sets)videoSet.append(el('option',{value:key},`${video.title} · ${count} notes`));if(activeVideo&&!sets.has(activeVideo))videoSet.append(el('option',{value:activeVideo},'Current footage · no saved notes'));videoSet.value=activeVideo;}
    const select = el('select', { 'aria-label': 'Tutorial for adding notes', onchange: () => { if ((editingStep || tutorialDraft) && !window.confirm('Discard unsaved tutorial edits?')) { select.value = selected; return; } selected = select.value; tutorialDraft = null; editingStep = null; renderTutorials(); } });
    const noteList = el('div', { class: 'stack' });
    const noteActions=new Map();
    let composerDetails=null;
    if(options.mode==='web'){composerDetails=el('details',{class:'note-composer-details'},el('summary',{},'Add a note'),noteForm);const captureNew=button('Capture & add note',()=>{composerDetails.open=true;capture.click();},'primary');if(options.composerContainer)options.composerContainer.append(composerDetails);else views.notes.append(captureNew,composerDetails);(options.sourceContainer||views.notes).append(field('Saved video notes',videoSet));views.notes.append(el('p',{class:'help'},'Notes save with their video. Adding them to a tutorial is optional.'));}
    else views.notes.append(noteForm);
    views.notes.append(el('div', { class: 'section-heading' }, el('h2', {}, compact ? 'This video’s notes' : 'Saved notes'), noteCount), search, options.mode==='web'?el('details',{class:'tutorial-option'},el('summary',{},'Add notes to a tutorial'),field('Tutorial (optional)',select)):field('Add notes to tutorial (optional)',select),noteList);
    function play(item) {
      if (options.play) { options.play(item); return; }
      if (item.video.kind === 'file') return flash('Open this file in your Leeway Replay web library.', true);
      if (options.seek?.(item.video.id, item.at,item)) return;
      window.open(core.videoURL(item.video.id, item.at), '_blank', 'noopener,noreferrer');
    }
    function renderNotes() {
      noteList.replaceChildren();noteActions.clear();
      const currentId = options.videoId?.();
      const query = search.value.toLowerCase();
      const notes = state.notes.filter(n => (!compact || n.video.id === currentId) && (!activeVideo || sourceKey(n.video)===activeVideo) && `${n.body} ${n.video.title}`.toLowerCase().includes(query))
        .sort((a, b) => compact || activeVideo ? a.at - b.at : b.updatedAt.localeCompare(a.updatedAt));
      noteCount.textContent = String(notes.length);
      if (!notes.length) noteList.append(el('div', { class: 'empty' }, el('span', { class: 'empty-mark' }, '✦'), el('h3', {}, query ? 'No matching notes' : 'Your next discovery belongs here'), el('p', {}, query ? 'Try a different search.' : 'Save an idea, a useful technique, or a question to come back to.')));
      for (const n of notes) {
        const edit = button('Edit', () => {
          notePlayback.value=n.pauseOnOpen?'pause':'play'; editingNote = { ...n }; draftVideo = n.video; noteBody.value = n.body; timeInput.value = core.formatPreciseTime(n.at);endInput.value=n.endAt!==undefined?core.formatPreciseTime(n.endAt):'';
          videoInput.value = n.video.kind === 'file' ? '' : core.videoURL(n.video.id); videoTitle.value = n.video.title; videoInput.disabled = true; videoTitle.disabled = true;
          sourceLabel.textContent = `Editing · ${n.video.title}`; saveLabel.textContent = 'Save changes'; cancelNote.hidden = false; if(composerDetails)composerDetails.open=true; noteBody.focus();if(options.composerContainer)composerDetails.scrollIntoView({behavior:'smooth',block:'nearest'});
        });
        const add = button('+ Tutorial', () => run(async () => {
          const t = state.tutorials.find(v => v.id === selected);
          if (!t) throw new Error('Create a tutorial in the Tutorials tab, then select it here.');
          await write({ type: 'step.add', id: t.id, expectedRevision: t.revision, noteId: n.id }); flash(`Step added to “${t.title}”.`);
        }));
        if(options.mode==='web')add.hidden=!state.tutorials.length;
        const remove = button('Delete', () => {
          if (window.confirm('Delete this note? Copies already added to tutorials will be kept.')) run(async () => {
            await write({ type: 'note.delete', id: n.id, expectedRevision: n.revision }); if (editingNote?.id === n.id) resetNote(); flash('Note deleted.');
          });
        }, 'danger-text');
        noteActions.set(n.id,{edit:()=>edit.click(),remove:()=>remove.click()});
        noteList.append(el('article', { class: 'card note-card' }, el('div', { class: 'row spread' }, button(n.video.kind === 'file' && !['video','audio'].includes(n.video.media) ? 'View file' : `${n.pauseOnOpen?'Ⅱ':'▶'} ${core.formatPreciseTime(n.at)}${n.endAt!==undefined?' – '+core.formatPreciseTime(n.endAt):''}`, () => play(n), 'timestamp'), el('span', { class: 'private-label' }, 'PRIVATE')), el('p', { class: 'note-body' }, n.body), el('p', { class: 'video-title' }, n.video.title), el('div', { class: 'row wrap' }, edit, add, options.createReplay&&canReplay(n.video)?button('Open as Replay',()=>run(()=>options.createReplay(n.video,state.notes.filter(o=>sourceKey(o.video)===sourceKey(n.video))))):null, remove)));
      }
    }

    const titleInput = el('input', { maxlength: 200, required: true, placeholder: 'e.g. Build a better backhand', 'aria-label': 'New tutorial title' });
    const createForm = el('form', { class: 'card', onsubmit: (event) => {
      event.preventDefault(); run(async () => {
        const before = new Set(state.tutorials.map(t => t.id));
        await write({ type: 'tutorial.create', title: titleInput.value }); selected = state.tutorials.find(t => !before.has(t.id))?.id || ''; titleInput.value = ''; tutorialDraft = null; render(); flash('Tutorial created. Add saved notes as steps from the Notes tab.');
      });
    } }, el('h2', {}, 'Make your own tutorial'), el('p', { class: 'muted' }, 'Bring useful moments together, in an order that makes sense to you.'), field('Tutorial title', titleInput), el('button', { type: 'submit', class: 'primary' }, 'Create tutorial'));
    const tutorialList = el('div', { class: 'tutorial-list' }); const tutorialDetail = el('div', { class: 'stack' });
    views.tutorials.append(createForm, tutorialList, tutorialDetail);
    function renderTutorials() {
      tutorialList.replaceChildren();
      for (const t of state.tutorials) tutorialList.append(button(`${t.title} · ${t.steps.length} steps`, () => {
        if ((editingStep || tutorialDraft) && !window.confirm('Switch tutorials and discard unsaved tutorial edits?')) return;
        selected = t.id; editingStep = null; tutorialDraft = null; render();
      }, selected === t.id ? 'selected-tutorial' : 'secondary'));
      if (editingStep || tutorialDraft) return;
      tutorialDetail.replaceChildren();
      const t = state.tutorials.find(v => v.id === selected);
      if (!t) { tutorialDetail.append(el('div', { class: 'empty' }, el('h3', {}, 'A learning path, made by you'), el('p', {}, 'Create a tutorial, then add notes from one video or several.'))); return; }
      const title = el('input', { value: t.title, maxlength: 200, required: true, 'aria-label': 'Tutorial title', oninput: () => { tutorialDraft = t.id; } });
      const description = el('textarea', { maxlength: 2000, rows: 2, 'aria-label': 'Tutorial description', oninput: () => { tutorialDraft = t.id; } }, t.description);
      const meta = el('form', { class: 'card', onsubmit: (event) => { event.preventDefault(); run(async () => {
        await write({ type: 'tutorial.update', id: t.id, expectedRevision: t.revision, title: title.value, description: description.value }); tutorialDraft = null; renderTutorials(); flash('Tutorial updated.');
      }); } }, el('span', { class: 'pill' }, 'PRIVATE TUTORIAL'), field('Title', title), field('What will you learn?', description), el('div', { class: 'row wrap' }, el('button', { type: 'submit', class: 'secondary' }, 'Save details'), button('Discard edits', () => { tutorialDraft = null; renderTutorials(); }), button('Delete tutorial', () => {
        if (window.confirm('Delete this tutorial and its steps? Your original notes will be kept.')) run(async () => {
          await write({ type: 'tutorial.delete', id: t.id, expectedRevision: t.revision }); selected = ''; tutorialDraft = null; editingStep = null; render(); flash('Tutorial deleted.');
        });
      }, 'danger-text')));
      tutorialDetail.append(meta);
      if (!t.steps.length) tutorialDetail.append(el('p', { class: 'empty' }, 'Open Notes, select this tutorial, and choose “+ Tutorial” on any note.'));
      t.steps.forEach((s, index) => {
        const action = (type, extra = {}) => run(async () => {
          await write({ type, id: t.id, expectedRevision: t.revision, stepId: s.id, ...extra }); flash('Tutorial saved.');
        });
        const up = button('↑', () => action('step.move', { direction: -1 })); up.setAttribute('aria-label', `Move step ${index + 1} up`); up.disabled = index === 0;
        const down = button('↓', () => action('step.move', { direction: 1 })); down.setAttribute('aria-label', `Move step ${index + 1} down`); down.disabled = index === t.steps.length - 1;
        const card = el('article', { class: 'card step-card' }, el('div', { class: 'row spread' }, el('span', { class: 'eyebrow' }, `STEP ${String(index + 1).padStart(2, '0')}`), button(s.video.kind === 'file' && !['video','audio'].includes(s.video.media) ? 'View file' : `${s.pauseOnOpen?'Ⅱ':'▶'} ${core.formatPreciseTime(s.at)}${s.endAt!==undefined?' – '+core.formatPreciseTime(s.endAt):''}`, () => play(s), 'timestamp')), el('p', { class: 'note-body' }, s.body), el('p', { class: 'video-title' }, s.video.title));
        const editStep = button('Edit step', () => {
          if (editingStep) return flash('Save or cancel the open step editor first.', true);
          editingStep = s.id;
          const body = el('textarea', { rows: 4, maxlength: 10000, required: true, 'aria-label': 'Step instructions' }, s.body);
          const timestamp = el('input', { value: core.formatPreciseTime(s.at), required: true, 'aria-label': 'Step timestamp' });
          const stepPlayback=playbackChoice(s.pauseOnOpen);
          const end=el('input',{value:s.endAt!==undefined?core.formatPreciseTime(s.endAt):'',placeholder:'Optional','aria-label':'Step context end'});
          const editor = el('form', { class: 'step-editor', onsubmit: (event) => { event.preventDefault(); run(async () => {
            await write({ type: 'step.update', id: t.id, expectedRevision: t.revision, stepId: s.id, pauseOnOpen:stepPlayback.value==='pause', body: body.value, at: core.parsePreciseTime(timestamp.value),endAt:end.value.trim()?core.parsePreciseTime(end.value):null }); editingStep = null; renderTutorials(); flash('Step updated.');
          }); } }, field('Instructions', body), field('Timestamp', timestamp),field('Context end (optional)',end),field('When this timestamp is selected',stepPlayback), el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, 'Save step'), button('Cancel', () => { editingStep = null; editor.remove(); })));
          card.append(editor); body.focus();
        });
        card.append(el('div', { class: 'row wrap' }, up, down, editStep, options.createReplay&&canReplay(s.video)?button('Open video as Replay',()=>run(()=>options.createReplay(s.video,t.steps.filter(o=>sourceKey(o.video)===sourceKey(s.video))))):null, button('Remove', () => { if (window.confirm('Remove this step?')) action('step.delete'); }, 'danger-text'))); tutorialDetail.append(card);
      });
      tutorialDetail.append(el('p', { class: 'muted' }, options.mode === 'web' ? 'This tutorial is private. Sharing is planned.' : 'Sharing is planned. This tutorial is currently private and stored only in this browser.'));
    }

    const importInput = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Choose Leeway Replay backup', onchange: () => run(async () => {
      const file = importInput.files?.[0]; if (!file) return;
      try {
        if (file.size > core.MAX_BACKUP_BYTES) throw new Error('Choose a backup smaller than 4 MB.');
        const input = await file.text(); const parsed = core.parseBackup(input);
        const counts = ['notes', 'tutorials'].map(kind => parsed[kind].filter(item => !state[kind].some(v => v.id === item.id)).length);
        if (!window.confirm(`Import ${counts[0]} new notes and ${counts[1]} new tutorials? Existing IDs are kept unchanged. This does not restore older edits over existing items.`)) return;
        await write({ type: 'backup.import', text: input }); flash(`Imported ${counts[0]} notes and ${counts[1]} tutorials.`);
      } finally { importInput.value = ''; }
    }) });
    views.backup.append(el('div', { class: 'card' }, el('h2', {}, 'Your work, yours to keep'), el('p', {}, options.mode === 'web' ? 'Export your notes and tutorials as JSON. Uploaded file references are included; the file contents are not included. Download original files separately to keep a complete backup.' : 'Notes and tutorials are saved in this browser profile. They do not sync between devices. Clearing browser data or removing the extension can erase them. Keep a backup of work you care about.'), button('Export backup', () => run(async () => {
      const latest = await request('library.read');
      const blob = new Blob([core.exportBackup(latest.state)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = el('a', { href: url, download: `leeway-replay-backup-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); flash('Backup export started.');
    }), 'primary')), el('div', { class: 'card' }, el('h2', {}, 'Import a backup'), el('p', {}, 'Adds missing items. Existing IDs are never overwritten, including newer or older edits. Leeway Replay JSON backups, including backups from earlier versions, are accepted.'), field('Backup file', importInput)));
    function render() { libraryGeneration++;
      if (!state.tutorials.some(t => t.id === selected)) selected = state.tutorials[0]?.id || '';
      select.replaceChildren(el('option', { value: '' }, state.tutorials.length ? 'Choose a tutorial' : 'Create a tutorial first'));
      for (const t of state.tutorials) select.append(el('option', { value: t.id }, t.title));
      select.value = selected;
      renderSets(); renderNotes(); renderTutorials();
    }
    api.storage.onChanged.addListener((_changes, area) => {
      if (area !== 'local' || !_changes['yoututor.library.v1']) return;
      request('library.read').then(result => { state = result.state; loaded = true; render(); }).catch(error => flash(error.message, true));
    });
    show('notes'); render();
    run(async () => { state = (await request('library.read')).state; loaded = true; render(); });
    return { noteActions:id=>noteActions.get(id), playbackNoteVersion:()=>`${libraryGeneration}:${tab}:${selected}`, playbackNotes: video => {if(!video)return [];const t=tab==='tutorials'?state.tutorials.find(t=>t.id===selected):null;return (t?t.steps:state.notes).filter(n=>sourceKey(n.video)===sourceKey(video));}, prepareNote: (video) => { activeVideo=sourceKey(video);renderSets();renderNotes(); if (editingNote || noteBody.value.trim()) { flash('Your unsaved note was kept. Save it or cancel it before switching its source.'); return false; } draftVideo = { ...video }; videoInput.disabled = video.kind === 'file'; videoInput.required = video.kind !== 'file'; videoInput.value = video.kind === 'file' ? '' : core.videoURL(video.id); videoTitle.value = video.title; timeInput.value = core.formatPreciseTime(video.at || 0); sourceLabel.textContent = video.title;if(sourceDetails)sourceDetails.open=false; if(tab!=='tutorials')show('notes'); return true; }, refreshContext: renderNotes, focus: () => (compact ? capture : videoInput).focus() };
  }
  root.YouTutorUI = { mount };
})(globalThis);
