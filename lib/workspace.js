'use strict';
function validate(body){
  if(!body||!['slip','preferences','journal','imports'].includes(body.component)||!Number.isSafeInteger(body.revision)||body.revision<0)throw Error('Invalid workspace component or revision.');
  const p=body.payload;
  if(body.component==='preferences'){
    require('../assets/analysis').settings(p?.analysis||{});if(typeof p?.autoAnalyze!=='boolean'||typeof p?.autoCodes!=='boolean')throw Error('Invalid analysis preferences.');
    return {analysis:require('../assets/analysis').settings(p.analysis),autoAnalyze:p.autoAnalyze,autoCodes:p.autoCodes};
  }
  if(!Array.isArray(p)||p.length>(body.component==='slip'?30:10000))throw Error('Workspace record count exceeded.');
  if(body.component==='slip')for(const row of p)if(!row||typeof row.event!=='string'||!Number.isFinite(row.odds)||row.odds<1.01||!['Real','vFootball','Scheduled','Instant'].includes(row.family))throw Error('Invalid saved slip.');
  if(body.component==='journal')for(const row of p)if(!row||typeof row.name!=='string'||row.name.length>140||typeof row.result!=='string'||typeof row.date!=='string')throw Error('Invalid saved journal.');
  if(body.component==='imports')for(const row of p)if(!row||row.sourceKind!=='user'||typeof row.home!=='string'||typeof row.away!=='string'||!Array.isArray(row.markets))throw Error('Only user imports belong in saved import records.');
  return p;
}
module.exports={validate};
