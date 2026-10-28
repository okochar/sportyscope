'use strict';
const {request}=require('./upstream'),model=require('../assets/model'),history=require('./history'),research=require('../assets/research');
const capabilities={Real:{booking:true},vFootball:{booking:true},Scheduled:{booking:false},Instant:{booking:false}};
const fallback=require('./price-fallback'),legacy=require('./legacy'),undated=require('./undated-stats');
const conditions=require('../assets/conditions');
const vfootballHistory=require('./vfootball-history');
function validate(q){
  if(!Object.hasOwn(capabilities,q.family))throw Error('Choose a supported football category.');
  const pattern=['Real','vFootball'].includes(q.family)?/^sr:match:\d+$/:/^[A-Za-z0-9]{10,80}$/;
  if(!pattern.test(q.eventId||''))throw Error('A valid event identifier is required.');
  return {family:q.family,eventId:q.eventId};
}
async function load(q,fetcher){
  const {family,eventId}=validate(q),now=Date.now();
  const base={ok:true,family,eventId,analyzedAt:new Date(now).toISOString(),eligible:false,capability:capabilities[family],sources:[],issues:[],coverage:[],comparisons:[]};
  if(family==='Instant'){
    await legacy.warm();
    const [details,round]=await Promise.all([request('/instantwin/api/v2/iwqk/event/details_without_login?'+new URLSearchParams({eventId,featureCode:'6',sportId:'sr:sport:1'}),{fetcher}),request('/instantwin/api/v3/iwqk/event/prepare_round_without_login?sportId=sr:sport:1&filterTournament=true&featureCode=6&forceNew=false',{fetcher})]);
    const raw=details.events?.[0];if(!raw||raw.eventId!==eventId||!details.roundId||details.roundId!==round.roundId)throw Error('Anonymous Instant round changed. Refresh the feed.');
    const league=round.leagues?.find(l=>l.leagueId===raw.leagueId)?.name||raw.leagueId,event=model.event(raw,'Instant',{league,roundId:details.roundId,sportId:'sr:sport:1'}),archival=legacy.report(event),{markets,...identity}=event;
    return {...base,...(archival||fallback(event,'No exact Instant England team-label match exists in the 2022 archive for this fixture.')),event:identity,issues:[...(archival?.issues||fallback(event,'No usable current history source is connected.').issues),'Anonymous round only; a transferable Instant booking code has not been verified.']};
  }
  if(family==='Scheduled'){
    const endpoint='/scheduledFootball/api/v1/stats/team-stats?'+new URLSearchParams({sportId:'sr:sport:10000',eventId}),[p,active]=await Promise.all([request(endpoint,{fetcher}),request('/scheduledFootball/api/v1/event/active?sportId=sr:sport:10000',{fetcher})]),stats=p.data;
    if(!stats?.homeTeam||!stats?.awayTeam||!Array.isArray(stats.headToHead?.matches))throw Error('Scheduled statistics schema changed.');
    const event=model.scheduled(active,'upcoming').find(e=>e.rawEventId===eventId);if(!event)throw Error('Scheduled event is no longer open in the current feed.');
    const fitted=undated(event,stats),{markets,...identity}=event;
    return {...base,...(fitted||fallback(event,'Usable provider result sample is missing.')),event:identity,statistics:stats,sources:[{name:'SportyBet Scheduled Football team statistics',url:'https://www.sportybet.com/api/ng'+endpoint,retrievedAt:base.analyzedAt}],issues:['Provider recent/H2H records have no dates or unique match IDs. Small-sample estimates are exploratory; chronology, season coverage and an independent backtest cannot be established. This diagnostic does not veto selection.','Scheduled transferable booking codes have not been verified.'],coverage:[{name:'Provider form, ranks, scoring averages, recent opponents, H2H',status:'ingested',detail:'Source-reported descriptive statistics; separate from real clubs.'},{name:'Multi-season dated records, corners, shots, players, tactics',status:'missing',detail:'Not supplied by this verified statistics response.'}]};
  }
  const path='/factsCenter/event?'+new URLSearchParams({productId:'3',eventId,_t:String(now)}),p=await request(path,{fetcher}),event=model.sports(p,family)[0];
  const sportId=family==='Real'?'sr:sport:1':'sr:sport:202120001';
  if(!event||event.rawEventId!==eventId||event.sportId!==sportId)throw Error('Event identity or category changed.');
  const {markets,...identity}=event;
  base.event=identity;base.sources.push({name:'SportyBet full event markets',url:'https://www.sportybet.com/api/ng'+path,retrievedAt:base.analyzedAt});
  if(family==='vFootball'){
    try{const h=await vfootballHistory.load(event,fetcher),category=p.data.sport.category.id,scoped={...event,providerHomeId:event.homeId,providerAwayId:event.awayId,homeId:'vFootball:'+category+':'+event.home,awayId:'vFootball:'+category+':'+event.away},report=research.build(scoped,[h],now);
      if(!report.fitted)return {...base,...fallback(event,'Too few completed vFootball results exist for this pairing.')};
      const {markets,...identity}=scoped;
      report.conditions={home:conditions.counts(h.records.filter(r=>r.homeId===scoped.homeId||r.awayId===scoped.homeId).map(r=>r.homeId===scoped.homeId?[...r.ft,1]:[r.ft[1],r.ft[0],1])),away:conditions.counts(h.records.filter(r=>r.homeId===scoped.awayId||r.awayId===scoped.awayId).map(r=>r.homeId===scoped.awayId?[...r.ft,1]:[r.ft[1],r.ft[0],1])),pair:conditions.counts(report.h2h.map(r=>r.homeId===scoped.homeId?[...r.ft,1]:[r.ft[1],r.ft[0],1]))};
      report.coverage[0].detail='Completed vFootball results from its own product and league, requested over the last 14 days. Team keys are scoped league labels; provider match IDs and dates are preserved.';
      return {...base,...report,event:identity,status:'modeled',comparisons:report.markets.rows,sources:[...base.sources,{name:h.source,url:h.sourceUrl,retrievedAt:h.retrievedAt,records:h.records.length,pages:h.pages,windowDays:14}]};
    }catch(e){return {...base,...fallback(event,'vFootball history unavailable: '+e.message)};}
  }
  let teams;try{teams=await Promise.all([history.team(event.homeId,{fetcher,now}),history.team(event.awayId,{fetcher,now})]);}catch(e){return {...base,...fallback(event,'Team history request failed: '+e.message)};}
  const archive=require('./real-archive').augment(event,teams,now);teams=archive.histories;
  const report=research.build(event,teams,now);report.archive=archive.coverage;
  if(archive.coverage.records){base.sources.push({name:'OpenFootball CC0 earlier seasons · '+archive.coverage.teams.join(' / '),url:'https://github.com/openfootball/football.json/tree/'+archive.coverage.sourceCommit,retrievedAt:base.analyzedAt,records:archive.coverage.records});report.coverage.push({name:'Earlier real-football seasons',status:'ingested',detail:archive.coverage.records+' additional team appearances from OpenFootball; exact label mapping, no overlapping date duplication. Date precision is one day.'});}
  if(!report.fitted)return {...base,...fallback(event,'Too few usable historical results to fit both teams.'),sources:base.sources};
  report.conditions={home:conditions.counts(teams[0].records.map(r=>r.homeId===event.homeId?[...r.ft,1]:[r.ft[1],r.ft[0],1])),away:conditions.counts(teams[1].records.map(r=>r.homeId===event.awayId?[...r.ft,1]:[r.ft[1],r.ft[0],1])),pair:conditions.counts(report.h2h.map(r=>r.homeId===event.homeId?[...r.ft,1]:[r.ft[1],r.ft[0],1]))};
  return {...base,...report,status:report.fitted?'modeled':'insufficient',sources:[...base.sources,...teams.map(t=>({name:t.source+' · '+t.name,url:t.sourceUrl,retrievedAt:t.retrievedAt,records:t.records.length,pages:t.pages,oldest:t.oldest,newest:t.newest,windowDays:t.windowDays,hasOlderHistory:t.hasOlderHistory}))],comparisons:report.markets.rows};
}
module.exports={validate,load};
