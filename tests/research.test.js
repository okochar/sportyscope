'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../assets/research'),A=require('../assets/analysis'),H=require('../lib/history'),{request}=require('../lib/upstream'),service=require('../lib/research-service');
const NOW=Date.UTC(2026,9,25,10),DAY=86400000;
const raw=(id,time,h='sr:competitor:1',a='sr:competitor:2')=>({eventId:id,fixtureSportId:'sr:sport:1',eventStatus:'Finished',eventMatchStatus:'Ended',eventPlayedTime:'90:00',eventScore:'2:1',eventGameScore:['1:0','1:1'],fixtureStartTime:time,fixtureHomeTeamId:h,fixtureAwayTeamId:a,fixtureHomeTeamName:'A',fixtureAwayTeamName:'B'});
const records=Array.from({length:100},(_,i)=>({id:'e'+i,time:NOW-(101-i)*DAY,homeId:i%2?'a':'b',awayId:i%2?'b':'a',home:'A',away:'B',ft:[i%4,(i*3)%3],ht:[i%2,0]}));
const event={id:'api-Real-sr:match:1',rawEventId:'sr:match:1',home:'A',away:'B',homeId:'a',awayId:'b',time:NOW+DAY/2,gameType:'Real',sourceKind:'api',sportId:'sr:sport:1',productId:3,league:'Test',markets:[]};
const market={id:'18',specifier:'total=1.5',name:'Over/Under',active:true,outcomes:[{id:'12',name:'Over 1.5',odds:1.4,active:true},{id:'13',name:'Under 1.5',odds:3.5,active:true}]};
const response=d=>new Response(JSON.stringify({bizCode:10000,data:d}));
test('History only accepts ended real regular-time results before the cutoff',()=>{
 assert.deepEqual(H.normalize(raw('x',NOW-DAY),NOW).ft,[2,1]);
 for(const x of [{eventStatus:'Not started'},{eventMatchStatus:'Live'},{fixtureStartTime:NOW+1},{eventPlayedTime:'120:00'},{fixtureSportId:'sr:sport:202120001'},{eventScore:'??'},{fixtureHomeTeamId:'virtual-1'}])assert.equal(H.normalize({...raw('x',NOW-DAY),...x},NOW),null);
 assert.equal(H.normalize({...raw('x',NOW-DAY),eventGameScore:['5:0']},NOW).ht,null);
});
test('History follows actual tournament IDs and every cursor, deduplicating records',async()=>{
 const calls=[];const d=await H.team('sr:competitor:1',{now:NOW,fetcher:async url=>{const u=new URL(url);calls.push(u);if(u.pathname.endsWith('/tournaments'))return response([{radarId:'sr:tournament:17'}]);if(!u.pathname.endsWith('/results'))return response({radarId:'sr:competitor:1',name:'A'});assert.equal(u.searchParams.get('tournamentIds'),'sr:tournament:17');return u.searchParams.has('flag')?response({data:[raw('old',NOW-2*DAY),raw('new',NOW-DAY)],hasNextPage:false}):response({data:[raw('new',NOW-DAY)],hasNextPage:true,flag:'cursor-1'});}});
 assert.equal(d.pages,2);assert.equal(d.records.length,2);assert.equal(d.records[0].id,'old');assert.equal(d.complete,true);assert.equal(calls.length,4);
});
test('Repeated history cursor and mismatched team history fail closed',async()=>{
 const fetcher=async u=>u.endsWith('/tournaments')?response([{radarId:'sr:tournament:1'}]):!u.includes('/results?')?response({radarId:'sr:competitor:1'}):response({data:[raw('same',NOW-DAY)],hasNextPage:true,flag:'repeat'});
 await assert.rejects(()=>H.team('sr:competitor:1',{now:NOW,fetcher}),/repeated|completeness/);
 await assert.rejects(()=>H.team('201128112403tmp000000029'),/real-football/);
});
test('Profiles preserve opponents, venues, halves, observed frequencies and missing values',()=>{
 const p=R.profile(records,'a',NOW);assert.equal(p.total.games,100);assert.equal(p.home.games,50);assert.equal(p.away.games,50);assert.equal(p.opponents.length,1);assert.equal(p.firstHalf.games,100);assert.equal(p.form.length,10);
 assert.equal(R.profile([],'a',NOW).total.scored,null);assert.equal(R.profile([],'a',NOW).restDays,null);
 const missing=R.profile([{...records[0],ht:null}],'a',NOW);assert.equal(missing.firstHalf.games,0);assert.equal(missing.secondHalf.scored,null);
});
test('Future results cannot change profiles, fitted rates or historical validation',()=>{
 const future={...records[0],id:'future',time:NOW+DAY,ft:[99,99]};
 assert.deepEqual(R.fit(records,'a','b',NOW),R.fit([...records,future],'a','b',NOW));
 assert.deepEqual(R.backtest(records,'a',NOW),R.backtest([...records,future],'a',NOW));
 const altered=records.map(r=>r.time>=NOW?{...r,ft:[90,90]}:r);assert.deepEqual(R.profile(records,'a',NOW),R.profile(altered,'a',NOW));
});
test('Score matrix conserves probability and maps 1X2, double chance, totals, BTTS and handicap',()=>{
 const g=R.grid({home:1.5,away:1.1});assert.ok(Math.abs(g.reduce((n,r)=>n+r.p,0)-1)<1e-12);
 assert.equal(R.settlement({id:'1'},{id:'1'})(2,1),true);
 assert.equal(R.settlement({id:'10'},{id:'9'})(1,1),true);
 assert.equal(R.settlement({id:'18',specifier:'total=2'},{id:'12'})(1,1),'void');
 assert.equal(R.settlement({id:'19',specifier:'total=1.5'},{id:'13'})(1,8),true);
 assert.equal(R.settlement({id:'20',specifier:'total=1.5'},{id:'12'})(0,2),true);
 assert.equal(R.settlement({id:'29'},{id:'74'})(1,1),true);
 assert.equal(R.settlement({id:'14',specifier:'hcp=0:1'},{id:'1712'})(2,1),true);
 assert.equal(R.settlement({id:'45'},{name:'2:1'})(2,1),true);
 assert.equal(R.settlement({id:'18',specifier:'total=2.25'},{id:'12'}),null);
 assert.equal(R.settlement({id:'60200'},{id:'1'}),null);
 assert.equal(R.settlement({id:'97'},{id:'74'}),null); // Away clean sheet is not BTTS.
});
test('Whole-line expected return includes pushes and supported half periods require half data',()=>{
 const e={markets:[{...market,specifier:'total=2'},{...market,id:'68',specifier:'total=1.5'}]};
 const full=R.compare(e,{home:1.4,away:1});assert.equal(full.modeledMarkets,1);assert.ok(full.rows[0].voidProbability>0);
 for(const row of full.rows)assert.ok(Math.abs(row.expectedReturn-(row.probability*(row.odds-1)-(1-row.probability-row.voidProbability)))<1e-10);
 const half=R.compare(e,{home:1.4,away:1,first:{home:.6,away:.4}});assert.equal(half.modeledMarkets,2);assert.equal(half.rows.filter(r=>r.period==='first').length,2);
});
test('Missing historical samples produce no fitted history model',()=>{
 const result=R.build({...event,markets:[market]},[{records:records.slice(0,5),complete:true}],NOW);
 assert.equal(result.eligible,false);assert.equal(result.fitted,null);assert.ok(result.issues.length);assert.ok(result.coverage.some(c=>c.name.includes('Corners')&&c.status==='missing'));
});
function eligible(){return {family:'Real',eventId:event.rawEventId,event,eligible:true,analyzedAt:new Date(NOW).toISOString(),home:{total:{games:60}},away:{total:{games:60}},comparisons:[{marketId:market.id,specifier:market.specifier,outcomeId:'12',odds:1.4,probability:.8,voidProbability:0,expectedReturn:.12,active:true}]};}
test('Automatic candidate requires independently researched eligible fresh evidence, never just a price',()=>{
 const o=market.outcomes[0],r=eligible();assert.ok(A.candidate(event,market,o,{},NOW,r));
 for(const report of [undefined,{...r,eligible:false},{...r,eventId:'sr:match:other'},{...r,analyzedAt:new Date(NOW-901000).toISOString()}])assert.equal(A.candidate(event,market,o,{},NOW,report),null);
 assert.equal(A.candidate({...event,gameType:'vFootball'},market,o,{},NOW,r),null);
 assert.equal(A.candidate(event,market,{...o,odds:1.5},{},NOW,r),null);
});
test('Partial, failed or stale feeds never produce automatic selections',()=>{
 const snapshot={events:[event],fetchedAt:new Date(NOW).toISOString(),complete:true},reports={[event.rawEventId]:eligible()};
 assert.equal(A.analyze(snapshot,'Real',{},NOW,reports).picks.length,1);
 for(const x of [{complete:false},{error:'network failed'},{fetchedAt:new Date(NOW-121000).toISOString()}])assert.equal(A.analyze({...snapshot,...x},'Real',{},NOW,reports).picks.length,0);
});
test('Target odds assembly respects maximum legs, distinct events and no filler',()=>{
 const picks=A.assemble([{rawEventId:'a',odds:1.4,score:.1},{rawEventId:'b',odds:1.4,score:.2},{rawEventId:'a',odds:1.5,score:.05}],{targetOdds:2,legs:3});assert.equal(picks.length,2);assert.equal(new Set(picks.map(p=>p.rawEventId)).size,2);assert.deepEqual(A.assemble([]),[]);
 assert.throws(()=>A.settings({targetOdds:0}));assert.throws(()=>A.settings({legs:0}));
});
test('Booking requests use the operator header that official SportyBet readback requires',async()=>{
 await request('/orders/share/TESTCODE',{fetcher:async(url,opts)=>{assert.equal(opts.headers.OperId,'2');return response({});}});
 await request('/factsCenter/teams/sr:competitor:1',{fetcher:async(url,opts)=>{assert.equal(opts.headers.OperId,undefined);return response({});}});
});
test('Instant archive is integrated with verified anonymous detail semantics and separate product identities',async()=>{
 const detail=require('./fixtures/instant-detail.json'),round=require('./fixtures/instant-round.json');
 const r=await service.load({family:'Instant',eventId:detail.events[0].eventId},async url=>new Response(JSON.stringify(url.includes('details_without_login')?detail:round)));
 assert.equal(r.evidenceMode,'archive');assert.equal(r.eligible,true);assert.ok(r.comparisons.length>20);assert.equal(r.capability.booking,false);assert.equal(r.conditions.home.length,40);assert.match(r.home.id,/legacy:Instant:England:2022/);assert.equal(r.home.newest,null);assert.equal(r.validation.home.samples,0);
 assert.ok(r.comparisons.every(c=>c.marketId.startsWith('e:')));assert.equal(r.event.roundId,round.roundId);
});
test('A failed model diagnostic is visible but does not veto a pick',()=>{
 const report=R.build({...event,markets:[market]},[{records,complete:true}],NOW);assert.ok(report.fitted);assert.equal(report.eligible,true);
 const r={...eligible(),validation:{home:{skill:-.4},away:{skill:-.1}},issues:['Diagnostic did not beat baseline']};assert.ok(A.candidate(event,market,market.outcomes[0],{},NOW,r));
});
test('Price fallback is explicit and uses no invented historical samples',()=>{
 const fallback=require('../lib/price-fallback'),r=fallback({...event,markets:[market]},'History absent');assert.equal(r.evidenceMode,'price');assert.equal(r.home,undefined);assert.equal(r.comparisons.length,2);assert.ok(r.issues.some(s=>s.includes('not a historical prediction')));
});
test('Thirty distinct legs can be assembled when requested and supported',()=>{
 const cs=Array.from({length:30},(_,i)=>({rawEventId:'e'+i,odds:1.25,score:.9})),p=A.assemble(cs,{legs:30,targetOdds:1.25**30});assert.equal(p.length,30);assert.equal(A.settings({legs:30}).legs,30);assert.throws(()=>A.settings({legs:51}));
});
test('Existing SportyBet code loads all selected current prices without placing an order',async()=>{
 const {loadCode}=require('../lib/booking'),fixture=require('./fixtures/booking-loaded.json');let called=0;
 const r=await loadCode('hsl5kf',async(url,opts)=>{called++;assert.equal(opts.method,'GET');assert.match(url,/orders\/share\/HSL5KF/);assert.equal(opts.headers.OperId,'2');return new Response(JSON.stringify(fixture));});assert.equal(called,1);assert.equal(r.slip.length,1);assert.equal(r.slip[0].rawEventId,fixture.data.ticket.selections[0].eventId);assert.equal(r.slip[0].odds,4.77);assert.equal(r.family,'Real');
});
test('Unavailable or mixed-category booking codes do not become loaded local slips',async()=>{
 const {loadCode}=require('../lib/booking'),fixture=require('./fixtures/booking-loaded.json');
 await assert.rejects(()=>loadCode('HSL5KF',async()=>new Response(JSON.stringify({...fixture,isAvailable:false}))),/unavailable|expired/);
 const d=structuredClone(fixture);d.data.ticket.selections[0].sportId='sr:sport:2';await assert.rejects(()=>loadCode('HSL5KF',async()=>new Response(JSON.stringify(d))),/category|mixed/);
});
test('Selections without specifiers remain valid through repeated automatic-route validation',()=>{
 const {validate}=require('../lib/booking'),input={family:'vFootball',selections:[{eventId:'sr:match:123',marketId:'29',outcomeId:'74',specifier:''}]},once=validate(input);assert.deepEqual(validate(once),once);assert.equal(once.selections[0].specifier,undefined);
 assert.throws(()=>validate({...input,selections:[{...input.selections[0],specifier:null}]}),/Invalid selection/);
});
