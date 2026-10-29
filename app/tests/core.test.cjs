'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../core.js');
let counter = 0;
const ctx = { now: '2026-10-04T17:00:00.000Z', newId: () => `item_${++counter}` };
const apply = (s, a) => c.apply(s, a, ctx);
const video = { id: 'abcdefghijk', title: 'A useful video' };
const add = (s = c.empty(), body = 'Keep your elbow steady') => apply(s, { type: 'note.save', video, at: 75.9, body });
test('creates, edits, and deletes notes without mutating input', () => {
  const original = c.empty(); const s = add(original); assert.equal(original.notes.length, 0);
  const n = s.notes[0]; assert.equal(n.at, 75.9); assert.equal(n.revision, 1);
  const edited = apply(s, { type: 'note.save', id: n.id, expectedRevision: 1, at: 80, body: 'Updated' });
  assert.equal(edited.notes[0].revision, 2); assert.equal(s.notes[0].body, 'Keep your elbow steady');
  assert.equal(apply(edited, { type: 'note.delete', id: n.id, expectedRevision: 2 }).notes.length, 0);
});
test('stale edits and deletes cannot overwrite another tab', () => {
  const s = add(); const n = s.notes[0];
  for (const type of ['note.save', 'note.delete']) assert.throws(() => apply(s, { type, id: n.id, expectedRevision: 0, body: 'lost update', at: 0 }), /another tab/);
});
test('tutorial steps are independent snapshots and can be edited/reordered', () => {
  let s = add(); const n = s.notes[0]; s = add(s, 'Second idea');
  s = apply(s, { type: 'tutorial.create', title: 'Backhand practice' }); let t = s.tutorials[0];
  s = apply(s, { type: 'step.add', id: t.id, expectedRevision: t.revision, noteId: n.id }); t = s.tutorials[0];
  s = apply(s, { type: 'step.add', id: t.id, expectedRevision: t.revision, noteId: s.notes[1].id }); t = s.tutorials[0];
  const firstId = t.steps[0].id;
  s = apply(s, { type: 'step.move', id: t.id, expectedRevision: t.revision, stepId: firstId, direction: 1 }); t = s.tutorials[0];
  assert.equal(t.steps[1].id, firstId);
  s = apply(s, { type: 'step.update', id: t.id, expectedRevision: t.revision, stepId: firstId, at: 90, body: 'Try five repetitions' });
  s = apply(s, { type: 'note.delete', id: n.id, expectedRevision: n.revision });
  assert.equal(s.tutorials[0].steps[1].body, 'Try five repetitions'); assert.equal(s.tutorials[0].steps[1].at, 90);
});
test('exports and imports round trip; merging never overwrites existing IDs', () => {
  const original = add(); const backup = c.exportBackup(original);
  assert.equal(JSON.parse(backup).format, 'leeway-replay-backup');
  assert.deepEqual(c.parseBackup(backup), original);
  const legacy = JSON.stringify({...JSON.parse(backup), format:'yoututor-backup'});
  assert.deepEqual(c.parseBackup(legacy), original);
  const restored = apply(c.empty(), { type: 'backup.import', text: backup }); assert.deepEqual(restored, original);
  const edited = apply(original, { type: 'note.save', id: original.notes[0].id, expectedRevision: 1, at: 0, body: 'Newer text' });
  const merged = apply(edited, { type: 'backup.import', text: backup }); assert.equal(merged.notes.length, 1); assert.equal(merged.notes[0].body, 'Newer text');
});
test('rejects malformed, duplicate, future-version, oversized and non-private data', () => {
  assert.throws(() => c.parseBackup('{bad'), /valid JSON/);
  assert.throws(() => c.parseBackup('{}'), /not a Leeway Replay/);
  assert.throws(() => c.validate({ ...c.empty(), schemaVersion: 99 }), /version/);
  const s = add(); s.notes.push(s.notes[0]); assert.throws(() => c.validate(s), /Duplicate/);
  assert.throws(() => add(c.empty(), 'x'.repeat(10001)), /too long/);
  assert.throws(() => c.parseBackup(' '.repeat(c.MAX_BACKUP_BYTES + 1)), /smaller/);
  const t = apply(c.empty(), { type: 'tutorial.create', title: 'Private' }); t.tutorials[0].visibility = 'public'; assert.throws(() => c.validate(t), /private/);
});
test('only accepts YouTube URLs and constructs safe playback links', () => {
  for (const url of ['https://www.youtube.com/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk?t=7', 'https://m.youtube.com/shorts/abcdefghijk']) assert.equal(c.parseVideo(url), video.id);
  for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.com/watch?v=abcdefghijk', 'https://www.youtube.com/watch?v=bad', 'file:///watch?v=abcdefghijk']) assert.equal(c.parseVideo(url), null);
  assert.equal(c.videoURL(video.id, 75), 'https://www.youtube.com/watch?v=abcdefghijk&t=75s'); assert.throws(() => c.videoURL('javascript:x'));
});
test('timestamps cover hours and reject ambiguous or invalid values', () => {
  assert.equal(c.parseTime('1:02:03'), 3723); assert.equal(c.parseTime('75'), 75); assert.equal(c.formatTime(3723), '1:02:03');
  for (const invalid of ['-1', '1:99', 'NaN', '', '0.5', '9999999']) assert.throws(() => c.parseTime(invalid));
});
test('unknown actions and invalid timestamps do not silently corrupt state', () => {
  assert.throws(() => apply(c.empty(), { type: 'nope' }), /Unknown/);
  assert.throws(() => apply(c.empty(), { type: 'note.save', video, body: 'x', at: NaN }), /Timestamp/);
});
test('library context ranges retain milliseconds across backup and tutorial copies; clear preserves legacy point notes',()=>{
 let s=apply(c.empty(),{type:'note.save',video,at:10.125,endAt:12.5,body:'Rally context'});assert.equal(s.notes[0].endAt,12.5);assert.equal(c.parsePreciseTime('0:10.125'),10.125);assert.equal(c.formatPreciseTime(12.5),'0:12.500');
 s=apply(s,{type:'tutorial.create',title:'Rally'});s=apply(s,{type:'step.add',id:s.tutorials[0].id,expectedRevision:1,noteId:s.notes[0].id});assert.equal(s.tutorials[0].steps[0].endAt,12.5);assert.deepEqual(c.parseBackup(c.exportBackup(s)),s);
 assert.throws(()=>apply(s,{type:'note.save',id:s.notes[0].id,expectedRevision:1,at:10.125,endAt:9,body:'Bad range'}));s=apply(s,{type:'note.save',id:s.notes[0].id,expectedRevision:1,at:10.125,endAt:null,body:'Point note'});assert.equal(s.notes[0].endAt,undefined);assert.equal(s.tutorials[0].steps[0].endAt,12.5);
});
test('every captured timestamp format round-trips across fractions, minute/hour boundaries and maximum duration',()=>{
 for(const t of [0,.001,9.1,59.9994,59.9996,60,62.125,3599.9994,3599.9996,3600,3723.456,604799.999,604800])assert.equal(c.parsePreciseTime(c.formatPreciseTime(t)),c.preciseTime(t));
 for(let t=0;t<=604800;t+=997)for(const fraction of [0,.001,.125,.999]){if(t+fraction>604800)continue;assert.equal(c.parsePreciseTime(c.formatPreciseTime(t+fraction)),c.preciseTime(t+fraction));}
});
test('paused library notes persist through edits, backups and tutorial snapshots',()=>{
 let s=apply(c.empty(),{type:'note.save',video,at:0,endAt:2.66,body:'Inspect frame',pauseOnOpen:true});
 let n=s.notes[0];s=apply(s,{type:'note.save',id:n.id,expectedRevision:n.revision,at:1,body:'Edited'});
 assert.equal(s.notes[0].pauseOnOpen,true);
 s=apply(s,{type:'tutorial.create',title:'Practice'});let t=s.tutorials[0];
 s=apply(s,{type:'step.add',id:t.id,expectedRevision:t.revision,noteId:n.id});
 assert.equal(s.tutorials[0].steps[0].pauseOnOpen,true);
 assert.deepEqual(c.parseBackup(c.exportBackup(s)),s);
 t=s.tutorials[0];s=apply(s,{type:'step.update',id:t.id,expectedRevision:t.revision,stepId:t.steps[0].id,at:0,body:'Play',pauseOnOpen:false});
 assert.equal(s.tutorials[0].steps[0].pauseOnOpen,undefined);assert.equal(s.notes[0].pauseOnOpen,true);
 n=s.notes[0];s=apply(s,{type:'note.save',id:n.id,expectedRevision:n.revision,at:0,body:n.body,pauseOnOpen:false});
 assert.equal(s.notes[0].pauseOnOpen,undefined);
 assert.throws(()=>apply(s,{type:'note.save',video,at:0,body:'Bad',pauseOnOpen:'true'}),/playback choice/);
});
