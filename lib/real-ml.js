'use strict';
const data=require('../data/real-event-facts.json'),run=require('../data/real-trained-models.json'),{canonical}=require('./real-archive');
function probability(model,values,preprocessing=run.preprocessing){
 const missing=values.map(v=>v===null||!Number.isFinite(v)),z=values.map((v,i)=>((missing[i]?preprocessing.median[i]:v)-preprocessing.mean[i])/preprocessing.scale[i]).concat(missing.map(Number));
 let raw;
 if(model.estimator.type==='logistic'){raw=1/(1+Math.exp(-Math.max(-35,Math.min(35,model.estimator.intercept+model.estimator.weights.reduce((n,w,i)=>n+w*z[i],0)))));}
 else {raw=model.estimator.trees.reduce((total,t)=>{let i=0;while(t.left[i]!==-1)i=Math.fround(z[t.feature[i]])<=t.threshold[i]?t.left[i]:t.right[i];return total+t.positive[i];},0)/model.estimator.trees.length;}
 raw=Math.max(1e-6,Math.min(1-1e-6,raw));return 1/(1+Math.exp(-Math.max(-35,Math.min(35,model.calibration.slope*Math.log(raw/(1-raw))+model.calibration.intercept))));
}
const identities=new Map();
for(const t of data.teams)for(const name of [t.name,t.officialName])if(name){const k=canonical(name);if(!identities.has(k))identities.set(k,new Set());identities.get(k).add(t.id);}
function team(name,event){if(event.gameType!=='Real'||/\bu\s?\d{2}\b|youth|women|reserves|premier league 2/i.test(event.league||''))return null;const ids=identities.get(canonical(name));return ids?.size===1?[...ids][0]:null;}
function profile(id){const records=data.matches.filter(r=>r.homeId===id||r.awayId===id),last=records.at(-1);if(!last)return null;const recent=records.slice(-20),totals={};for(const field of ['corners','shots','accurateShots','yellowCards','redCards','fouls','passes']){const values=recent.map(r=>r.stats[r.homeId===id?'home':'away']?.[field]).filter(Number.isFinite);totals[field]={samples:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};}return {teamId:id,name:data.teams.find(t=>t.id===id)?.name,source:data.provider,matches:records.length,oldest:records[0].playedAt,newest:last.playedAt,totals,lineups:records.filter(r=>r.quality[r.homeId===id?'home':'away'].hasFullLineup).length};}
function evidence(event){const home=profile(team(event.home,event)),away=profile(team(event.away,event));return {runId:run.id,home,away,models:run.models.length,status:'research-only',liveForecastAvailable:false,reason:'Event statistics are historical (2016–2018). Current matching history, verified settlement definitions and recent out-of-sample validation are required before these models can rank live bets.'};}
function summary(){return {sourceId:data.sourceId,provider:data.provider,license:data.license,sourceUrl:data.sourceUrl,attribution:data.attribution,definitions:data.definitions,events:data.events,matches:data.matches.length,teams:data.teams.length,players:data.players.length,oldest:data.matches[0].playedAt,newest:data.matches.at(-1).playedAt,rawObjects:data.raw.length,rawBytes:data.raw.reduce((n,r)=>n+r.bytes,0),run:{...run,preprocessing:undefined,models:run.models.map(({estimator,...m})=>({...m,estimatorType:estimator.type}))}};}
module.exports={probability,profile,team,evidence,summary,data,run};
