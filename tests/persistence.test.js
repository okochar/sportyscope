'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../assets/persistence.js'),'utf8');
async function harness(initial=[],guest={}){
 const remote=new Map(initial.map(r=>[r.component,structuredClone(r)])),cache={},elements=new Map(),storage=new Map(),timers=new Map(),intervals=[],listeners={},delays=[];let next=0,failure=null;
 const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',dataset:{},addEventListener(){}});return elements.get(id);},addEventListener(k,fn){listeners[k]=fn;}};
 const context={document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:(fn,delay)=>{delays.push(delay);timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn),AbortSignal,Date,Map,Set,JSON,Error,console,window:{addEventListener(){}},ScopeAccount:{ready:Promise.resolve(),user:()=>({id:'test-account'}),headers:async()=>({Authorization:'Bearer fixture'})},fetch:async(url,opts)=>{
  if(failure)throw failure;
  if(url.includes('view=workspace'))return new Response(JSON.stringify({ok:true,components:[...remote.values()]}));
  if(url==='/api/account'){const b=JSON.parse(opts.body),old=remote.get(b.component);if((old?.revision||0)!==b.revision)return new Response(JSON.stringify({ok:false,error:'conflict'}),{status:409});remote.set(b.component,{component:b.component,payload:b.payload,revision:b.revision+1});return new Response(JSON.stringify({ok:true,revision:b.revision+1}));}
  return new Response(JSON.stringify({ok:true,configured:true,tickets:[],nextCursor:null}));
 }};vm.createContext(context);vm.runInContext(source,context);
 for(const name of ['slip','preferences','journal','imports','review'])context.window.ScopeWorkspace.register(name,{read:()=>cache[name],cached:()=>cache[name]??null,guest:()=>guest[name]??null,empty:()=>name==='preferences'?{}:[],apply:v=>{cache[name]=v;}});
 context.window.ScopeCloud.start({all:async()=>[],restore:async()=>{},onRestore:async()=>{},onAccount:async()=>{}});
 const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};await settle();
 return {remote,cache,elements,delays,fail(){failure=Object.assign(Error('signal timed out'),{name:'TimeoutError'});},recover(){failure=null;},changed:context.window.ScopeWorkspace.changed,async tick(){const jobs=[...timers.values()];timers.clear();for(const f of jobs)f();await settle();},async refresh(){intervals[0]();await settle();}};
}
test('First sign-in automatically preserves and uploads existing guest drafts',async()=>{
 const h=await harness([],{slip:[{event:'Existing draft'}],journal:[{name:'Existing note'}]});assert.equal(h.remote.get('slip').payload[0].event,'Existing draft');assert.equal(h.remote.get('journal').payload[0].name,'Existing note');assert.match(h.elements.get('saveStatus').textContent,/Saved to Supabase/);
});
test('A new device loads existing cloud state without overwriting it with empty defaults',async()=>{
 const h=await harness([{component:'slip',payload:[{event:'Cloud draft'}],revision:5}]);assert.equal(h.cache.slip[0].event,'Cloud draft');assert.equal(h.remote.get('slip').revision,5);h.cache.slip=[{event:'Edited draft'}];h.changed('slip');await h.tick();assert.equal(h.remote.get('slip').revision,6);assert.equal(h.remote.get('slip').payload[0].event,'Edited draft');
});
test('Concurrent device edits preserve the local draft and require a conflict choice',async()=>{
 const h=await harness([{component:'slip',payload:[{event:'Original'}],revision:1}]);h.cache.slip=[{event:'Local edit'}];h.changed('slip');h.remote.set('slip',{component:'slip',payload:[{event:'Other device edit'}],revision:2});await h.tick();assert.equal(h.remote.get('slip').payload[0].event,'Other device edit');assert.equal(h.cache.slip[0].event,'Local edit');assert.match(h.elements.get('workspaceConflicts').innerHTML,/slip/);
});
test('Ticket review persists automatically and equivalent remote revisions do not create a conflict',async()=>{
 const h=await harness([{component:'review',payload:{loaded:null,legs:[],threshold:.8,analyzedAt:0},revision:1}]);h.cache.review={loaded:{code:'TEST123'},legs:[],threshold:.75,analyzedAt:1};h.changed('review');await h.tick();assert.equal(h.remote.get('review').revision,2);assert.equal(h.remote.get('review').payload.threshold,.75);
 h.cache.review={...h.cache.review};h.changed('review');h.remote.set('review',{component:'review',payload:structuredClone(h.cache.review),revision:3});await h.tick();assert.equal(h.remote.get('review').revision,3);assert.equal(h.elements.get('workspaceConflicts').innerHTML,'');
});
test('A timed-out save retains the draft, backs off, and saves it after reconnection',async()=>{
 const h=await harness([{component:'slip',payload:[{event:'Original'}],revision:1}]);h.fail();h.cache.slip=[{event:'Retained edit'}];h.changed('slip');await h.tick();
 assert.match(h.elements.get('saveStatus').textContent,/device copy retained; retrying automatically/);assert.equal(h.remote.get('slip').payload[0].event,'Original');assert.ok(h.delays.at(-1)>=5000);
 h.recover();await h.tick();assert.equal(h.remote.get('slip').payload[0].event,'Retained edit');assert.match(h.elements.get('saveStatus').textContent,/Saved to Supabase/);
});
