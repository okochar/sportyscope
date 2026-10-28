'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../assets/analysis'),R=require('../assets/ticket-review');
const now=Date.UTC(2026,9,28,12),p={family:'Real',rawEventId:'sr:match:99',event:'Home vs Away',marketId:'1',outcomeId:'1',specifier:'',market:'1X2',outcome:'Home',odds:2.44};
const row=(id,odds,probability,rate=probability)=>({marketId:id,outcomeId:'12',specifier:'',market:'Market '+id,outcome:'Selection',active:true,odds,probability,voidProbability:0,empirical:{rate,wins:Math.round(rate*100),samples:100}});
function report(rows){return {ok:true,family:'Real',eventId:p.rawEventId,event:{rawEventId:p.rawEventId,gameType:'Real',home:'Home',away:'Away',time:now+3600000},analyzedAt:new Date(now).toISOString(),eligible:true,fitted:{home:1,away:1},home:{total:{games:100}},away:{total:{games:100}},comparisons:rows,issues:[]};}
test('Weak market gets a useful same-match replacement rather than the 1.02 confidence maximum',()=>{
 const r=report([{...row('1',2.44,.5),outcomeId:'1'},row('10',1.02,.99),row('18',1.4,.84)]),l=R.leg(p,r,{now});assert.equal(l.changed,true);assert.equal(l.qualified,true);assert.equal(l.revised.marketId,'18');assert.equal(l.revised.rawEventId,p.rawEventId);assert.equal(l.revised.odds,1.4);
});
test('A qualifying original stays unchanged even if short or an alternative has a better rank',()=>{
 const r=report([{...row('1',1.02,.99),outcomeId:'1'},row('18',1.4,.9)]),l=R.leg({...p,odds:1.02},r,{now});assert.equal(l.changed,false);assert.equal(l.revised.marketId,'1');assert.equal(l.revised.odds,1.02);
});
test('Only tiny qualifying alternatives leave a weak market unresolved',()=>{
 const l=R.leg(p,report([{...row('1',2.44,.5),outcomeId:'1'},row('10',1.02,.99)]),{now});assert.equal(l.changed,false);assert.equal(l.qualified,false);assert.match(l.reason,/No tiny-odds replacement/);
});
test('Balanced score rewards useful odds but its bounded price bonus does not chase a longshot',()=>{
 const r=[row('safe',1.15,.98),row('balanced',1.5,.9),row('expensive',4,.8)].sort(A.compareBalanced);assert.equal(r[0].marketId,'balanced');assert.ok(A.balancedScore(row('x',1.02,.999))<0);assert.equal(A.balancedScore(row('x',1.6,.8)),A.balancedScore(row('y',4,.8)));
});
test('Auto picks use additional qualifying matches and reject weak or 1.01 fillers',()=>{
 const cs=Array.from({length:8},(_,i)=>({rawEventId:'e'+i,odds:1.5,probability:.9,score:.9}));cs.push({rawEventId:'tiny',odds:1.01,probability:.999,score:.999},{rawEventId:'weak',odds:20,probability:.4,score:.4});const picks=A.assemble(cs,{targetOdds:10,legs:50});assert.equal(picks.length,6);assert.ok(picks.every(p=>p.odds===1.5));assert.ok(picks.reduce((v,p)=>v*p.odds,1)>=10);
});
test('Old saved 1.01 price defaults migrate without breaking workspace restoration',()=>{
 assert.equal(A.settings({minOdds:1.01}).minOdds,1.15);assert.equal(A.settings({minOdds:1.3}).minOdds,1.3);
});
test('35.42 to 1.08 collapse is not exposed as an acceptable revision',()=>{
 const original=Math.pow(35.42,1/4),tiny=Math.pow(1.08,1/4),legs=Array.from({length:4},(_,i)=>({original:{...p,rawEventId:'e'+i,odds:original},revised:{...p,rawEventId:'e'+i,odds:tiny},changed:true,qualified:true})),r=R.returnAssessment(legs);assert.equal(r.status,'low-return');assert.equal(r.allowRevision,false);assert.match(r.message,/not a recommended revision/);
 const stillTooLow=R.returnAssessment(legs.map(l=>({...l,revised:{...l.revised,odds:1.4}})));assert.equal(stillTooLow.status,'low-return');assert.equal(stillTooLow.allowRevision,false);
 const moderate=R.returnAssessment(legs.map(l=>({...l,revised:{...l.revised,odds:1.5}})));assert.equal(moderate.status,'large-reduction');assert.equal(moderate.allowRevision,true);assert.ok(moderate.revisedOdds>5);
});
test('Review workspace retains policy version so new-device restores do not revive old tiny-odds suggestions',()=>{
 const payload={loaded:null,legs:[],threshold:.8,analyzedAt:0,policy:'balanced-v1'},saved=require('../lib/workspace').validate({component:'review',revision:0,payload});assert.equal(saved.policy,'balanced-v1');
});
