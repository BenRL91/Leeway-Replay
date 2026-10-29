(function(){
 'use strict';
 const entry=document.getElementById('review-entry');if(!entry||!globalThis.YouTutorSession)return;
 YouTutorSession.ready.then(identity=>{
  document.getElementById('review-entry-title').textContent='Your saved library';
  document.getElementById('review-entry-help').textContent='Keep using existing notes and tutorials, or create a Replay to collect and share moments.';
  document.getElementById('review-entry-account').textContent=identity.user?.email||'';
  const create=document.getElementById('create-review-link');create.hidden=false;create.textContent='Create Replay';create.href='/replay?new=1';
  document.getElementById('review-workspace-link').textContent='My Replays & shared with me';
  document.getElementById('breakdowns-nav').textContent='My Replays';entry.hidden=false;
 }).catch(()=>{});
})();
