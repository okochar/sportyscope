'use strict';
const {json,fail}=require('../lib/upstream'),service=require('../lib/research-service'),{store}=require('../lib/knowledge-store'),{auth,sameOrigin}=require('../lib/account');
module.exports=async(req,res)=>{
  if(req.method==='GET'&&req.query?.view==='validation'){try{const user=await auth.user(req);if(!user)return json(res,401,{ok:false,error:'Sign in to check independently recorded prediction evidence.'});if(!require('../assets/analysis').families.includes(req.query.family))return json(res,400,{ok:false,error:'Choose a valid category.'});return json(res,200,{ok:true,...await require('../lib/recommendation-validation').load(store,user.id,req.query.family)});}catch(e){return fail(res,e);}}

  if(req.method==='GET'&&req.query?.view==='training'){
    try{const ml=require('../lib/real-ml'),rich=require('../lib/rich-bootstrap'),progress=store.configured?await store.readIngestion(rich.id):null;return json(res,200,{ok:true,...ml.summary(),storage:progress,currentProvider:{configured:require('../lib/current-football-data').configured(),dailyBudget:90,freeSeasonRestrictions:true}});}catch(e){return fail(res,e);}
  }
  if(req.method==='POST'&&req.query?.view==='current-data'){
    if(!sameOrigin(req))return json(res,403,{ok:false,error:'Use your account from this app.'});
    try{if(!await auth.user(req))return json(res,401,{ok:false,error:'Sign in to fetch current provider data.'});const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(body?.family!=='Real')return json(res,400,{ok:false,error:'Choose a real football fixture.'});const report=await service.load(body);if(!report.event)throw Error('No verified fixture identity.');return json(res,200,{ok:true,...await require('../lib/current-football-data').sync(report.event,store)});}catch(e){return fail(res,e);}
  }
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{ok:false,error:'GET only.'});}
  try{service.validate(req.query||{});}catch(e){return json(res,400,{ok:false,error:e.message});}
  try{const report=await service.load(req.query),user=req.headers.authorization?await auth.user(req):null,validation=await require('../lib/recommendation-validation').load(store,user?.id,report.family);return json(res,200,require('../lib/recommendation-validation').attach(report,validation));}catch(e){return fail(res,e);}
};
