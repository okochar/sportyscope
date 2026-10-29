'use strict';
const {createHash}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
function owner(headers){const token=/^Bearer ([a-f0-9]{64})$/.exec(headers.authorization||'')?.[1];if(!token)throw Error('A private history key is required.');return hash('scope-tickets-v1:'+token);}
function sanitize(t){
  if(!t||!['Real','vFootball','Scheduled','Instant'].includes(t.family)||!Array.isArray(t.picks)||t.picks.length<1||t.picks.length>50)throw Error('Save 1–50 selections in one product.');
  if(!Number.isFinite(t.createdAt)||t.createdAt<0||t.createdAt>Date.now()+60000)throw Error('Invalid ticket date.');
  const seen=new Set(),text=(v,max=300)=>typeof v==='string'?v.slice(0,max):'';
  const picks=t.picks.map(p=>{
    const selection=p&&[p.rawEventId,p.marketId,p.specifier||'',p.outcomeId].join('|');
    if(!p||p.family!==t.family||typeof p.rawEventId!=='string'||!/^[-A-Za-z0-9:]{1,90}$/.test(p.rawEventId)||seen.has(selection)||!(p.odds===null&&p.priceUnavailable===true)&&(!Number.isFinite(p.odds)||p.odds<1.01||p.odds>100000))throw Error('Invalid or duplicate saved selection.');seen.add(selection);
    if(![p.marketId,p.outcomeId].every(v=>typeof v==='string'&&/^[-A-Za-z0-9:]{1,90}$/.test(v))||typeof p.specifier!=='string'||p.specifier.length>200)throw Error('Invalid saved selection.');
    const clean={family:p.family,rawEventId:p.rawEventId,marketId:p.marketId,outcomeId:p.outcomeId,specifier:p.specifier,odds:p.odds};
    for(const k of ['eventId','event','home','away','market','outcome','source','sourceKind','roundId','evidenceMode','forecastAt','addedAt','reason','modelVersion'])clean[k]=text(p[k],k==='reason'?1000:300);
    for(const k of ['probability','voidProbability','baseProbability'])if(Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1)clean[k]=p[k];
    if(p.priceUnavailable===true)clean.priceUnavailable=true;
    if(Number.isFinite(p.time))clean.time=p.time;
    // Cloud payloads are personal backups, never evidence for shared model training.
    clean.status=['pending','won','lost','void','unverified'].includes(p.status)?p.status:'pending';clean.note=text(p.note,500);
    if(p.result?.id&&Array.isArray(p.result.ft)&&p.result.ft.length===2&&p.result.ft.every(n=>Number.isInteger(n)&&n>=0&&n<100))clean.result={id:text(p.result.id,90),ft:p.result.ft,source:text(p.result.source,300)};
    if(typeof p.verifiedAt==='string')clean.verifiedAt=text(p.verifiedAt,40);
    if(typeof p.checkedAt==='string')clean.checkedAt=text(p.checkedAt,40);
    if(p.live?.eventId===p.rawEventId&&p.live.family===p.family&&['live','scheduled','finished'].includes(p.live.state)&&Number.isFinite(Date.parse(p.live.observedAt))){const l=p.live;clean.live={eventId:p.rawEventId,family:p.family,state:l.state,phase:text(l.phase,40),score:Array.isArray(l.score)&&l.score.length===2&&l.score.every(n=>Number.isInteger(n)&&n>=0&&n<100)?l.score:null,clock:/^\d{1,3}:\d{2}$/.test(l.clock||'')?l.clock:null,kickoff:Number.isFinite(l.kickoff)?l.kickoff:null,observedAt:l.observedAt,source:text(l.source),stale:Boolean(l.stale)};}
    return clean;
  });
  const id=t.family+'|'+picks.map(p=>[p.family,p.rawEventId,p.marketId,p.specifier,p.outcomeId].join('|')).sort().join('~');
  if(t.id!==id)throw Error('Ticket identity does not match its selections.');
  return {id,family:t.family,createdAt:t.createdAt,updatedAt:Number.isFinite(t.updatedAt)?Math.min(Date.now(),t.updatedAt):t.createdAt,code:/^[A-Z0-9]{4,16}$/.test(t.code||'')?t.code:'',footballSubset:Boolean(t.footballSubset),generatedBy:text(t.generatedBy,40),picks};
}
module.exports={owner,hash,sanitize};
