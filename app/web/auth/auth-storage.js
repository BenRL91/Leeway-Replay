// Share only the short-lived PKCE verifier across tabs. Access and refresh tokens
// remain in page memory. Namespace by the authenticated PaddleLog account.
export function connectionStorage({persistent,legacyTab,accountId,clock=Date.now,ttl=60*60*1000}){
 const memory=new Map(),prefix='leewaypb.pkce.'+accountId+'.';
 return {
  getItem(key){
   if(!key.endsWith('-code-verifier'))return memory.get(key)??null;
   try{const raw=persistent.getItem(prefix+key);if(raw){const saved=JSON.parse(raw);if(typeof saved.value==='string'&&Number.isFinite(saved.expires)&&saved.expires>clock())return saved.value;persistent.removeItem(prefix+key);return null;}
    // Recover a pre-fix request only in the original tab, without changing its data.
    const legacy=legacyTab?.getItem(key);if(legacy){this.setItem(key,legacy);legacyTab.removeItem(key);return legacy;}
   }catch{return null;}return null;
  },
  setItem(key,value){if(!key.endsWith('-code-verifier')){memory.set(key,value);return;}try{persistent.setItem(prefix+key,JSON.stringify({value,expires:clock()+ttl}));}catch{throw new Error('Your browser cannot save the sign-in request. Allow site storage and request a fresh email.');}},
  removeItem(key){memory.delete(key);if(key.endsWith('-code-verifier')){try{persistent.removeItem(prefix+key);legacyTab?.removeItem(key);}catch{}}},
  clearSession(){memory.clear();}
 };
}
export function authErrorMessage(error){
 const text=error instanceof Error?error.message:String(error??'');
 if(/code verifier|code_verifier|pkce|flow.state|flow_state/i.test(text))return 'This email link cannot be matched to a sign-in request in this browser. Request a fresh email here and use only the newest link, or enter its verification code on this page. Links opened in a different browser or device cannot use this browser’s sign-in request.';
 return text||'Sign-in could not complete. Request a fresh email and try again.';
}
