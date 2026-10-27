(() => {
  'use strict';
  const $=id=>document.getElementById(id),storageKey='scope.history.private-key';
  let adapter=null,busy=false,again=false,timer=null,token='';
  const status=message=>{$('cloudHistoryStatus').textContent=message;};
  function getToken(){if(token)return token;token=localStorage.getItem(storageKey)||'';if(!/^[a-f0-9]{64}$/.test(token)){token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem(storageKey,token);}return token;}
  async function call(path,body){const response=await fetch('/api/tickets'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+getToken(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)}),r=await response.json();if(!response.ok||!r.ok)throw Error(r.error||'Cloud sync failed.');return r;}
  async function sync(){
    if(!adapter)return;if(busy){again=true;return;}busy=true;status('Checking private cloud history…');
    try{
      const remote=new Map(),cursors=new Set();let cursor='';
      do{const r=await call(cursor?'?cursor='+encodeURIComponent(cursor):'');if(!r.configured){status('Saved on this device. Supabase is not connected yet; follow the setup steps below.');return;}for(const t of r.tickets||[])remote.set(t.id,t);cursor=r.nextCursor||'';if(cursor&&cursors.has(cursor))throw Error('Cloud history cursor repeated.');cursors.add(cursor);}while(cursor);
      let local=await adapter.all(),restored=0;
      for(const r of remote.values()){const old=local.find(t=>t.id===r.id);if(!old||(r.updatedAt||r.createdAt)>(old.updatedAt||old.createdAt)){
        // Re-check restored outcomes with the provider before they affect learning.
        const t={...r,picks:r.picks.map(p=>{const clean={...p,status:'pending',note:'Restored from cloud; verifying with the provider.'};delete clean.result;delete clean.verifiedAt;return clean;})};
        await adapter.restore(t);restored++;
      }}
      local=await adapter.all();let saved=0;
      for(const t of local){const r=remote.get(t.id);if(!r||(t.updatedAt||t.createdAt)>(r.updatedAt||r.createdAt)){await call('',t);saved++;}}
      status('Cloud connected · '+local.length+' tickets backed up'+(restored?' · '+restored+' restored for provider verification':'')+' · '+new Date().toLocaleTimeString('en-NG',{timeZone:'Africa/Lagos'})+' WAT.');
      if(restored)await adapter.onRestore();
    }catch(e){status('Local tickets are safe. '+e.message);}finally{busy=false;if(again){again=false;queue();}}
  }
  function queue(){clearTimeout(timer);timer=setTimeout(()=>{if(!document.hidden)sync();},2000);}
  window.ScopeCloud={start(value){adapter=value;sync();},queue};
  $('syncHistory').addEventListener('click',sync);
  $('copyHistoryKey').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(getToken());status('Private recovery key copied. Keep it in your password manager; anyone with it can load your history. This is not a Supabase API key.');}catch{status('Could not copy the recovery key. Allow clipboard access and try again.');}});
  $('restoreHistoryForm').addEventListener('submit',e=>{e.preventDefault();if(busy){status('Wait for the current sync before switching private history keys.');return;}const value=$('restoreHistoryKey').value.trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(value)){status('Enter the 64-character private history key from your other device.');return;}try{localStorage.setItem(storageKey,value);token=value;$('restoreHistoryKey').value='';sync();}catch{status('Private history key could not be saved in this browser.');}});
  setInterval(()=>{if(!document.hidden)sync();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
})();
