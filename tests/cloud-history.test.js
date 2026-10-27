'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{owner,sanitize,hash}=require('../lib/ticket-store'),{createHandler}=require('../api/tickets'),{createStore}=require('../lib/knowledge-store');
const p={family:'Real',rawEventId:'sr:match:1',marketId:'18',specifier:'total=1.5',outcomeId:'12',odds:1.3,status:'pending',probability:.8,voidProbability:0};
function ticket(){return {id:'Real|Real|sr:match:1|18|total=1.5|12',family:'Real',createdAt:Date.now(),picks:[p],code:'ABC123'};}
function run(handler,method,token='a'.repeat(64),body,query={},origin){return new Promise(resolve=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){resolve({status:this.statusCode,body:JSON.parse(s),headers:this.headers});}};handler({method,headers:{host:'localhost',...(token?{authorization:'Bearer '+token}:{}),...(origin?{origin}:{})},body,query},res);});}
test('Cloud tickets validate identities, keep 30-leg limit and discard arbitrary payload fields',()=>{
 const clean=sanitize({...ticket(),serviceKey:'never-save',picks:[{...p,arbitrary:'discard'}]});assert.equal(clean.id,ticket().id);assert.equal(clean.serviceKey,undefined);assert.equal(clean.picks[0].arbitrary,undefined);assert.equal(clean.picks[0].probability,.8);
 assert.throws(()=>sanitize({...ticket(),id:'other'}),/identity/);assert.throws(()=>sanitize({...ticket(),picks:[p,p]}),/duplicate/);assert.throws(()=>sanitize({...ticket(),picks:Array(31).fill(p)}),/30/);assert.throws(()=>sanitize({...ticket(),picks:[{...p,family:'vFootball'}]}));
 assert.notEqual(owner({authorization:'Bearer '+'a'.repeat(64)}),owner({authorization:'Bearer '+'b'.repeat(64)}));assert.throws(()=>owner({}));
});
test('Private ticket API scopes backups by hashed recovery key and supports restore pagination',async()=>{
 const rows=new Map(),db={configured:true,async saveTicket(o,id,payload){rows.set(o+id,{ticket_id:id,payload});},async readTickets(o,cursor){return [...rows].filter(([k,v])=>k.startsWith(o)&&(!cursor||v.ticket_id>cursor)).map(([,v])=>v);}},handler=createHandler(db);
 const saved=await run(handler,'POST','a'.repeat(64),ticket());assert.equal(saved.status,200);assert.equal(rows.size,1);assert.equal([...rows.keys()][0].includes('a'.repeat(64)),false);
 const own=await run(handler,'GET');assert.equal(own.body.tickets.length,1);assert.equal(own.body.tickets[0].code,'ABC123');assert.equal((await run(handler,'GET','b'.repeat(64))).body.tickets.length,0);
 assert.equal((await run(handler,'GET','')).status,401);assert.equal((await run(handler,'GET',undefined,undefined,{cursor:'bad'})).status,400);assert.equal((await run(handler,'POST',undefined,ticket(),{},'https://elsewhere.example')).status,403);
 const paging=createHandler({...db,async readTickets(){return Array.from({length:100},(_,i)=>({ticket_id:hash(String(i)),payload:ticket()}));}});assert.match((await run(paging,'GET')).body.nextCursor,/^[a-f0-9]{64}$/);
});
test('Disconnected and failed cloud storage leave local-only mode explicit',async()=>{
 const none=await run(createHandler({configured:false}),'GET');assert.equal(none.body.configured,false);assert.equal(none.status,200);
 const fail=await run(createHandler({configured:true,readTickets:async()=>{throw Error('private secret must not leak');}}),'GET');assert.equal(fail.status,503);assert.doesNotMatch(JSON.stringify(fail.body),/private secret/);assert.match(fail.body.error,/local tickets/);
});
test('Supabase secret keys use only apikey; legacy JWT service roles retain Authorization',async()=>{
 for(const modern of [true,false]){const key=modern?'sb_secret_test':'legacy-test-jwt',store=createStore({SUPABASE_URL:'https://test.supabase.co',[modern?'SUPABASE_SECRET_KEY':'SUPABASE_SERVICE_ROLE_KEY']:key},async(url,opts)=>{assert.equal(opts.headers.apikey,key);assert.equal(opts.headers.Authorization,modern?undefined:'Bearer '+key);assert.match(String(url),/owner_id=eq\.[a-f0-9]{64}/);return new Response('[]');});await store.readTickets(hash('owner'));assert.equal(store.status(),'connected');}
});
