'use strict';
const {json,fail}=require('../lib/upstream'),service=require('../lib/research-service'),{store}=require('../lib/knowledge-store'),{auth,sameOrigin}=require('../lib/account');
module.exports=async(req,res)=>{
  if(req.method==='GET'&&req.query?.view==='training'){
    try{const ml=require('../lib/real-ml'),rich=require('../lib/rich-bootstrap'),progress=store.configured?await store.readIngestion(rich.id):null;return json(res,200,{ok:true,...ml.summary(),storage:progress,currentProvider:{configured:require('../lib/current-football-data').configured(),dailyBudget:90,freeSeasonRestrictions:true}});}catch(e){return fail(res,e);}
  }
  if(req.method==='POST'&&req.query?.view==='current-data'){
    if(!sameOrigin(req))return json(res,403,{ok:false,error:'Use your account from this app.'});
    try{if(!await auth.user(req))return json(res,401,{ok:false,error:'Sign in to fetch current provider data.'});const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(body?.family!=='Real')return json(res,400,{ok:false,error:'Choose a real football fixture.'});const report=await service.load(body);if(!report.event)throw Error('No verified fixture identity.');return json(res,200,{ok:true,...await require('../lib/current-football-data').sync(report.event,store)});}catch(e){return fail(res,e);}
  }
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{ok:false,error:'GET only.'});}
  try{service.validate(req.query||{});}catch(e){return json(res,400,{ok:false,error:e.message});}
  try{return json(res,200,await service.load(req.query));}catch(e){return fail(res,e);}
};
