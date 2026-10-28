'use strict';
const {json}=require('../lib/upstream'),results=require('../lib/results'),{store}=require('../lib/knowledge-store');
module.exports=async(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{ok:false,error:'POST only.'});}
  let picks;try{const b=typeof req.body==='string'?JSON.parse(req.body):req.body;picks=b?.picks;if(!Array.isArray(picks)||!picks.length||picks.length>50)throw Error('Track 1–50 selections at a time.');for(const p of picks)if(!['Real','vFootball','Instant','Scheduled'].includes(p.family)||typeof p.rawEventId!=='string'||p.rawEventId.length>90||typeof p.marketId!=='string'||p.marketId.length>90||typeof p.outcomeId!=='string'||p.outcomeId.length>90||typeof p.specifier!=='string'||p.specifier.length>200)throw Error('Invalid tracked selection.');}catch(e){return json(res,400,{ok:false,error:e.message});}
  let index=0;const updates=new Array(picks.length);
  await Promise.all(Array.from({length:Math.min(4,picks.length)},async()=>{while(index<picks.length){const i=index++,p=picks[i],base={key:[p.family,p.rawEventId,p.marketId,p.specifier,p.outcomeId].join('|'),checkedAt:new Date().toISOString()};
    if(!['Real','vFootball'].includes(p.family)){updates[i]={...base,status:'unverified',note:'This product’s completed-round results are not connected. No outcome is inferred.'};continue;}
    if(!/^sr:match:\d+$/.test(p.rawEventId)){updates[i]={...base,status:'unverified',note:'A provider match identifier is missing.'};continue;}
    try{const r=await results.eventResult(p.rawEventId,p.family);if(!r){updates[i]={...base,status:'pending',note:'No completed regular-time result verified yet.'};continue;}updates[i]={...base,...results.settle(p,r),result:r};if(store.configured)try{await store.saveVerifiedResult(r);}catch{}}catch{updates[i]={...base,status:'pending',note:'Result source unavailable; will retry.'};}
  }}));return json(res,200,{ok:true,updates,note:'Calculated from verified regular-time scores. This is research tracking, not an official account payout or settlement statement.'});
};
