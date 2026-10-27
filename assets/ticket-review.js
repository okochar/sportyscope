/* Ticket estimates use history models only. Price shares never become win predictions. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScopeTicketReview=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const key=p=>[p.marketId,p.specifier||'',p.outcomeId].join('|');
  function estimate(p,row,report){
    return {...p,time:report.event.time,odds:row.odds,probability:row.probability,voidProbability:row.voidProbability||0,evidenceMode:report.evidenceMode||'dated-history',forecastAt:report.analyzedAt};
  }
  function valid(row){return row?.active===true&&Number.isFinite(row.probability)&&row.probability>=0&&row.probability<=1&&Number.isFinite(row.voidProbability)&&row.voidProbability>=0&&row.probability+row.voidProbability<=1.000001&&Number.isFinite(row.odds)&&row.odds>=1.01;}
  function leg(p,report,{minOdds=1.1,now=Date.now()}={}){
    if(!Number.isFinite(minOdds)||minOdds<1.01||minOdds>10)throw Error('Choose replacement minimum odds between 1.01 and 10.');
    const original={...p};delete original.probability;delete original.voidProbability;
    const base={original,revised:original,changed:false,coverage:null,issues:report?.issues||[],reason:''};
    if(!report?.ok||report.family!==p.family||report.eventId!==p.rawEventId)return {...base,reason:'History could not be matched to this event.'};
    const age=now-new Date(report.analyzedAt).getTime(),e=report.event;
    if(!Number.isFinite(age)||age>900000||age< -60000||!e||e.rawEventId!==p.rawEventId||e.gameType!==p.family)return {...base,reason:'A fresh, matching research snapshot is required.'};
    if(!Number.isFinite(Number(e.time))||Number(e.time)<=now||e.productId===1)return {...base,reason:'Kickoff has passed or this is in play. The pre-match model cannot evaluate it.'};
    original.time=Number(e.time);
    base.coverage={home:report.home?.total?.games||0,away:report.away?.total?.games||0,h2h:report.h2h?.length||0};
    if(!report.eligible||!report.fitted||report.evidenceMode==='price')return {...base,reason:'Insufficient historical evidence. A bookmaker price share is not a history-based win estimate.'};
    const rows=(report.comparisons||[]).filter(valid),row=rows.find(r=>key(r)===key(p));
    if(row)base.original=estimate({...original,home:e.home,away:e.away},row,report);
    const best=rows.filter(r=>r.odds>=minOdds).sort((a,b)=>b.probability-a.probability||b.expectedReturn-a.expectedReturn||b.odds-a.odds)[0];
    base.revised=base.original;
    if(best&&(!row||best.probability>row.probability+.0001)){
      base.revised=estimate({...original,home:e.home,away:e.away,market:best.market,marketId:best.marketId,specifier:best.specifier||'',outcome:best.outcome,outcomeId:best.outcomeId},best,report);
      base.changed=key(best)!==key(p);
    }
    base.reason=row?(base.changed?'A currently available market on the same match has a higher modeled win probability. Lower total odds are possible.':'Retained: no modeled alternative above the minimum odds improves its win probability.'):(base.changed?'The original market has no supported history model. A modeled alternative is suggested; an improvement over the unknown original cannot be measured.':'This market has no supported history model or is unavailable. No percentage is assigned.');
    return base;
  }
  function summary(picks){
    if(!picks.length||picks.length>30||new Set(picks.map(p=>p.family+'|'+p.rawEventId)).size!==picks.length)throw Error('Review 1–30 distinct matches. Same-match dependence is unsupported.');
    const known=picks.filter(p=>Number.isFinite(p.probability)&&p.probability>=0&&p.probability<=1&&Number.isFinite(p.voidProbability)&&p.voidProbability>=0&&p.probability+p.voidProbability<=1.000001);
    const complete=known.length===picks.length,allWin=complete?known.reduce((v,p)=>v*p.probability,1):null,noLoss=complete?known.reduce((v,p)=>v*(p.probability+p.voidProbability),1):null;
    return {legs:picks.length,estimatedLegs:known.length,unestimatedLegs:picks.length-known.length,winProbability:allWin,noLossProbability:noLoss,combinedOdds:picks.every(p=>Number.isFinite(p.odds)&&p.odds>=1.01)?picks.reduce((v,p)=>v*p.odds,1):null,assumption:'Experimental pre-match model; combined probabilities assume independent matches. Shared teams, competitions and virtual generators can violate this assumption. Not a calibrated guarantee of winning. Void outcomes are excluded from all-leg wins and included in no-leg-loses.'};
  }
  return {key,leg,summary};
});
