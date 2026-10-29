(function () {
  'use strict';
  if (document.getElementById('yoututor-extension-root')) return;
  const api = globalThis.browser || globalThis.chrome;
  const core = globalThis.YouTutorCore;
  const host = document.createElement('div'); host.id = 'yoututor-extension-root';
  host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = api.runtime.getURL('styles.css'); shadow.append(style);
  const launcher = document.createElement('button'); launcher.className = 'launcher'; launcher.textContent = '✦ Leeway Replay'; launcher.type = 'button'; launcher.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('aside'); panel.className = 'extension-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Leeway Replay notes and tutorials');
  shadow.append(launcher, panel); document.documentElement.append(host);
  let mounted; let lastId = core.parseVideo(location.href); let changedAt = Date.now();
  const videoId = () => core.parseVideo(location.href);
  function context() {
    const id = videoId(); const player = document.querySelector('#movie_player'); const video = document.querySelector('video');
    if (!id || !video || video.readyState < 1 || !Number.isFinite(video.duration) || Date.now() - changedAt < 1200 || player?.classList.contains('ad-showing') || player?.classList.contains('ad-interrupting')) return null;
    return { id, title: document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || document.title.replace(/ - YouTube$/, '') || `YouTube video ${id}`, at: Math.max(0, Math.floor(video.currentTime)) };
  }
  function close() { panel.hidden = true; launcher.hidden = false; launcher.setAttribute('aria-expanded', 'false'); launcher.focus(); }
  launcher.addEventListener('click', () => {
    if (!mounted) mounted = YouTutorUI.mount(panel, { mode: 'panel', close, videoId, context, seek: (id, at, note) => {
      if (context()?.id !== id) return false;
      const video = document.querySelector('video'); if(note?.pauseOnOpen)video.pause();video.currentTime = Math.min(at, video.duration);if(!note?.pauseOnOpen)video.play()?.catch(()=>{});return true;
    } });
    panel.hidden = false; launcher.hidden = true; launcher.setAttribute('aria-expanded', 'true'); mounted.focus();
  });
  shadow.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(); }
  });
  // YouTube navigates without full page loads. Refresh only the video-scoped list;
  // the composer retains the captured video's identity and unsaved text.
  function navigation() {
    const id = videoId();
    if (id !== lastId) { lastId = id; changedAt = Date.now(); mounted?.refreshContext(); }
    if (!id && panel.hidden) launcher.hidden = true;
    else if (panel.hidden) launcher.hidden = false;
  }
  document.addEventListener('yt-navigate-finish', navigation);
  window.addEventListener('popstate', navigation);
  setInterval(navigation, 1000);
  navigation();
})();
