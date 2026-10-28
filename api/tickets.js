'use strict';
const {json}=require('../lib/upstream'),{store}=require('../lib/knowledge-store'),T=require('../lib/ticket-store'),{auth}=require('../lib/account');
function createHandler(db=store,identity=auth){return async(req,res)=>{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,405,{ok:false,error:'GET or POST only.'});}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{ok:false,error:'Use history sync from this app.'});}catch{return json(res,403,{ok:false,error:'Invalid origin.'});}}
  if(!db.configured)return json(res,200,{ok:true,configured:false,note:'Supabase is not connected. Tickets remain saved on this device.'});
  let owner;try{const user=await identity.user(req);if(!user)return json(res,401,{ok:false,error:'Sign in to access your saved tickets.'});owner=user.owner;}catch(e){return json(res,503,{ok:false,error:e.message});}
  let ticket,migration,cursor=req.query?.cursor||'';
  try{if(req.method==='POST'){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw||'')>256000)return json(res,413,{ok:false,error:'Ticket exceeds backup size limit.'});const body=JSON.parse(raw);if(body.action==='migrate_legacy'){migration=T.owner({authorization:'Bearer '+body.legacyKey});cursor=body.cursor||'';if(cursor&&!/^[a-f0-9]{64}$/.test(cursor))throw Error('Invalid history cursor.');}else ticket=T.sanitize(body);}else if(cursor&&!/^[a-f0-9]{64}$/.test(cursor))throw Error('Invalid history cursor.');}catch(e){return json(res,400,{ok:false,error:e.message});}
  try{
    if(migration){const rows=await db.readTickets(migration,cursor);for(let i=0;i<rows.length;i+=20)await db.saveTickets(owner,rows.slice(i,i+20).map(r=>T.sanitize(r.payload)));return json(res,200,{ok:true,configured:true,migrated:rows.length,nextCursor:rows.length===100?rows.at(-1).ticket_id:null});}
    if(req.method==='POST'){await db.saveTicket(owner,T.hash(ticket.id),ticket);return json(res,200,{ok:true,configured:true,saved:ticket.id});}
    const rows=await db.readTickets(owner,cursor);return json(res,200,{ok:true,configured:true,tickets:rows.map(r=>r.payload),nextCursor:rows.length===100?rows.at(-1).ticket_id:null});
  }catch{return json(res,503,{ok:false,error:'Cloud history unavailable. Check Supabase variables and apply the current database setup SQL; local tickets are retained.'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
