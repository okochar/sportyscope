'use strict';
// Optional server-only connector. A free provider key is never sent to the browser.
const crypto=require('node:crypto'),{canonical}=require('./real-archive');
const SOURCE='api-football-v3',PROVIDER='API-Football';
function configured(env=process.env){return Boolean(env.API_FOOTBALL_KEY?.trim());}
function createClient(db,env=process.env,fetcher=fetch){
 async function get(path,ttl=86400000){
  if(!configured(env))throw Error('Add API_FOOTBALL_KEY to Vercel Production to connect current injuries, lineups and match statistics.');
  const id='api-football-cache-'+crypto.createHash('sha256').update(path).digest('hex').slice(0,24),cached=await db.readIngestion(id);
  if(cached&&Date.now()-Date.parse(cached.at)<ttl)return cached.response;
  if(!await db.reserveProviderCall())throw Error('The app has reached its 90-request daily provider budget. Cached data is retained.');
  const r=await fetcher('https://v3.football.api-sports.io/'+path,{headers:{'x-apisports-key':env.API_FOOTBALL_KEY.trim()},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!r.ok)throw Error('Football data provider returned HTTP '+r.status+'.');const p=await r.json();
  if(p.errors&&Object.keys(p.errors).length)throw Error('Football data provider: '+Object.values(p.errors).join(' ').slice(0,500));
  if(!Array.isArray(p.response))throw Error('Football data provider response schema changed.');
  await db.saveIngestion(id,PROVIDER,{at:new Date().toISOString(),path,response:p.response});return p.response;
 }
 return {get};
}
function match(event,fixtures){
 const candidates=fixtures.filter(f=>canonical(f.teams?.home?.name)===canonical(event.home)&&canonical(f.teams?.away?.name)===canonical(event.away)&&Math.abs(Number(f.fixture?.timestamp)*1000-event.time)<=15*60000);
 if(candidates.length!==1)throw Error('No unique exact team-pair and kickoff match exists in this provider. No team identity was guessed.');return candidates[0];
}
function number(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
function normalizeFixture(f,statistics=[],lineups=[],observedAt=new Date().toISOString()){
 const mapping={corners:'Corner Kicks',shots:'Total Shots',shotsOnTarget:'Shots on Goal',yellowCards:'Yellow Cards',redCards:'Red Cards',fouls:'Fouls',passes:'Total passes',accuratePasses:'Passes accurate',offsides:'Offsides'};
 const row={provider:PROVIDER,sourceId:SOURCE,matchId:String(f.fixture.id),playedAt:f.fixture.date,competitionId:String(f.league.id),seasonId:String(f.league.season),country:f.league.country,league:f.league.name,regularTime:f.fixture.status.short==='FT',homeId:String(f.teams.home.id),awayId:String(f.teams.away.id),home:f.teams.home.name,away:f.teams.away.name,score:[f.score?.fulltime?.home??null,f.score?.fulltime?.away??null],halfTime:[f.score?.halftime?.home??null,f.score?.halftime?.away??null],stats:{},lineups:{},quality:{},observedAt};
 for(const side of ['home','away']){const id=f.teams[side].id,raw=statistics.find(s=>s.team?.id===id),values=new Map((raw?.statistics||[]).map(v=>[v.type,v.value])),formation=lineups.find(l=>l.team?.id===id);
  row.stats[side]=raw?Object.fromEntries(Object.entries(mapping).map(([key,label])=>[key,number(values.get(label))])):null;
  if(row.stats[side])Object.assign(row.stats[side],{events:null,accurateShots:null,crosses:null,duelsWon:null,secondYellowCards:null});
  row.lineups[side]={starters:(formation?.startXI||[]).map(p=>p.player.id),bench:(formation?.substitutes||[]).map(p=>p.player.id),formation:formation?.formation||null,coachId:formation?.coach?.id||null,knownBeforeMatch:Date.parse(observedAt)<Date.parse(f.fixture.date)};
  row.quality[side]={statisticsPresent:Boolean(raw),hasFullLineup:row.lineups[side].starters.length===11};
 }
 return row;
}
function availability(injuries,fixture,at){return injuries.filter(r=>r.fixture?.id===fixture.fixture.id&&[fixture.teams.home.id,fixture.teams.away.id].includes(r.team?.id)&&r.player?.id).map(r=>{const reason=String(r.player.reason||''),kind=/suspend|suspension|red card/i.test(reason)?'suspension':/doubt|questionable/i.test(r.player.type||'')?'doubtful':/injur|illness|surgery|fracture|concussion/i.test(reason)?'injury':'unavailable';return {provider:PROVIDER,fixture_id:String(fixture.fixture.id),team_id:String(r.team.id),player_id:String(r.player.id),kind,asserted_at:at,kickoff_at:fixture.fixture.date,known_before_match:Date.parse(at)<Date.parse(fixture.fixture.date),detail:{name:r.player.name,reason,type:r.player.type,source:'https://www.api-football.com/documentation-v3#tag/Injuries',status:'provider-reported'}};});}
async function sync(event,db,{env=process.env,fetcher=fetch}={}){
 if(event.gameType!=='Real')throw Error('Real football context cannot be used for virtual sports.');
 const client=createClient(db,env,fetcher),date=new Date(event.time).toISOString().slice(0,10),fixtures=await client.get('fixtures?'+new URLSearchParams({date,timezone:'UTC'}),3600000),f=match(event,fixtures),at=new Date().toISOString(),issues=[];
 const optional=async path=>{try{return await client.get(path,1800000);}catch(e){issues.push(e.message);return [];}};
 const [lineups,injuries]=await Promise.all([optional('fixtures/lineups?fixture='+f.fixture.id),optional('injuries?fixture='+f.fixture.id)]);
 const [home,away]=await Promise.all([optional('fixtures?team='+f.teams.home.id+'&last=20'),optional('fixtures?team='+f.teams.away.id+'&last=20')]);
 await db.saveSource(SOURCE,{provider:PROVIDER,documentation:'https://www.api-football.com/documentation-v3',retrievedAt:at,license:'Provider account terms; not an open redistribution licence',scope:'Exact real team pair and kickoff only',unknownFields:'Never filled with zero; old injury reports are not current availability.'});
 const current=normalizeFixture(f,[],lineups,at);await db.saveFacts(SOURCE,PROVIDER,[current]);await db.saveAvailability(availability(injuries,f,at));
 const previous=[...new Map([...home,...away].filter(r=>r.fixture.status.short==='FT'&&Date.parse(r.fixture.date)<Date.now()).map(r=>[r.fixture.id,r])).values()].sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)),imported=[];
 // Four uncached fixtures per sync bounds work under the function duration and
 // daily free quota. Repeated syncs resume with the next missing statistics.
 const retained=(await Promise.all([db.readFacts(PROVIDER,String(f.teams.home.id)),db.readFacts(PROVIDER,String(f.teams.away.id))])).flat().map(r=>r.facts),known=new Set(retained.filter(r=>r.stats?.home&&r.stats?.away).map(r=>r.matchId));
 for(const old of previous.filter(r=>!known.has(String(r.fixture.id))).slice(0,4)){const details=await optional('fixtures?id='+old.fixture.id),complete=details.find(r=>r.fixture?.id===old.fixture.id);if(complete?.statistics?.length){const normalized=normalizeFixture(complete,complete.statistics,complete.lineups||[],at);await db.saveFacts(SOURCE,PROVIDER,[normalized]);imported.push(normalized.matchId);}}
 const progress={at,fixtureId:String(f.fixture.id),homeId:String(f.teams.home.id),awayId:String(f.teams.away.id),lineups:lineups.reduce((n,l)=>n+(l.startXI?.length||0),0),availabilityReports:injuries.length,historicalStatsImported:imported.length,historicalStatsPending:Math.max(0,previous.length-known.size-imported.length),issues};await db.saveIngestion('current-context:'+event.rawEventId,PROVIDER,progress);return progress;
}
module.exports={configured,createClient,match,normalizeFixture,availability,sync,PROVIDER,SOURCE};
