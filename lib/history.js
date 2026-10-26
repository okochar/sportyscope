'use strict';
const {request}=require('./upstream');
const {store}=require('./knowledge-store');
const cache=new Map(),pending=new Map();
const WINDOW_DAYS=1096;
function score(value){const m=/^(\d+)\s*:\s*(\d+)$/.exec(value||'');return m?[Number(m[1]),Number(m[2])]:null;}
function normalize(raw,asOf=Date.now()){
  const ft=score(raw.eventScore),ht=score(raw.eventGameScore?.[0]),time=Number(raw.fixtureStartTime);
  // A returned score alone is not proof a fixture finished. Exclude extra time/penalty games
  // until regular-time score semantics can be verified for those result types.
  if(raw.fixtureSportId!=='sr:sport:1'||raw.eventStatus!=='Finished'||raw.eventMatchStatus!=='Ended'||raw.eventPlayedTime!=='90:00'||!ft||!Number.isFinite(time)||time>=asOf||!/^sr:competitor:\d+$/.test(raw.fixtureHomeTeamId||'')||!/^sr:competitor:\d+$/.test(raw.fixtureAwayTeamId||''))return null;
  return {id:raw.eventId,time,homeId:raw.fixtureHomeTeamId,awayId:raw.fixtureAwayTeamId,home:raw.fixtureHomeTeamName,away:raw.fixtureAwayTeamName,league:raw.fixtureTournamentName,tournamentId:raw.fixtureTournamentId,ft,ht:ht&&ht.every((v,i)=>v<=ft[i])?ht:null};
}
async function team(id,{fetcher,now=Date.now()}={}){
  if(!/^sr:competitor:\d+$/.test(id))throw Error('A verified real-football team identifier is required.');
  const hit=cache.get(id);if(!fetcher&&hit&&now-hit.at<900000)return hit.value;
  if(!fetcher&&pending.has(id))return pending.get(id);
  const task=(async()=>{
    if(!fetcher&&store.configured){try{const saved=await store.readTeam(id),age=now-new Date(saved?.retrievedAt||0).getTime();if(saved?.id===id&&saved.complete&&Array.isArray(saved.records)&&age>=0&&age<900000){cache.set(id,{at:now,value:saved});return {...saved,storage:'Supabase'};}}catch{}}
    const base='/factsCenter/teams/'+encodeURIComponent(id);
    const [details,tournaments]=await Promise.all([request(base,{fetcher}),request(base+'/tournaments',{fetcher})]);
    if(details.data?.radarId!==id||!Array.isArray(tournaments.data))throw Error('Team identity or tournament schema changed.');
    const ids=tournaments.data.map(t=>t.radarId).filter(x=>/^sr:tournament:\d+$/.test(x));
    if(!ids.length)throw Error('SportyBet returned no history tournaments for this team.');
    const cutoff=now-WINDOW_DAYS*86400000,records=[],seen=new Set(),cursors=new Set(),sources=[];
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
      // The official cursor is reverse chronological. Only stop at the window if the
      // entire last page is older, so one out-of-order item cannot truncate history.
      if(windowReached&&data.data.length&&data.data.every(r=>Number(r.fixtureStartTime)<cutoff))break;
      if(more){if(!data.flag||cursors.has(data.flag)||(!fresh&&!windowReached))throw Error('History cursor repeated; completeness is unknown.');cursors.add(data.flag);flag=data.flag;}
    }
    records.sort((a,b)=>a.time-b.time);
    const value={id,name:details.data.displayName||details.data.name,records,pages,windowDays:WINDOW_DAYS,complete:true,hasOlderHistory:more,rejectedRecords:rejected,tournaments:tournaments.data.map(t=>({id:t.radarId,name:t.displayName||t.name})),source:'SportyBet team results',sourceUrl:'https://www.sportybet.com/ng/m/team-pages/sr:sport:1/'+id,retrievedAt:new Date(now).toISOString(),oldest:records[0]?.time||null,newest:records.at(-1)?.time||null,sources};
    if(!fetcher&&store.configured){try{await store.saveTeam(value);value.storage='Supabase';}catch{value.storage='Temporary cache; database write unavailable';}}else value.storage='Temporary cache; Supabase not configured';
    if(!fetcher){if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(id,{at:now,value});}return value;
  })();
  if(!fetcher){pending.set(id,task);task.finally(()=>pending.delete(id)).catch(()=>{});}return task;
}
module.exports={score,normalize,team,WINDOW_DAYS};
