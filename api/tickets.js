'use strict';
const {json}=require('../lib/upstream'),{store}=require('../lib/knowledge-store'),T=require('../lib/ticket-store');
function createHandler(db=store){return async(req,res)=>{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,405,{ok:false,error:'GET or POST only.'});}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{ok:false,error:'Use history sync from this app.'});}catch{return json(res,403,{ok:false,error:'Invalid origin.'});}}
  let owner;try{owner=T.owner(req.headers);}catch(e){return json(res,401,{ok:false,error:e.message});}
  if(!db.configured)return json(res,200,{ok:true,configured:false,note:'Supabase is not connected. Tickets remain saved on this device.'});
  let ticket,cursor=req.query?.cursor||'';
  try{if(req.method==='POST'){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw||'')>64000)return json(res,413,{ok:false,error:'Ticket exceeds backup size limit.'});ticket=T.sanitize(JSON.parse(raw));}else if(cursor&&!/^[a-f0-9]{64}$/.test(cursor))throw Error('Invalid history cursor.');}catch(e){return json(res,400,{ok:false,error:e.message});}
  try{
    if(req.method==='POST'){await db.saveTicket(owner,T.hash(ticket.id),ticket);return json(res,200,{ok:true,configured:true,saved:ticket.id});}
    const rows=await db.readTickets(owner,cursor);return json(res,200,{ok:true,configured:true,tickets:rows.map(r=>r.payload),nextCursor:rows.length===100?rows.at(-1).ticket_id:null});
  }catch{return json(res,503,{ok:false,error:'Cloud history unavailable. Check Supabase variables and run both SQL migrations; local tickets are retained.'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
