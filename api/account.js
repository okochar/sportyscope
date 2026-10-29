'use strict';
const {json}=require('../lib/upstream'),{store}=require('../lib/knowledge-store'),{auth,sameOrigin}=require('../lib/account'),workspace=require('../lib/workspace');
function createHandler(db=store,identity=auth){return async(req,res)=>{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,405,{ok:false,error:'GET or POST only.'});}
  if(!sameOrigin(req))return json(res,403,{ok:false,error:'Use your account from this app.'});
  try{
    if(req.method==='POST'&&req.query?.view==='background-step'){
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw||'')>1024)return json(res,400,{ok:false,error:'Invalid worker request.'});const b=JSON.parse(raw);
      if(!/^[a-f0-9-]{36}$/.test(b?.jobId||'')||!/^([a-f0-9]{64})$/.test(b?.token||''))return json(res,401,{ok:false,error:'Invalid worker capability.'});
      const job=await db.claimBackgroundJob(b.jobId,b.token);if(!job)return json(res,401,{ok:false,error:'Worker capability expired or was already used.'});return json(res,200,{ok:true,...await require('../lib/background').run(job,db)});
    }
    if(req.method==='GET'&&['rich-bootstrap','history-repair'].includes(req.query?.view)){if(!db.configured)return json(res,503,{ok:false,error:'Supabase server connection is required.'});const rich=require('../lib/rich-bootstrap');return json(res,200,{ok:true,...await(req.query.view==='rich-bootstrap'?rich.ensure(db,Number(req.query.cursor||0)):rich.repair(db,String(req.query.after||'')))});}
    if(req.method==='GET'&&req.query?.view==='bootstrap'){const health=await db.health();if(!health.connected)return json(res,503,{ok:false,error:health.issues.join(' ')});return json(res,200,{ok:true,...await require('../lib/archive-bootstrap').ensure(db,Number(req.query?.cursor||0))});}
    if(req.method==='GET'&&!['workspace','background'].includes(req.query?.view))return json(res,200,{ok:true,configured:db.configured,database:await db.health(),auth:identity.publicConfig()});
    if(!db.configured)return json(res,503,{ok:false,error:db.issues().join(' ')});
    const user=await identity.user(req);if(!user)return json(res,401,{ok:false,error:'Sign in to access your saved workspace.'});
    if(req.query?.view==='background'){
      if(req.method==='GET')return json(res,200,{ok:true,accounts:await db.backgroundAccounts(user.id),learning:await Promise.all(['Real','vFootball'].map(async family=>({family,artifact:await db.readCalibration(user.id,family)})))});
      const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(typeof b?.enabled!=='boolean')return json(res,400,{ok:false,error:'Choose start or pause.'});const settings=require('../assets/analysis').settings(b.settings||{});
      for(const family of ['Real','vFootball','Tracking'])await db.setBackground(user.id,family,b.enabled,family==='Tracking'?{}:{...settings,family});return json(res,200,{ok:true,enabled:b.enabled});
    }
    if(req.method==='GET')return json(res,200,{ok:true,user:{id:user.id,email:user.email},components:await db.readWorkspace(user.id)});
    const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw||'')>2500000)return json(res,413,{ok:false,error:'This workspace component is too large to save online (2.5 MB maximum). Your local copy is retained.'});
    let body,payload;try{body=JSON.parse(raw);payload=workspace.validate(body);}catch(e){return json(res,400,{ok:false,error:e.message});}
    const revision=await db.saveWorkspace(user.id,body.component,payload,body.revision);return json(res,200,{ok:true,component:body.component,revision});
  }catch(e){return json(res,e.code==='40001'?409:503,{ok:false,error:e.message});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
