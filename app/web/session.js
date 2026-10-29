(function(root){
 'use strict';let refresh,activeIdentity;
 function invalidate(){root.dispatchEvent(new Event('leeway-session-changing'));}
 function login(){invalidate();const next=location.pathname+location.search;location.replace('/leeway-account?next='+encodeURIComponent(next));}
 async function check(){if(refresh)return refresh;refresh=(async()=>{const r=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});const data=await r.json();if(r.status===401||data.linkRequired){login();throw new Error('Sign in or confirm your account connection to continue.');}if(!r.ok)throw new Error(data.error||'Sign-in is temporarily unavailable. Try again.');if(activeIdentity&&activeIdentity!==data.userId){invalidate();location.reload();throw new Error('Your account changed. Reloading your library.');}activeIdentity=data.userId;return data;})().finally(()=>refresh=null);return refresh;}
 const ready=check();ready.catch(()=>{});root.YouTutorSession={ready,check};
 setInterval(()=>check().catch(()=>{}),60000);root.addEventListener('focus',()=>check().catch(()=>{}));
})(globalThis);
