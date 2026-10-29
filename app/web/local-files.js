(function(root){
 'use strict';
 async function identify(file){
  const media=file.type?.startsWith('audio/')||/\.(mp3|m4a|wav|ogg)$/i.test(file.name)?'audio':'video';
  if(!file.size)throw new Error('Choose a nonempty video or audio file.');
  // Read only two small samples on-device, even for multi-gigabyte footage.
  const first=await file.slice(0,1048576).arrayBuffer(),last=await file.slice(Math.max(0,file.size-1048576),file.size).arrayBuffer();
  const label=new TextEncoder().encode(String(file.size));const bytes=new Uint8Array(label.length+first.byteLength+last.byteLength);
  bytes.set(label);bytes.set(new Uint8Array(first),label.length);bytes.set(new Uint8Array(last),label.length+first.byteLength);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return {id:'local_'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),name:file.name,media,local:true,size:file.size};
 }
 function create(){
  const files=new Map();
  return {async attach(file){const info=await identify(file),old=files.get(info.id);if(old)URL.revokeObjectURL(old.url);const item={...info,url:URL.createObjectURL(file)};files.set(info.id,item);return item;},get:id=>files.get(id),clear(){for(const item of files.values())URL.revokeObjectURL(item.url);files.clear();}};
 }
 root.LeewayLocalFiles={create,identify};
})(globalThis);
