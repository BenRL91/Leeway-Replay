(function (root) {
  'use strict';
  const core = root.YouTutorCore || (typeof require === 'function' && require('../core.js'));
  function timestamp(value) {
    if (/^\d+s?$/.test(value)) return core.parseTime(value.replace(/s$/, ''));
    const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
    if (!parts || !parts.slice(1).some(Boolean)) throw new Error('The shared timestamp is invalid. Use a video link with seconds or h/m/s units.');
    const seconds = Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
    return core.parseTime(String(seconds));
  }
  function parse(input) {
    if (typeof input !== 'string' || input.length > 10000) throw new Error('Paste a YouTube video link.');
    const candidates = input.match(/https?:\/\/[^\s<>]+/g) || [];
    for (const candidate of candidates) {
      const raw = candidate.replace(/[),.!;]+$/, '');
      const id = core.parseVideo(raw); if (!id) continue;
      const url = new URL(raw); const hash = new URLSearchParams(url.hash.slice(1));
      const time = url.searchParams.get('t') ?? url.searchParams.get('start') ?? hash.get('t');
      return { id, at: time === null ? 0 : timestamp(time), url: core.videoURL(id, time === null ? 0 : timestamp(time)) };
    }
    throw new Error('No valid YouTube video link was found. Copy the video’s Share link and paste it here.');
  }
  root.YouTutorLinks = { parse, timestamp };
  if (typeof module !== 'undefined') module.exports = root.YouTutorLinks;
})(globalThis);
