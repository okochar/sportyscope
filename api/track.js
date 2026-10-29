'use strict';
const {json}=require('../lib/upstream'),results=require('../lib/results'),{store}=require('../lib/knowledge-store');
module.exports=async(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{ok:false,error:'POST only.'});}
  let picks;try{const b=typeof req.body==='string'?JSON.parse(req.body):req.body;picks=b?.picks;if(!Array.isArray(picks)||!picks.length||picks.length>50)throw Error('Track 1–50 selections at a time.');for(const p of picks)if(!['Real','vFootball','Instant','Scheduled'].includes(p.family)||typeof p.rawEventId!=='string'||p.rawEventId.length>90||typeof p.marketId!=='string'||p.marketId.length>90||typeof p.outcomeId!=='string'||p.outcomeId.length>90||typeof p.specifier!=='string'||p.specifier.length>200)throw Error('Invalid tracked selection.');}catch(e){return json(res,400,{ok:false,error:e.message});}
  const updates=await require('../lib/tracking').check(picks,{db:store});return json(res,200,{ok:true,updates,note:'Live scores and clocks are provider snapshots. Final outcomes require verified regular-time results; no stake is placed.'});
};
