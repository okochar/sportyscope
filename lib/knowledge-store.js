'use strict';
// Server-only adapter. The browser never receives the Supabase service credential.
function createStore(env=process.env,fetcher=fetch){
  const configuration=require('./supabase-config').config(env),base=configuration.url,key=configuration.key;
  const configured=configuration.configured;let lastStatus=configured?'configured; not yet verified':'not configured';
  async function call(table,query='',body){
    if(!configured)return null;
    const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw Error('Supabase URL must use HTTPS.');
    const res=await fetcher(new URL('/rest/v1/'+table+query,url),{method:body?'POST':'GET',headers:{apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!res.ok){let detail;try{detail=await res.json();}catch{}lastStatus='unavailable';const e=Error(res.status===401?'Supabase rejected the server key. Check that the URL and key belong to the same project.':detail?.code==='PGRST205'?'Supabase tables are missing from the API schema. Apply the current setup SQL.':detail?.code==='42501'?'Supabase denied server table access. Apply the table grants in the setup SQL.':detail?.code==='40001'?'This workspace changed on another device.':'Supabase request failed ('+res.status+').');e.code=detail?.code;e.http=res.status;throw e;}lastStatus='connected';
    if(body)return true;return res.json();
  }
  return {configured,status:()=>lastStatus,issues:()=>configuration.issues,
    async health(){if(!configured)return {connected:false,issues:configuration.issues};try{await call('scope_tickets','?select=ticket_id&limit=1');await call('scope_workspace','?select=component&limit=1');return {connected:true,issues:[]};}catch(e){return {connected:false,issues:[e.message]};}},
    async readWorkspace(user){return call('scope_workspace','?user_id=eq.'+encodeURIComponent(user)+'&select=component,payload,revision,updated_at');},
    async saveWorkspace(user,component,payload,revision){
      // This invoker-rights RPC uses optimistic revisions to prevent device overwrites.
      await call('rpc/scope_save_workspace','',{p_user:user,p_component:component,p_payload:payload,p_revision:revision});return revision+1;
    },
    async readTickets(owner,cursor=''){return call('scope_tickets','?owner_id=eq.'+owner+(cursor?'&ticket_id=gt.'+cursor:'')+'&order=ticket_id.asc&limit=100&select=ticket_id,payload');},
    async saveTicket(owner,id,ticket){return call('scope_tickets','?on_conflict=owner_id,ticket_id',[{owner_id:owner,ticket_id:id,payload:ticket,updated_at:new Date().toISOString()}]);},
    async saveVerifiedResult(r){return call('scope_observations','?on_conflict=family,provider,observation_id',[{family:r.family,provider:'SportyBet official results',observation_id:r.id,provider_match_id:r.id,played_at:new Date(r.time).toISOString(),home_key:r.homeId,away_key:r.awayId,measurements:{ft:r.ft,ht:r.ht},provenance:{source:r.sourceUrl,retrieved_at:new Date().toISOString()}}]);},
    async readTeam(id){const p=await call('scope_team_history','?team_id=eq.'+encodeURIComponent(id)+'&select=snapshot');return p?.[0]?.snapshot||null;},
    async saveTeam(value){
      await call('scope_team_history','?on_conflict=team_id',[{team_id:value.id,family:'Real',snapshot:value,updated_at:value.retrievedAt}]);
      const observations=value.records.map(r=>({family:'Real',provider:'SportyBet',observation_id:r.id,provider_match_id:r.id,played_at:new Date(r.time).toISOString(),home_key:r.homeId,away_key:r.awayId,measurements:{ft:r.ft,ht:r.ht},provenance:{source:value.sourceUrl,retrieved_at:value.retrievedAt}}));
      for(let i=0;i<observations.length;i+=100)await call('scope_observations','?on_conflict=family,provider,observation_id',observations.slice(i,i+100));return true;
    },
    async saveModel(id,family,data){return call('scope_models','?on_conflict=id',[{id,family,model:data,trained_at:new Date().toISOString()}]);},
    async hasModel(id){const rows=await call('scope_models','?id=eq.'+encodeURIComponent(id)+'&select=id&limit=1');return Boolean(rows?.length);},
    async hasProfiles(id){const rows=await call('scope_condition_profiles','?model_id=eq.'+encodeURIComponent(id)+'&select=profile_key&limit=1');return Boolean(rows?.length);},
    async readModel(id){const p=await call('scope_models','?id=eq.'+encodeURIComponent(id)+'&select=model');return p?.[0]?.model||null;},
    async seedProfiles(modelId,data){
      const provenance={source:data.source,archive_sha256:data.archiveSHA256,period:data.collected,dated:false,independent_match_ids:false};
      const identities=Object.entries(data.profiles).map(([code,p])=>({family:data.family,provider:'legacy-instant-2022',provider_team_id:p.id,display_name:code,aliases:[],provenance}));
      await call('scope_team_identities','?on_conflict=family,provider,provider_team_id',identities);
      const profiles=[...Object.entries(data.profiles).map(([code,p])=>({family:data.family,model_id:modelId,profile_key:'team:'+code,conditions:p.conditions,source_coverage:{...provenance,samples:p.total.games}})),...Object.entries(data.pairs).map(([pair,p])=>({family:data.family,model_id:modelId,profile_key:'pair:'+pair,conditions:p.conditions,source_coverage:{...provenance,samples:p.samples}}))];
      for(let i=0;i<profiles.length;i+=100)await call('scope_condition_profiles','?on_conflict=family,model_id,profile_key',profiles.slice(i,i+100));return profiles.length;
    }
  };
}
module.exports={createStore,store:createStore()};
