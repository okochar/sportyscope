'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../assets/tracking-model'),C=require('../assets/live-clock');
const now=Date.UTC(2026,9,30,10),snapshot=(extra={})=>({eventId:'sr:match:123',family:'Real',state:'live',phase:'H1',clock:'13:05',observedAt:new Date(now).toISOString(),...extra});
test('All history puts old pending tickets before newer completed tickets and keeps ongoing distinct',()=>{
 const tickets=[{id:'new-completed',createdAt:99,picks:[{status:'won'}]},{id:'ongoing',createdAt:2,picks:[{status:'pending',live:snapshot({observedAt:new Date().toISOString()})}]},{id:'old-pending',createdAt:1,picks:[{status:'pending',time:now+1000}]}],original=tickets.map(t=>t.id);
 assert.deepEqual(M.historyOrder(tickets).map(t=>t.id),['old-pending','ongoing','new-completed']);assert.deepEqual(tickets.map(t=>t.id),original);
});
test('A lost ticket remains active while another leg awaits its result; stale snapshots do not claim ongoing play',()=>{
 assert.equal(M.historyGroup([{status:'lost'},{status:'pending'}]),'pending');assert.equal(M.historyGroup([{status:'lost'},{status:'won'}]),'completed');assert.equal(M.historyGroup([{status:'pending',live:snapshot()}],now+91000),'pending');assert.equal(M.historyGroup([{status:'pending',live:snapshot({phase:'HT'})}],now),'ongoing');
});
test('Legs sort by kickoff across dates, keeping unknown times last and original booking selections unchanged',()=>{
 const rows=[{time:now+3600000},{time:null},{time:now+1800000},{time:now},{live:{kickoff:now+2100000}}];const ordered=M.chronological(rows);assert.deepEqual(ordered.map(M.kickoff),[now,now+1800000,now+2100000,now+3600000,Infinity]);assert.equal(rows[0].time,now+3600000);
});
test('Real clocks advance each second without another provider response and resync on the next response',()=>{
 const c=C.create(),s=snapshot();c.observe(s);assert.equal(c.view(s,now+1000).text,'00:13:06');assert.equal(c.view(s,now+5000).text,'00:13:10');const next=snapshot({clock:'13:12',observedAt:new Date(now+6000).toISOString()});c.observe(next);assert.equal(c.view(next,now+7000).text,'00:13:13');assert.equal(c.view(next,now+7000).estimated,true);
});
test('Repeated provider clock snapshots preserve the timer anchor and eventually become stale',()=>{
 const c=C.create(),first=snapshot();c.observe(first);assert.equal(c.view(first,now+14000).text,'00:13:19');const repeated=snapshot({observedAt:new Date(now+15000).toISOString()});c.observe(repeated);assert.equal(c.view(repeated,now+16000).text,'00:13:21');assert.equal(c.view(repeated,now+16000).age,'00:00:16');
 const stillRepeated=snapshot({observedAt:new Date(now+100000).toISOString()});c.observe(stillRepeated);assert.equal(c.view(stillRepeated,now+101000).running,false);assert.equal(c.view(stillRepeated,now+101000).stale,true);
});
test('Clocks freeze at half boundaries, during breaks and once provider snapshots become stale',()=>{
 const c=C.create(),s=snapshot({clock:'44:59'});assert.equal(c.view(s,now+5000).text,'00:45:00');const half=snapshot({phase:'HT',clock:'45:00'});assert.equal(c.view(half,now+5000).text,'00:45:00');assert.equal(c.view(half,now+5000).running,false);
 const stale=c.view(snapshot(),now+120000);assert.equal(stale.running,false);assert.equal(stale.text,c.view(snapshot(),now+180000).text);assert.equal(stale.age,'00:02:00');assert.match(stale.label,/waiting for provider/);assert.equal(c.view(snapshot({phase:'Suspended'}),now+10000).text,'00:13:05');
});
test('Virtual clocks use measured consistent pace, with a running update-age timer until pace is known',()=>{
 const c=C.create(),s=snapshot({family:'vFootball',clock:'10:00'});c.observe(s);let v=c.view(s,now+2000);assert.equal(v.text,'00:10:00');assert.equal(v.age,'00:00:02');assert.equal(v.estimated,false);
 for(const [ms,clock]of [[10000,'15:00'],[20000,'20:00']])c.observe({...s,clock,observedAt:new Date(now+ms).toISOString()});const latest={...s,clock:'20:00',observedAt:new Date(now+20000).toISOString()};v=c.view(latest,now+21000);assert.equal(v.text,'00:20:30');assert.equal(v.estimated,true);
});
test('Virtual pace never crosses fixtures or halves, and repeated, stale or irregular samples cannot invent a rate',()=>{
 assert.equal(C.measuredRate([{at:0,seconds:1},{at:10000,seconds:1},{at:20000,seconds:1}]),null);assert.equal(C.measuredRate([{at:0,seconds:0},{at:10000,seconds:10},{at:20000,seconds:600}]),null);
 const c=C.create(),s=snapshot({family:'vFootball'});for(const [ms,clock]of [[0,'10:00'],[10000,'15:00'],[20000,'20:00']])c.observe({...s,clock,observedAt:new Date(now+ms).toISOString()});assert.equal(c.view({...s,eventId:'sr:match:999'},now+1000).estimated,false);const second={...s,phase:'H2',clock:'46:00',observedAt:new Date(now+30000).toISOString()};c.observe(second);assert.equal(c.view(second,now+31000).estimated,false);
});
test('Unknown clocks and timestamps stay unknown and hour/minute/second formatting is explicit',()=>{
 const c=C.create();assert.equal(C.seconds('00:99'),null);assert.equal(C.format(4748),'01:19:08');assert.equal(c.view(snapshot({clock:null}),now).estimated,false);assert.equal(c.view(snapshot({observedAt:null}),now).running,false);
});
