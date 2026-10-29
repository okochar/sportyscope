'use strict';
const {request}=require('./upstream'),results=require('./results'),liveState=require('./live-state'),M=require('../assets/tracking-model');
const cache=new Map(),pending=new Map();
async function inspect(id,family,{fetcher,now=Date.now()}={}){
 const key=family+'|'+id,old=cache.get(key);if(!fetcher&&old&&now<old.expires)return old.value;if(!fetcher&&pending.has(key))return pending.get(key);
 const job=(async()=>{let completed=null;try{completed=await results.eventResult(id,family,fetcher);}catch{}let live=null;
  if(!completed){for(const productId of ['1','3']){try{const p=await request('/factsCenter/event?'+new URLSearchParams({eventId:id,productId}),{fetcher});if(p.data?.eventId!==id)throw Error('Tracking event identity mismatch.');live=liveState.normalize(p.data,family,now);if(live)break;}catch(e){if(productId==='3'&&!old)throw e;}}}
  const value={result:completed,live:live||old?.value?.live&&{...old.value.live,stale:true}||null};
  if(!fetcher){if(cache.size>1500)cache.delete(cache.keys().next().value);const ttl=completed?300000:live?.state==='live'?12000:live?.kickoff?Math.max(12000,Math.min(180000,live.kickoff-now)):30000;cache.set(key,{expires:now+ttl,value});}return value;
 })();if(!fetcher){pending.set(key,job);job.finally(()=>pending.delete(key)).catch(()=>{});}return job;
}
async function check(picks,{fetcher,db,now=Date.now()}={}){
 const grouped=new Map();for(const p of picks){const k=p.family+'|'+p.rawEventId;if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(p);}const entries=[...grouped.values()],updates=[];let index=0;
 await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(index<entries.length){const group=entries[index++],first=group[0],checkedAt=new Date(now).toISOString();let response,error;
  if(!['Real','vFootball'].includes(first.family))error='Completed results for this product are not connected.';
  else if(!/^sr:match:\d+$/.test(first.rawEventId))error='A verified provider match identifier is missing.';
  else try{response=await inspect(first.rawEventId,first.family,{fetcher,now});if(response.result&&db?.configured)try{await db.saveVerifiedResult(response.result);}catch{}}catch{error='Provider update unavailable; retaining the last verified state.';}
  for(const p of group){const base={key:M.key(p),checkedAt};if(response?.result)updates.push({...base,...results.settle(p,response.result),result:response.result,live:null,time:response.result.time});else updates.push({...base,status:error&&(!['Real','vFootball'].includes(p.family)||!/^sr:match:\d+$/.test(p.rawEventId))?'unverified':'pending',live:response?.live||null,time:response?.live?.kickoff||p.time,note:error||(response?.live?.state==='finished'?'Full-time state observed; waiting for the verified result.':response?.live?.state==='live'?'Live score is provisional.':'Awaiting kickoff or a verified completed result.')});}
 }}));return updates;
}
module.exports={inspect,check};
