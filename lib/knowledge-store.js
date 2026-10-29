'use strict';
// Server-only adapter. The browser never receives the Supabase service credential.
function createStore(env=process.env,fetcher=fetch){
  const configuration=require('./supabase-config').config(env),base=configuration.url,key=configuration.key;
  const configured=configuration.configured;let lastStatus=configured?'configured; not yet verified':'not configured';
  async function call(table,query='',body,readResponse=false,ignoreDuplicates=false){
    if(!configured)return null;
    const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw Error('Supabase URL must use HTTPS.');
    const res=await fetcher(new URL('/rest/v1/'+table+query,url),{method:body?'POST':'GET',headers:{apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',Prefer:'resolution='+(ignoreDuplicates?'ignore':'merge')+'-duplicates,return=minimal'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!res.ok){let detail;try{detail=await res.json();}catch{}lastStatus='unavailable';const e=Error(res.status===401?'Supabase rejected the server key. Check that the URL and key belong to the same project.':detail?.code==='PGRST205'?'Supabase tables are missing from the API schema. Apply the current setup SQL.':detail?.code==='42501'?'Supabase denied server table access. Apply the table grants in the setup SQL.':detail?.code==='40001'?'This workspace changed on another device.':'Supabase request failed ('+res.status+').');e.code=detail?.code;e.http=res.status;throw e;}lastStatus='connected';
    if(body&&!readResponse)return true;return res.json();
  }
  return {configured,status:()=>lastStatus,issues:()=>configuration.issues,
    async health(){if(!configured)return {connected:false,issues:configuration.issues};try{await call('scope_tickets','?select=ticket_id&limit=1');await call('scope_workspace','?select=component&limit=1');return {connected:true,issues:[]};}catch(e){return {connected:false,issues:[e.message]};}},
    async backgroundAccounts(user){return call('scope_background_accounts','?user_id=eq.'+user+'&select=family,enabled,settings,next_run_at,last_run_at,last_status,last_error');},
    async setBackground(user,family,enabled,settings){return call('rpc/scope_set_background','',{p_user:user,p_family:family,p_enabled:enabled,p_settings:settings},true);},
    async claimBackgroundJob(id,token){return call('rpc/scope_claim_background_job','',{p_id:id,p_token:token},true);},
    async finishBackgroundJob(id,state,delay,result){return call('rpc/scope_finish_background_job','',{p_id:id,p_state:state,p_delay:delay,p_result:result},true);},
    async readCalibration(user,family){const p=await call('scope_calibration_models','?user_id=eq.'+user+'&family=eq.'+family+'&select=artifact');return p?.[0]?.artifact||null;},
    async saveCalibration(user,family,artifact){return call('scope_calibration_models','?on_conflict=user_id,family',[{user_id:user,family,artifact,updated_at:new Date().toISOString()}]);},
    async readPredictions(user,family){return call('scope_predictions','?user_id=eq.'+user+'&family=eq.'+family+'&settled_at=not.is.null&order=event_time.desc&limit=5000&select=event_id,event_time,forecasted_at,probability,selection,outcome,settled_at');},
    async recordPrediction(user,pick){const k=require('./ticket-store').hash(require('../assets/tracking-model').key(pick));return call('rpc/scope_record_prediction','',{p_user:user,p_family:pick.family,p_key:k,p_event:pick.rawEventId,p_time:new Date(pick.time).toISOString(),p_forecast:pick.forecastAt||new Date().toISOString(),p_probability:Math.max(.000001,Math.min(.999999,pick.probability)),p_model:pick.modelVersion||'history-goals-v1',p_selection:pick},true);},
    async recordPredictions(user,picks){const T=require('./ticket-store'),M=require('../assets/tracking-model');return picks.length?call('scope_predictions','?on_conflict=user_id,family,forecast_key',picks.map(p=>({user_id:user,family:p.family,forecast_key:T.hash(M.key(p)),event_id:p.rawEventId,event_time:new Date(p.time).toISOString(),forecasted_at:p.forecastAt||new Date().toISOString(),probability:Math.max(.000001,Math.min(.999999,p.probability)),model_version:p.modelVersion||'history-goals-v1',selection:p})),false,true):true;},
    async settlePrediction(user,pick,update){return call('rpc/scope_set_prediction_outcome','',{p_user:user,p_family:pick.family,p_key:require('./ticket-store').hash(require('../assets/tracking-model').key(pick)),p_outcome:update},true);},
    async enqueueTicket(user,ticket,next){if(next===undefined){const pending=ticket.picks.filter(p=>!['won','lost','void'].includes(p.status));next=pending.length?Math.min(...pending.map(p=>p.time>Date.now()+120000?p.time-60000:Date.now())):Date.now();}return call('scope_tracking_queue','?on_conflict=user_id,ticket_id',[{user_id:user,ticket_id:require('./ticket-store').hash(ticket.id),payload:ticket,next_check_at:new Date(next).toISOString(),updated_at:new Date().toISOString()}]);},
    async trackingQueue(user){return call('scope_tracking_queue','?user_id=eq.'+user+'&next_check_at=lte.'+encodeURIComponent(new Date().toISOString())+'&order=next_check_at.asc&limit=8&select=ticket_id,payload');},
    async dropTracking(user,ticketId){return call('rpc/scope_drop_tracking','',{p_user:user,p_ticket:ticketId},true);},
    async saveSource(id,metadata){return call('scope_data_sources','?on_conflict=source_id',[{source_id:id,family:'Real',metadata,updated_at:new Date().toISOString()}]);},
    async saveFacts(source,provider,rows){return rows.length?call('scope_match_facts','?on_conflict=provider,match_id',rows.map(r=>({source_id:source,provider,match_id:r.matchId,played_at:r.playedAt,home_id:r.homeId,away_id:r.awayId,competition_id:r.competitionId||null,season_id:r.seasonId||null,facts:r,updated_at:new Date().toISOString()}))):true;},
    async readFacts(provider,id,limit=100){return call('scope_match_facts','?provider=eq.'+encodeURIComponent(provider)+'&or=(home_id.eq.'+encodeURIComponent(id)+',away_id.eq.'+encodeURIComponent(id)+')&order=played_at.desc&limit='+Math.min(100,limit)+'&select=facts');},
    async saveFeatures(source,digest,rows){return rows.length?call('scope_training_features','?on_conflict=source_id,dataset_digest,match_id',rows.map(r=>({source_id:source,dataset_digest:digest,match_id:r.matchId,played_at:r.playedAt,history_latest_at:r.historyLatestAt,features:{version:1,homeId:r.homeId,awayId:r.awayId,values:r.values},labels:r.labels}))):true;},
    async saveTrainingRun(run){const {models,...registry}=run;return call('scope_training_runs','?on_conflict=id',[{id:run.id,dataset_digest:run.datasetDigest,status:'research-only',registry:{...registry,models:models.map(({estimator,...m})=>({...m,estimatorType:estimator.type}))},trained_at:run.trainedAt}]);},
    async readIngestion(id){const p=await call('scope_ingestion_runs','?id=eq.'+encodeURIComponent(id)+'&select=progress');return p?.[0]?.progress||null;},
    async saveIngestion(id,provider,progress){return call('scope_ingestion_runs','?on_conflict=id',[{id,provider,progress,updated_at:new Date().toISOString()}]);},
    async repairQueue(after=''){return call('rpc/scope_history_repair_queue','',{p_after:after,p_limit:2},true);},
    async reserveProviderCall(){return call('rpc/scope_reserve_provider_call','',{p_provider:'API-Football'},true);},
    async saveAvailability(rows){return rows.length?call('scope_availability','?on_conflict=provider,fixture_id,team_id,player_id,kind',rows):true;},
    async saveSourceBlob(object,bytes){
      if(!/^wyscout-pappalardo-2019-v1\/[a-f0-9]{16}\/[A-Za-z0-9_.-]+$/.test(object))throw Error('Unexpected source archive key.');
      const headers={apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/octet-stream','x-upsert':'true'};
      const r=await fetcher(new URL('/storage/v1/object/scope-source-archive/'+object,base),{method:'POST',headers,body:bytes,signal:AbortSignal.timeout(20000),redirect:'error'});if(!r.ok)throw Error('Source archive upload failed ('+r.status+').');return true;
    },
    async readWorkspace(user){return call('scope_workspace','?user_id=eq.'+encodeURIComponent(user)+'&select=component,payload,revision,updated_at');},
    async saveWorkspace(user,component,payload,revision){
      // This invoker-rights RPC uses optimistic revisions to prevent device overwrites.
      await call('rpc/scope_save_workspace','',{p_user:user,p_component:component,p_payload:payload,p_revision:revision});return revision+1;
    },
    async readTickets(owner,cursor=''){return call('scope_tickets','?owner_id=eq.'+owner+(cursor?'&ticket_id=gt.'+cursor:'')+'&order=ticket_id.asc&limit=100&select=ticket_id,payload');},
    async readOneTicket(owner,id){const p=await call('scope_tickets','?owner_id=eq.'+owner+'&ticket_id=eq.'+id+'&select=payload&limit=1');return p?.[0]?.payload||null;},
    async saveTicket(owner,id,ticket){return call('scope_tickets','?on_conflict=owner_id,ticket_id',[{owner_id:owner,ticket_id:id,payload:ticket,updated_at:new Date().toISOString()}]);},
    async saveTickets(owner,tickets){return call('scope_tickets','?on_conflict=owner_id,ticket_id',tickets.map(t=>({owner_id:owner,ticket_id:require('./ticket-store').hash(t.id),payload:t,updated_at:new Date().toISOString()})));},
    async saveVerifiedResult(r){return call('scope_observations','?on_conflict=family,provider,observation_id',[{family:r.family,provider:'SportyBet official results',observation_id:r.id,provider_match_id:r.id,played_at:new Date(r.time).toISOString(),home_key:r.homeId,away_key:r.awayId,measurements:{ft:r.ft,ht:r.ht},provenance:{source:r.sourceUrl,retrieved_at:new Date().toISOString()}}]);},
    async readTeam(id){const p=await call('scope_team_history','?team_id=eq.'+encodeURIComponent(id)+'&select=snapshot');return p?.[0]?.snapshot||null;},
    async saveTeam(value,changed=value.records){
      await call('scope_team_history','?on_conflict=team_id',[{team_id:value.id,family:'Real',snapshot:value,updated_at:value.retrievedAt}]);
      const observations=changed.map(r=>({family:'Real',provider:'SportyBet',observation_id:r.id,provider_match_id:r.id,played_at:new Date(r.time).toISOString(),home_key:r.homeId,away_key:r.awayId,measurements:{ft:r.ft,ht:r.ht},provenance:{source:value.sourceUrl,retrieved_at:value.retrievedAt}}));
      for(let i=0;i<observations.length;i+=100)await call('scope_observations','?on_conflict=family,provider,observation_id',observations.slice(i,i+100));return true;
    },
    async saveModel(id,family,data){return call('scope_models','?on_conflict=id',[{id,family,model:data,trained_at:new Date().toISOString()}]);},
    async hasModel(id){const rows=await call('scope_models','?id=eq.'+encodeURIComponent(id)+'&select=id&limit=1');return Boolean(rows?.length);},
    async listArchiveChunks(prefix){return call('scope_models','?id=like.'+encodeURIComponent(prefix+'*')+'&select=id&limit=1000');},
    async saveModels(rows){return call('scope_models','?on_conflict=id',rows.map(r=>({id:r.id,family:r.family,model:r.model,trained_at:new Date().toISOString()})));},
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
