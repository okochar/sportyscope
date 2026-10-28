(() => {
  'use strict';
  const $=id=>document.getElementById(id),M=ScopeTrackingModel,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  let tickets=[],page=1,refreshing=false,feedback={samples:0,markets:{}};const databases=new Map(),owner=()=>ScopeAccount.user()?.id||'guest';
  function db(account=owner()){if(!databases.has(account))databases.set(account,new Promise((resolve,reject)=>{const req=indexedDB.open(account==='guest'?'sportyscope.research.history':'sportyscope.research.history.'+account,1);req.onupgradeneeded=()=>req.result.createObjectStore('tickets',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}));return databases.get(account);}
  async function all(account=owner()){const d=await db(account);return new Promise((resolve,reject)=>{const r=d.transaction('tickets').objectStore('tickets').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function put(ticket,cloud=true,account=owner()){if(cloud)ticket.updatedAt=Date.now();const d=await db(account);await new Promise((resolve,reject)=>{const tx=d.transaction('tickets','readwrite');tx.objectStore('tickets').put(ticket);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});if(cloud)window.ScopeCloud?.queue();}
  function render(){
    tickets.sort((a,b)=>b.createdAt-a.createdAt);const pages=Math.max(1,Math.ceil(tickets.length/10));page=Math.max(1,Math.min(page,pages));
    $('historyPage').textContent='Page '+page+' of '+pages;$('historyPrev').disabled=page===1;$('historyNext').disabled=page===pages;
    $('historyStatus').textContent=(refreshing?'Checking provider results… · ':'')+tickets.length+' saved tickets · '+feedback.samples+' distinct verified win/loss evaluations available for local calibration. Verified completed scores feed the next provider-history model refresh.';
    $('trackedTickets').innerHTML=tickets.length?tickets.slice((page-1)*10,page*10).map(t=>`<details class="tracked-ticket"><summary><span class="result-badge ${esc(M.ticketStatus(t.picks))}">${esc(M.ticketStatus(t.picks))}</span> ${esc(t.family)} · ${t.picks.length} legs · ${Number(t.picks.reduce((n,p)=>n*Number(p.odds||1),1)).toFixed(2)} odds${t.code?' · '+esc(t.code):' · suggested ticket'} · ${esc(new Date(t.createdAt).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}))} WAT</summary><div class="research-table-wrap"><table class="research-table"><thead><tr><th>Match</th><th>Selection</th><th>Odds</th><th>Status</th><th>Verified score / detail</th></tr></thead><tbody>${t.picks.map(p=>`<tr><td>${esc(p.home&&p.away?p.home+' vs '+p.away:p.event)}</td><td>${esc(p.market)} ${esc(p.specifier)} · ${esc(p.outcome)}</td><td>${Number(p.odds).toFixed(2)}</td><td><span class="result-badge ${esc(p.status||'pending')}">${esc(p.status||'pending')}</span></td><td>${p.result?esc(p.result.ft.join(':'))+' · '+esc(p.result.source):esc(p.note||'Awaiting a verified completed result.')}</td></tr>`).join('')}</tbody></table></div></details>`).join(''):'<p>Completed analysis runs, local selections and loaded/reserved codes will appear here. Results are tracked without placing a bet.</p>';
  }
  async function reload(){const account=owner(),saved=await all(account);if(account!==owner())return;tickets=saved;feedback=M.learning(tickets);render();document.dispatchEvent(new CustomEvent('scope:learning',{detail:{samples:feedback.samples}}));}
  async function add(input,code=''){
    try{await ScopeAccount.ready;const account=owner();if(!Array.isArray(input)||!input.length||input.length>50)return;const family=input[0].family;if(input.some(p=>p.family!==family))return;
      const picks=input.map(p=>({...p,rawEventId:p.rawEventId||p.eventId,specifier:p.specifier||'',status:'pending'})),id=family+'|'+picks.map(M.key).sort().join('~');
      const old=(await all(account)).find(t=>t.id===id);if(old){let changed=false;if(code&&old.code!==code){old.code=code;changed=true;}for(const p of old.picks){const current=picks.find(x=>M.key(x)===M.key(p));if(current&&p.status==='pending'&&Number.isFinite(current.probability)&&!Number.isFinite(p.probability)){Object.assign(p,{probability:current.probability,voidProbability:current.voidProbability,forecastAt:current.forecastAt,evidenceMode:current.evidenceMode});changed=true;}if(code&&current&&current.odds!==p.odds){p.odds=current.odds;changed=true;}}if(changed){await put(old,true,account);await reload();}return;}
      await put({id,family,code,createdAt:Date.now(),picks},true,account);await reload();
    }catch{$('historyStatus').textContent='Browser history storage is unavailable. Provider data and the picker remain usable.';}
  }
  async function refresh(){
    if(refreshing||document.hidden)return;const account=owner();refreshing=true;render();
    try{for(const t of tickets){const waiting=t.picks.filter(p=>!['won','lost','void'].includes(p.status));if(!waiting.length)continue;
      const res=await fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({picks:waiting.map(p=>({family:p.family,rawEventId:p.rawEventId,marketId:p.marketId,specifier:p.specifier||'',outcomeId:p.outcomeId,market:p.market,outcome:p.outcome}))}),signal:AbortSignal.timeout(60000)}),r=await res.json();if(!res.ok||!r.ok)continue;
      for(const u of r.updates){const p=t.picks.find(p=>M.key(p)===u.key);if(p){Object.assign(p,u);if(u.result&&['won','lost','void'].includes(u.status))p.verifiedAt=u.checkedAt;}}
      if(account!==owner())return;await put(t,true,account);
    }await reload();}catch{}finally{refreshing=false;render();}
  }
  window.ScopeTracker={add,refresh,feedback:()=>feedback};
  $('refreshHistory').addEventListener('click',refresh);$('historyPrev').addEventListener('click',()=>{page--;render();});$('historyNext').addEventListener('click',()=>{page++;render();});
  window.ScopeCloud?.start({all,restore:t=>put(t,false),onRestore:async()=>{await reload();await refresh();},onAccount:async({migrateGuest})=>{const account=owner();if(migrateGuest&&account!=='guest'){const current=await all(account),legacy=await all('guest');for(const t of legacy)if(!current.some(x=>x.id===t.id))await put(t,true,account);}await reload();refresh();}});
  setInterval(()=>{if(!document.hidden)refresh();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
