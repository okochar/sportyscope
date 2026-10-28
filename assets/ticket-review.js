/* Same-match revisions obey the requested estimate floor; unknown is not 80%. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./analysis'));else root.ScopeTicketReview=factory(root.ScopeAnalysis);})(typeof globalThis!=='undefined'?globalThis:this,function(A){
  'use strict';
  const key=p=>[p.marketId,p.specifier||'',p.outcomeId].join('|');
  function estimate(p,row,report){return {...p,time:report.event.time,odds:row.odds,probability:row.probability,voidProbability:row.voidProbability||0,empirical:row.empirical||null,evidenceMode:report.evidenceMode||'dated-history',forecastAt:report.analyzedAt};}
  function valid(row){return row?.active===true&&Number.isFinite(row.probability)&&row.probability>=0&&row.probability<=1&&Number.isFinite(row.voidProbability)&&row.voidProbability>=0&&row.probability+row.voidProbability<=1.000001&&Number.isFinite(row.odds)&&row.odds>=1.01;}
  function leg(p,report,{threshold=.8,now=Date.now()}={}){
    if(!Number.isFinite(threshold)||threshold<.75||threshold>.99)throw Error('Choose an estimate threshold between 75% and 99%.');
    const original={...p};for(const k of ['probability','voidProbability','empirical'])delete original[k];
    const base={original,revised:original,changed:false,qualified:false,threshold,coverage:null,issues:report?.issues||[],reason:''};
    if(!report?.ok||report.family!==p.family||report.eventId!==p.rawEventId)return {...base,reason:'History could not be matched to this event.'};
    const age=now-new Date(report.analyzedAt).getTime(),e=report.event;
    if(!Number.isFinite(age)||age>900000||age< -60000||!e||e.rawEventId!==p.rawEventId||e.gameType!==p.family)return {...base,reason:'A fresh matching research snapshot is required.'};
    if(!Number.isFinite(Number(e.time))||Number(e.time)<=now||e.productId===1)return {...base,reason:'Kickoff has passed or this is in play. The pre-match model cannot evaluate it.'};
    original.time=Number(e.time);base.coverage={home:report.home?.total?.games||0,away:report.away?.total?.games||0,h2h:report.h2h?.length||0};
    if(!report.eligible||!report.fitted||report.evidenceMode==='price')return {...base,reason:'Insufficient historical evidence. Bookmaker price shares are not history-based predictions.'};
    const rows=(report.comparisons||[]).filter(valid),row=rows.find(r=>key(r)===key(p));
    if(row)base.original=estimate({...original,home:e.home,away:e.away},row,report);base.revised=base.original;
    if(row&&A.qualified(row,report,threshold))return {...base,qualified:true,maximumQualifiedOdds:row.odds,reason:'Retained: this leg meets the '+Math.round(threshold*100)+'% model and available observed-frequency filter.'};
    const qualifying=rows.filter(r=>A.qualified(r,report,threshold)),best=qualifying.filter(r=>r.odds>=A.minimumUsefulOdds).sort(A.compareBalanced)[0];
    base.maximumQualifiedOdds=qualifying.length?Math.max(...qualifying.map(r=>r.odds)):null;
    if(best){base.revised=estimate({...original,home:e.home,away:e.away,market:best.market,marketId:best.marketId,specifier:best.specifier||'',outcome:best.outcome,outcomeId:best.outcomeId},best,report);base.changed=key(best)!==key(p);base.qualified=true;base.reason=row?'Replaced only this weak market on the same match. The replacement balances historical support and useful odds, with a minimum price of '+A.minimumUsefulOdds.toFixed(2)+'.':'Original market has no supported estimate. A qualifying market with useful odds on this same match is suggested; improvement over an unknown probability cannot be measured.';}
    else base.reason=qualifying.length?'Unresolved: the only qualifying replacements have odds below '+A.minimumUsefulOdds.toFixed(2)+'. No tiny-odds replacement was applied. This match is kept for your review.':'Unresolved: no currently available, supported market on this match meets '+Math.round(threshold*100)+'%. The original is shown for review; it is not promoted to a qualifying pick.';
    return base;
  }
  function summary(picks){
    if(!picks.length||picks.length>50)throw Error('Review 1–50 legs.');
    const dependent=new Set(picks.map(p=>p.family+'|'+p.rawEventId)).size!==picks.length;
    const known=picks.filter(p=>Number.isFinite(p.probability)&&p.probability>=0&&p.probability<=1&&Number.isFinite(p.voidProbability)&&p.voidProbability>=0&&p.probability+p.voidProbability<=1.000001),complete=known.length===picks.length&&!dependent;
    return {legs:picks.length,estimatedLegs:known.length,unestimatedLegs:picks.length-known.length,dependenceUnsupported:dependent,winProbability:complete?known.reduce((v,p)=>v*p.probability,1):null,noLossProbability:complete?known.reduce((v,p)=>v*(p.probability+p.voidProbability),1):null,combinedOdds:picks.every(p=>Number.isFinite(p.odds)&&p.odds>=1.01)?picks.reduce((v,p)=>v*p.odds,1):null,assumption:'Model estimates are experimental, not calibrated guarantees. Ticket percentages multiply leg estimates assuming independent matches. Shared teams, competitions and virtual generators can violate that assumption. More legs reduce the all-leg win probability; 50 legs at 80% each give about 0.0014% under independence. Same-match legs or missing estimates prevent a whole-ticket percentage.'};
  }
  function returnAssessment(legs){
    if(!legs.length)return {status:'incomplete',allowRevision:false,message:''};
    const before=summary(legs.map(l=>l.original)),after=summary(legs.map(l=>l.revised)),changed=legs.some(l=>l.changed),oldOdds=before.combinedOdds,newOdds=after.combinedOdds;
    if(!Number.isFinite(oldOdds)||!Number.isFinite(newOdds))return {status:'incomplete',allowRevision:false,message:'Current prices are incomplete. Check the ticket again.'};
    const ratio=newOdds/oldOdds,profitRetention=oldOdds>1?(newOdds-1)/(oldOdds-1):null,ceiling=legs.every(l=>Number.isFinite(l.maximumQualifiedOdds))?legs.reduce((v,l)=>v*l.maximumQualifiedOdds,1):null,base={originalOdds:oldOdds,revisedOdds:newOdds,oddsChange:ratio-1,profitRetention,qualifiedOddsCeiling:ceiling};
    // A warning is not evidence of a better available market. Leave the exact
    // matches intact and report an unsuitable revision instead of forcing one.
    if(changed&&oldOdds>=5&&(newOdds<2||profitRetention<.1))return {...base,status:'low-return',allowRevision:false,message:'Severe return reduction: '+oldOdds.toFixed(2)+' → '+newOdds.toFixed(2)+' odds ('+Math.round((1-ratio)*100)+'% lower). This is a low-return comparison, not a recommended revision. No revised code will be generated.'+(ceiling?' The highest combined odds verified within this supported-market scan are '+ceiling.toFixed(2)+'.':'')+' Use Auto picks if you want to search other matches for your target; this review keeps the original matches.'};
    if(changed&&Number.isFinite(profitRetention)&&profitRetention<.25)return {...base,status:'large-reduction',allowRevision:true,message:'Large return reduction: '+oldOdds.toFixed(2)+' → '+newOdds.toFixed(2)+' odds ('+Math.round((1-ratio)*100)+'% lower). Review the trade-off before choosing this ticket. Higher-return qualifying replacements were not verified.'};
    return {...base,status:changed?'balanced':'unchanged',allowRevision:true,message:changed?'The same matches are retained. Only weak or unsupported markets were replaced, balancing the history filter with useful odds.':'Original qualifying markets are retained, including any short prices you already chose.'};
  }
  return {key,leg,summary,returnAssessment};
});
