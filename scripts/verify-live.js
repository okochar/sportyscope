/* Read-only live verification. Does not create reservations or place bets. */
'use strict';
const {load} = require('../lib/feeds');
const {request} = require('../lib/upstream');
const model = require('../assets/model');
const fs = require('node:fs/promises');
const path = require('node:path');
async function verify(family,mode='upcoming') {
  let page=1,pages=0,events=[],ids=new Set();
  while(true) {
    const d=await load({family,mode,page});pages++;
    const fresh=d.events.filter(e=>!ids.has(e.id));
    if(d.more&&!fresh.length)throw new Error('Repeated page in '+family);
    fresh.forEach(e=>{ids.add(e.id);events.push(e);});
    console.log(family,mode,'page',page,'unique',events.length,'more',d.more);
    if(!d.more)break;page=d.nextPage;
  }
  const result={family,mode,ok:true,pages,count:events.length,leagues:[...new Set(events.map(e=>e.league))],sample:events[0]?{eventId:events[0].rawEventId,home:events[0].home,away:events[0].away,markets:events[0].markets.length}:null};
  if(['Real','vFootball'].includes(family)&&events.length) {
    const p=await request('/factsCenter/event?'+new URLSearchParams({productId:String(events[0].productId),eventId:events[0].rawEventId}));
    const e=model.sports(p,family)[0];result.detail={eventId:e.rawEventId,markets:e.markets.length,outcomes:e.markets.reduce((n,m)=>n+m.outcomes.length,0),allReturnedMarketsPreserved:e.markets.length===p.data.markets.length};
  }
  return result;
}
(async()=>{
  const startedAt=new Date().toISOString();
  const results=[];
  for(const [family,mode] of [['vFootball','upcoming'],['Real','upcoming'],['Scheduled','upcoming'],['Instant','upcoming'],['vFootball','live'],['Real','live'],['Scheduled','live']]){
    try{results.push(await verify(family,mode));}catch(e){console.error(family,mode,e.message);results.push({family,mode,ok:false,error:e.message,upstreamStatus:e.upstreamStatus});}
  }
  const report={startedAt,completedAt:new Date().toISOString(),results};
  await fs.mkdir(path.join(__dirname,'../test-results'),{recursive:true});
  await fs.writeFile(path.join(__dirname,'../test-results/live.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(results.some(r=>!r.ok))process.exitCode=1;
})();
