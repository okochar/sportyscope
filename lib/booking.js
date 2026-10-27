'use strict';
const {request, FeedError} = require('./upstream');
const key = s => [s.eventId, String(s.marketId), s.specifier || '', String(s.outcomeId)].join('|');
function validate(body) {
  if (!body || !['Real','vFootball'].includes(body.family) || !Array.isArray(body.selections) || !body.selections.length || body.selections.length > 30) throw new FeedError('Choose 1–30 fetched selections from one supported category (real football or vFootball).');
  const seen = new Set();
  const selections = body.selections.map(s => {
    if (!s || !/^sr:match:\d+$/.test(s.eventId || '') || !/^\d+$/.test(s.marketId || '') || !/^\d+$/.test(s.outcomeId || '') || (s.specifier !== undefined && typeof s.specifier !== 'string') || (s.specifier || '').length > 200) throw new FeedError('Invalid selection identifiers.');
    if (seen.has(s.eventId)) throw new FeedError('Only one selection per event is supported.');
    seen.add(s.eventId);
    return {eventId:s.eventId,marketId:s.marketId,outcomeId:s.outcomeId,...(s.specifier ? {specifier:s.specifier} : {})};
  });
  return {family:body.family,selections};
}
function verify(data, selections, family) {
  if (!data || data.isAvailable === false || data.unavailableOutcomes?.length) throw new FeedError('SportyBet reported unavailable selections. Refresh and review the slip.');
  const actual = data.ticket?.selections;
  if (!Array.isArray(actual) || actual.length !== selections.length || !selections.every(s => actual.some(a => key(a) === key(s)))) throw new FeedError('SportyBet booking readback did not match all requested selections. No code will be shown.');
  const sport = family === 'Real' ? 'sr:sport:1' : 'sr:sport:202120001';
  if (actual.some(s => s.sportId !== sport)) throw new FeedError('SportyBet returned selections from a different category.');
  if (Array.isArray(data.outcomes)) for(const s of selections){
    const e=data.outcomes.find(e=>e.eventId===s.eventId),m=e?.markets?.find(m=>String(m.id)===String(s.marketId)&&(m.specifier||'')===(s.specifier||'')),o=m?.outcomes?.find(o=>String(o.id)===String(s.outcomeId));
    if(!e||e.banned||!m||m.banned||!o||[false,0,'0'].includes(o.isActive)||(m.status!==undefined&&![0,'0'].includes(m.status)))throw new FeedError('SportyBet reports a suspended or unavailable booked outcome.');
  }
}
function result(data,code){
  const starts=(data.outcomes||[]).map(e=>Number(e.estimateStartTime)).filter(t=>Number.isFinite(t)&&t>0);
  const validUntil=Math.min(Number(data.deadline)||Infinity,...starts,Date.now()+86400000);
  const prices=data.ticket.selections.map(s=>{const e=data.outcomes?.find(e=>e.eventId===s.eventId),m=e?.markets?.find(m=>String(m.id)===String(s.marketId)&&(m.specifier||'')===(s.specifier||'')),o=m?.outcomes?.find(o=>String(o.id)===String(s.outcomeId));return {eventId:s.eventId,marketId:String(s.marketId),specifier:s.specifier||'',outcomeId:String(s.outcomeId),odds:o?Number(o.odds):null};});
  return {ok:true,code,url:'https://www.sportybet.com/ng/m/?shareCode='+encodeURIComponent(code),verifiedAt:new Date().toISOString(),deadline:data.deadline,validUntil,selections:data.ticket.selections,prices,note:'Issued by SportyBet; every selection matched on load-back. No bet was placed. Prices and availability may change.'};
}
async function loadCode(code,fetcher){
  code=String(code||'').trim().toUpperCase();if(!/^[A-Z0-9]{4,16}$/.test(code))throw new FeedError('Enter a SportyBet booking code containing 4–16 letters or digits.');
  const p=await request('/orders/share/'+encodeURIComponent(code)+'?_t='+Date.now(),{fetcher}),d=p.data;
  if(p.isAvailable===false||d?.shareCode!==code)throw new FeedError('SportyBet could not load this code. It may be unavailable or expired.');
  const sports=new Set(d.ticket?.selections?.map(s=>s.sportId)),family=sports.size===1&&sports.has('sr:sport:1')?'Real':sports.size===1&&sports.has('sr:sport:202120001')?'vFootball':null;
  if(!family)throw new FeedError('This code contains a category or mixed products not supported by this football workspace.');
  const {selections}=validate({family,selections:d.ticket.selections.map(s=>({...s,specifier:s.specifier||''}))});verify(d,selections,family);
  const model=require('../assets/model'),events=model.sports({data:d.outcomes},family);
  const slip=selections.map(s=>{const e=events.find(e=>e.rawEventId===s.eventId),m=e?.markets.find(m=>m.id===String(s.marketId)&&(m.specifier||'')===(s.specifier||'')),o=m?.outcomes.find(o=>o.id===String(s.outcomeId));if(!e||!m||!o||!Number.isFinite(o.odds))throw new FeedError('SportyBet did not supply complete prices and names for every selection.');return {identifier:[e.id,m.id,m.specifier,o.id].join('::'),eventId:e.id,rawEventId:e.rawEventId,family,source:e.origin,event:e.home+' vs '+e.away,market:m.name,marketId:m.id,specifier:m.specifier||'',outcomeId:o.id,outcome:o.name,odds:o.odds,sourceKind:'api',roundId:'',addedAt:new Date().toISOString()};});
  return {...result(d,code),family,slip};
}
async function check(body,fetcher){
  const {family,selections}=validate(body),code=body.code;
  if(!/^[A-Z0-9]{4,16}$/.test(code||''))throw new FeedError('A SportyBet booking code is required.');
  const loaded=await request('/orders/share/'+encodeURIComponent(code)+'?_t='+Date.now(),{fetcher});
  if(loaded.isAvailable===false||loaded.data?.shareCode!==code)throw new FeedError('SportyBet could not validate this booking code.');
  verify(loaded.data,selections,family);return result(loaded.data,code);
}
async function book(body, fetcher) {
  const {family,selections} = validate(body);
  const issued = await request('/orders/share?throwInvalidEvent=true',{body:{selections},fetcher});
  const code = issued.data?.shareCode;
  if (!/^[A-Z0-9]{4,16}$/.test(code || '')) throw new FeedError('SportyBet did not issue a valid booking code.');
  verify(issued.data,selections,family);
  const loaded = await request('/orders/share/'+encodeURIComponent(code),{fetcher});
  if (loaded.data?.shareCode !== code) throw new FeedError('SportyBet returned a different booking code on readback.');
  verify(loaded.data,selections,family);
  if(issued.isAvailable===false||loaded.isAvailable===false)throw new FeedError('SportyBet reports unavailable selections.');
  return result(loaded.data,code);
}
module.exports = {validate,verify,book,check,loadCode};
