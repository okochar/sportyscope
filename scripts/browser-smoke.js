/* Deterministic UI regressions with recorded SportyBet responses. No bookings are created. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {createServer}=require('../dev-server');
const model=require('../assets/model');
const fs=require('node:fs/promises');
const path=require('node:path');
const fixture=n=>require('../tests/fixtures/'+n+'.json');
const version='4.0.0';
(async()=>{
 const server=createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const p=await browser.newPage();const errors=[],checks=[],calls=[];let fail=false,empty=false,passed=false;
 p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install();
 const vf=[...model.sports(fixture('virtual-page'),'vFootball'),...model.sports(fixture('virtual-page2'),'vFootball')];
 const real=model.sports(fixture('real-page'),'Real'),live=model.sports(fixture('virtual-live'),'vFootball');
 await p.route('**/api/virtual?**',async route=>{
  const u=new URL(route.request().url()),family=u.searchParams.get('family'),mode=u.searchParams.get('mode'),page=Number(u.searchParams.get('page'));
  calls.push({family,mode,page});await new Promise(ok=>setTimeout(ok,family==='Real'?250:100));
  if(fail)return route.fulfill({status:502,json:{version,ok:false,error:'Recorded test outage'}});
  let events=[],more=false;
  if(!empty){if(family==='Real')events=real;else if(mode==='live')events=live;else{events=page===1?model.sports(fixture('virtual-page'),'vFootball'):model.sports(fixture('virtual-page2'),'vFootball');more=page===1;}}
  await route.fulfill({json:{version,ok:true,family,mode,page,events,more,nextPage:more?page+1:null,fetchedAt:new Date().toISOString()}});
 });
 await p.route('**/api/event?**',async route=>{
  const u=new URL(route.request().url()),id=u.searchParams.get('eventId'),family=u.searchParams.get('family');
  const event=family==='Real'&&id===fixture('real-detail').data.eventId?model.sports(fixture('real-detail'),'Real')[0]:[...vf,...live].find(e=>e.rawEventId===id);
  await route.fulfill({json:{version,ok:true,event,fetchedAt:new Date().toISOString()}});
 });
 try{
  await p.goto(base);await p.locator('[data-family="Real"]').click();
  await p.waitForFunction(()=>document.querySelector('#statEvents').textContent!=='0'&&document.querySelector('#eventList').textContent.includes('Aston Villa'));
  await p.waitForTimeout(700);assert.ok((await p.locator('#eventList').innerText()).includes('Aston Villa'));checks.push('Tab switch while another feed loads cannot replace real data with virtual data');
  await p.locator('[data-family="vFootball"]').click();await p.waitForFunction(()=>document.querySelector('#connectionBadge').textContent.includes('complete'));
  assert.equal(Number(await p.locator('#statEvents').innerText()),new Set(vf.map(e=>e.id)).size);assert.ok(calls.some(c=>c.family==='vFootball'&&c.page===2));checks.push('Every returned fixture page loads automatically');
  const before=calls.length;await p.locator('[data-family="Real"]').click();await p.locator('[data-family="vFootball"]').click();assert.equal(calls.length,before);checks.push('Returning to a fresh category restores data without a reload request');
  await p.locator('[data-mode="live"]').click();await p.waitForFunction(()=>document.querySelector('#statEvents').textContent==='48');checks.push('All 48 captured live virtual games render');
  const count=await p.locator('#statEvents').innerText();fail=true;await p.locator('#fetchBtn').click();await p.waitForFunction(()=>document.querySelector('#dataNotice').textContent.includes('Recorded test outage'));assert.equal(await p.locator('#statEvents').innerText(),count);checks.push('Failed refresh retains previous records and reports the error');
  const requestsBefore=calls.length;fail=false;await p.clock.fastForward(45001);await p.waitForFunction(()=>document.querySelector('#connectionBadge').textContent.includes('complete'));assert.ok(calls.length>requestsBefore);checks.push('45-second timer refreshes without a user click');
  empty=true;await p.locator('#fetchBtn').click();await p.waitForFunction(()=>document.querySelector('#statEvents').textContent==='0');checks.push('A verified empty response removes expired records');empty=false;
  await p.locator('[data-family="Real"]').click();await p.waitForFunction(()=>document.querySelectorAll('.market-entry').length>1000);
  assert.equal(await p.locator('.market-entry').count(),fixture('real-detail').data.markets.length);checks.push('All recorded 1,990 full-event markets render');
  await p.locator('.slip-pick:not([disabled])').first().click();assert.equal(await p.locator('#slipCount').innerText(),'1');
  await p.locator('.slip-pick:not([disabled])').nth(1).click();assert.equal(await p.locator('#slipCount').innerText(),'1');assert.equal(await p.locator('#bookSlip').isEnabled(),true);
  await p.reload();await p.waitForFunction(()=>document.querySelector('#slipCount').textContent==='1');checks.push('Local slip persists after reload and replaces a conflicting pick');
  await p.locator('[data-remove]').click();assert.equal(await p.locator('#slipCount').innerText(),'0');assert.equal(await p.locator('#bookSlip').isDisabled(),true);checks.push('Slip removal and booking eligibility work');
  await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('Mobile layout fits a 390px viewport');
  assert.deepEqual(errors,[]);checks.push('No browser JavaScript errors');passed=true;
 }finally{
  await browser.close();await new Promise(ok=>server.close(ok));
  const report={at:new Date().toISOString(),type:'Recorded-response UI regression',passed,checks,errors};await fs.mkdir(path.join(__dirname,'../test-results'),{recursive:true});await fs.writeFile(path.join(__dirname,'../test-results/browser.json'),JSON.stringify(report,null,2));console.log(report);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
