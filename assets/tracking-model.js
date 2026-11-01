(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScopeTrackingModel=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const key=p=>[p.family,p.rawEventId,p.marketId,p.specifier||'',p.outcomeId].join('|');
  const marketKey=p=>[p.family,p.marketId,p.specifier||'',p.outcomeId].join('|');
  const settled=p=>['won','lost','void'].includes(p.status);
  function kickoff(p){const value=p.time||p.live?.kickoff,n=Number(value)||Date.parse(value);return Number.isFinite(n)&&n>0?n:Infinity;}
  function chronological(picks){return [...picks].sort((a,b)=>{const x=kickoff(a),y=kickoff(b);return x===y?0:x-y;});}
  function historyGroup(picks,now=Date.now()){const open=picks.filter(p=>!settled(p));if(picks.length&&!open.length)return 'completed';return open.some(p=>p.live?.state==='live'&&!p.live.stale&&now-Date.parse(p.live.observedAt)<90000)?'ongoing':'pending';}
  function historyOrder(tickets){const rank={pending:0,ongoing:1,completed:2};return [...tickets].sort((a,b)=>{const ag=historyGroup(a.picks),bg=historyGroup(b.picks);if(ag!==bg)return rank[ag]-rank[bg];if(ag!=='completed'){const next=t=>Math.min(...t.picks.filter(p=>!settled(p)).map(kickoff)),x=next(a),y=next(b);if(x!==y)return x-y;}return (b.createdAt||0)-(a.createdAt||0);});}
  function applyUpdate(p,u){
    if(p.result?.id&&p.verifiedAt&&['won','lost','void'].includes(p.status)&&!u.result){p.checkedAt=u.checkedAt;return {changed:false,persist:false};}
    const old={status:p.status,result:p.result,live:p.live||null,time:p.time,note:p.note||''};
    const next={status:u.status,result:u.result||p.result,live:u.live||u.note?.includes('unavailable')&&p.live&&{...p.live,stale:true}||null,time:u.time||p.time,note:u.note||''};
    let changed=JSON.stringify(next)!==JSON.stringify(old),persist=next.status!==old.status||JSON.stringify(next.result)!==JSON.stringify(old.result)||next.time!==old.time||JSON.stringify(next.live&&[next.live.state,next.live.phase,next.live.score])!==JSON.stringify(old.live&&[old.live.state,old.live.phase,old.live.score]);
    if(changed)Object.assign(p,next);
    if(u.result&&['won','lost','void'].includes(u.status)&&!p.verifiedAt){p.verifiedAt=u.checkedAt;changed=persist=true;}
    p.checkedAt=u.checkedAt;
    return {changed,persist};
  }
  function ticketStatus(picks){if(picks.some(p=>p.status==='lost'))return 'lost';if(picks.some(p=>!p.status||p.status==='pending'))return 'pending';if(picks.some(p=>p.status==='unverified'))return 'unverified';if(picks.every(p=>p.status==='void'))return 'void';return picks.every(p=>['won','void'].includes(p.status))?'won':'pending';}
  function learning(tickets){const seen=new Set(),modelSeen=new Set(),ticketSeen=new Set(),markets={},families={};let samples=0,wins=0,brier=0,logLoss=0,trackedWins=0,trackedLosses=0,ticketWins=0,ticketLosses=0;for(const t of tickets){
    if(!ticketSeen.has(t.id)&&t.picks.every(p=>['won','lost','void'].includes(p.status)&&p.result?.id&&p.verifiedAt)){ticketSeen.add(t.id);if(t.picks.some(p=>p.status==='lost'))ticketLosses++;else if(t.picks.some(p=>p.status==='won'))ticketWins++;}
    for(const p of t.picks){const k=key(p);if(!['won','lost'].includes(p.status)||!p.result?.id||!p.verifiedAt)continue;if(!seen.has(k)){seen.add(k);p.status==='won'?trackedWins++:trackedLosses++;}if(modelSeen.has(k)||!Number.isFinite(p.probability))continue;modelSeen.add(k);samples++;const y=p.status==='won'?1:0,q=Math.min(1-1e-6,Math.max(1e-6,p.probability));wins+=y;brier+=(q-y)**2;logLoss-=y*Math.log(q)+(1-y)*Math.log(1-q);const mk=marketKey(p);if(!markets[mk])markets[mk]={n:0,residual:0,wins:0};const m=markets[mk];m.n++;m.wins+=y;m.residual+=y-q;if(!families[p.family])families[p.family]={samples:0,wins:0};families[p.family].samples++;families[p.family].wins+=y;
    }}return {samples,markets,wins,losses:samples-wins,brier:samples?brier/samples:null,logLoss:samples?logLoss/samples:null,tracking:{wins:trackedWins,losses:trackedLosses},tickets:{wins:ticketWins,losses:ticketLosses},families};}
  return {key,marketKey,ticketStatus,learning,applyUpdate,kickoff,chronological,historyGroup,historyOrder};
});
