(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScopeLiveClock=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';const MAX_AGE=90000,phases=new Set(['H1','H2','ET1','ET2']);
 function seconds(clock){const m=/^(\d{1,3}):([0-5]\d)$/.exec(clock||'');return m?Number(m[1])*60+Number(m[2]):null;}
 function format(value){const n=Math.max(0,Math.floor(value)),pad=v=>String(v).padStart(2,'0');return [pad(Math.floor(n/3600)),pad(Math.floor(n/60)%60),pad(n%60)].join(':');}
 function measuredRate(samples){if(samples.length<3)return null;const rates=[];for(let i=1;i<samples.length;i++){const dt=(samples[i].at-samples[i-1].at)/1000,ds=samples[i].seconds-samples[i-1].seconds;if(dt<5||dt>60||ds<=0)return null;rates.push(ds/dt);}if(Math.min(...rates)<.5||Math.max(...rates)>120||Math.max(...rates)/Math.min(...rates)>1.5)return null;return (samples.at(-1).seconds-samples[0].seconds)/((samples.at(-1).at-samples[0].at)/1000);}
 function create(){const observations=new Map();
  function observe(live){if(!live?.eventId||!live.family)return;const key=live.family+'|'+live.eventId,at=Date.parse(live.observedAt),value=seconds(live.clock);if(!Number.isFinite(at)||value===null||live.stale||live.state!=='live'||!phases.has(live.phase))return;let entry=observations.get(key);if(!entry||entry.phase!==live.phase){entry={phase:live.phase,samples:[]};observations.set(key,entry);}const last=entry.samples.at(-1);if(last&&(at<=last.at||value===last.seconds))return;if(last&&(value<last.seconds||at-last.at>MAX_AGE))entry.samples=[];entry.samples.push({at,seconds:value});entry.samples=entry.samples.slice(-3);if(observations.size>500)observations.delete(observations.keys().next().value);}
  function view(live,now=Date.now()){
   const base=seconds(live?.clock),observedAt=Date.parse(live?.observedAt),phase=live?.phase,entry=observations.get(live?.family+'|'+live?.eventId),last=entry?.samples.at(-1),anchored=entry?.phase===phase&&last?.seconds===base&&observedAt>=last.at,at=anchored?last.at:observedAt,known=Number.isFinite(at),age=known?Math.max(0,now-at):0,stale=Boolean(live?.stale)||!known||age>=MAX_AGE,active=live?.state==='live'&&phases.has(phase);
   const rate=live?.family==='Real'?1:anchored?measuredRate(entry.samples):null;
   const estimated=active&&base!==null&&rate!==null&&!live?.stale&&known;let value=base;
   if(estimated){value=base+Math.min(age,MAX_AGE)/1000*rate;const end={H1:2700,H2:5400,ET1:6300,ET2:7200}[phase];if(base<end)value=Math.min(end,value);}
   const text=value===null?(phase==='HT'?'Half-time':phase||'Clock unavailable'):format(value);
   const label=stale?'Clock paused · waiting for provider':phase==='HT'?'Half-time · clock paused':['Pause','Paused','Suspended'].includes(phase)?'Match paused':estimated?'Estimated match clock':active&&live.family==='vFootball'?'Provider clock · measuring pace':'Provider clock';
   return {text,label,stale,estimated,running:estimated&&!stale,age:known?format(age/1000):'unavailable'};
  }
  return {observe,view};
 }
 return {create,seconds,format,measuredRate};
});
