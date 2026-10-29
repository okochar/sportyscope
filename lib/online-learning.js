'use strict';
const {hash}=require('./ticket-store');
const clip=p=>Math.max(1e-6,Math.min(1-1e-6,p)),logit=p=>Math.log(clip(p)/(1-clip(p))),sigmoid=x=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
function assess(rows,fn){let brier=0,logLoss=0;for(const r of rows){const p=clip(fn(r));brier+=(p-r.y)**2;logLoss-=r.y*Math.log(p)+(1-r.y)*Math.log(1-p);}return {samples:rows.length,brier:rows.length?brier/rows.length:null,logLoss:rows.length?logLoss/rows.length:null};}
function train(input,previous=null,now=Date.now()){
 const rows=input.filter(r=>r.outcome?.result?.id&&['won','lost'].includes(r.outcome.status)&&Number.isFinite(r.probability)&&Date.parse(r.forecasted_at)<Date.parse(r.event_time)).map(r=>({...r,p:clip(r.selection?.baseProbability??r.probability),y:r.outcome.status==='won'?1:0})).sort((a,b)=>Date.parse(a.event_time)-Date.parse(b.event_time));
 const digest=hash(JSON.stringify(rows.map(r=>[r.event_id,r.selection.marketId,r.selection.specifier,r.selection.outcomeId,r.p,r.y,r.outcome.result.ft]))),events=new Set(rows.map(r=>r.event_id)).size;
 if(previous?.datasetHash===digest)return previous;
 if(previous&&rows.length>previous.samples&&rows.length-previous.samples<20&&now-Date.parse(previous.trainedAt)<86400000)return previous;
 const base={type:'Logistic probability calibration',samples:rows.length,distinctMatches:events,datasetHash:digest,trainedAt:new Date(now).toISOString(),active:previous?.active||null,status:'collecting',minimumDistinctMatches:100,batchSize:20,scope:'Only server-recorded, pre-kickoff forecasts with provider-verified outcomes. Real and virtual products are trained separately.'};
 if(events<100)return base;
 const times=[...new Set(rows.map(r=>r.event_time))].sort(),cutoff=times[Math.floor(times.length*.8)],training=rows.filter(r=>r.event_time<cutoff),test=rows.filter(r=>r.event_time>=cutoff);
 if(training.length<80||new Set(test.map(r=>r.event_id)).size<20||training.filter(r=>r.y).length<10||training.filter(r=>!r.y).length<10)return {...base,status:'insufficient-independent-validation'};
 let slope=1,intercept=0;for(let epoch=0;epoch<600;epoch++){let a=0,b=0;for(const r of training){const x=logit(r.p),error=sigmoid(slope*x+intercept)-r.y;a+=error*x;b+=error;}slope=Math.max(.25,Math.min(2.5,slope-.025*(a/training.length+.02*(slope-1))));intercept=Math.max(-3,Math.min(3,intercept-.025*(b/training.length+.02*intercept)));}
 const candidate=assess(test,r=>sigmoid(slope*logit(r.p)+intercept)),baseline=assess(test,r=>r.probability),passed=candidate.brier<baseline.brier-.0005&&candidate.logLoss<baseline.logLoss-.0005&&now-Date.parse(rows.at(-1).event_time)<30*86400000;
 const version='online-calibration-v1-'+digest.slice(0,16),challenger={version,slope,intercept,trainingSamples:training.length,testSamples:test.length,cutoff,candidate,baseline,passed};return {...base,status:passed?'promoted':'candidate-not-promoted',challenger,active:passed?{version,slope,intercept,trainedAt:base.trainedAt,validation:challenger}:base.active};
}
function apply(report,artifact){const model=artifact?.active;if(!model||report.live)return report;for(const row of report.comparisons||[]){row.baseProbability=row.probability;const adjusted=sigmoid(model.slope*logit(row.probability)+model.intercept);row.probability=Math.min(1-(row.voidProbability||0),adjusted);row.modelVersion=model.version;row.expectedReturn=row.probability*(row.odds-1)-(1-row.probability-(row.voidProbability||0));}report.calibration={version:model.version,validation:model.validation};return report;}
module.exports={train,apply,assess};
