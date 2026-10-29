'use strict';
const {request}=require('./upstream');
const {store}=require('./knowledge-store');
const cache=new Map(),pending=new Map();
const WINDOW_DAYS=1096;
const NORMALIZATION_VERSION=2;
function score(value){const m=/^(\d+)\s*:\s*(\d+)$/.exec(value||'');return m?[Number(m[1]),Number(m[2])]:null;}
function normalize(raw,asOf=Date.now()){
  const ft=score(raw.eventScore),ht=score(raw.eventGameScore?.[0]),time=Number(raw.fixtureStartTime);
  // The results feed uses both Ended and Finished and often leaves its clock null
  // or frozen before 90. Its explicit FT result is stronger evidence than that clock.
  const labels=[...(raw.displayStatus||[]),...(raw.minStatus||[])].map(x=>x.displayStatus),periods=raw.displayPeriodScores||[];
  const explicitFT=labels.includes('FT')&&periods.some(p=>p.label==='FT'&&JSON.stringify(score(p.score))===JSON.stringify(ft));
  const extended=labels.some(s=>/extra|pen|aet|ap$/i.test(s||''))||periods.some(p=>/extra|pen|aet|et$/i.test(p.label||''))||Boolean(raw.displayScoreDetail?.penaltyScore)||Number.parseInt(raw.eventPlayedTime,10)>100;
  if(raw.fixtureSportId!=='sr:sport:1'||!['Finished','Ended'].includes(raw.eventStatus)||raw.eventMatchStatus!=='Ended'||extended||(!explicitFT&&raw.eventPlayedTime!=='90:00')||!ft||!Number.isFinite(time)||time>=asOf||!/^sr:competitor:\d+$/.test(raw.fixtureHomeTeamId||'')||!/^sr:competitor:\d+$/.test(raw.fixtureAwayTeamId||''))return null;
  return {id:raw.eventId,time,homeId:raw.fixtureHomeTeamId,awayId:raw.fixtureAwayTeamId,home:raw.fixtureHomeTeamName,away:raw.fixtureAwayTeamName,league:raw.fixtureTournamentName,tournamentId:raw.fixtureTournamentId,ft,ht:ht&&ht.every((v,i)=>v<=ft[i])?ht:null};
}
async function team(id,{fetcher,now=Date.now()}={}){
  if(!/^sr:competitor:\d+$/.test(id))throw Error('A verified real-football team identifier is required.');
  const hit=cache.get(id);if(!fetcher&&hit&&now-hit.at<900000)return hit.value;
  if(!fetcher&&pending.has(id))return pending.get(id);
  const task=(async()=>{
    let saved=hit?.value;
    if(!fetcher&&store.configured){try{saved=await store.readTeam(id)||saved;const age=now-new Date(saved?.retrievedAt||0).getTime();if(saved?.normalizationVersion===NORMALIZATION_VERSION&&saved?.id===id&&saved.complete&&Array.isArray(saved.records)&&age>=0&&age<900000){cache.set(id,{at:now,value:saved});return {...saved,storage:'Supabase'};}}catch{}}
    const base='/factsCenter/teams/'+encodeURIComponent(id);
    const [details,tournaments]=await Promise.all([request(base,{fetcher}),request(base+'/tournaments',{fetcher})]);
    if(details.data?.radarId!==id||!Array.isArray(tournaments.data))throw Error('Team identity or tournament schema changed.');
    const ids=tournaments.data.map(t=>t.radarId).filter(x=>/^sr:tournament:\d+$/.test(x));
    if(!ids.length)throw Error('SportyBet returned no history tournaments for this team.');
    const retained=saved?.id===id&&saved.complete&&Array.isArray(saved.records)?saved.records:[],cutoff=now-WINDOW_DAYS*86400000,records=[],seen=new Set(),cursors=new Set(),sources=[],oldIds=new Set(retained.map(r=>r.id)),newest=retained.at(-1)?.time||0;
    let flag='',more=true,pages=0,windowReached=false,rejected=0;
    while(more){
      const params=new URLSearchParams({tournamentIds:ids.join(','),size:'50'});if(flag)params.set('flag',flag);
      const path=base+'/results?'+params;
      const p=await request(path,{fetcher}),data=p.data;
      if(!Array.isArray(data?.data)||typeof data.hasNextPage!=='boolean')throw Error('Unknown result pagination schema.');
      sources.push('https://www.sportybet.com/api/ng'+path);pages++;
      let fresh=0;
      for(const raw of data.data){
        const record=normalize(raw,now);if(!record){rejected++;continue;}
        if(record.homeId!==id&&record.awayId!==id)throw Error('History contains a different team.');
        if(record.time<cutoff){windowReached=true;continue;}
        if(!seen.has(record.id)){seen.add(record.id);records.push(record);fresh++;}
      }
      more=data.hasNextPage;
      // A previously completed import is retained. Refresh only the new pages,
      // including their score corrections, until reaching an already known page.
      if(retained.length&&data.data.length&&data.data.every(r=>oldIds.has(r.eventId)&&Number(r.fixtureStartTime)<=newest))break;
      // The official cursor is reverse chronological. Only stop at the window if the
      // entire last page is older, so one out-of-order item cannot truncate history.
      if(windowReached&&data.data.length&&data.data.every(r=>Number(r.fixtureStartTime)<cutoff))break;
      if(more){if(!data.flag||cursors.has(data.flag)||(!fresh&&!windowReached))throw Error('History cursor repeated; completeness is unknown.');cursors.add(data.flag);flag=data.flag;}
    }
    const changed=records.filter(r=>!oldIds.has(r.id)||JSON.stringify(retained.find(x=>x.id===r.id))!==JSON.stringify(r));
    const merged=new Map(retained.map(r=>[r.id,r]));for(const r of records)merged.set(r.id,r);records.splice(0,records.length,...merged.values());records.sort((a,b)=>a.time-b.time);
    const value={id,name:details.data.displayName||details.data.name,records,pages,windowDays:WINDOW_DAYS,complete:true,hasOlderHistory:more,rejectedRecords:rejected,tournaments:tournaments.data.map(t=>({id:t.radarId,name:t.displayName||t.name})),source:'SportyBet team results',sourceUrl:'https://www.sportybet.com/ng/m/team-pages/sr:sport:1/'+id,retrievedAt:new Date(now).toISOString(),oldest:records[0]?.time||null,newest:records.at(-1)?.time||null,sources};
    value.normalizationVersion=NORMALIZATION_VERSION;value.incremental=retained.length>0;value.newOrCorrectedRecords=changed.length;
    if(!fetcher&&store.configured){try{await store.saveTeam(value,changed);value.storage='Supabase';}catch{value.storage='Temporary cache; database write unavailable';}}else value.storage='Temporary cache; Supabase not configured';
    if(!fetcher){if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(id,{at:now,value});}return value;
  })();
  if(!fetcher){pending.set(id,task);task.finally(()=>pending.delete(id)).catch(()=>{});}return task;
}
module.exports={score,normalize,team,WINDOW_DAYS,NORMALIZATION_VERSION};
