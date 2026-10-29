'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');
const { createTransport, KEY } = require('../web/transport.js');
function setup() {
  const data = new Map(); let queue = Promise.resolve();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const locks = { request(_name, task) { const next = queue.then(task); queue = next.catch(() => {}); return next; } };
  const create = () => createTransport({ core, storage, locks });
  return { create, storage, data };
}
const note = body => ({ type: 'note.save', video: { id: 'abcdefghijk', title: 'Video' }, at: 30, body });
const send = (transport, action) => transport.runtime.sendMessage({ namespace: 'yoututor', type: action ? 'library.write' : 'library.read', action });
test('web preview uses the shared schema and persists across sessions', async () => {
  const env = setup(); const first = env.create(); assert.equal((await send(first)).state.notes.length, 0);
  assert.equal((await send(first, note('Keep this'))).ok, true);
  const second = env.create(); assert.equal((await send(second)).state.notes[0].body, 'Keep this');
});
test('separate web tabs serialize saves with one shared lock', async () => {
  const env = setup(); const a = env.create(); const b = env.create();
  const result = await Promise.all([send(a, note('A')), send(b, note('B'))]); assert.ok(result.every(r => r.ok));
  assert.equal((await send(a)).state.notes.length, 2);
});
test('web storage failures and corrupt JSON are surfaced without data reset', async () => {
  const env = setup(); env.storage.setItem(KEY, '{broken'); const t = env.create();
  const read = await send(t); assert.equal(read.ok, false); assert.match(read.error, /could not be read/);
  assert.equal((await send(t, note('No reset'))).ok, false); assert.equal(env.storage.getItem(KEY), '{broken');
  env.data.clear(); env.storage.setItem = () => { throw new Error('Storage blocked'); };
  const write = await send(t, note('Keep draft')); assert.equal(write.ok, false); assert.match(write.error, /draft is still here/);
});
test('web and extension backups remain interchangeable', async () => {
  const env = setup(); const t = env.create(); const state = (await send(t, note('Portable'))).state;
  const restored = core.apply(core.empty(), { type: 'backup.import', text: core.exportBackup(state) }); assert.deepEqual(restored, state);
  const other = setup().create(); const result = await send(other, { type: 'backup.import', text: core.exportBackup(restored) }); assert.deepEqual(result.state, state);
});
test('unsupported browsers refuse unsafe writes but retain read/export access', async () => {
  const env = setup(); const t = createTransport({ core, storage: env.storage });
  assert.equal((await send(t)).ok, true); const result = await send(t, note('Unsafe')); assert.equal(result.ok, false); assert.match(result.error, /updated Safari/);
});
test('storage event updates are delivered only for relevant keys', () => {
  const env = setup(); let handler; let count = 0;
  const t = createTransport({ core, storage: env.storage, listen(_type, fn) { handler = fn; } });
  t.storage.onChanged.addListener(() => count++);
  handler({ key: 'other' }); handler({ key: KEY }); handler({ key: null }); assert.equal(count, 2);
});
