'use strict';
const analysis=require('../assets/analysis');
const research=require('../lib/research-service');
const {request,json,fail}=require('../lib/upstream');
const {validate,book,check}=require('../lib/booking');
const flights=new Map();
async function execute(body,fetcher){
  const {family,selections}=validate(body),settings=analysis.settings(body.settings);
  if(selections.length>settings.legs)throw Error('More selections supplied than requested.');
  let index=0;const picks=new Array(selections.length);
  await Promise.all(Array.from({length:Math.min(4,selections.length)},async()=>{while(index<selections.length){const i=index++,s=selections[i];
    const report=await research.load({family,eventId:s.eventId},fetcher),e=report.event;
    const row=report.comparisons.find(r=>r.marketId===s.marketId&&r.specifier===(s.specifier||'')&&r.outcomeId===s.outcomeId);
    const m=row&&{id:row.marketId,name:row.market,specifier:row.specifier,active:row.active},o=row&&{id:row.outcomeId,name:row.outcome,odds:row.odds,active:row.active};
    const pick=m&&o?analysis.candidate(e,m,o,settings,Date.now(),report):null;
    if(!pick)throw Error('A selection expired, suspended or no longer meets the analysis filters.');
    picks[i]=pick;
  }}));
  if(body.code){
    const verified=await check(body,fetcher);
    if(verified.prices.some(p=>!Number.isFinite(p.odds)||p.odds<settings.minOdds||p.odds>settings.maxOdds))throw Error('Current prices no longer meet the analysis filters.');
    if(verified.validUntil<=Date.now()+300000)throw Error('The selections are too close to kickoff; a fresh analysis is needed.');
    return {...verified,picks};
  }
  const code=await book({family,selections},fetcher);return {...code,picks};
}
async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{ok:false,error:'POST only.'});}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{ok:false,error:'Use automatic booking from this app.'});}catch{return json(res,403,{ok:false,error:'Invalid origin.'});}}
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;validate(body);analysis.settings(body.settings);}catch(e){return json(res,400,{ok:false,error:e.message});}
  const key=analysis.fingerprint(body.family,body.selections.map(s=>({...s,rawEventId:s.eventId})))+'|'+JSON.stringify(analysis.settings(body.settings))+'|'+(body.code||'');
  try{
    if(!flights.has(key)){const job=execute(body);flights.set(key,job);job.finally(()=>flights.delete(key)).catch(()=>{});}
    return json(res,200,await flights.get(key));
  }catch(e){return fail(res,e);}
}
module.exports=handler;module.exports.execute=execute;
