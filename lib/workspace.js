'use strict';
function validate(body){
  if(!body||!['slip','preferences','journal','imports','review'].includes(body.component)||!Number.isSafeInteger(body.revision)||body.revision<0)throw Error('Invalid workspace component or revision.');
  const p=body.payload;
  if(body.component==='review'){
    if(!p||!Array.isArray(p.legs)||p.legs.length>50||!Number.isFinite(p.threshold)||p.threshold<.75||p.threshold>.99||!Number.isFinite(p.analyzedAt))throw Error('Invalid saved ticket review.');
    if(p.loaded&&(!/^[A-Z0-9]{4,16}$/.test(p.loaded.code||'')||!['Real','vFootball'].includes(p.loaded.family)||!Array.isArray(p.loaded.slip)||p.loaded.slip.length<1||p.loaded.slip.length>50))throw Error('Invalid saved review code.');
    return {loaded:p.loaded||null,legs:p.legs,analyzedAt:p.analyzedAt,threshold:p.threshold};
  }
  if(body.component==='preferences'){
    require('../assets/analysis').settings(p?.analysis||{});if(typeof p?.autoAnalyze!=='boolean'||typeof p?.autoCodes!=='boolean')throw Error('Invalid analysis preferences.');
    return {analysis:require('../assets/analysis').settings(p.analysis),autoAnalyze:p.autoAnalyze,autoCodes:p.autoCodes};
  }
  if(!Array.isArray(p)||p.length>(body.component==='slip'?50:10000))throw Error('Workspace record count exceeded.');
  if(body.component==='slip')for(const row of p)if(!row||typeof row.event!=='string'||!Number.isFinite(row.odds)||row.odds<1.01||!['Real','vFootball','Scheduled','Instant'].includes(row.family))throw Error('Invalid saved slip.');
  if(body.component==='journal')for(const row of p)if(!row||typeof row.name!=='string'||row.name.length>140||typeof row.result!=='string'||typeof row.date!=='string')throw Error('Invalid saved journal.');
  if(body.component==='imports')for(const row of p)if(!row||row.sourceKind!=='user'||typeof row.home!=='string'||typeof row.away!=='string'||!Array.isArray(row.markets))throw Error('Only user imports belong in saved import records.');
  return p;
}
module.exports={validate};
