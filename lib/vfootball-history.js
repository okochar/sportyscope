'use strict';
const {request}=require('./upstream'),{normalize}=require('./results'),{store}=require('./knowledge-store');
let cache=null,pending=null;
const DAY=86400000;
function league(value,key){return {...value,records:value.records.filter(r=>r.tournamentId===key),tournamentId:key};}
async function load(event,fetcher){
  const key=event.tournamentId;if(!/^sv:league:[1-5]$/.test(key||''))throw Error('A verified vFootball league is required.');
  if(!fetcher&&cache&&Date.now()-cache.at<180000)return league(cache.value,key);
  if(!fetcher&&pending)return league(await pending,key);
  const task=(async()=>{
    let retained=cache?.value;if(!fetcher&&store.configured)try{retained=await store.readModel('vfootball-history-latest')||retained;}catch{}
    const now=Date.now();if(retained?.complete&&Array.isArray(retained.records)&&now-new Date(retained.retrievedAt).getTime()<180000){cache={at:now,value:retained};return retained;}
    const days=retained?.complete&&Array.isArray(retained.records)?Math.min(14,Math.max(2,Math.ceil((now-new Date(retained.retrievedAt).getTime())/DAY)+1)):14;
    const today=Math.floor((now+3600000)/DAY)*DAY-3600000,records=[],ids=new Set(),failedDays=[];let pages=0,index=0;
    async function worker(){while(index<days){const day=index++,start=today-day*DAY,end=Math.min(now,start+DAY-1);let more=true,lastId='';const cursors=new Set();try{
      while(more){const path='/factsCenter/eventResultList?'+new URLSearchParams({sportId:'sr:sport:202120001',startTime:String(start),endTime:String(end),count:'20',lastId}),p=await request(path,{fetcher}),d=p.data;
        if(!Array.isArray(d?.tournaments)||typeof d.moreEvents!=='boolean')throw Error('Unknown vFootball result pagination.');pages++;
        for(const raw of d.tournaments.flatMap(t=>t.events||[])){const r=normalize(raw,'vFootball',now);if(r&&r.time>=start&&r.time<=end&&!ids.has(r.id)){records.push(r);ids.add(r.id);}}
        more=d.moreEvents;if(more){lastId=d.tournaments.at(-1)?.id;if(!lastId||cursors.has(lastId))throw Error('vFootball history cursor repeated.');cursors.add(lastId);}
      }
    }catch{failedDays.push(new Date(start+3600000).toISOString().slice(0,10));}}}
    await Promise.all([worker(),worker()]);if(!records.length)throw Error('No completed vFootball results returned.');
    const all=new Map((retained?.records||[]).map(r=>[r.id,r]));for(const r of records)all.set(r.id,r);records.splice(0,records.length,...all.values());records.sort((a,b)=>a.time-b.time);
    const value={records,complete:failedDays.length===0,failedDays,pages,retrievedAt:new Date(now).toISOString(),windowDays:14,source:'SportyBet official vFootball daily results',sourceUrl:'https://www.sportybet.com/ng/m/liveResult'};
    if(!fetcher){cache={at:now,value};if(store.configured)try{await store.saveModel('vfootball-history-latest','vFootball',value);}catch{}}return value;
  })();
  if(!fetcher){pending=task;task.finally(()=>{pending=null;}).catch(()=>{});}return league(await task,key);
}
module.exports={load};
