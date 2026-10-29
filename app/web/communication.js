(function(root){
 'use strict';
 const status=document.getElementById('communication-status'),activation=document.getElementById('inapp-activation'),badge=document.getElementById('inapp-badge'),saved=document.getElementById('inapp-saved'),retry=document.getElementById('communication-retry');
 let identity=null,version=null,previous=false,epoch=0,controller=null,busy=false,active=false;
 function invalidate(){epoch++;controller?.abort();version=null;active=false;badge.checked=false;badge.disabled=true;saved.textContent='Saved preference unavailable. Reload for the current account.';}
 root.addEventListener('leeway-session-changing',invalidate);root.addEventListener('pagehide',invalidate);
 function valid(data){if(typeof data?.inApp!=='boolean'||!Number.isSafeInteger(data.version)||data.version<1)throw Error('Unsupported preference response.');return data;}
 async function request(path,options={}){
  const r=await fetch('/api/notifications'+path,{credentials:'same-origin',cache:'no-store',signal:controller.signal,...options,headers:{'x-leeway-session':'1',...(options.body?{'Content-Type':'application/json'}:{})}});
  const data=await r.json();if(!r.ok)throw Error(r.status===409?'Your preference changed elsewhere. Refresh settings before trying again.':'Communication settings are temporarily unavailable.');return data;
 }
 function display(data){valid(data);version=data.version;previous=data.inApp;badge.checked=previous;saved.textContent='Saved preference: unread badge '+(previous?'on.':'off.');}
 async function load(){
  if(busy)return;busy=true;badge.disabled=true;controller?.abort();controller=new AbortController();const token=++epoch;
  try{
   const session=await YouTutorSession.check();if(token!==epoch)return;identity=session.user.id;
   const channels=await request('/status');if(token!==epoch)return;active=channels.enabled===true;
   activation.textContent=active?'Channel active · In-app inbox available.':'Channel inactive · In-app service is unavailable.';
   if(!active){version=null;saved.textContent='Saved preference unavailable while this channel is inactive.';status.textContent='Email and push remain inactive.';return;}
   const data=await request('/preferences');if(token!==epoch)return;display(data);status.textContent='Communication settings loaded.';
  }catch(e){if(e.name!=='AbortError'&&token===epoch){active=false;version=null;activation.textContent='Channel status unavailable.';saved.textContent='Saved preference unavailable.';status.textContent=e.message;}}
  finally{if(token===epoch){busy=false;badge.disabled=!active||version===null;}else busy=false;}
 }
 badge.addEventListener('change',async()=>{
  if(busy||version===null)return;busy=true;badge.disabled=true;const token=epoch,choice=badge.checked;
  try{const session=await YouTutorSession.check();if(token!==epoch||session.user.id!==identity){invalidate();return;}
   const data=await request('/preferences',{method:'PUT',body:JSON.stringify({inApp:choice,version})});if(token!==epoch)return;display(data);status.textContent='Unread badge preference saved.';
  }catch(e){if(token===epoch&&e.name!=='AbortError'){badge.checked=previous;status.textContent=e.message;}}
  finally{busy=false;if(token===epoch)badge.disabled=!active||version===null;}
 });
 retry.addEventListener('click',load);load();
})(window);
