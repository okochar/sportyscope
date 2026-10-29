'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {query,load}=require('../lib/feeds');const {request}=require('../lib/upstream');const model=require('../assets/model');const {book,validate,verify}=require('../lib/booking');const {createServer}=require('../dev-server');
const fixture=name=>require('./fixtures/'+name+'.json');
const respond=body=>new Response(JSON.stringify(body),{status:200});
test('Queries validate categories and modes without imposing an event/page cap',()=>{
 assert.equal(query({page:'5000'}).page,5000);
 for(const q of [{family:'http://evil.test'},{mode:'results'},{page:'-1'},{page:'1.2'},{family:'Instant',mode:'live'}])assert.throws(()=>query(q));
});
test('Sports fixtures use the observed ordered POST request and preserve pagination',async()=>{
 let captured;const data=await load({family:'vFootball',mode:'upcoming',page:2},async(url,opts)=>{captured={url,opts};return respond(fixture('virtual-page'));});
 assert.equal(new URL(captured.url).hostname,'www.sportybet.com');
 assert.equal(new URL(captured.url).pathname,'/api/ng/factsCenter/wapConfigurableEventsByOrder');
 assert.equal(captured.opts.method,'POST');assert.equal(JSON.parse(captured.opts.body).pageNum,2);assert.equal(JSON.parse(captured.opts.body).sportId,'sr:sport:202120001');
 assert.equal(captured.opts.headers['country-code'],'ng');assert.equal(captured.opts.headers.platform,'wap');
 assert.equal(data.more,true);assert.equal(data.nextPage,3);assert.equal(data.events[0].gameType,'vFootball');
});
test('Real football has its own sport ID and retains country and tournament labels',async()=>{
 const data=await load({family:'Real',mode:'upcoming',page:1},async(url,opts)=>{assert.equal(JSON.parse(opts.body).sportId,'sr:sport:1');return respond(fixture('real-page'));});
 assert.match(data.events[0].league,/England.*Premier League/);assert.equal(data.events[0].gameType,'Real');
});
test('All recorded full-event markets and outcomes survive normalization',()=>{
 const raw=fixture('real-detail'),event=model.sports(raw,'Real')[0];assert.equal(event.markets.length,raw.data.markets.length);assert.ok(event.markets.length>1000);
 assert.equal(event.markets.reduce((n,m)=>n+m.outcomes.length,0),raw.data.markets.reduce((n,m)=>n+m.outcomes.length,0));
});
test('Numeric disabled flags, suspended markets and legitimate 1.00 odds are handled',()=>{
 const m=model.markets({markets:[{id:'1',status:1,outcomes:[{id:'1',desc:'Home',odds:'1.00',isActive:0},{id:'2',desc:'Draw',odds:'3.50',isActive:1}]}]})[0];
 assert.equal(m.active,false);assert.equal(m.outcomes[0].active,false);assert.equal(m.outcomes[0].odds,1);assert.equal(m.outcomes[1].active,true);
});
test('Scheduled compact payload uses supplied keys, preserving every returned market',()=>{
 const raw=fixture('scheduled');const decoded=model.unpack(raw.data.wrapLeagueMatchdayList);const events=model.scheduled(raw,'upcoming');assert.ok(events.length>0);
 const target=decoded.flatMap(l=>l.matchdays).flatMap(d=>d.events).find(e=>e.eventId===events[0].rawEventId);
 assert.equal(events[0].markets.length,target.markets.length);assert.ok(events[0].league.includes('Matchday'));assert.ok(events[0].closeAt);assert.equal(events[0].gameType,'Scheduled');
});
test('Instant payload remains an anonymous round snapshot with actual league labels',()=>{
 const raw=fixture('instant'),round=fixture('instant-round');const events=model.instant(raw,round);assert.equal(events.length,raw.wrapEventList.value.length);assert.equal(events[0].league,'England');assert.equal(events[0].roundId,raw.roundId);assert.match(events[0].status,/Anonymous/);assert.equal(events[0].markets.length,model.unpack(raw.wrapEventList)[0].markets.length);
});
test('Instant inconsistent rounds are rejected rather than mixed',async()=>{
 await assert.rejects(()=>load({family:'Instant',mode:'upcoming',page:1},async url=>respond(url.includes('prepare_')?{...fixture('instant-round'),roundId:'changed'}:fixture('instant'))),/round changed/);
});
test('Recorded complete live feed includes all 48 virtual games across five leagues',()=>{
 const events=model.sports(fixture('virtual-live'),'vFootball');assert.equal(events.length,48);assert.equal(new Set(events.map(e=>e.league)).size,5);assert.equal(events[0].productId,1);
});
test('Instant detail preserves all 71 returned markets, beyond the listing subset',()=>{
 const raw=fixture('instant-detail');const event=model.event(raw.events[0],'Instant',{roundId:raw.roundId});assert.equal(event.markets.length,71);assert.equal(event.roundId,raw.roundId);
});
test('Business failures and non-JSON responses never become successful feeds',async()=>{
 await assert.rejects(()=>request('/factsCenter/event',{fetcher:async()=>respond({bizCode:19000})}),/rejected/);
 await assert.rejects(()=>request('/factsCenter/event',{fetcher:async()=>new Response('<html>error</html>',{status:422})}),/non-JSON/);
});
test('Booking validates supported products, identifiers and one pick per event',()=>{
 for(const body of [{family:'Instant',selections:[]},{family:'Real',selections:[{eventId:'fake'}]}])assert.throws(()=>validate(body));
 const s={eventId:'sr:match:1',marketId:'18',outcomeId:'12',specifier:'total=1.5'};assert.throws(()=>validate({family:'Real',selections:[s,s]}));
});
test('Genuine booking code is exposed only after exact SportyBet readback',async()=>{
 const issued=fixture('booking-issued'),loaded=fixture('booking-loaded');const selections=issued.data.ticket.selections.map(s=>({eventId:s.eventId,marketId:s.marketId,outcomeId:s.outcomeId,specifier:s.specifier||''}));let calls=0;
 const result=await book({family:'Real',selections},async(url,opts)=>{calls++;if(calls===1){assert.match(url,/orders\/share\?throwInvalidEvent=true$/);assert.deepEqual(Object.keys(JSON.parse(opts.body)),['selections']);return respond(issued);}assert.match(url,new RegExp('/orders/share/'+issued.data.shareCode+'$'));assert.equal(opts.method,'GET');return respond(loaded);});
 assert.equal(calls,2);assert.equal(result.code,issued.data.shareCode);assert.ok(result.url.startsWith('https://www.sportybet.com/ng/'));
});
test('Partial or different booking readback is rejected',()=>{
 const d=structuredClone(fixture('booking-loaded').data),sels=d.ticket.selections;assert.throws(()=>verify({...d,unavailableOutcomes:[{}]},sels,'Real'));
 assert.throws(()=>verify(d,[{...sels[0],specifier:'total=99.5'}],'Real'),/did not match/);
 assert.throws(()=>verify(d,sels,'vFootball'),/different category/);
});
test('Local app serves versioned assets, protects server files and rejects unsupported API methods',async()=>{
 const server=createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await fetch(base).then(r=>r.text());assert.match(html,/app.js\?v=5.5.0/);assert.match(html,/model.js/);
 const status=await fetch(base+'/api/status');assert.equal(status.headers.get('x-virtualscope-version'),'5.5.0');assert.equal((await status.json()).version,'5.5.0');
 assert.equal((await fetch(base+'/lib/upstream.js')).status,404);assert.equal((await fetch(base+'/api/virtual',{method:'POST'})).status,405);assert.equal((await fetch(base+'/api/book')).status,405);assert.equal((await fetch(base+'/api/event?eventId=evil&family=Real')).status,400);
 const invalid=await fetch(base+'/api/book',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:'{}'});assert.equal(invalid.status,403);
 }finally{await new Promise(ok=>server.close(ok));}
});
