/** SERVER ONLY. Never ship a producer secret or this configured adapter to a browser. */
export async function sendEvent({serviceUrl,secret,event,fetcher=fetch,signal}){
 if(typeof secret!=='string'||secret.length<32)throw new Error('A dedicated producer secret is required.');
 const origin=new URL(serviceUrl);if(origin.protocol!=='https:')throw new Error('HTTPS is required.');
 const body=JSON.stringify(event),timestamp=String(Date.now());
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'\nPOST\n/v1/events\n'+body))),n=>n.toString(16).padStart(2,'0')).join('');
 const r=await fetcher(origin.origin+'/v1/events',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','x-leeway-producer':event.app,'x-leeway-timestamp':timestamp,'x-leeway-signature':signature},body,signal:signal||AbortSignal.timeout(10000)});
 if(!r.ok){const error=new Error('Notification ingestion failed');error.status=r.status;error.retryable=r.status===429||r.status>=500;throw error;}
 return r.json();
}
