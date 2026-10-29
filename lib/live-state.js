'use strict';
const {pair}=require('./results');
function normalize(raw,family,at=Date.now()){
 const sport=family==='Real'?'sr:sport:1':'sr:sport:202120001';if(!raw||raw.sport?.id!==sport||!/^sr:match:\d+$/.test(raw.eventId||''))return null;
 const phase=String(raw.matchStatus||''),score=pair(raw.setScore),clock=/^\d{1,3}:\d{2}$/.test(raw.playedSeconds||'')?raw.playedSeconds:null;
 const live=Number(raw.status)===1&&Boolean(score)&&['H1','H2','HT','ET','ET1','ET2','Pause','Paused','Suspended'].includes(phase),finished=['End','Ended'].includes(phase)&&[3,4].includes(Number(raw.status));
 return {eventId:raw.eventId,family,state:finished?'finished':live?'live':'scheduled',phase,score,clock,kickoff:Number(raw.estimateStartTime)||null,observedAt:new Date(at).toISOString(),source:'SportyBet event response',sourceUrl:'https://www.sportybet.com/api/ng/factsCenter/event?eventId='+encodeURIComponent(raw.eventId),stale:false};
}
module.exports={normalize};
