/* Shared, browser-independent data rules. No network or browser APIs. */
(function (root) {
  'use strict';
  const VERSION = 2;
  const MAX_BYTES = 4 * 1024 * 1024;
  const MAX_BACKUP_BYTES = MAX_BYTES + 1024;
  const ID = /^[a-zA-Z0-9_-]{1,100}$/;
  const VIDEO = /^[a-zA-Z0-9_-]{11}$/;
  const fail = (message) => { throw new Error(message); };
  const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function text(v, label, max, required = true) {
    if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(`${label} is missing or too long.`);
    return v.trim();
  }
  function id(v) { if (typeof v !== 'string' || !ID.test(v)) fail('Invalid record ID.'); return v; }
  function seconds(v) { if (!Number.isFinite(v) || v < 0 || v > 604800) fail('Timestamp must be between 0 and 168 hours.'); return Math.floor(v); }
  function date(v) { if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) fail('Invalid saved date.'); return new Date(v).toISOString(); }
  function revision(v) { if (!Number.isSafeInteger(v) || v < 1) fail('Invalid revision.'); return v; }
  function video(v) {
    if (object(v) && v.kind === 'file') {
      if (!['video', 'audio', 'image', 'pdf', 'text'].includes(v.media)) fail('Unsupported file source.');
      if(v.local===true){if(!/^local_[a-f0-9]{64}$/.test(v.id)||!['video','audio'].includes(v.media))fail('Invalid local media source.');return {id:v.id,title:text(v.title,'File title',500),kind:'file',media:v.media,local:true};}
      return { id: id(v.id), title: text(v.title, 'File title', 500), kind: 'file', media: v.media };
    }
    if (v?.kind && v.kind !== 'youtube') fail('Unsupported source.');
    if (!object(v) || typeof v.id !== 'string' || !VIDEO.test(v.id)) fail('Choose a valid YouTube video.');
    return { id: v.id, title: text(v.title, 'Video title', 500) };
  }
  function contextRange(v){const at=preciseTime(v.at);if(v.endAt===undefined||v.endAt===null)return {at};const endAt=preciseTime(v.endAt);if(endAt<=at)fail('The context end must be after the note timestamp.');return {at,endAt};}
  function playbackIntent(v){if(v.pauseOnOpen!==undefined&&typeof v.pauseOnOpen!=='boolean')fail('Invalid playback choice.');return v.pauseOnOpen?{pauseOnOpen:true}:{};}
  function note(v) {
    if (!object(v)) fail('Invalid note.');
    return { id: id(v.id), video: video(v.video), ...contextRange(v), ...playbackIntent(v), body: text(v.body, 'Note', 10000), createdAt: date(v.createdAt), updatedAt: date(v.updatedAt), revision: revision(v.revision) };
  }
  function step(v) {
    if (!object(v)) fail('Invalid tutorial step.');
    return { id: id(v.id), video: video(v.video), ...contextRange(v), ...playbackIntent(v), body: text(v.body, 'Step instructions', 10000) };
  }
  function tutorial(v) {
    if (!object(v) || !Array.isArray(v.steps) || v.steps.length > 500) fail('Invalid tutorial or too many steps (maximum 500).');
    const steps = v.steps.map(step);
    unique(steps);
    if (v.visibility !== 'private') fail('This version supports private tutorials only.');
    return { id: id(v.id), title: text(v.title, 'Tutorial title', 200), description: text(v.description, 'Description', 2000, false), visibility: 'private', steps, createdAt: date(v.createdAt), updatedAt: date(v.updatedAt), revision: revision(v.revision) };
  }
  function unique(records) { if (new Set(records.map(v => v.id)).size !== records.length) fail('Duplicate record IDs.'); }
  function empty() { return { schemaVersion: VERSION, notes: [], tutorials: [] }; }
  function validate(value) {
    if (!object(value) || ![1, VERSION].includes(value.schemaVersion)) fail('Unsupported backup or data version.');
    if (!Array.isArray(value.notes) || !Array.isArray(value.tutorials) || value.notes.length > 10000 || value.tutorials.length > 1000) fail('Invalid library or too many records.');
    const result = { schemaVersion: VERSION, notes: value.notes.map(note), tutorials: value.tutorials.map(tutorial) };
    unique(result.notes); unique(result.tutorials);
    if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_BYTES) fail('Library is too large (4 MB limit). Export your work before removing older items.');
    return result;
  }
  function parseBackup(input) {
    if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_BACKUP_BYTES) fail('Backup must be a JSON file smaller than 4 MB plus backup metadata.');
    let parsed;
    try { parsed = JSON.parse(input); } catch { fail('This file is not valid JSON.'); }
    if (!['leeway-replay-backup', 'yoututor-backup'].includes(parsed?.format)) fail('This is not a Leeway Replay backup.');
    return validate(parsed.data);
  }
  function exportBackup(state) { return JSON.stringify({ format: 'leeway-replay-backup', exportedAt: new Date().toISOString(), data: validate(state) }); }
  function parseVideo(url) {
    try {
      const u = new URL(url);
      if (!['https:', 'http:'].includes(u.protocol)) return null;
      let v;
      if (u.hostname === 'youtu.be') v = u.pathname.slice(1).split('/')[0];
      else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname)) {
        v = u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(shorts|embed)\/([^/]+)/.exec(u.pathname)?.[2];
      }
      return VIDEO.test(v || '') ? v : null;
    } catch { return null; }
  }
  function videoURL(videoId, at = 0) {
    if (!VIDEO.test(videoId)) fail('Invalid video ID.');
    return `https://www.youtube.com/watch?v=${videoId}&t=${seconds(at)}s`;
  }
  function formatTime(value) {
    const n = seconds(value); const h = Math.floor(n / 3600); const m = Math.floor(n % 3600 / 60); const s = String(n % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }
  function parseTime(value) {
    if (typeof value !== 'string' || !/^\d+(?::[0-5]\d){0,2}$/.test(value.trim())) fail('Use seconds, m:ss, or h:mm:ss for the timestamp.');
    return seconds(value.trim().split(':').reduce((n, part) => n * 60 + Number(part), 0));
  }
  function preciseTime(value){if(!Number.isFinite(value)||value<0||value>604800)fail('Timestamp must be between 0 and 168 hours.');return Math.round(value*1000)/1000;}
  function formatPreciseTime(value){const milliseconds=Math.round(preciseTime(value)*1000),whole=Math.floor(milliseconds/1000),fraction=milliseconds%1000;return formatTime(whole)+(fraction?'.'+String(fraction).padStart(3,'0'):'');}
  function parsePreciseTime(value){if(typeof value!=='string'||!/^\d+(?::[0-5]\d){0,2}(?:\.\d{1,3})?$/.test(value.trim()))fail('Use seconds, m:ss, or h:mm:ss, optionally with milliseconds.');return preciseTime(value.trim().split(':').reduce((n,part)=>n*60+Number(part),0));}
  function apply(state, action, ctx = {}) {
    let next = validate(state);
    const now = ctx.now || new Date().toISOString();
    const newId = ctx.newId || (() => crypto.randomUUID());
    if (!object(action)) fail('Invalid action.');
    const find = (kind) => {
      const record = next[kind].find(v => v.id === action.id);
      if (!record) fail('This item no longer exists.');
      if (record.revision !== action.expectedRevision) fail('This item changed in another tab. Reopen it before editing.');
      return record;
    };
    const touch = (record) => { record.updatedAt = now; record.revision += 1; };
    switch (action.type) {
      case 'note.save': {
        const previous = action.id ? find('notes') : null;
        const saved = note({ id: previous?.id || newId(), video: previous?.video || action.video, at: action.at, endAt:action.endAt===undefined?previous?.endAt:action.endAt, pauseOnOpen:action.pauseOnOpen===undefined?previous?.pauseOnOpen:action.pauseOnOpen, body: action.body, createdAt: previous?.createdAt || now, updatedAt: now, revision: (previous?.revision || 0) + 1 });
        if (previous) next.notes[next.notes.indexOf(previous)] = saved; else next.notes.push(saved);
        break;
      }
      case 'note.delete': { const record = find('notes'); next.notes = next.notes.filter(v => v !== record); break; }
      case 'tutorial.create':
        next.tutorials.push(tutorial({ id: newId(), title: action.title, description: action.description || '', visibility: 'private', steps: [], createdAt: now, updatedAt: now, revision: 1 })); break;
      case 'tutorial.update': { const record = find('tutorials'); record.title = action.title; record.description = action.description; touch(record); break; }
      case 'tutorial.delete': { const record = find('tutorials'); next.tutorials = next.tutorials.filter(v => v !== record); break; }
      case 'step.add': {
        const record = find('tutorials');
        const source = next.notes.find(v => v.id === action.noteId);
        if (!source) fail('This note no longer exists.');
        record.steps.push(step({ id: newId(), video: source.video, at: source.at, endAt:source.endAt, pauseOnOpen:source.pauseOnOpen, body: source.body })); touch(record); break;
      }
      case 'step.update': {
        const record = find('tutorials'); const item = record.steps.find(v => v.id === action.stepId);
        if (!item) fail('This step no longer exists.');
        if(action.pauseOnOpen!==undefined){playbackIntent(action);if(action.pauseOnOpen)item.pauseOnOpen=true;else delete item.pauseOnOpen;}
        item.body = text(action.body, 'Step instructions', 10000); const range=contextRange({at:action.at,endAt:action.endAt===undefined?item.endAt:action.endAt});item.at=range.at;if(range.endAt!==undefined)item.endAt=range.endAt;else delete item.endAt; touch(record); break;
      }
      case 'step.delete': {
        const record = find('tutorials');
        if (!record.steps.some(v => v.id === action.stepId)) fail('This step no longer exists.');
        record.steps = record.steps.filter(v => v.id !== action.stepId); touch(record); break;
      }
      case 'step.move': {
        const record = find('tutorials'); const from = record.steps.findIndex(v => v.id === action.stepId); const to = from + action.direction;
        if (from < 0 || ![-1, 1].includes(action.direction) || to < 0 || to >= record.steps.length) fail('Cannot move this step.');
        [record.steps[from], record.steps[to]] = [record.steps[to], record.steps[from]]; touch(record); break;
      }
      case 'backup.import': {
        const imported = parseBackup(action.text);
        for (const kind of ['notes', 'tutorials']) {
          const ids = new Set(next[kind].map(v => v.id));
          next[kind].push(...imported[kind].filter(v => !ids.has(v.id)));
        }
        break;
      }
      default: fail('Unknown action.');
    }
    return validate(next);
  }
  root.YouTutorCore = { VERSION, MAX_BYTES, MAX_BACKUP_BYTES, empty, validate, apply, parseBackup, exportBackup, parseVideo, videoURL, parseTime, formatTime, preciseTime, parsePreciseTime, formatPreciseTime };
  if (typeof module !== 'undefined') module.exports = root.YouTutorCore;
})(globalThis);
