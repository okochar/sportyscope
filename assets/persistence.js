(() => {
  'use strict';
  const $=id=>document.getElementById(id),providers=new Map(),names=['slip','preferences','journal','imports','review'];
  let adapter=null,busy=false,again=false,timer,initialized='',ready=false,applying=false,epoch=0,conflicts=new Map(),meta={};
  function status(message,tone=''){$('cloudHistoryStatus').textContent=message;$('saveStatus').textContent=message;$('saveStatus').dataset.tone=tone;}
  const owner=()=>ScopeAccount.user()?.id||'guest',metaKey=()=> 'scope.workspace.meta.'+owner();
  function saveMeta(){try{localStorage.setItem(metaKey(),JSON.stringify(meta));}catch{}}
  function readMeta(){try{return JSON.parse(localStorage.getItem(metaKey())||'{}');}catch{return {};}}
  function apply(name,payload){applying=true;try{providers.get(name).apply(payload);}finally{applying=false;}}
  function renderConflicts(){
    $('workspaceConflicts').innerHTML=[...conflicts.keys()].map(name=>'<div class="workspace-conflict"><p>Your '+name+' also changed on another device. Your local draft is retained. Choose which version to continue with.</p><button type="button" class="button subtle" data-conflict="'+name+'" data-choice="cloud">Use cloud version</button> <button type="button" class="button subtle" data-conflict="'+name+'" data-choice="local">Keep this device’s draft</button></div>').join('');
  }
  async function call(url,headers,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(body?.action==='migrate_legacy'?65000:20000)}),p=await r.json();if(!r.ok||!p.ok){const e=Error(p.error||'Automatic saving is unavailable. Your device copy is retained.');e.http=r.status;throw e;}return p;}
  function queue(){clearTimeout(timer);timer=setTimeout(()=>{sync();},400);}
  function changed(name){if(applying||!names.includes(name))return;meta[name]={revision:meta[name]?.revision||0,dirty:true};saveMeta();queue();}
  async function reconcileWorkspace(headers,token){
    const remote=await call('/api/account?view=workspace',headers);if(token!==epoch)return;
    const rows=new Map(remote.components.map(r=>[r.component,r]));
    for(const name of names){const p=providers.get(name),row=rows.get(name),m=meta[name]||{revision:0,dirty:false};
      if(initialized!==owner()){
        const cached=p.cached(),guest=localStorage.getItem('scope.guest.claimed')===owner()?p.guest():null;
        if(cached!==null&&m.dirty)apply(name,cached);
        else if(row)apply(name,row.payload);
        else{apply(name,cached??guest??p.empty());m.dirty=true;}
      }
      if(row){if(m.dirty&&row.revision!==m.revision){if(JSON.stringify(p.read())===JSON.stringify(row.payload)){m.revision=row.revision;m.dirty=false;}else{conflicts.set(name,row);meta[name]=m;continue;}}if(!m.dirty&&row.revision!==m.revision){apply(name,row.payload);m.revision=row.revision;}}
      if(m.dirty&&!conflicts.has(name)){
        const payload=p.read(),sent=JSON.stringify(payload);
        try{const saved=await call('/api/account',headers,{component:name,payload,revision:m.revision});if(token!==epoch)return;m.revision=saved.revision;m.dirty=JSON.stringify(p.read())!==sent;if(m.dirty)again=true;}
        catch(e){if(token!==epoch)return;if(e.http===409){again=true;meta[name]=m;saveMeta();continue;}throw e;}
      }
      meta[name]=m;
    }
    initialized=owner();saveMeta();renderConflicts();
  }
  async function sync(){
    if(!ready||!adapter||providers.size!==names.length)return;if(busy){again=true;return;}
    const user=ScopeAccount.user();if(!user){status('Not logged in · account saving is off');return;}
    busy=true;const token=epoch;
    try{
      const headers=await ScopeAccount.headers();if(!headers.Authorization)throw Error('Sign in again to resume automatic saving.');
      const legacy=localStorage.getItem('scope.history.private-key');
      if(/^[a-f0-9]{64}$/.test(legacy||'')&&!localStorage.getItem('scope.legacy.cloud.claimed')){
        let cursor='',seen=new Set();do{const migrated=await call('/api/tickets',headers,{action:'migrate_legacy',legacyKey:legacy,cursor});if(token!==epoch)return;cursor=migrated.nextCursor||'';if(cursor&&seen.has(cursor))throw Error('Legacy history cursor repeated.');seen.add(cursor);}while(cursor);localStorage.setItem('scope.legacy.cloud.claimed',user.id);
      }
      await reconcileWorkspace(headers,token);if(token!==epoch)return;
      const remote=new Map(),cursors=new Set();let cursor='';
      do{const r=await call('/api/tickets'+(cursor?'?cursor='+encodeURIComponent(cursor):''),headers);if(token!==epoch)return;if(!r.configured)throw Error(r.note);for(const t of r.tickets||[])remote.set(t.id,t);cursor=r.nextCursor||'';if(cursor&&cursors.has(cursor))throw Error('Saved history cursor repeated.');cursors.add(cursor);}while(cursor);
      let local=await adapter.all(),restored=0;
      for(const r of remote.values()){const old=local.find(t=>t.id===r.id);if(!old||(r.updatedAt||r.createdAt)>(old.updatedAt||old.createdAt)){
        const t={...r,picks:r.picks.map(p=>({...p}))};
        if(token!==epoch)return;await adapter.restore(t);restored++;
      }}
      local=await adapter.all();for(const t of local){if(token!==epoch)return;const r=remote.get(t.id);if(!r||(t.updatedAt||t.createdAt)>(r.updatedAt||r.createdAt))await call('/api/tickets',headers,t);}
      if(token!==epoch)return;status(conflicts.size?'Saved history · review a workspace conflict in Settings.':'Saved to Supabase · '+local.length+' tickets','good');
      if(restored)adapter.onRestore().catch(()=>{});
    }catch(e){if(token===epoch)status(e.message,'bad');}finally{busy=false;if(again){again=false;queue();}}
  }
  async function switchAccount(){
    epoch++;initialized='';conflicts.clear();renderConflicts();meta=readMeta();
    const user=ScopeAccount.user();if(user&&!localStorage.getItem('scope.guest.claimed'))localStorage.setItem('scope.guest.claimed',user.id);
    for(const [name,p]of providers)apply(name,p.cached()??(!user||localStorage.getItem('scope.guest.claimed')===user.id?p.guest():null)??p.empty());
    if(adapter)await adapter.onAccount({migrateGuest:Boolean(user&&localStorage.getItem('scope.guest.claimed')===user.id)});
    queue();
  }
  window.ScopeWorkspace={register(name,provider){providers.set(name,provider);if(ready)queue();},changed};
  window.ScopeCloud={start(value){adapter=value;ScopeAccount.ready.then(async()=>{ready=true;await switchAccount();sync();});},queue};
  document.addEventListener('scope:session',()=>{if(ready)switchAccount();});
  $('workspaceConflicts').addEventListener('click',e=>{const b=e.target.closest('[data-conflict]');if(!b)return;const name=b.dataset.conflict,row=conflicts.get(name);if(!row)return;if(b.dataset.choice==='cloud')apply(name,row.payload);meta[name]={revision:row.revision,dirty:b.dataset.choice==='local'};conflicts.delete(name);saveMeta();renderConflicts();queue();});
  setInterval(()=>{if(!document.hidden)sync();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});window.addEventListener('online',queue);
})();
