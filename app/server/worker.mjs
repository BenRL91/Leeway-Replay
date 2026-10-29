import {proxyNotifications,reconcileSweep} from './notifications.mjs';
import {handleUploads, SINGLE_MAX} from './uploads.mjs';
export {MAX_FILE} from './uploads.mjs';
import {handleAuth, resolveAuth, mergeAuthHeaders, authFailure} from './auth.mjs';
import { handleReplay, COACH_ID } from './replay.mjs';
const core = globalThis.YouTutorCore;
const TYPES = {
  mp4: ['video', 'video/mp4'], mov: ['video', 'video/quicktime'], webm: ['video', 'video/webm'],
  mp3: ['audio', 'audio/mpeg'], m4a: ['audio', 'audio/mp4'], wav: ['audio', 'audio/wav'], ogg: ['audio', 'audio/ogg'],
  jpg: ['image', 'image/jpeg'], jpeg: ['image', 'image/jpeg'], png: ['image', 'image/png'], webp: ['image', 'image/webp'], gif: ['image', 'image/gif'],
  pdf: ['pdf', 'application/pdf'], txt: ['text', 'text/plain'], md: ['text', 'text/plain'], csv: ['text', 'text/plain'], json: ['text', 'text/plain']
};
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export function fileType(name) { return TYPES[name.split('.').pop().toLowerCase()] || null; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }); }
function error(message, status = 400) { return json({ ok: false, error: message }, status); }
async function read(bucket, key) {
  const stored = await bucket.get(key);
  return { state: stored ? core.validate(await stored.json()) : core.empty(), etag: stored?.etag };
}
async function write(bucket, prefix, action) {
  const key = `${prefix}library.json`; const generated = crypto.randomUUID();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state, etag } = await read(bucket, key);
    if (action.type === 'note.save' && !action.id && action.video?.kind === 'file' && action.video.local !== true) {
      if (!UUID.test(action.video.id) || !(await bucket.head(`${prefix}files/${action.video.id}`))) throw new Error('This uploaded file is unavailable. Open or upload it again.');
    }
    const next = core.apply(state, action, { newId: () => generated });
    const saved = await bucket.put(key, JSON.stringify(next), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
    if (saved) return next;
  }
  throw new Error('Another save is in progress. Your draft is still here; try again.');
}
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2])) throw new Error('range');
  let start; let end;
  if (!m[1]) { const suffix = Number(m[2]); if (!suffix) throw new Error('range'); start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new Error('range');
  return { offset: start, length: end - start + 1 };
}
async function appFetch(request, env, storageUser, principal) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      const route = url.pathname==='/'&&url.searchParams.has('video')?'/index.html':url.pathname==='/communication-policy'?'/communication-policy.html':url.pathname==='/settings/communication'?'/communication.html':['/leeway-account','/auth/return'].includes(url.pathname) ? '/account.html' : (url.pathname === '/replay'||url.pathname==='/') || /^\/replay\/(view|preview)\/[a-f0-9-]+$/.test(url.pathname) ? '/replay.html' : url.pathname === '/library' ? '/index.html' : url.pathname;
      const asset = ASSETS[route];
      if (!asset) return new Response('Not found', { status: 404 });
      return new Response(request.method==='HEAD'?null:asset.encoding==='base64'?Uint8Array.from(atob(asset.content),c=>c.charCodeAt(0)):asset.content, { headers: { 'Content-Type': asset.type, 'Cache-Control': ['/leeway-account','/auth/return'].includes(url.pathname) ? 'private, no-store' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': ['/leeway-account','/auth/return'].includes(url.pathname) ? 'no-referrer' : 'strict-origin-when-cross-origin' } });
    }
    const user = storageUser || request.headers.get('oai-authenticated-user-id');
    if (!user) return error('Sign in to access your saved library.', 401);
    if (!env.BUCKET) return error('File storage is unavailable. Please try again later.', 503);
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return error('Request origin is not allowed.', 403);
    if (url.pathname.startsWith('/api/replay/')) return handleReplay(request, env, user, parseRange, principal);
    const bucket = env.BUCKET; const prefix = `users/${encodeURIComponent(user)}/`;
    if (url.pathname === '/api/uploads' || url.pathname.startsWith('/api/uploads/')) {
      if(env.LEEWAY_CLOUD_UPLOADS!=='enabled' && request.method!=='DELETE')return error('Cloud uploads are disabled. Open a local file instead; its contents stay on your device.',403);
      return handleUploads(request,bucket,prefix,fileType);
    }
    try {
      if (url.pathname === '/api/library' && request.method === 'GET') {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user));
        const accountKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
        return json({ ok: true, accountKey, legacyImportAllowed: user === COACH_ID && request.headers.get('oai-authenticated-user-id') === COACH_ID, state: (await read(bucket, `${prefix}library.json`)).state });
      }
      if (url.pathname === '/api/library' && request.method === 'POST') {
        const reader = request.body?.getReader(); const chunks = []; let bytes = 0;
        if (!reader) return error('Invalid request.');
        while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length;
          if (bytes > 5 * 1024 * 1024) { await reader.cancel(); return error('Request is too large.', 413); } chunks.push(part.value); }
        const buffer = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { buffer.set(chunk,offset); offset += chunk.length; }
        const input = new TextDecoder().decode(buffer);
        const action = JSON.parse(input); return json({ ok: true, state: await write(bucket, prefix, action) });
      }
      if (url.pathname === '/api/files' && request.method === 'GET') {
        let cursor; const files = [];
        do {
          const page = await bucket.list({ prefix: `${prefix}files/`, include: ['customMetadata'], limit: 100, cursor });
          for (const o of page.objects) files.push({ id: o.key.split('/').pop(), name: o.customMetadata.name, media: o.customMetadata.media, contentType: o.customMetadata.contentType, size: o.size, createdAt: o.uploaded });
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor && files.length < 1000);
        return json({ ok: true, files: files.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
      }
      const match = /^\/api\/files\/([^/]+)$/.exec(url.pathname);
      if (!match || !UUID.test(match[1])) return error('Not found.', 404);
      const id = match[1]; const key = `${prefix}files/${id}`;
      if (request.method === 'PUT') {
        if(env.LEEWAY_CLOUD_UPLOADS!=='enabled')return error('Cloud uploads are disabled. Open a local file instead.',403);
        const size = Number(request.headers.get('Content-Length'));
        if (!Number.isSafeInteger(size) || size < 1 || size > SINGLE_MAX) return error('Use the chunked uploader for files larger than 50 MB.', 413);
        let name; try { name = decodeURIComponent(request.headers.get('X-File-Name') || ''); } catch { return error('Invalid filename.'); }
        if (!name || name.length > 200 || /[\x00-\x1f/\\]/.test(name)) return error('Invalid filename.');
        const type = fileType(name); if (!type) return error('Supported: MP4/MOV/WebM, MP3/M4A/WAV/OGG, JPG/PNG/WebP/GIF, PDF, TXT/MD/CSV/JSON.');
        const saved = await bucket.put(key, request.body, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: type[1] }, customMetadata: { name, media: type[0], contentType: type[1] } });
        if (!saved) return error('This upload already exists.', 409);
        return json({ ok: true, file: { id, name, media: type[0], contentType: type[1], size: saved.size, createdAt: saved.uploaded } }, 201);
      }
      const head = await bucket.head(key); if (!head) return error('File not found. It may belong to another account or have been removed.', 404);
      if (!['GET','HEAD'].includes(request.method)) return error('Method not allowed.', 405);
      let range;
      try { range = parseRange(request.headers.get('Range'), head.size); } catch { return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } }); }
      const headers = { 'Content-Type': head.customMetadata.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Content-Length': String(range?.length ?? head.size), 'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(head.customMetadata.name)}` };
      if (range) headers['Content-Range'] = `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`;
      if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
      const file = await bucket.get(key, range ? { range } : undefined);
      return new Response(file.body, { status: range ? 206 : 200, headers });
    } catch (err) {
      console.error('Leeway Replay request failed', err.message);
      return error(err.message === 'Unexpected end of JSON input' ? 'Invalid request.' : err.message || 'Unable to complete this request.', 400);
    }
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname==='/robots.txt')return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain','X-Robots-Tag':'noindex, nofollow'}});
 const protectedPage=url.pathname==='/'||url.pathname==='/library'||url.pathname==='/settings/communication'||url.pathname==='/communication.html'||url.pathname==='/replay'||/^\/replay\/(view|preview)\//.test(url.pathname)||['/index.html','/replay.html'].includes(url.pathname);
 if(env.LEEWAY_ACCESS_MODE==='allowlist'&&(protectedPage||url.pathname.startsWith('/api/'))&&env.LEEWAY_AUTH_MODE!=='supabase')return error('Private access is not configured.',503);
 if(protectedPage&&env.LEEWAY_ACCESS_MODE==='allowlist'){
  try{const a=await resolveAuth(request,env);const response=mergeAuthHeaders(await appFetch(request,env,a.storageId,a.user),a.headers);response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');return response;}
  catch(e){const status=authFailure(e);if(status===401)return new Response(null,{status:302,headers:{Location:'/leeway-account?next='+encodeURIComponent(url.pathname+url.search),'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});if(status===403)return new Response(null,{status:302,headers:{Location:'/leeway-account?access=denied','Cache-Control':'private, no-store'}});return error('Sign-in is temporarily unavailable. Try again.',status);}
 }
 if(url.pathname.startsWith('/api/auth/'))return handleAuth(request,env);
 if(url.pathname.startsWith('/api/')&&env.LEEWAY_AUTH_MODE==='supabase'){
  try{const a=await resolveAuth(request,env);if(a.isCoach&&ctx?.waitUntil)ctx.waitUntil(reconcileSweep(env).catch(()=>{}));if(a.linkRequired)return error('Confirm your LeewayPB account link before opening your existing library.',409);
   return mergeAuthHeaders(url.pathname.startsWith('/api/notifications/')?await proxyNotifications(request,env,a):await appFetch(request,env,a.storageId,a.user),a.headers);
  }catch(e){const status=authFailure(e);return error(status===401?'Sign in to LeewayPB to access your library.':status===403?e.message:'Sign-in is temporarily unavailable. Your work is safe; try again.',status);}
 }
 return appFetch(request,env);
}};
