import {createClient} from '@supabase/supabase-js';
import {createConnection} from './auth-controller.js';
import {connectionStorage,authErrorMessage} from './auth-storage.js';
const $=id=>document.getElementById(id);const status=t=>{$('authStatus').textContent=t;};
function destination(value){try{const u=new URL(value||'/replay',location.origin);return u.origin===location.origin&&(/^\/replay(?:[/?]|$)/.test(u.pathname)||u.pathname==='/')?u.pathname+u.search:'/replay';}catch{return '/replay';}}
async function start(){
 const query=new URLSearchParams(location.search),code=query.get('code'),failed=query.has('error')||new URLSearchParams(location.hash.slice(1)).has('error');
 if(query.has('next'))try{sessionStorage.setItem('yoututor.auth.next',destination(query.get('next')));}catch{}
 history.replaceState(null,'','/leeway-account');let next='/replay';try{next=destination(sessionStorage.getItem('yoututor.auth.next'));}catch{}
 async function request(path,options={}){const r=await fetch(path,{credentials:'same-origin',...options});const data=await r.json();if(!r.ok||data.ok===false){const error=new Error(data.error||'Sign-in unavailable.');error.status=r.status;throw error;}return data;}
 async function session(){return request('/api/auth/session');}
 async function showSession(s){$('authControls').hidden=true;$('linkPanel').hidden=!s.linkRequired;$('signedInPanel').hidden=s.linkRequired;$('verifiedEmail').textContent=`${s.user.email||'Verified account'} · ${s.user.id}`;$('signedInIdentity').textContent=`${s.isCoach?'Coach Lee':'Student'} mode · ${s.user.email||s.user.id}`;$('continueLink').href=next;$('continueLink').textContent=s.isCoach?'Open coach workspace':'Open my breakdowns';status(s.linkRequired?'Review your verified account, then confirm the connection.':s.isCoach?'Coach access is active. You can create and share reviews.':'You are signed in as a student.');if(!s.linkRequired&&(code||completed)){location.replace(next);}}
 let completed=false;
 if(!code&&!failed){try{await showSession(await session());return;}catch(error){if(error.status===403){$('authControls').hidden=true;$('signedInPanel').hidden=false;$('continueLink').hidden=true;$('signedInIdentity').textContent='This account is not approved for Leeway Replay.';status(error.message);return;}/* sign-in form */}}
 const config=await request('/api/auth/config');if(new URL(config.redirectTo).origin!==location.origin){location.replace(new URL(config.redirectTo).origin+'/leeway-account');return;}
 const storage=connectionStorage({persistent:localStorage,legacyTab:sessionStorage,accountId:'yoututor'});const client=createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,storage,storageKey:'yoututor-leeway-connect',autoRefreshToken:false}});const connection=createConnection({client,config});let busy=false;
 async function action(fn){if(busy)return;busy=true;const controls=[...document.querySelectorAll('button')],previous=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);try{await fn();}catch(e){status(authErrorMessage(e));}finally{controls.forEach((n,i)=>n.disabled=previous[i]);busy=false;}}
 async function finish(){await connection.signIn();storage.clearSession();completed=true;await showSession(await session());}
 $('authControls').hidden=false;
 for(const provider of ['google','apple']){const b=$(provider+'Auth');b.disabled=!config.providers[provider];if(!b.disabled)b.textContent='Continue with '+(provider==='google'?'Google':'Apple');b.addEventListener('click',()=>action(async()=>{status('Opening sign-in…');location.assign(await connection.oauth(provider));}));}
 $('sendCode').disabled=$('verifyCode').disabled=!config.providers.email;
 $('emailAuth').addEventListener('submit',e=>{e.preventDefault();action(async()=>{await connection.sendEmail($('authEmail').value);$('codeAuth').hidden=false;status('Open the newest sign-in link in this same browser, or enter its code if your email includes one. A new tab in this browser is okay.');});});
 $('codeAuth').addEventListener('submit',e=>{e.preventDefault();action(async()=>{await connection.verifyCode($('authEmail').value,$('authCode').value);await finish();});});
 // Shared session controls also work when recovering an existing cookie session.
 if(failed)status('Sign-in was cancelled or could not complete. Try again.');
 else if(code){status('Verifying your sign-in…');await action(async()=>{await connection.callback(code);await finish();});}else status('Choose your usual LeewayPB sign-in method.');
}
async function signout(){const r=await fetch('/api/auth/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-leeway-session':'1'},body:JSON.stringify({action:'signout'})});if(!r.ok)throw Error('Sign-out could not complete. Try again.');location.replace('/leeway-account');}
$('signOut').addEventListener('click',()=>signout().catch(e=>status(e.message)));
$('changeAccount').addEventListener('click',()=>signout().catch(e=>status(e.message)));
$('confirmLink').addEventListener('click',async()=>{const b=$('confirmLink');b.disabled=true;try{const r=await fetch('/api/auth/link',{method:'POST',credentials:'same-origin',headers:{'x-leeway-session':'1','x-confirm-link':'link-my-yoututor-account'}});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Linking failed.');let next='/replay';try{next=sessionStorage.getItem('yoututor.auth.next')||next;}catch{}location.replace(destination(next));}catch(e){status(e.message);b.disabled=false;}});
start().catch(e=>status(authErrorMessage(e)));
