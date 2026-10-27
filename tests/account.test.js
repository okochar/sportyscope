'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createAuth}=require('../lib/account'),{createHandler}=require('../api/account'),{config}=require('../lib/supabase-config');
const uid='12345678-1234-1234-1234-123456789abc',other='98765432-1234-1234-1234-123456789abc';
function run(handler,method='GET',body,view='',token='valid-token'){return new Promise(resolve=>handler({method,body,query:{view},headers:{host:'localhost',authorization:'Bearer '+token}},{setHeader(){},end(body){resolve({status:this.statusCode,body:JSON.parse(body)});}}));}
test('Connection diagnostics distinguish missing configuration and never publish server secrets',async()=>{
 const c=config({SUPABASE_URL:' https://test.supabase.co ',SUPABASE_SECRET_KEY:' sb_secret_private '});assert.equal(c.configured,true);assert.equal(c.key,'sb_secret_private');assert.match(config({SUPABASE_URL:c.url}).issues.join(' '),/SUPABASE_SECRET_KEY/);assert.equal(config({SUPABASE_URL:'https://supabase.com/dashboard',SUPABASE_SECRET_KEY:c.key}).configured,false);assert.equal(config({SUPABASE_URL:c.url,SUPABASE_SECRET_KEY:'sb_publishable_wrong'}).configured,false);
 const handler=createHandler({configured:true,health:async()=>({connected:true,issues:[]})},{publicConfig:()=>({url:c.url,key:'sb_publishable_public'})}),r=await run(handler);assert.equal(r.body.database.connected,true);assert.doesNotMatch(JSON.stringify(r.body),/sb_secret_private/);
});
test('Server identity comes from Supabase user verification, never decoded browser claims',async()=>{
 let calls=0;const auth=createAuth({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_private',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_public'},async(url,opts)=>{calls++;assert.match(url,/auth\/v1\/user$/);assert.equal(opts.headers.apikey,'sb_publishable_public');assert.equal(opts.headers.Authorization,'Bearer '+'a'.repeat(40));return new Response(JSON.stringify({id:uid,email:'test@example.com'}));});
 assert.equal((await auth.user({headers:{authorization:'Bearer '+'a'.repeat(40)}})).id,uid);assert.equal(await auth.user({headers:{}}),null);assert.equal(calls,1);
 const expired=createAuth({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'server'},async()=>new Response('{}',{status:401}));assert.equal(await expired.user({headers:{authorization:'Bearer '+'a'.repeat(40)}}),null);
 assert.equal(createAuth({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'server',SUPABASE_PUBLISHABLE_KEY:'sb_secret_accidental'}).publicConfig(),null);
});
test('Account workspace writes are scoped to verified account and reject stale device revisions',async()=>{
 const rows=new Map(),db={configured:true,async readWorkspace(user){return [...rows.values()].filter(r=>r.user===user);},async saveWorkspace(user,component,payload,revision){const id=user+component,old=rows.get(id);if((old?.revision||0)!==revision)throw Object.assign(Error('Workspace changed'),{code:'40001'});rows.set(id,{user,component,payload,revision:revision+1});return revision+1;}},identity={user:async req=>req.headers.authorization==='Bearer valid-token'?{id:uid,email:'user@example.com'}:req.headers.authorization==='Bearer second-token'?{id:other,email:'other@example.com'}:null},handler=createHandler(db,identity);
 assert.equal((await run(handler,'GET',undefined,'workspace','expired-token')).status,401);
 const first=await run(handler,'POST',{user_id:other,component:'slip',payload:[],revision:0});assert.equal(first.body.revision,1);assert.equal(rows.get(uid+'slip').user,uid);assert.equal(rows.has(other+'slip'),false);
 const conflict=await run(handler,'POST',{component:'slip',payload:[],revision:0});assert.equal(conflict.status,409);assert.equal((await run(handler,'GET',undefined,'workspace','second-token')).body.components.length,0);
 assert.equal((await run(handler,'POST',{component:'server-secret',payload:[],revision:0})).status,400);assert.equal((await run(handler,'POST',{component:'slip',payload:Array(31).fill({}),revision:1})).status,400);
});
