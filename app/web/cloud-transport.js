(function (root) {
  'use strict';
  const subscribers = []; let initialization;
  async function api(path, options = {}) {
    if (root.YouTutorSession) await root.YouTutorSession.ready;
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    let result;
    try { result = await response.json(); } catch { throw new Error('Your sign-in may have expired. Reload this page to sign in again.'); }
    if (!response.ok || !result.ok) { const error = new Error(result.error || 'Unable to reach your saved library. Your draft is still here.'); error.status = response.status; throw error; }
    return result;
  }
  async function initialize() {
    if (!initialization) initialization = (async () => {
      const saved = await api('/api/library');
      if (!saved.legacyImportAllowed) return; // legacy browser notes belong to the original owner only
      let legacy;
      try { legacy = localStorage.getItem('yoututor.web.library.v1'); } catch { return; }
      if (!legacy) return;
      const marker = `yoututor.cloud-migrated.${saved.accountKey}`;
      try { if (localStorage.getItem(marker)) return; } catch { /* still safe to merge by ID */ }
      let state;
      try { state = YouTutorCore.validate(JSON.parse(legacy)); } catch { throw new Error('Older browser notes could not be migrated. They were preserved. Please report this before clearing browser data.'); }
      if (state.notes.length || state.tutorials.length) await api('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'backup.import', text: YouTutorCore.exportBackup(state) }) });
      try { localStorage.setItem(marker, 'done'); } catch { /* merging is idempotent */ }
    })().catch(error => { initialization = null; throw error; });
    return initialization;
  }
  root.YouTutorTransport = {
    runtime: { async sendMessage(message) {
      try {
        await initialize();
        if (message.type === 'library.read') return await api('/api/library');
        if (message.type !== 'library.write') throw new Error('Unsupported request.');
        const result = await api('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message.action) });
        for (const listener of subscribers) listener({ 'yoututor.library.v1': {} }, 'local');
        return result;
      } catch (error) { return { ok: false, error: error.message }; }
    } },
    storage: { onChanged: { addListener(listener) { subscribers.push(listener); } } }
  };
  root.YouTutorAPI = api;
  root.addEventListener('focus', () => { for (const listener of subscribers) listener({ 'yoututor.library.v1': {} }, 'local'); });
})(globalThis);
