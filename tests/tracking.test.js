'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),results=require('../lib/results'),T=require('../assets/tracking-model'),A=require('../assets/analysis'),{createStore}=require('../lib/knowledge-store');
const raw=require('./fixtures/virtual-result.json').data.tournaments[0].events[0],NOW=raw.estimateStartTime+86400000;
test('Verified completed result keeps provider ID, product and both regular-time periods',()=>{
 const r=results.normalize(raw,'vFootball',NOW);assert.deepEqual(r.ft,[1,2]);assert.deepEqual(r.ht,[0,1]);assert.equal(r.id,raw.eventId);assert.match(r.homeId,/^vFootball:/);
 for(const change of [{matchStatus:'Live'},{status:1},{gameScore:['1:2']},{gameScore:['0:1','1:2']},{gameScore:['0:1','1:1','0:0']},{estimateStartTime:NOW+1}])assert.equal(results.normalize({...raw,...change},'vFootball',NOW),null);
 assert.equal(results.normalize(raw,'Real',NOW),null);
});
test('The previously generated BHA–AST under 2.5 leg correctly tracks as lost',()=>{
 const r=results.normalize(raw,'vFootball',NOW),p={marketId:'18',specifier:'total=2.5',outcomeId:'13',market:'O/U',outcome:'Under 2.5'};assert.equal(results.settle(p,r).status,'lost');assert.equal(results.settle({...p,specifier:'total=1.5',outcomeId:'12'},r).status,'won');
 assert.equal(results.settle({marketId:'16',specifier:'hcp=1',outcomeId:'1714'},r).status,'void');
 assert.equal(results.settle({marketId:'16',specifier:'hcp=1.25',outcomeId:'1714'},r).status,'unverified');
 assert.equal(results.settle({marketId:'999999',specifier:'total=6.5',outcomeId:'13',market:'Corners'},r).status,'unverified');
});
test('First and second half settlement uses its own period score',()=>{
 const r=results.normalize(raw,'vFootball',NOW);assert.equal(results.settle({marketId:'68',specifier:'total=1.5',outcomeId:'13'},r).status,'won');assert.equal(results.settle({marketId:'90',specifier:'total=1.5',outcomeId:'12'},r).status,'won');
});
test('One lost leg marks a ticket lost while all other legs retain independent outcomes',()=>{
 assert.equal(T.ticketStatus([{status:'won'},{status:'lost'},{status:'pending'}]),'lost');assert.equal(T.ticketStatus([{status:'won'},{status:'void'}]),'won');assert.equal(T.ticketStatus([{status:'won'},{status:'unverified'}]),'unverified');assert.equal(T.ticketStatus([{status:'void'}]),'void');
});
test('Clock-only refreshes stay local while verified outcomes require a durable save',()=>{
 const p={status:'pending',time:123,live:{state:'live',clock:'41:00',score:[0,0]},note:'Live score is provisional.'};
 const clock=T.applyUpdate(p,{status:'pending',time:123,live:{state:'live',clock:'42:00',score:[0,0]},note:p.note,checkedAt:'2026-10-29T12:42:00Z'});
 assert.equal(clock.changed,true);assert.equal(clock.persist,false);assert.equal(p.live.clock,'42:00');assert.equal(p.checkedAt,'2026-10-29T12:42:00Z');
 const finished=T.applyUpdate(p,{status:'lost',time:123,result:{id:'verified-result',ft:[0,0]},checkedAt:'2026-10-29T13:30:00Z'});
 assert.equal(finished.persist,true);assert.equal(p.live,null);assert.equal(p.verifiedAt,'2026-10-29T13:30:00Z');assert.equal(p.status,'lost');
 const late=T.applyUpdate(p,{status:'pending',live:{state:'live',clock:'89:00'},checkedAt:'2026-10-29T13:31:00Z'});assert.equal(late.persist,false);assert.equal(p.status,'lost');assert.equal(p.live,null);
});
test('Learning excludes unverified, pending and duplicate predictions',()=>{
 const p={family:'vFootball',rawEventId:raw.eventId,marketId:'18',specifier:'total=2.5',outcomeId:'13',probability:.7,status:'lost',result:{id:raw.eventId},verifiedAt:'2026-10-25T12:00:00Z'};
 const learning=T.learning([{picks:[p,{...p,status:'won',verifiedAt:null},{...p,rawEventId:'other',status:'pending'}]},{picks:[p]}]);assert.equal(learning.samples,1);assert.equal(learning.markets[T.marketKey(p)].n,1);assert.equal(learning.markets[T.marketKey(p)].residual,-.7);
});
test('Today uses WAT midnight, and future/24-hour windows change actual fixture eligibility',()=>{
 const now=Date.UTC(2026,9,25,22,30),e={sourceKind:'api',gameType:'Real',time:Date.UTC(2026,9,25,23,10),productId:3};assert.equal(A.open(e,'Real',now,{window:'today'}),false);assert.equal(A.open(e,'Real',now,{window:'24h'}),true);assert.equal(A.open({...e,time:now+3*86400000},'Real',now,{window:'24h'}),false);assert.equal(A.open({...e,time:now+3*86400000},'Real',now,{window:'7days'}),true);
});
test('Supabase credential stays in server headers; disabled store never sends a request',async()=>{
 let calls=0;const disabled=createStore({},()=>{calls++;});assert.equal(await disabled.readTeam('x'),null);assert.equal(calls,0);
 const store=createStore({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-only'},async(url,opts)=>{calls++;assert.equal(opts.headers.apikey,'test-server-only');return new Response(JSON.stringify([{snapshot:{id:'team',records:[]}}]));});assert.deepEqual(await store.readTeam('team'),{id:'team',records:[]});assert.equal(store.status(),'connected');
});
test('vFootball history uses official daily date bounds and preserves real result IDs',async()=>{
 const history=require('../lib/vfootball-history');let calls=0;
 const h=await history.load({tournamentId:'sv:league:1'},async(url,opts)=>{const q=new URL(url).searchParams;assert.equal(opts.headers.OperId,'2');assert.equal(q.get('sportId'),'sr:sport:202120001');assert.ok(Number(q.get('endTime'))-Number(q.get('startTime'))<86400000);calls++;const time=Number(q.get('startTime'))+60000;const e={...raw,eventId:'sr:match:'+time,estimateStartTime:time};return new Response(JSON.stringify({bizCode:10000,data:{tournaments:[{id:'sv:league:1',events:[e]}],moreEvents:false}}));});
 assert.equal(calls,14);assert.equal(h.pages,14);assert.equal(h.records.length,14);assert.equal(h.complete,true);assert.equal(new Set(h.records.map(r=>r.id)).size,14);
});
