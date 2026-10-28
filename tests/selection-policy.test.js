'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../assets/analysis'),R=require('../assets/ticket-review'),Research=require('../assets/research');
const now=Date.UTC(2026,9,28,12),event={id:'api-Real-sr:match:1',rawEventId:'sr:match:1',gameType:'Real',sourceKind:'api',home:'Home',away:'Away',time:now+3600000,productId:3},row={marketId:'18',specifier:'total=1.5',outcomeId:'12',market:'Over/Under',outcome:'Over 1.5',odds:1.15,probability:.9,voidProbability:0,expectedReturn:0,active:true,empirical:{rate:.85,wins:85,samples:100}},report={ok:true,event,family:'Real',eventId:event.rawEventId,analyzedAt:new Date(now).toISOString(),eligible:true,fitted:{home:2,away:1},home:{total:{games:50}},away:{total:{games:50}},comparisons:[row]};
test('Target 50 cannot replace strong low-odds markets with weak high-odds markets',()=>{
 const candidates=Array.from({length:50},(_,i)=>[{rawEventId:'m'+i,marketId:'safe',odds:1.15,probability:.93,score:.91},{rawEventId:'m'+i,marketId:'weak',odds:3,probability:.39,score:.39}]).flat();
 const picks=A.assemble(candidates,{targetOdds:50,legs:50});assert.ok(picks.length>20);assert.ok(picks.every(p=>p.marketId==='safe'));assert.ok(picks.reduce((v,p)=>v*p.odds,1)>=50);
});
test('Probability floor excludes screenshot-like first-half picks even with huge expected return',()=>{
 const m={id:row.marketId,specifier:row.specifier},o={id:row.outcomeId,odds:row.odds};assert.ok(A.candidate(event,m,o,{},now,report));
 for(const changes of [{probability:.539,expectedReturn:100},{empirical:{rate:.74,wins:74,samples:100}},{probability:.79,empirical:{rate:.99}}])assert.equal(A.candidate(event,m,o,{},now,{...report,comparisons:[{...row,...changes}]}),null);
 assert.equal(A.candidate(event,m,o,{},now,{...report,evidenceMode:'price'}),null);
});
test('Targets above 1000 and 50 legs work; invalid infinity is rejected',()=>{
 assert.equal(A.settings({targetOdds:1e100,legs:50}).targetOdds,1e100);assert.throws(()=>A.settings({targetOdds:Infinity}));assert.throws(()=>A.settings({minProbability:.5}));assert.throws(()=>A.settings({legs:51}));
});
test('Already qualifying legs are retained; unresolved legs never receive an invented 80%',()=>{
 const pick={...event,family:'Real',marketId:'18',specifier:'total=1.5',outcomeId:'12',market:'Totals',outcome:'Over 1.5',odds:1.15};
 assert.equal(R.leg(pick,report,{now}).changed,false);const unresolved=R.leg({...pick,marketId:'999'}, {...report,comparisons:[{...row,probability:.7}]},{now});assert.equal(unresolved.qualified,false);assert.equal(unresolved.revised.probability,undefined);assert.match(unresolved.reason,/Unresolved/);
});
test('Fifty legs multiply probabilities, and same-match dependence withholds only the combined percentage',()=>{
 const picks=Array.from({length:50},(_,i)=>({family:'Real',rawEventId:'m'+i,probability:.8,voidProbability:0,odds:1.1})),summary=R.summary(picks);assert.ok(Math.abs(summary.winProbability-.8**50)<1e-18);assert.ok(summary.winProbability<.00002);assert.equal(R.summary([picks[0],picks[0]]).winProbability,null);
});
test('Empirical half-market frequencies use half scores and deduplicate shared H2H rows',()=>{
 const e={homeId:'h',awayId:'a'},records=[{id:'1',homeId:'h',awayId:'a',ft:[2,1],ht:[0,0]},{id:'1',homeId:'h',awayId:'a',ft:[2,1],ht:[0,0]},{id:'2',homeId:'x',awayId:'a',ft:[2,2],ht:[1,1]}];
 const p=Research.historical(e,records,{marketId:'68',specifier:'total=1.5',outcomeId:'12',period:'first'});assert.equal(p.samples,2);assert.equal(p.wins,1);assert.equal(p.rate,.5);
});
test('Real archive uses explicit identities, extends older seasons and cannot contaminate virtual sports',()=>{
 const archive=require('../lib/real-archive');assert.ok(archive.audit.records>80000);assert.equal(archive.match('Manchester City FC'),'manchester city');assert.equal(archive.match('Totally unknown FC'),null);
 const real={gameType:'Real',home:'Manchester City',away:'Liverpool FC',homeId:'h',awayId:'a'},histories=[{id:'h',records:[],complete:true},{id:'a',records:[],complete:true}],result=archive.augment(real,histories,now);assert.ok(result.coverage.records>500);assert.ok(result.histories[0].records.every(r=>r.homeId==='h'||r.awayId==='h'));assert.equal(archive.augment({...real,gameType:'vFootball'},histories,now).coverage.records,0);
});
