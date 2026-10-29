/* One serialized writer prevents read/modify/write races between browser tabs. */
'use strict';
if (typeof importScripts === 'function') importScripts('core.js');
const api = globalThis.browser || globalThis.chrome;
const core = globalThis.YouTutorCore;
const KEY = 'yoututor.library.v1';
let queue = Promise.resolve();
async function read() {
  const saved = await api.storage.local.get(KEY);
  return saved[KEY] === undefined ? core.empty() : core.validate(saved[KEY]);
}
api.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== api.runtime.id || message?.namespace !== 'yoututor') return false;
  const work = async () => {
    if (message.type === 'library.read') return { ok: true, state: await read() };
    if (message.type === 'library.open') {
      await api.tabs.create({ url: api.runtime.getURL('library.html') });
      return { ok: true };
    }
    if (message.type !== 'library.write') throw new Error('Unknown request.');
    const state = core.apply(await read(), message.action);
    await api.storage.local.set({ [KEY]: state });
    return { ok: true, state };
  };
  queue = queue.then(work).then(respond, (error) => respond({ ok: false, error: error.message || 'Unable to save. Please export a backup and retry.' }));
  return true;
});
api.action.onClicked.addListener(() => api.tabs.create({ url: api.runtime.getURL('library.html') }));
