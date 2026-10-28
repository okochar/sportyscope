'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../assets/ticket-review');
const now=1793120000000,p={family:'Real',rawEventId:'sr:match:123',marketId:'1',outcomeId:'1',specifier:'',event:'Home vs Away',market:'1X2',outcome:'Home',odds:2};
function report(){return {ok:true,family:'Real',eventId:p.rawEventId,analyzedAt:new Date(now).toISOString(),event:{rawEventId:p.rawEventId,gameType:'Real',home:'Home',away:'Away',time:now+3600000,productId:3},eligible:true,fitted:{home:1,away:1},home:{total:{games:50}},away:{total:{games:60}},h2h:[{}],issues:['A diagnostic has not beaten its baseline.'],comparisons:[{marketId:'1',outcomeId:'1',specifier:'',market:'1X2',outcome:'Home',odds:2,active:true,probability:.45,voidProbability:0,expectedReturn:-.1},{marketId:'18',outcomeId:'12',specifier:'total=1.5',market:'O/U',outcome:'Over 1.5',odds:1.2,active:true,probability:.8,voidProbability:0,expectedReturn:-.04}]};}
test('Review keeps the same event, uses history and improves modeled chance without a diagnostic veto',()=>{
 const l=R.leg(p,report(),{now});assert.equal(l.original.probability,.45);assert.equal(l.revised.probability,.8);assert.equal(l.changed,true);assert.equal(l.revised.rawEventId,p.rawEventId);assert.equal(l.revised.marketId,'18');assert.equal(l.coverage.home,50);
 const retained=R.leg(p,report(),{now,threshold:.85});assert.equal(retained.changed,false);assert.equal(retained.qualified,false);assert.equal(retained.revised.marketId,'1');
});
test('Unsupported original leg has no fabricated probability; a supported alternative may still be offered',()=>{
 const l=R.leg({...p,marketId:'999',market:'Corners',probability:.99},report(),{now});assert.equal(l.original.probability,undefined);assert.equal(l.revised.probability,.8);assert.equal(l.changed,true);assert.match(l.reason,/cannot be measured/);assert.equal(R.summary([l.original]).winProbability,null);assert.equal(R.summary([l.revised]).winProbability,.8);
});
test('Price-only, expired, mismatched and in-play research never becomes a historical ticket percentage',()=>{
 for(const mutation of [{evidenceMode:'price'},{eligible:false},{fitted:null},{eventId:'sr:match:999'},{analyzedAt:new Date(now-1000000).toISOString()},{event:{...report().event,time:now-1}},{event:{...report().event,productId:1}}]){const l=R.leg(p,{...report(),...mutation},{now});assert.equal(l.original.probability,undefined);assert.equal(l.changed,false);}
});
test('Suspended markets cannot be revisions and a whole ticket needs every leg estimated',()=>{
 const r=report();r.comparisons[1].active=false;assert.equal(R.leg(p,r,{now}).changed,false);r.comparisons[0].active=false;assert.equal(R.leg(p,r,{now}).original.probability,undefined);
 const s=R.summary([{...p,probability:.8,voidProbability:.1},{...p,rawEventId:'sr:match:456',probability:.5,voidProbability:.2}]);assert.ok(Math.abs(s.winProbability-.4)<1e-12);assert.ok(Math.abs(s.noLossProbability-.63)<1e-12);assert.match(s.assumption,/independent/);assert.equal(s.combinedOdds,4);
 assert.equal(R.summary([p]).unestimatedLegs,1);assert.equal(R.summary([p,p]).winProbability,null);assert.throws(()=>R.leg(p,r,{threshold:0,now}));
});
test('Thirty modeled legs multiply their chances instead of averaging confidence',()=>{
 const s=R.summary(Array.from({length:30},(_,i)=>({...p,rawEventId:'sr:match:'+i,probability:.9,voidProbability:0})));assert.ok(Math.abs(s.winProbability-.9**30)<1e-12);assert.ok(s.winProbability<.05);
});
