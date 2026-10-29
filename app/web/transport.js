/* Web preview persistence adapter. Uses the extension's exact schema/reducer. */
(function (root) {
  'use strict';
  const KEY = 'yoututor.web.library.v1';
  function createTransport({ storage, locks, listen, core }) {
    const subscribers = [];
    function read() {
      const raw = storage.getItem(KEY);
      if (raw === null) return core.empty();
      let value;
      try { value = JSON.parse(raw); } catch { throw new Error('Saved data could not be read. Do not clear this browser; keep it open and report the problem.'); }
      return core.validate(value);
    }
    function changed() { for (const listener of subscribers) listener({ 'yoututor.library.v1': {} }, 'local'); }
    listen?.('storage', event => { if (event.key === KEY || event.key === null) changed(); });
    return {
      runtime: { async sendMessage(message) {
        try {
          if (message?.namespace !== 'yoututor') throw new Error('Invalid request.');
          if (message.type === 'library.read') return { ok: true, state: read() };
          if (message.type !== 'library.write') throw new Error('Unsupported web preview request.');
          if (!locks?.request) throw new Error('This browser cannot safely save across tabs. Open this preview in an updated Safari browser.');
          return await locks.request(KEY, async () => {
            const next = core.apply(read(), message.action);
            // Write before reporting success. Quota/security errors leave the draft intact.
            try { storage.setItem(KEY, JSON.stringify(next)); }
            catch { throw new Error('Unable to save in this browser. Your draft is still here. Export your existing notes and check browser storage.'); }
            changed();
            return { ok: true, state: next };
          });
        } catch (error) { return { ok: false, error: error.message }; }
      } },
      storage: { onChanged: { addListener(listener) { subscribers.push(listener); } } }
    };
  }
  if (typeof module !== 'undefined') module.exports = { createTransport, KEY };
  else {
    // Delay localStorage access until a request so browser restrictions become UI errors.
    root.YouTutorTransport = createTransport({ storage: { getItem: key => root.localStorage.getItem(key), setItem: (key, value) => root.localStorage.setItem(key, value) }, locks: root.navigator.locks, listen: root.addEventListener.bind(root), core: root.YouTutorCore });
  }
})(globalThis);
