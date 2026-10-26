'use strict';
const {request}=require('./upstream'),R=require('../assets/research');
function pair(s){const m=/^(\d+):(\d+)$/.exec(String(s||''));return m?[Number(m[1]),Number(m[2])]:null;}
function normalize(raw,family,now=Date.now()){
  const sport=family==='Real'?'sr:sport:1':'sr:sport:202120001',ft=pair(raw.setScore),halves=raw.gameScore?.map(pair),time=Number(raw.estimateStartTime);
  if(raw.sport?.id!==sport||!['End','Ended'].includes(raw.matchStatus)||![3,4].includes(raw.status)||!ft||!Number.isFinite(time)||time>=now||halves?.length!==2||halves.some(x=>!x)||!ft.every((g,i)=>g===halves[0][i]+halves[1][i]))return null;
  const category=raw.sport.category;
  return {id:raw.eventId,time,home:raw.homeTeamName,away:raw.awayTeamName,homeId:family+':'+category.id+':'+raw.homeTeamName,awayId:family+':'+category.id+':'+raw.awayTeamName,league:category.name,tournamentId:category.tournament.id,ft,ht:halves[0],family,source:'SportyBet official results',sourceUrl:'https://www.sportybet.com/api/ng/factsCenter/eventResultList?eventId='+encodeURIComponent(raw.eventId)};
}
async function eventResult(eventId,family,fetcher){
  const p=await request('/factsCenter/eventResultList?'+new URLSearchParams({eventId}),{fetcher}),raw=p.data?.tournaments?.flatMap(t=>t.events||[]).find(e=>e.eventId===eventId);
  return raw?normalize(raw,family):null;
}
function settle(pick,result){
  const canonical=R.canonical({id:pick.marketId,name:pick.market,specifier:pick.specifier||''},{id:pick.outcomeId,name:pick.outcome}),fn=R.settlement(canonical.market,canonical.outcome);
  if(!fn)return {status:'unverified',note:'Final score observed; this market’s settlement requires additional verified data.'};
  const first=new Set(['60','63','64','65','66','68','69','70','75','81']),second=new Set(['83','85','87','88','90','91','92']);let score=result.ft;
  if(first.has(pick.marketId))score=result.ht;
  if(second.has(pick.marketId))score=result.ht?result.ft.map((v,i)=>v-result.ht[i]):null;
  if(!score)return {status:'unverified',note:'Required period score is missing.'};
  const value=fn(...score);return value==='void'?{status:'void'}:value===true?{status:'won'}:value===false?{status:'lost'}:{status:'unverified'};
}
module.exports={pair,normalize,eventResult,settle};
