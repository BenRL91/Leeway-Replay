'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
function setup(initial) {
  let listener; let stored = initial; let failNext = false;
  const api = { runtime: { id: 'test', onMessage: { addListener(fn) { listener = fn; } } }, action: { onClicked: { addListener() {} } }, storage: { local: {
    async get() { await new Promise(r => setTimeout(r, 2)); return stored === undefined ? {} : { 'yoututor.library.v1': structuredClone(stored) }; },
    async set(values) { await new Promise(r => setTimeout(r, 2)); if (failNext) { failNext = false; throw new Error('Quota exceeded'); } stored = structuredClone(values['yoututor.library.v1']); }
  } } };
  const sandbox = vm.createContext({ chrome: api, crypto, TextEncoder, setTimeout });
  for (const f of ['core.js', 'background.js']) vm.runInContext(fs.readFileSync(require.resolve(`../${f}`), 'utf8'), sandbox);
  const send = (type, action) => new Promise(resolve => listener({ namespace: 'yoututor', type, action }, { id: 'test' }, resolve));
  return { send, fail() { failNext = true; }, stored: () => stored, listener: () => listener };
}
const action = body => ({ type: 'note.save', video: { id: 'abcdefghijk', title: 'Video' }, at: 1, body });
test('simultaneous tab saves are serialized and survive worker restart', async () => {
  const env = setup(); const result = await Promise.all(Array.from({ length: 12 }, (_, i) => env.send('library.write', action(`Note ${i}`))));
  assert.ok(result.every(r => r.ok)); assert.equal(env.stored().notes.length, 12);
  const restarted = setup(env.stored()); assert.equal((await restarted.send('library.read')).state.notes.length, 12);
});
test('failed storage write does not report success and queue recovers', async () => {
  const env = setup(); env.fail(); const failed = await env.send('library.write', action('Not persisted')); assert.equal(failed.ok, false);
  assert.match(failed.error, /Quota/); const next = await env.send('library.write', action('Persisted')); assert.equal(next.ok, true); assert.equal(env.stored().notes.length, 1);
});
test('corrupt saved state is never silently replaced by an empty library', async () => {
  const env = setup({ schemaVersion: 999 }); const result = await env.send('library.write', action('New note')); assert.equal(result.ok, false); assert.equal(env.stored().schemaVersion, 999);
});
test('rejects messages from other extensions', () => {
  const env = setup(); assert.equal(env.listener()({ namespace: 'yoututor', type: 'library.read' }, { id: 'other' }, () => assert.fail('Responded')), false);
});
