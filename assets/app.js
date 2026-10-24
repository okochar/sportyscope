(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { family: 'vFootball', mode: 'upcoming', apiEvents: [], importedEvents: [], selectedId: '', marketIndex: 0,
    selectedOutcome: 0, allMarkets: true, query: '', league: '', origin: 'none', lastFetched: null, busy: false, journal: [], feedCache: {}, slip: [], refreshEvery: 45000, loadToken: 0 };
  const VERSION = '4.0.0';
  const pending = new Map(), detailCache = new Map(), detailPending = new Set();
  const STORE_EVENTS = 'virtualscope.imported.v1';
  const STORE_JOURNAL = 'virtualscope.journal.v1';
  const MAX_IMPORT_BYTES = 2_000_000;
  const MAX_ROWS = 10000;
  const STORE_SLIP = 'virtualscope.slip.v1';
  const feedKey=()=>state.family+':'+state.mode;
  const canFetch=()=>['Real','vFootball','Scheduled','Instant'].includes(state.family);

  function getSaved(key) {
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function safe(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
  function firstText(...choices) {
    for (const s of choices) if (typeof s === 'string' && s.trim()) return s.trim();
    return '';
  }
  function numOdds(val) { return ScopeModel.odds(val); }
  function fmtOdds(v) { return numOdds(v) ? Number(v).toFixed(2) : '—'; }
  function prob(v) { return numOdds(v) ? (100 / Number(v)) : null; }
  function pct(n) { return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—'; }
  function formatTime(t) {
    if (!t) return '';
    let date;
    if (typeof t === 'number' || /^\d{10,13}$/.test(String(t))) {
      const n = Number(t); date = new Date(n < 1e11 ? n*1000 : n);
    } else date = new Date(t);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date) : '';
  }
  function normalizeMarkets(raw) { return ScopeModel.markets(raw); }
  function normalUserEvent(raw, index=0) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid event in imported file.');
    const home = firstText(raw.home,raw.homeTeam,raw.homeTeamName);
    const away = firstText(raw.away,raw.awayTeam,raw.awayTeamName);
    if (!home || !away) throw new Error(`Row ${index+1} needs home and away team names.`);
    let markets = normalizeMarkets(raw);
    if (!markets.length) {
      const a = numOdds(raw.home_odds ?? raw.homeOdds);
      const b = numOdds(raw.draw_odds ?? raw.drawOdds);
      const c = numOdds(raw.away_odds ?? raw.awayOdds);
      if (![a,b,c].every(Boolean)) throw new Error(`Row ${index+1} needs decimal home, draw, and away odds ≥ 1.01.`);
      markets = [{id:'1',name:'1X2',outcomes:[{name:'1',odds:a},{name:'X',odds:b},{name:'2',odds:c}]}];
    }
    const originalType = firstText(raw.game_type,raw.gameType,'vFootball').toLowerCase();
    const type = originalType.includes('real') ? 'Real' : originalType.includes('instant') ? 'Instant' : originalType.includes('scheduled') ? 'Scheduled' : 'vFootball';
    return { id:`user-${Date.now()}-${index}-${Math.random().toString(36).slice(2,8)}`,
      home,away,league:firstText(raw.league,raw.tournamentName,'User import'),gameType:type,time:raw.starts_at ?? raw.time ?? null,
      markets,origin:'User-supplied',sourceKind:'user',status:'' };
  }
  function oneXTwo(event) {
    const m = event.markets.find(m => m.id === '1' || /(^|\b)(1x2|1\s*x\s*2|three.way|full.time.result|match result)(\b|$)/i.test(m.name)
      || (m.outcomes.length===3 && ['1','X','2'].every(n=>m.outcomes.some(o=>o.name.toUpperCase()===n))));
    if (!m) return null;
    const sorted = ['1','X','2'].map((name,j) => m.outcomes.find(o => o.name.toUpperCase()===name) || m.outcomes.find(o=>{
      const n=o.name.toLowerCase();return j===0 ? /^(home|home win)$/.test(n):j===1 ? /^(draw|tie)$/.test(n):/^(away|away win)$/.test(n);
    }));
    if (sorted.some(o=>!o)) return null;
    return sorted;
  }
  function margins(event) {
    const o = oneXTwo(event);
    if (!o || o.some(x=>!numOdds(x.odds))) return null;
    return o.reduce((sum,x)=>sum+1/x.odds,0)*100-100;
  }
  function sourceEvents() {
    return [...state.apiEvents,...state.importedEvents].filter(e=>e.gameType === state.family);
  }
  function filteredEvents() {
    return sourceEvents().filter(e => (!state.league || e.league===state.league) &&
      (!state.query || `${e.home} ${e.away} ${e.league}`.toLowerCase().includes(state.query)));
  }
  function updateStats() {
    const items = sourceEvents();
    $('statEvents').textContent = String(items.length);
    $('statPriced').textContent = String(items.filter(oneXTwo).length);
    const numbers = items.map(margins).filter(v=>v !== null);
    $('statMargin').textContent = numbers.length ? pct(numbers.reduce((a,b)=>a+b,0)/numbers.length) : '—';
    const apiCount = items.filter(e=>e.sourceKind==='api').length, userCount=items.length-apiCount;
    $('sourceName').textContent = apiCount && userCount ? 'API + user' : apiCount ? 'SportyBet response' : userCount ? 'User data' : 'None';
    $('sourceStamp').textContent = apiCount && state.lastFetched ? `Fetched ${formatTime(state.lastFetched)} · unofficial` : userCount ? 'Manual or imported odds' : 'Not yet loaded';
  }
  function updateLeagues() {
    const leagues = [...new Set(sourceEvents().map(e=>e.league))].sort();
    const prev = state.league;
    $('leagueFilter').innerHTML = '<option value="">All leagues</option>'+leagues.map(l=>`<option value="${safe(l)}">${safe(l)}</option>`).join('');
    if (leagues.includes(prev)) $('leagueFilter').value=prev; else {state.league='';$('leagueFilter').value='';}
  }
  function updateEventList() {
    const filtered = filteredEvents();
    $('visibleCount').textContent = `${filtered.length} event${filtered.length===1?'':'s'} shown`;
    if (!filtered.length) {
      const hasAny = sourceEvents().length>0;
      $('eventList').innerHTML = `<div class="empty"><div class="empty-icon">⌁</div><h3>${hasAny?'No matching events.':'Nothing loaded. Yet.'}</h3><p>${hasAny?'Try another filter or game family.':'Test the unofficial feed or import your own genuine odds.'}</p><a href="#import">Import your own data ↓</a></div>`;
      return;
    }
    $('eventList').innerHTML = filtered.map(event => {
      const three = oneXTwo(event);
      return `<div class="event ${state.selectedId===event.id?'selected':''}" data-id="${safe(event.id)}"><button type="button" class="event-info" data-select="${safe(event.id)}" aria-label="Inspect ${safe(event.home)} versus ${safe(event.away)}"><span class="event-league">${safe(event.league)} ${event.sourceKind==='user'?'· USER':''}</span><span class="event-name">${safe(event.home)} <span style="color:#617e67">vs</span> ${safe(event.away)}</span><span class="event-time">${safe(formatTime(event.time))}${event.status?' · '+safe(event.status):''}</span></button>${[0,1,2].map(i=>`<button type="button" class="odds ${!three || !three[i] || !numOdds(three[i].odds)?'empty-odds':''}" data-select="${safe(event.id)}" data-outcome="${i}" aria-label="Inspect ${['home','draw','away'][i]} odds ${three&&three[i]?fmtOdds(three[i].odds):'unavailable'}">${three&&three[i]?fmtOdds(three[i].odds):'—'}</button>`).join('')}</div>`;
    }).join('');
  }
  function detailEvent() { const e = [...state.apiEvents,...state.importedEvents].find(e=>e.id===state.selectedId); return detailCache.get(e?.id)?.event || e; }
  function updateDetail() {
    const event=detailEvent();
    if (!event || event.gameType!==state.family) {
      $('detailContent').className='detail-empty';
      $('detailContent').innerHTML='<div class="big-orbit">◉</div><h3>Look closer.</h3><p>Select a match to inspect its markets, implied probabilities and bookmaker margin.</p>';
      return;
    }
    $('detailContent').className='';
    if (state.marketIndex>=event.markets.length) state.marketIndex=0;
    const margin = margins(event);
    const market=event.markets[state.marketIndex];
    const fullMarkets=event.markets.map((m,i)=>`<details class="market-entry" ${i===state.marketIndex?'open':''}><summary><strong>${safe(m.name)}${m.specifier?' · '+safe(m.specifier):''}</strong><span>${m.outcomes.length} outcomes${m.group?' · '+safe(m.group):''}</span></summary><div class="outcome-list">${m.outcomes.map(o=>`<div class="outcome-item"><div><strong>${safe(o.name)}</strong><span>${m.active !== false && o.active?'Break-even: '+pct(prob(o.odds)):'Inactive'}</span></div><button type="button" class="outcome-odd slip-pick" data-market="${i}" data-outcome="${m.outcomes.indexOf(o)}" ${m.active === false || !o.active||!numOdds(o.odds)?'disabled':''} title="Add to local bet slip">${fmtOdds(o.odds)}<small>＋ slip</small></button></div>`).join('')}</div></details>`).join('');
    $('detailContent').innerHTML = `<div class="data-label">${safe(event.sourceKind==='api'?'Fetched via unofficial API':'USER-SUPPLIED DATA')}</div>
      <div class="detail-title">${safe(event.home)}<br><span style="color:#839f87">vs</span> ${safe(event.away)}</div>
      <div class="detail-sub">${safe(event.league)}${event.time?' · '+safe(formatTime(event.time)):''}</div>
      <div class="detail-divider"></div>
      <div class="overround"><div class="overround-head"><span>1X2 bookmaker overround</span><b>${margin===null?'—':`${margin>=0?'+':''}${margin.toFixed(1)}%`}</b></div><p>Sum of (1 ÷ decimal odds) minus 100%. This is not your chance of winning.</p></div>
      <div class="market-title">Inspect market <small>${event.markets.length} available</small></div>
      <label class="search-box" style="margin:12px 0;display:flex"><span>⌕</span><input id="marketSearch" type="search" placeholder="Find a market (e.g. handicap, score, corners)" aria-label="Search all markets"></label>
      <p class="model-callout">Showing all ${event.markets.length} returned markets${event.totalMarketSize ? `; SportyBet advertises ${event.totalMarketSize}` : ''}. Suspended outcomes remain visible.</p>
      ${event.sourceKind === 'api' && ['Real','vFootball','Instant'].includes(event.gameType) ? `<p id="detailFeedStatus" class="model-callout">${safe(detailCache.get(event.id)?.message || 'Full event markets load automatically when selected.')}</p><button type="button" class="button subtle" id="loadDetail">Reload full event markets</button>` : ''}
      <div id="allMarkets">${fullMarkets || '<p>No markets present in this response.</p>'}</div>
      <p class="model-callout">Implied percentages come directly from prices. They are not model predictions, and the bookmaker margin is not guaranteed to be constant across markets.</p>
      <button type="button" class="button subtle detail-action" id="prefillNote">＋ Log this event after results</button>`;
    $('loadDetail')?.addEventListener('click',()=>loadDetail(event));
    $('marketSearch').addEventListener('input', e=>{const q=e.target.value.trim().toLowerCase(); $('allMarkets').querySelectorAll('details').forEach(d=>{d.hidden=!d.querySelector('summary').textContent.toLowerCase().includes(q);});});
    $('allMarkets').addEventListener('click',ev=>{const b=ev.target.closest('.slip-pick');if(!b)return;addSlip(event,event.markets[Number(b.dataset.market)],Number(b.dataset.outcome));});
    $('prefillNote').addEventListener('click',()=>{$('journalEvent').value=`${event.home} vs ${event.away}`; $('log').scrollIntoView({behavior:'smooth',block:'center'});});
  }
  function updateAll() {
    updateStats();updateLeagues();updateEventList();updateDetail();
  }
  function setNotice(message,tone='') {
    const n=$('dataNotice');n.className='notice '+tone;
    n.innerHTML=`<span class="notice-icon">${tone==='bad'?'!':'ⓘ'}</span><span>${safe(message)}</span>`;
  }
  function setConnection(message,tone='') {
    const b=$('connectionBadge');b.className=`connection ${tone}`;
    b.innerHTML=`<span class="pulse"></span>${safe(message)}`;
  }
  function cacheFor(key) {
    if (!state.feedCache[key]) {
      let saved;
      try { saved=JSON.parse(sessionStorage.getItem('virtualscope.feed.v4.'+key)); } catch {}
      state.feedCache[key]=saved && Array.isArray(saved.events) ? saved : {events:[], fetchedAt:null, complete:false, pages:0};
    }
    return state.feedCache[key];
  }
  function persistFeed(key) {
    const c=cacheFor(key);
    try { sessionStorage.setItem('virtualscope.feed.v4.'+key, JSON.stringify({...c,loading:false})); } catch {}
  }
  function displayFeed() {
    const c=cacheFor(feedKey());
    state.apiEvents=c.events; state.lastFetched=c.fetchedAt; state.busy=Boolean(c.loading);
    if(!sourceEvents().some(e=>e.id===state.selectedId))state.selectedId=c.events.some(e=>e.id===c.selectedId)?c.selectedId:c.events[0]?.id || '';
    $('fetchBtn').disabled=state.busy;
    $('fetchBtn').textContent=state.busy?'↻ Updating…':'↻ Refresh now';
    const stale=c.fetchedAt && Date.now()-new Date(c.fetchedAt).getTime()>state.refreshEvery*2;
    setConnection(c.loading ? 'Updating · '+c.events.length+' retained' : c.error ? 'Update failed · saved data' : c.fetchedAt ? c.events.length+' matches · '+(c.complete?'complete':'partial')+(stale?' · stale':'') : 'Connecting…', c.error?'bad':c.fetchedAt?'good':'');
    setNotice(c.error ? c.error+' Previous data retained; automatic retry remains enabled.' : c.loading ? 'Refreshing pages automatically. You can switch categories while loading.' : c.fetchedAt ? c.events.length+' verified fixtures · '+c.pages+' page(s). '+(c.complete?'All pages returned by this feed loaded.':'Partial feed; completeness not established.')+' '+(c.note||'') : 'Loading verified SportyBet response…',c.error?'bad':c.fetchedAt?'good':'');
    updateAll();
    const selected=detailEvent();
    if(!c.loading && selected?.sourceKind==='api' && ['Real','vFootball','Instant'].includes(selected.gameType) && (!detailCache.get(selected.id)?.fetchedAt || Date.now()-new Date(detailCache.get(selected.id).fetchedAt).getTime()>=state.refreshEvery))loadDetail(selected);
  }
  function rememberView() {
    Object.assign(cacheFor(feedKey()),{selectedId:state.selectedId,query:state.query,league:state.league});
  }
  function changeFamily(family) {
    rememberView(); state.family=family;
    if(family==='Instant')state.mode='upcoming';
    document.querySelectorAll('[data-family]').forEach(b=>{const active=b.dataset.family===family;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('familyDescription').textContent=family==='Real'?'REAL FOOTBALL · SportyBet fixtures, kept separate from virtual games.':family==='vFootball'?'VFOOTBALL · Every available fixture page across all returned leagues.':family==='Scheduled'?'SCHEDULED FOOTBALL · Fixed matchdays from SportyBet. Other Scheduled Virtuals are a separate provider.':'INSTANT FOOTBALL · Anonymous round snapshot. Your logged-in SportyBet round may be different.';
    document.querySelectorAll('[data-mode]').forEach(b=>{b.disabled=b.dataset.mode==='results'||(family==='Instant'&&b.dataset.mode!=='upcoming');b.title=b.disabled?'No verified feed for this mode':'';const active=b.dataset.mode===state.mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    restoreView();
  }
  function restoreView() {
    const c=cacheFor(feedKey()); state.selectedId=c.selectedId || c.events[0]?.id || '';state.query=c.query||'';state.league=c.league||'';
    $('searchInput').value=state.query; state.marketIndex=0;
    displayFeed();
    if(!c.fetchedAt || Date.now()-new Date(c.fetchedAt).getTime()>=state.refreshEvery)fetchSporty();
  }
  function changeMode(mode) {
    if(mode==='results'||(state.family==='Instant'&&mode!=='upcoming'))return;
    rememberView(); state.mode=mode;
    document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    restoreView();
  }
  async function fetchSporty() {
    const family=state.family, mode=state.mode, key=feedKey(), c=cacheFor(key);
    if(pending.has(key))return pending.get(key);
    c.loading=true;c.error='';if(feedKey()===key)displayFeed();
    const preserve=Boolean(c.fetchedAt);
    const job=(async()=>{
      const result=[], ids=new Set();let page=1,pages=0,fetchedAt=null,note='';
      try {
        while(true) {
          const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
          let obj;
          try {
            const response=await fetch('/api/virtual?'+new URLSearchParams({family,mode,page:String(page)}),{cache:'no-store',signal:controller.signal});
            obj=await response.json();
            if(obj.version!==VERSION)throw new Error('Deployment mismatch: expected API '+VERSION+', received '+(obj.version||'older version')+'. Deploy the entire V4 folder.');
            if(!response.ok||!obj.ok)throw new Error(obj.error||'Feed request failed.');
            if(obj.family!==family||obj.mode!==mode||!Array.isArray(obj.events)||typeof obj.more!=='boolean')throw new Error('Unexpected feed response.');
          } finally { clearTimeout(timer); }
          pages++;fetchedAt=obj.fetchedAt;note=obj.note;
          let fresh=0;
          for(const e of obj.events) { if(!ids.has(e.id)){ids.add(e.id);result.push(e);fresh++;} }
          if(obj.more&&!fresh)throw new Error('Pagination repeated or returned an empty page; feed is incomplete.');
          if(!preserve) {
            c.events=[...result];c.pages=pages;c.complete=false;c.fetchedAt=fetchedAt;
            if(feedKey()===key)displayFeed();
          }
          if(!obj.more)break;
          if(obj.nextPage!==page+1)throw new Error('Invalid next-page cursor.');
          page=obj.nextPage;
        }
        Object.assign(c,{events:result,pages,fetchedAt,note,complete:true,error:''});
      }catch(e){
        c.error=e.name==='AbortError'?'Refresh timed out.':e.message;
        if(!preserve){c.events=result;c.pages=pages;c.complete=false;c.fetchedAt=fetchedAt;}
      }finally{
        c.loading=false;pending.delete(key);persistFeed(key);
        if(feedKey()===key)displayFeed();
        renderSlip();
      }
    })();
    pending.set(key,job);return job;
  }
  async function loadDetail(event) {
    if(detailPending.has(event.id))return;
    detailPending.add(event.id);
    const el=$('loadDetail');if(el){el.disabled=true;el.textContent='Loading all returned markets…';}
    try{
      const r=await fetch('/api/event?'+new URLSearchParams({family:event.gameType,eventId:event.rawEventId,productId:String(event.productId||3),roundId:event.roundId||''}),{cache:'no-store',signal:AbortSignal.timeout(22000)});
      const obj=await r.json();
      if(!r.ok||!obj.ok||obj.version!==VERSION)throw new Error(obj.error||'Event detail unavailable.');
      if(obj.event.rawEventId!==event.rawEventId)throw new Error('Event detail identity mismatch.');
      detailCache.set(event.id,{event:obj.event,fetchedAt:obj.fetchedAt,message:'Full event response fetched '+formatTime(obj.fetchedAt)+' · '+obj.event.markets.length+' markets.'});
    }catch(e){detailCache.set(event.id,{event,message:'Full market update failed: '+e.message+' Listing markets retained.'});}
    detailPending.delete(event.id);
    if(state.selectedId===event.id&&state.family===event.gameType)updateDetail();
  }
  function addSlip(event,market,index){
    const outcome=market?.outcomes?.[index];if(!outcome||market.active===false||!outcome.active||!numOdds(outcome.odds))return;
    if(event.closeAt&&Date.now()>=event.closeAt){$('slipFeedback').textContent='This scheduled matchday has closed. Refresh the feed.';return;}
    const identifier=[event.id,market.id,market.specifier||'',outcome.id||outcome.name].join('::');
    const item={identifier,eventId:event.id,family:event.gameType,rawEventId:event.rawEventId,source:event.origin,event:event.home+' vs '+event.away,market:market.name+(market.specifier?' · '+market.specifier:''),marketId:market.id,specifier:market.specifier||'',outcomeId:outcome.id,outcome:outcome.name,odds:outcome.odds,addedAt:new Date().toISOString(),roundId:event.roundId||'',sourceKind:event.sourceKind};
    // One pick per event avoids presenting correlated outcomes as an accumulator.
    state.slip=state.slip.filter(x=>x.eventId!==event.id);state.slip.push(item);save(STORE_SLIP,state.slip);renderSlip();
    $('slipFeedback').textContent='Selection saved locally. One pick per event; adding another replaces it.';
  }
  function renderSlip(){
    const el=$('slipItems');if(!el)return;
    const families=new Set(state.slip.map(s=>s.family||'legacy'));
    el.innerHTML=state.slip.length?state.slip.map((s,i)=>'<div class="slip-line"><div><strong>'+safe(s.event)+'</strong><br><small>'+safe(s.family||'Saved selection')+' · '+safe(s.market)+' · '+safe(s.outcome)+' @ '+fmtOdds(s.odds)+'</small><br><small>Saved '+safe(formatTime(s.addedAt))+' · price snapshot; review current availability</small></div><button type="button" data-remove="'+i+'" aria-label="Remove selection">×</button></div>').join(''):'<p class="placeholder">Choose a priced outcome to build a local slip.</p>';
    $('slipCount').textContent=String(state.slip.length);
    const combined=state.slip.reduce((p,s)=>p*Number(s.odds),1);
    $('slipOdds').textContent=state.slip.length&&families.size===1&&Number.isFinite(combined)?combined.toFixed(2):families.size>1?'Separate products · no combined accumulator':'—';
    const eligible=state.slip.length>0 && state.slip.length<=30 && families.size===1 && state.slip.every(s=>s.sourceKind==='api' && ['Real','vFootball'].includes(s.family) && s.rawEventId && s.marketId && s.outcomeId);
    $('bookSlip').disabled=!eligible;
    $('bookingInfo').textContent=eligible?'SportyBet will validate these selections and issue a reservation code. No stake or account is used.':'Booking supports 1–30 fetched real-football or vFootball selections in one category. Instant, Scheduled and imported picks remain local.';
    const signature=JSON.stringify(state.slip);
    if($('bookingResult').dataset.slip!==signature){$('bookingResult').replaceChildren();$('bookingResult').dataset.slip=signature;}
  }
  async function bookSlip(){
    const picks=state.slip.map(s=>({...s}));const fingerprint=JSON.stringify(picks);
    $('bookSlip').disabled=true;$('bookingResult').textContent='Requesting a code from SportyBet and verifying it…';
    try{
      const response=await fetch('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({family:picks[0]?.family,selections:picks.map(s=>({eventId:s.rawEventId,marketId:s.marketId,outcomeId:s.outcomeId,specifier:s.specifier||''}))}),signal:AbortSignal.timeout(35000)});
      const obj=await response.json();
      if(!response.ok||!obj.ok||obj.version!==VERSION)throw new Error(obj.error||'Booking response could not be verified.');
      if(fingerprint!==JSON.stringify(state.slip)){ $('bookingResult').textContent='The slip changed while booking. Request a new code for the current selections.';return;}
      $('bookingResult').innerHTML='<strong>SportyBet code: '+safe(obj.code)+'</strong> · <a class="text-button" href="'+safe(obj.url)+'" target="_blank" rel="noopener noreferrer">Load on SportyBet ↗</a><p>'+safe(obj.note)+'</p>';
    }catch(e){$('bookingResult').textContent='No verified code available: '+e.message;}
    finally{$('bookSlip').disabled=!(state.slip.length>0 && state.slip.length<=30 && new Set(state.slip.map(s=>s.family)).size===1 && state.slip.every(s=>s.sourceKind==='api'&&['Real','vFootball'].includes(s.family)&&s.rawEventId&&s.marketId&&s.outcomeId));}
  }
  function csvRows(text) {
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted) { if(c==='"' && text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c; }
      else if(c==='"')quoted=true;
      else if(c===','){row.push(cell.trim());cell='';}
      else if(c==='\n' || c==='\r') {if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[];}
      else cell+=c;
    }
    if(quoted)throw new Error('CSV contains an unmatched quotation mark.');
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);
    if(rows.length<2) throw new Error('CSV needs a header and at least one data row.');
    const headers=rows.shift().map(h=>h.trim().toLowerCase().replace(/^\ufeff/,''));
    return rows.map((cells,i)=>Object.fromEntries(headers.map((h,j)=>[h,cells[j] ?? ''])));
  }
  function addImport(items) {
    if (!Array.isArray(items) || !items.length) throw new Error('The file contains no event records.');
    const normalized=items.slice(0,MAX_ROWS).map((v,i)=>normalUserEvent(v,i));
    state.importedEvents=[...normalized,...state.importedEvents].slice(0,MAX_ROWS);
    save(STORE_EVENTS,state.importedEvents);
    state.family=normalized[0].gameType; state.league='';state.selectedId=normalized[0].id;state.marketIndex=0;
    changeFamily(state.family);
    state.selectedId=normalized[0].id;
    updateAll();
    return normalized.length;
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size>MAX_IMPORT_BYTES) { $('importFeedback').textContent='File is too large (2 MB maximum).';return; }
    try {
      const content=await file.text();
      let records;
      if (/\.json$/i.test(file.name)) {
        const parsed=JSON.parse(content);
        records=Array.isArray(parsed)?parsed:parsed.events;
      } else if (/\.csv$/i.test(file.name)) records=csvRows(content);
      else throw new Error('Use a .csv or .json file.');
      const count=addImport(records);
      $('importFeedback').textContent=`✓ Imported ${count} event${count===1?'':'s'} as user-supplied data. No prices were retrieved from SportyBet.`;
      $('importFeedback').style.color='#c0f66b';
      setNotice(`Imported ${count} user-supplied events. These prices are not a SportyBet live connection.`);
      document.getElementById('markets').scrollIntoView({behavior:'smooth'});
    } catch(err) { $('importFeedback').style.color='#ffa6a0'; $('importFeedback').textContent=`Import failed: ${err.message}`; }
    finally {$('fileInput').value='';}
  }
  function csvQuote(value) {const v=String(value??'');return /[,\r\n"]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;}
  function saveCsv(rows,filename) {
    const csv=rows.map(r=>r.map(csvQuote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function updateJournal() {
    const items=state.journal.slice(0,25);
    $('journalList').innerHTML=items.length?items.map(item=>`<div class="journal-entry"><span>${safe(item.name)}</span><small>${safe(item.result)}</small></div>`).join(''):'<p class="placeholder">No observations recorded.</p>';
  }
  function bind() {
    document.querySelectorAll('[data-family]').forEach(b=>b.addEventListener('click',()=>changeFamily(b.dataset.family)));
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>changeMode(b.dataset.mode)));
    $('fetchBtn').addEventListener('click',fetchSporty);
    $('bookSlip').addEventListener('click',bookSlip);
    $('slipItems').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;state.slip.splice(Number(b.dataset.remove),1);save(STORE_SLIP,state.slip);renderSlip();});
    $('clearSlip').addEventListener('click',()=>{state.slip=[];save(STORE_SLIP,[]);renderSlip();});
    $('copySlip').addEventListener('click',async()=>{const text=state.slip.map(s=>`${s.event} | ${s.market} | ${s.outcome} @ ${fmtOdds(s.odds)}`).join('\n');if(!text){$('slipFeedback').textContent='Add a selection first.';return;}try{await navigator.clipboard.writeText(text);$('slipFeedback').textContent='Selections copied. This is NOT a SportyBet booking code.';}catch{$('slipFeedback').textContent='Copy unavailable here. Select text manually.';}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!cacheFor(feedKey()).fetchedAt||Date.now()-new Date(cacheFor(feedKey()).fetchedAt).getTime()>=state.refreshEvery))fetchSporty();});
    $('searchInput').addEventListener('input',e=>{state.query=e.target.value.toLowerCase().trim();updateEventList();});
    $('leagueFilter').addEventListener('change',e=>{state.league=e.target.value;updateEventList();});
    $('eventList').addEventListener('click',e=>{
      const target=e.target.closest('button[data-select]');if(!target)return;
      state.selectedId=target.dataset.select;state.marketIndex=0;
      updateEventList();updateDetail();
      const picked=detailEvent();if(picked?.sourceKind==='api'&&['Real','vFootball','Instant'].includes(picked.gameType))loadDetail(picked);
      if(window.innerWidth<=1200)$('detailPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    $('manualToggle').addEventListener('click',()=>$('manualForm').classList.toggle('hidden'));
    $('manualClose').addEventListener('click',()=>$('manualForm').classList.add('hidden'));
    $('manualForm').addEventListener('submit',e=>{
      e.preventDefault();
      const values=Object.fromEntries(new FormData(e.currentTarget));
      try {
        const event=normalUserEvent({home:values.home,away:values.away,league:values.league,
          home_odds:values.homeOdds,draw_odds:values.drawOdds,away_odds:values.awayOdds,gameType:state.family});
        state.importedEvents=[event,...state.importedEvents].slice(0,MAX_ROWS);save(STORE_EVENTS,state.importedEvents);
        state.selectedId=event.id;state.marketIndex=0;state.league='';e.currentTarget.reset();e.currentTarget.classList.add('hidden');
        $('manualError').textContent='';updateAll();setNotice('Added a user-entered event. These prices are NOT from a live feed.');
      }catch(err){$('manualError').textContent=err.message;}
    });
    $('fileInput').addEventListener('change',e=>importFile(e.target.files?.[0]));
    $('exportEvents').addEventListener('click',()=>{
      const events=sourceEvents();
      if(!events.length){$('importFeedback').textContent='No events to export.';return;}
      saveCsv([['source','game_type','league','home','away','starts_at','home_odds','draw_odds','away_odds'],...events.map(e=>{
        const odds=oneXTwo(e)||[];return[e.origin,e.gameType,e.league,e.home,e.away,e.time||'',...Array.from({length:3},(_,i)=>odds[i]?.odds||'')];
      })],`virtualscope-${state.family.toLowerCase()}-events.csv`);
    });
    $('clearImported').addEventListener('click',()=>{
      if(!state.importedEvents.length)return;
      if(!confirm('Delete all imported and manually entered events from this browser?'))return;
      state.importedEvents=[];save(STORE_EVENTS,[]);state.selectedId='';updateAll();$('importFeedback').textContent='User-supplied records cleared.';
    });
    $('journalForm').addEventListener('submit',e=>{
      e.preventDefault();const name=$('journalEvent').value.trim();if(!name)return;
      state.journal.unshift({name,result:$('journalResult').value,date:new Date().toISOString()});
      state.journal=state.journal.slice(0,MAX_ROWS);save(STORE_JOURNAL,state.journal);
      e.currentTarget.reset();updateJournal();
    });
    $('exportJournal').addEventListener('click',()=>{
      if(!state.journal.length){$('journalList').innerHTML='<p class="placeholder">No observations to export.</p>';return;}
      saveCsv([['date','event','observed_result'],...state.journal.map(x=>[x.date,x.name,x.result])],'virtualscope-outcomes.csv');
    });
    $('clearJournal').addEventListener('click',()=>{
      if(!state.journal.length)return;
      if(!confirm('Delete all observation notes from this browser?'))return;
      state.journal=[];save(STORE_JOURNAL,[]);updateJournal();
    });
  }
  function init() {
    state.importedEvents=getSaved(STORE_EVENTS).filter(e=>e && e.sourceKind==='user' && e.home && e.away).slice(0,MAX_ROWS);
    state.journal=getSaved(STORE_JOURNAL).filter(e=>e&&e.name&&e.result).slice(0,MAX_ROWS);
    state.slip=getSaved(STORE_SLIP).filter(s=>s&&s.event&&numOdds(s.odds));
    bind();updateJournal();renderSlip();
    changeFamily(state.family);
    fetch('/api/status',{cache:'no-store'}).then(r=>r.json()).then(x=>{if(x.version!==VERSION)setNotice('Deployment mismatch. Deploy all V4 files together.','bad');}).catch(()=>{});
    setInterval(()=>{if(!document.hidden)fetchSporty();},state.refreshEvery);
    document.querySelectorAll('[data-family]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.family===state.family)));
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    function time() {$('nowClock').textContent=new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())+' WAT';}
    time();setInterval(time,60000);
  }
  init();
})();
