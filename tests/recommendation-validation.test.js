'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),V=require('../lib/recommendation-validation'),A=require('../assets/analysis'),B=require('../lib/background'),M=require('../assets/tracking-model');
const now=Date.UTC(2026,10,1,12),day=86400000;
function rows(n=240){return Array.from({length:n},(_,i)=>{const at=now-(n-i)*day/8,id='event-'+i;return {family:'Real',model_version:'test-v1',event_id:id,event_time:new Date(at).toISOString(),forecasted_at:new Date(at-3600000).toISOString(),probability:.95,selection:{marketId:'18',specifier:'total=1.5',outcomeId:'12',odds:1.3,modelVersion:'test-v1',voidProbability:0},outcome:{status:i%20===0?'lost':'won',result:{id}}};});}
test('Market validation requires chronological, recent, distinct held-out evidence',()=>{
 const input=rows(),r=V.assess(input,'Real',now),g=Object.values(r.markets)[0];assert.equal(r.passedMarkets,1);assert.ok(g.trainingMatches>=80);assert.ok(g.testMatches>=40);assert.ok(g.lowerWinBound>.8);assert.ok(g.returnLowerBound>0);assert.ok(g.brier<g.priceBrier);
 assert.deepEqual(V.assess([...input,...input],'Real',now),r);assert.equal(V.assess(input.slice(0,138),'Real',now).passedMarkets,0);assert.equal(V.assess(input,'vFootball',now).passedMarkets,0);assert.equal(V.assess(input,'Real',now+8*day).passedMarkets,0);
});
test('Unverified, post-kickoff, pushed and wrong-result forecasts cannot qualify',()=>{
 for(const transform of [r=>({...r,forecasted_at:r.event_time}),r=>({...r,outcome:{status:'won',result:{id:'other'}}}),r=>({...r,selection:{...r.selection,voidProbability:.1}}),r=>({...r,event_time:new Date(now+day).toISOString()})])assert.equal(Object.keys(V.assess(rows().map(transform),'Real',now).markets).length,0);
 const versions=rows().map((r,i)=>({...r,model_version:i%2?'a':'b'}));assert.equal(V.assess(versions,'Real',now).passedMarkets,0);
 const loss=rows().map((r,i)=>({...r,probability:.95,outcome:{status:i%2?'won':'lost',result:{id:r.event_id}}}));assert.equal(V.assess(loss,'Real',now).passedMarkets,0);
});
test('Validation cache and evidence stay account- and model-specific',async()=>{
 let calls=0;const db={configured:true,async readPredictions(user){calls++;return user==='validation-test-a'?rows():[];}};
 const [a,b,a2]=await Promise.all([V.load(db,'validation-test-a','Real'),V.load(db,'validation-test-b','Real'),V.load(db,'validation-test-a','Real')]);assert.equal(calls,2);assert.equal(a,a2);assert.equal(Object.keys(b.markets).length,0);
 const artifact=V.assess(rows(),'Real',now),report={family:'Real',comparisons:[{...rows()[0].selection},{...rows()[0].selection,modelVersion:'different'}]};V.attach(report,artifact);assert.equal(report.comparisons[0].recommendationEvidence.status,'passed');assert.equal(report.comparisons[1].recommendationEvidence.status,'not-validated');
});
test('Short tickets migrate old defaults and longshot must be explicitly chosen',()=>{
 assert.equal(A.defaults.mode,'short');assert.equal(A.settings({legs:50}).legs,3);assert.equal(A.settings({mode:'longshot',legs:50}).legs,50);assert.throws(()=>A.settings({mode:'unknown'}));
 const picks=Array.from({length:10},(_,i)=>({rawEventId:'m'+i,odds:1.3,probability:.95,recommendationEvidence:{status:'passed',lowerWinBound:.9}}));assert.equal(A.assemble(picks,{targetOdds:100,legs:50}).length,3);assert.equal(A.assemble(picks,{targetOdds:100,mode:'longshot',legs:50}).length,10);assert.deepEqual(A.assemble(picks.map(p=>({...p,recommendationEvidence:undefined}))),[]);assert.ok(Math.abs(A.ticketChance(picks.slice(0,3))-.95**3)<1e-12);
});
test('Background generation without validation stops before fixtures or booking',async()=>{
 const r=await B.generate({userId:'no-evidence-test',family:'Real',settings:{}},{configured:true,readPredictions:async()=>[]});assert.equal(r.result.status,'no-reliable-ticket');assert.deepEqual(r.state,{});assert.equal(r.delay,1800);
});
test('Live clock-only updates are ephemeral, scores and settlements persist',()=>{
 const p={status:'pending',time:now,live:{state:'live',phase:'H1',score:[0,0],clock:'10:00',observedAt:new Date(now).toISOString()}},u={status:'pending',time:now,checkedAt:new Date(now+10000).toISOString(),live:{...p.live,clock:'10:10',observedAt:new Date(now+10000).toISOString()}};
 assert.deepEqual(M.applyUpdate(p,u),{changed:true,persist:false});assert.equal(M.applyUpdate(p,{...u,live:{...u.live,score:[1,0]}}).persist,true);assert.equal(M.applyUpdate(p,{...u,live:{...u.live,phase:'HT'}}).persist,true);assert.equal(M.applyUpdate(p,{...u,status:'won',result:{id:'x',ft:[1,0]}}).persist,true);
});
test('Background tracking reschedules unchanged tickets without rewriting full payloads',async()=>{
 const pick={family:'Real',rawEventId:'e',marketId:'18',outcomeId:'12',status:'pending',time:now,live:{state:'live',phase:'H1',score:[0,0],clock:'10:00'}};let saved=0,enqueued=0,patched=0;
 const db={trackingQueue:async()=>[{ticket_id:'hashed',payload:{id:'t',picks:[pick]}}],saveTicket:async()=>saved++,enqueueTicket:async()=>enqueued++,rescheduleTracking:async()=>patched++};
 await B.track({userId:'test'},db,async()=>[{key:M.key(pick),status:'pending',time:now,live:{...pick.live,clock:'10:10'},checkedAt:new Date().toISOString()}]);assert.equal(saved,0);assert.equal(enqueued,0);assert.equal(patched,1);
 await B.track({userId:'test'},db,async()=>[{key:M.key(pick),status:'pending',time:now,live:{...pick.live,score:[1,0]},checkedAt:new Date().toISOString()}]);assert.equal(saved,1);assert.equal(enqueued,1);
});
test('Automatic booking cannot bypass validation with client-provided evidence',async()=>{
 const route=require('../api/auto-book'),body={family:'Real',selections:[{eventId:'sr:match:1',marketId:'18',specifier:'total=1.5',outcomeId:'12'}],settings:{},recommendationEvidence:{status:'passed'}};
 const res=()=>({statusCode:200,setHeader(){},end(body){this.body=JSON.parse(body);}}),r=res();await route.createHandler({configured:true},{user:async()=>null})({method:'POST',headers:{},body},r);assert.equal(r.statusCode,401);
 let reads=0;await assert.rejects(()=>route.execute(body,()=>{throw Error('Must not access feed');},{userId:'no-evidence-book-test',db:{configured:true,readPredictions:async()=>{reads++;return [];}}}),/No reliable ticket/);assert.equal(reads,1);
});
