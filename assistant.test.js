'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const endpoint = require('../api/assistant');
const {collectEvents,cleanParams,htmlEsc} = endpoint._test;

function response() {
  return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
}
const payload={ok:true,mode:'upcoming',fetchedAt:'2026-10-24T11:00:00Z',payload:{data:{events:[
  {eventId:'1',homeTeamName:'A FC',awayTeamName:'B FC',tournamentName:'Virtual EPL',markets:[{id:'1',desc:'1X2',outcomes:[{id:'1',desc:'1',odds:'2.50'},{id:'2',desc:'X',odds:'3.10'}]}]},
  {eventId:'2',homeTeamName:'C FC',awayTeamName:'D FC',tournamentName:'Virtual EPL',markets:[]}
]}}};

test('parses fixture records and preserves all supplied outcomes',()=>{
  const ev=collectEvents(payload.payload);
  assert.equal(ev.length,2);assert.equal(ev[0].markets[0].outcomes.length,2);
  assert.equal(ev[0].markets[0].outcomes[0].odds,'2.5');
});
test('safe, bounded query and HTML escaping',()=>{
  assert.deepEqual(cleanParams({kind:'no',page:'999999',mode:'no'}),{kind:'virtual',mode:'upcoming',page:1,event:''});
  assert.equal(htmlEsc('<script>'), '&lt;script&gt;');
});
test('renders a browsable HTML match index with detail links',async()=>{
  global.fetch=async()=>({ok:true,text:async()=>JSON.stringify(payload)});
  process.env.VIRTUALSCOPE_BASE_URL='http://localhost:3000';
  const r=response();await endpoint({method:'GET',query:{kind:'virtual',page:'1'}},r);
  assert.equal(r.statusCode,200);assert.match(r.body,/A FC vs B FC/);
  assert.match(r.body,/event=1/);assert.match(r.headers['Content-Type'],/text\/html/);
});
test('renders selected match markets, not fabricated odds',async()=>{
  global.fetch=async()=>({ok:true,text:async()=>JSON.stringify(payload)});
  const r=response();await endpoint({method:'GET',query:{kind:'virtual',page:'1',event:'1'}},r);
  assert.equal(r.statusCode,200);assert.match(r.body,/1X2/);assert.match(r.body,/2\.5/);
  assert.doesNotMatch(r.body,/Correct Score/);
});
test('rejects writes',async()=>{
  const r=response();await endpoint({method:'POST',query:{}},r);assert.equal(r.statusCode,405);
});
