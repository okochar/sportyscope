(() => {
  'use strict';
  const $=id=>document.getElementById(id),A=ScopeAnalysis,VERSION='5.3.0';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const n=v=>Number.isFinite(v)?v.toFixed(2):'—',pct=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
  const date=v=>v?new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',day:'numeric',month:'short',year:'numeric'}).format(new Date(v)):'—';
  const states=Object.fromEntries(A.families.map(f=>[f,{reports:{},errors:{},running:false,code:null,analysis:null,scanned:0,total:0}]));
  const jobs=new Map();let opts=A.settings(),selected='',generation=0;
  const rankJobs=new Map(),latestRank=new Map();let rankId=0,rankWorker;
  try{rankWorker=new Worker('/assets/analysis-worker.js?v=5.3.0');rankWorker.onmessage=e=>{const pending=rankJobs.get(e.data.id);if(!pending)return;rankJobs.delete(e.data.id);e.data.error?pending.reject(Error(e.data.error)):pending.resolve(e.data.result);};rankWorker.onerror=()=>{for(const job of rankJobs.values())job.reject(Error('Background ranking could not start. Retry the scan.'));rankJobs.clear();rankWorker?.terminate();rankWorker=null;};}catch{}
  try{opts=A.settings(JSON.parse(localStorage.getItem('scope.research.settings')||'{}'));}catch{}
  for(const [id,k]of [['targetOdds','targetOdds'],['analysisLegs','legs'],['analysisMinOdds','minOdds'],['analysisMaxOdds','maxOdds']])$(id).value=opts[k];
  $('analysisFamily').value=opts.family;$('analysisWindow').value=opts.window;$('analysisConfidence').value=opts.minProbability;
  function picksBody(family,picks){return {family,settings:opts,selections:picks.map(p=>({eventId:p.rawEventId,marketId:p.marketId,specifier:p.specifier||'',outcomeId:p.outcomeId}))};}
  function invalidateCode(s){if(s.code&&(Date.now()>s.code.validUntil||Date.now()-new Date(s.code.verifiedAt).getTime()>90000))s.code=null;}
  function renderCards(){
    $('analysisCards').innerHTML=A.families.filter(f=>opts.family==='All'||f===opts.family).map(f=>{
      const s=states[f],a=s.analysis;invalidateCode(s);
      const status=s.running?`Researching ${s.scanned}/${s.total} eligible fixtures`:s.error||a?.message||'Waiting for a complete feed.';
      return `<article class="analysis-card"><div class="card-kicker">${esc(A.capabilities[f].label)}</div><h3>${s.running?'Building evidence':a?.picks.length?'Ranked automatic picks':'Evidence check'}</h3><p>${esc(status)}</p><small>${a?.scannedEvents||0} feed events · ${a?.scannedMarkets||0} returned markets reviewed · ${Object.keys(s.reports).length} profiles</small>${A.capabilities[f].reason?'<p class="research-gap">'+esc(A.capabilities[f].reason)+'</p>':''}${a?.picks.length?`<ol>${a.picks.map(p=>`<li><strong>${esc(p.home)} – ${esc(p.away)}</strong><br>${esc(p.market)} ${esc(p.specifier)} · ${esc(p.outcome)} @ ${n(p.odds)}<br><small>${esc(p.reason)}</small></li>`).join('')}</ol><p>Total snapshot odds <strong>${n(a.combinedOdds)}</strong> / target ${n(opts.targetOdds)}</p><button class="button subtle" type="button" data-use="${f}">Replace local slip with these picks</button>`:''}${s.code?`<p class="verified-code">Verified SportyBet code <strong>${esc(s.code.code)}</strong><br><a href="${esc(s.code.url)}" target="_blank" rel="noopener noreferrer">Load reservation ↗</a></p>`:''}${s.booking?'<p>Rechecking history, current prices and SportyBet reservation…</p>':''}${s.bookError?'<p class="research-gap">No verified code: '+esc(s.bookError)+'</p>':''}<button type="button" class="text-button" data-scan="${f}" ${s.running?'disabled':''}>Scan ${esc(f)}</button></article>`;
    }).join('');
  }
  function renderOptions(){
    const profiles=A.families.flatMap(f=>Object.values(states[f].reports).map(r=>({key:f+'|'+r.eventId,label:f+' · '+(r.event?`${r.event.home} vs ${r.event.away}`:r.statistics?`${r.statistics.homeTeam.teamName} vs ${r.statistics.awayTeam.teamName}`:r.eventId)})));
    $('researchProfile').innerHTML='<option value="">Select a researched match</option>'+profiles.map(p=>`<option value="${esc(p.key)}">${esc(p.label)}</option>`).join('');$('researchProfile').value=selected;
  }
  function table(headers,rows){return `<div class="research-table-wrap"><table class="research-table"><thead><tr>${headers.map(x=>'<th>'+esc(x)+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`;}
  function renderReport(){
    const [family,id]=selected.split('|'),r=states[family]?.reports[id];if(!r)return;
    const e=r.event,stats=r.statistics;
    let html=`<h3>${esc(e?e.home+' vs '+e.away:stats?stats.homeTeam.teamName+' vs '+stats.awayTeam.teamName:family+' research')}</h3><p>${esc(family)} · updated ${esc(new Date(r.analyzedAt).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}))} WAT</p>`;
    html+='<div class="coverage-grid">'+r.coverage.map(c=>`<div class="coverage-item"><span class="coverage-status ${esc(c.status)}">${esc(c.status)}</span><strong>${esc(c.name)}</strong><p>${esc(c.detail)}</p></div>`).join('')+'</div>';
    if(r.issues.length)html+='<p class="research-gap">'+r.issues.map(esc).join('<br>')+'</p>';
    if(r.home&&r.away){
      const h=r.home,a=r.away;
      html+='<h4>Team evidence and patterns</h4>'+table(['Statistic',e.home,e.away],[['Profile key',h.id,a.id],[r.evidenceMode==='archive'?'Distinct scored samples':'Completed matches',h.total.games,a.total.games],['History dates',date(h.oldest)+' – '+date(h.newest),date(a.oldest)+' – '+date(a.newest)],['W / D / L',`${h.total.wins} / ${h.total.draws} / ${h.total.losses}`,`${a.total.wins} / ${a.total.draws} / ${a.total.losses}`],['Recent form (oldest → newest)',h.form,a.form],['Goals scored / conceded per game',n(h.total.scored)+' / '+n(h.total.conceded),n(a.total.scored)+' / '+n(a.total.conceded)],['Home scoring / conceding',n(h.home.scored)+' / '+n(h.home.conceded),n(a.home.scored)+' / '+n(a.home.conceded)],['Away scoring / conceding',n(h.away.scored)+' / '+n(h.away.conceded),n(a.away.scored)+' / '+n(a.away.conceded)],['Last 5 scoring / previous 5',n(h.last5.scored)+' / '+n(h.previous5.scored),n(a.last5.scored)+' / '+n(a.previous5.scored)],['Clean sheets / failed to score',pct(h.total.cleanSheet)+' / '+pct(h.total.failedToScore),pct(a.total.cleanSheet)+' / '+pct(a.total.failedToScore)],['Both teams scored',pct(h.total.btts),pct(a.total.btts)],['Over 1.5 / 2.5 / 3.5 frequency',[h.total.over15,h.total.over25,h.total.over35].map(pct).join(' / '),[a.total.over15,a.total.over25,a.total.over35].map(pct).join(' / ')],['First-half goals scored / conceded',n(h.firstHalf.scored)+' / '+n(h.firstHalf.conceded),n(a.firstHalf.scored)+' / '+n(a.firstHalf.conceded)],['Second-half goals scored / conceded',n(h.secondHalf.scored)+' / '+n(h.secondHalf.conceded),n(a.secondHalf.scored)+' / '+n(a.secondHalf.conceded)],['Days since last completed game',n(h.restDays),n(a.restDays)]]);
      html+='<details><summary>Opponents and recent fixtures</summary>'+[h,a].map((p,i)=>'<h4>'+esc(i?e.away:e.home)+'</h4>'+table(['Opponent','Games','W / D / L','Goals for / against'],p.opponents.map(o=>[o.name,o.games,`${o.wins} / ${o.draws} / ${o.losses}`,n(o.scored)+' / '+n(o.conceded)]))+table(['Date','Match','FT','HT'],p.recent.map(x=>[date(x.time),x.home+' vs '+x.away,x.ft.join(':'),x.ht?.join(':')||'Missing']))).join('')+'</details>';
      html+='<details><summary>Dated head-to-head meetings ('+r.h2h.length+')</summary>'+table(['Date','Match','FT','HT'],r.h2h.map(x=>[date(x.time),x.home+' vs '+x.away,x.ft.join(':'),x.ht?.join(':')||'Missing']))+'</details>';
      if(r.fitted)html+='<h4>Experimental goal model</h4><p>'+esc(r.fitted.method)+'</p><p>Estimated goals: '+n(r.fitted.home)+' / '+n(r.fitted.away)+'. These are model rates, not measured xG.</p>';
      html+='<details><summary>Chronological model diagnostic</summary><p>Rolling over-2.5 total-goals diagnostic only. Lower Brier error is better. It does not validate profit, other markets, or combined odds.</p>'+table(['Team','Held-out fixtures','Model Brier','Frequency baseline','Skill'],[r.validation.home,r.validation.away].map((v,i)=>[i?e.away:e.home,v.samples,n(v.brier),n(v.baselineBrier),pct(v.skill)]))+'</details>';
      html+='<details><summary>All modeled market comparisons ('+r.comparisons.length+')</summary><p>Point estimates are experimental. Estimated return includes explicit void probability for whole goal lines. Unsupported settlements and quarter lines are excluded.</p>'+table(['Market / line','Outcome','Odds','Model win','Void','Estimated return','Available'],r.comparisons.map(c=>[c.market+' '+c.specifier,c.outcome,n(c.odds),pct(c.probability),pct(c.voidProbability),pct(c.expectedReturn),c.active?'Yes':'Suspended']))+'</details>';
      html+='<details><summary>Markets without a verified model ('+r.markets.unmodeled.reduce((n,m)=>n+m.count,0)+')</summary>'+table(['Market','Returned lines','Reason'],r.markets.unmodeled.map(m=>[m.name,m.count,m.reason]))+'</details>';
    }
    if(r.conditions)html+='<details><summary>40 market-condition profiles (observed counts)</summary><p>These are observed final-score conditions, not 40 independently trained prediction models. Corners and player events require their own records.</p>'+table(['Condition',e?.home||'Home',e?.away||'Away','Same-direction H2H'],r.conditions.home.map((c,i)=>[c.label,c.met+' / '+c.samples,r.conditions.away[i].met+' / '+r.conditions.away[i].samples,r.conditions.pair[i]?r.conditions.pair[i].met+' / '+r.conditions.pair[i].samples:'Unavailable']))+'</details>';
    if(stats){
      const h=stats.homeTeam,a=stats.awayTeam;
      html+='<h4>Provider descriptive statistics</h4>'+table(['Field',h.teamName,a.teamName],[['Provider rank',h.rank,a.rank],['Provider form',h.form,a.form],['Provider probability (not our estimate)',h.probability,a.probability],['Average points',h.avgPoints,a.avgPoints],['Average home goals',h.homeAvgScore,a.homeAvgScore],['Average away goals',h.awayAvgScore,a.awayAvgScore],['Average overall goals',h.overallAvgScore,a.overallAvgScore]]);
      html+='<details><summary>Recent and head-to-head records (undated)</summary>'+[h.recentMatches||[],a.recentMatches||[],stats.headToHead.matches].map(xs=>table(['Home','Away','Score'],xs.map(x=>[x.homeTeamName,x.awayTeamName,x.homeScore+':'+x.awayScore]))).join('')+'</details>';
    }
    html+='<details><summary>Sources and coverage</summary><ul>'+r.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a> · ${esc(s.retrievedAt)}${s.records!==undefined?' · '+s.records+' records'+(s.pages?' / '+s.pages+' pages · '+s.windowDays+'-day requested window':''):''}</li>`).join('')+'</ul><p>Free public viewing does not establish a general data redistribution licence. LiveScore Bet’s public client also uses statistics widgets; a reusable open feed has not been verified. <a href="https://www.livescorebet.com/ng/" target="_blank" rel="noopener noreferrer">LiveScore Bet ↗</a></p></details>';
    $('researchReport').innerHTML=html;
  }
  async function getReport(family,eventId){
    const key=family+'|'+eventId;if(jobs.has(key))return jobs.get(key);
    const job=(async()=>{const res=await fetch('/api/research?'+new URLSearchParams({family,eventId}),{cache:'no-store',signal:AbortSignal.timeout(60000)}),r=await res.json();if(!res.ok||!r.ok||r.version!==VERSION)throw Error(r.error||'Research version or response mismatch.');if(r.family!==family||r.eventId!==eventId)throw Error('Research identity mismatch.');states[family].reports[eventId]=r;delete states[family].errors[eventId];if(!selected)selected=key;renderOptions();if(selected===key)renderReport();return r;})();
    jobs.set(key,job);job.finally(()=>jobs.delete(key)).catch(()=>{});return job;
  }
  async function updateAnalysis(family,force=false){
    if(rankWorker&&rankJobs.size&&!force)return;
    const s=states[family],id=++rankId,token=generation;latestRank.set(family,id);
    const snapshot=ScopeApp.snapshot(family),light={...snapshot,events:snapshot.events.map(e=>{const {markets,...rest}=e;return {...rest,markets:[]};})};
    const reports=Object.fromEntries(Object.entries(s.reports).map(([key,r])=>[key,{family:r.family,eventId:r.eventId,event:r.event,eligible:r.eligible,analyzedAt:r.analyzedAt,evidenceMode:r.evidenceMode,comparisons:r.comparisons,marketsReturned:r.marketsReturned,markets:r.markets?{marketsReturned:r.markets.marketsReturned}:null,home:r.home?{total:r.home.total}:null,away:r.away?{total:r.away.total}:null}]));
    try{const result=rankWorker?await new Promise((resolve,reject)=>{rankJobs.set(id,{resolve,reject});rankWorker.postMessage({id,family,snapshot:light,settings:opts,now:Date.now(),reports,feedback:window.ScopeTracker?.feedback()});}):A.analyze(snapshot,family,opts,Date.now(),reports,window.ScopeTracker?.feedback());
      if(token!==generation||latestRank.get(family)!==id)return;s.analysis=result;if(s.code&&s.code.fingerprint!==result.fingerprint)s.code=null;renderCards();return result;
    }catch(e){s.error='Ranking unavailable: '+e.message;renderCards();}
  }
  async function autoBook(family){
    const s=states[family],a=s.analysis;if(!$('autoCodes').checked||!['Real','vFootball'].includes(family)||!a?.picks.length||s.booking)return;
    const key=a.fingerprint,leaseKey='scope.booking.lease',owner=crypto.randomUUID();invalidateCode(s);
    if(s.code?.fingerprint===key&&Date.now()-new Date(s.code.verifiedAt).getTime()<60000)return;
    try{const lease=JSON.parse(localStorage.getItem(leaseKey)||'null');if(lease?.until>Date.now())return;localStorage.setItem(leaseKey,JSON.stringify({owner,until:Date.now()+90000}));if(JSON.parse(localStorage.getItem(leaseKey)).owner!==owner)return;}catch{}
    const token=generation;s.booking=true;s.bookError='';renderCards();
    try{
      let previous;try{previous=JSON.parse(localStorage.getItem('scope.booking.last')||'null');}catch{}
      const body=picksBody(family,a.picks);if(previous?.fingerprint===key&&previous.validUntil>Date.now())body.code=previous.code;
      const res=await fetch('/api/auto-book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)}),r=await res.json();
      if(!res.ok||!r.ok||r.version!==VERSION)throw Error(r.error||'Booking read-back was not verified.');
      if(token!==generation||s.analysis.fingerprint!==key||!$('autoCodes').checked)return;
      const verifiedPicks=(r.picks||a.picks).map(p=>{const current=r.prices?.find(x=>x.eventId===p.rawEventId&&x.marketId===p.marketId&&x.specifier===(p.specifier||'')&&x.outcomeId===p.outcomeId);return {...p,odds:current?.odds||p.odds};});
      s.analysis.picks=verifiedPicks;s.analysis.combinedOdds=verifiedPicks.reduce((n,p)=>n*p.odds,1);s.analysis.message='Verified reservation snapshot '+s.analysis.combinedOdds.toFixed(2)+' toward target '+opts.targetOdds.toFixed(2)+'. Prices can change.';
      s.code={...r,fingerprint:key};window.ScopeTracker?.add(verifiedPicks,r.code);try{localStorage.setItem('scope.booking.last',JSON.stringify(s.code));}catch{}
    }catch(e){s.code=null;s.bookError=e.message;}finally{s.booking=false;try{if(JSON.parse(localStorage.getItem(leaseKey)||'null')?.owner===owner)localStorage.removeItem(leaseKey);}catch{}renderCards();}
  }
  async function scan(family){
    const s=states[family];if(document.hidden)return;if(s.running){s.requested=true;return;}const token=generation;s.running=true;s.error='';window.ScopeFeedback?.start('scan-'+family,'Loading '+family+' fixtures and history…');renderCards();
    try{
      await ScopeApp.refresh(family);const snapshot=ScopeApp.snapshot(family);if(!snapshot.complete||snapshot.error)throw Error(snapshot.error||'Incomplete feed; research waits.');
      const currentIds=new Set(snapshot.events.map(e=>e.rawEventId));for(const id of Object.keys(s.reports))if(!currentIds.has(id)&&selected!==family+'|'+id)delete s.reports[id];s.errors={};renderOptions();
      const now=Date.now(),events=snapshot.events.filter(e=>A.open(e,family,now,opts));s.total=events.length;s.scanned=0;let lastAnalysis=0;
      const queue=events;
      let index=0;async function worker(){while(index<queue.length){if(document.hidden||token!==generation||!$('autoAnalyze').checked&&s.automatic)break;const e=queue[index++],old=s.reports[e.rawEventId];try{if(!old||Date.now()-new Date(old.analyzedAt).getTime()>90000)await getReport(family,e.rawEventId);}catch(err){s.errors[e.rawEventId]=err.message;}s.scanned++;window.ScopeFeedback?.update('scan-'+family,'Checking '+family+': '+s.scanned+' / '+s.total+' matches',s.scanned,s.total);if(Date.now()-lastAnalysis>5000){lastAnalysis=Date.now();updateAnalysis(family);}else renderCards();}}
      await Promise.all([worker(),worker()]);
      const errors=Object.values(s.errors);if(errors.length)s.error=errors.length+' profile request(s) failed. '+errors[0];
      if(token!==generation)return;const finalAnalysis=await updateAnalysis(family,true);if(token!==generation||!finalAnalysis)return;if(s.analysis?.picks.length)window.ScopeTracker?.add(s.analysis.picks);await autoBook(family);
    }catch(e){s.error=e.message;s.code=null;}finally{s.running=false;window.ScopeFeedback?.finish('scan-'+family,s.error||s.analysis?.message,s.error?'error':'success');renderCards();if(s.requested){s.requested=false;if(opts.family==='All'||opts.family===family)scan(family);}}
  }
  async function scanAll(automatic=false){if(automatic&&document.querySelector('[data-screen-panel="picks"]').hidden)return;for(const f of A.families.filter(f=>opts.family==='All'||f===opts.family)){if(automatic&&states[f].running)continue;states[f].automatic=automatic;scan(f);}}
  function preferences(){return {analysis:opts,autoAnalyze:$('autoAnalyze').checked,autoCodes:$('autoCodes').checked};}
  function savePreferences(){try{localStorage.setItem(ScopeAccount.storageKey('scope.preferences.v2'),JSON.stringify(preferences()));}catch{}ScopeWorkspace.changed('preferences');}
  $('analysisSettings').addEventListener('submit',e=>{e.preventDefault();try{opts=A.settings({targetOdds:$('targetOdds').value,legs:$('analysisLegs').value,minOdds:$('analysisMinOdds').value,maxOdds:$('analysisMaxOdds').value,family:$('analysisFamily').value,window:$('analysisWindow').value,minProbability:$('analysisConfidence').value});generation++;savePreferences();for(const s of Object.values(states)){s.code=null;s.analysis=null;}scanAll(false);}catch(err){$('researchReport').textContent=err.message;ScopeFeedback.notify(err.message,'error');}});
  $('analysisCards').addEventListener('click',e=>{const scanBtn=e.target.closest('[data-scan]'),use=e.target.closest('[data-use]');if(scanBtn){states[scanBtn.dataset.scan].automatic=false;scan(scanBtn.dataset.scan);}if(use){const s=states[use.dataset.use];ScopeApp.addPicks(s.analysis.picks);ScopeNavigation.go('slip');}});
  $('researchProfile').addEventListener('change',e=>{selected=e.target.value;renderReport();});
  $('researchSelected').addEventListener('click',async()=>{const e=ScopeApp.selected();if(!e||e.sourceKind!=='api'){$('researchReport').textContent='Select a fetched match in the explorer first.';return;}selected=e.gameType+'|'+e.rawEventId;$('researchReport').textContent='Retrieving verified history and comparing every returned market…';try{await getReport(e.gameType,e.rawEventId);updateAnalysis(e.gameType);}catch(err){$('researchReport').textContent=err.message;}});
  $('autoAnalyze').addEventListener('change',()=>{savePreferences();if($('autoAnalyze').checked)scanAll(true);});
  $('autoCodes').addEventListener('change',()=>{savePreferences();generation++;if($('autoCodes').checked)for(const f of A.families)autoBook(f);});
  document.addEventListener('scope:feed',e=>{if(e.detail.mode==='upcoming')updateAnalysis(e.detail.family);});
  document.addEventListener('scope:learning',()=>{for(const f of A.families)updateAnalysis(f);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('autoAnalyze').checked)scanAll(true);else if(document.hidden){generation++;for(const s of Object.values(states))s.code=null;}});
  setInterval(()=>{renderCards();if(!document.hidden&&$('autoAnalyze').checked)scanAll(true);},90000);
  renderCards();ScopeAccount.ready.then(()=>{if($('autoAnalyze').checked)scanAll(true);});
  document.addEventListener('scope:screen',e=>{if(e.detail.screen==='picks'&&$('autoAnalyze').checked)scanAll(true);});
  function cachedPreferences(guest=false){try{const raw=localStorage.getItem(guest?'scope.preferences.v2':ScopeAccount.storageKey('scope.preferences.v2'));if(raw)return JSON.parse(raw);if(guest){const old=localStorage.getItem('scope.research.settings');if(old)return {analysis:A.settings(JSON.parse(old)),autoAnalyze:true,autoCodes:true};}}catch{}return null;}
  ScopeWorkspace.register('preferences',{read:preferences,cached:()=>cachedPreferences(),guest:()=>cachedPreferences(true),empty:()=>({analysis:A.settings(),autoAnalyze:true,autoCodes:true}),apply(value){opts=A.settings(value?.analysis||{});generation++;for(const [id,key]of [['targetOdds','targetOdds'],['analysisLegs','legs'],['analysisMinOdds','minOdds'],['analysisMaxOdds','maxOdds']])$(id).value=opts[key];$('analysisFamily').value=opts.family;$('analysisWindow').value=opts.window;$('analysisConfidence').value=opts.minProbability;$('autoAnalyze').checked=value?.autoAnalyze!==false;$('autoCodes').checked=value?.autoCodes!==false;for(const s of Object.values(states)){s.code=null;s.analysis=null;}try{localStorage.setItem(ScopeAccount.storageKey('scope.preferences.v2'),JSON.stringify(preferences()));}catch{}renderCards();}});
  fetch('/assets/openfootball-audit.json',{cache:'no-store'}).then(r=>r.json()).then(d=>{$('externalDataSummary').innerHTML='<p><strong>'+esc(d.provider)+'</strong> · '+d.records+' completed results · '+d.profiles+' distinct source team labels · '+d.sources.length+' league/season files. Dates '+esc(d.oldest)+' to '+esc(d.newest)+'. Licence: <a href="'+esc(d.licenceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(d.licence)+'</a>.</p><p>'+esc(d.coverage)+' '+esc(d.identityPolicy)+'</p>';}).catch(()=>{$('externalDataSummary').textContent='Supplementary source audit could not load.';});
})();
