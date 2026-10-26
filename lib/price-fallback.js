'use strict';
const R=require('../assets/research');
function fallback(event,reason){
  const rows=[];
  for(const m of event.markets||[]){
    const mapped=R.canonical(m,m.outcomes[0]||{}).market,line=Number((mapped.specifier||'').match(/^total=(\d+(?:\.\d+)?)$/)?.[1]);
    if(!(mapped.id==='1'&&m.outcomes.length===3||mapped.id==='18'&&m.outcomes.length===2&&line%1===.5))continue;
    if(m.outcomes.some(o=>!Number.isFinite(o.odds)||o.odds<1.01))continue;
    const total=m.outcomes.reduce((n,o)=>n+1/o.odds,0);
    for(const o of m.outcomes){const p=(1/o.odds)/total;rows.push({marketId:m.id,market:m.name,specifier:m.specifier||'',outcomeId:o.id,outcome:o.name,odds:o.odds,probability:p,voidProbability:0,expectedReturn:p*o.odds-1,active:m.active!==false&&o.active!==false});}
  }
  const {markets,...identity}=event;
  return {event:identity,evidenceMode:'price',status:'price-fallback',eligible:rows.length>0,comparisons:rows,marketsReturned:markets.length,issues:[reason,'Market-price fallback: normalized implied prices are used to rank available outcomes. This is not a historical prediction, learned win probability or proven edge.'],coverage:[{name:'Current verified market prices',status:'ingested',detail:markets.length+' returned markets; price fallback uses only complementary 1X2 and half-goal totals.'},{name:'Historical evidence for this fixture',status:'missing',detail:reason}]};
}
module.exports=fallback;
