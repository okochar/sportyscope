(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScopeTrackingModel=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const key=p=>[p.family,p.rawEventId,p.marketId,p.specifier||'',p.outcomeId].join('|');
  const marketKey=p=>[p.family,p.marketId,p.specifier||'',p.outcomeId].join('|');
  function ticketStatus(picks){if(picks.some(p=>p.status==='lost'))return 'lost';if(picks.some(p=>!p.status||p.status==='pending'))return 'pending';if(picks.some(p=>p.status==='unverified'))return 'unverified';if(picks.every(p=>p.status==='void'))return 'void';return picks.every(p=>['won','void'].includes(p.status))?'won':'pending';}
  function learning(tickets){const seen=new Set(),markets={};let samples=0;for(const t of tickets)for(const p of t.picks){const k=key(p);if(seen.has(k)||!['won','lost'].includes(p.status)||!p.result?.id||!p.verifiedAt||!Number.isFinite(p.probability))continue;seen.add(k);samples++;const mk=marketKey(p);if(!markets[mk])markets[mk]={n:0,residual:0,wins:0};const m=markets[mk];m.n++;m.wins+=p.status==='won'?1:0;m.residual+=(p.status==='won'?1:0)-p.probability;}return {samples,markets};}
  return {key,marketKey,ticketStatus,learning};
});
