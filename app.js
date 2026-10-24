(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { family: 'vFootball', mode: 'upcoming', apiEvents: [], importedEvents: [], selectedId: '', marketIndex: 0,
    selectedOutcome: 0, allMarkets: true, query: '', league: '', origin: 'none', lastFetched: null, busy: false, journal: [], feedCache: {}, slip: [], refreshEvery: 45000, loadToken: 0 };
  const STORE_EVENTS = 'virtualscope.imported.v1';
  const STORE_JOURNAL = 'virtualscope.journal.v1';
  const MAX_IMPORT_BYTES = 2_000_000;
  const MAX_ROWS = 10000;
  const STORE_SLIP = 'virtualscope.slip.v1';
  const feedKey=()=>state.family+':'+(state.family==='Real'?'upcoming':state.mode);
  const canFetch=()=>['Real','vFootball'].includes(state.family);

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
  function numOdds(val) { const n = Number(val); return Number.isFinite(n) && n >= 1.01 && n <= 1000 ? n : null; }
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
  function normalizeOutcome(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = firstText(raw.desc, raw.name, raw.outcomeName, raw.label, raw.shortName, raw.value);
    const odds = numOdds(raw.odds ?? raw.price ?? raw.decimalOdds ?? raw.decimal); 
    return { name: name || String(raw.id ?? ''), odds, id: String(raw.id ?? ''), active: raw.isActive !== false && raw.status !== 'Suspended' };
  }
  function normalizeMarkets(raw) {
    let ms = raw.markets || raw.marketList || raw.marketOdds || raw.betMarkets || [];
    if (!Array.isArray(ms)) ms = Object.values(ms);
    return ms.slice(0,2000).filter(m=>m && typeof m==='object').map(m => {
      let candidates = m.outcomes || m.outcomeList || m.selections || m.options || [];
      if (!Array.isArray(candidates)) candidates = Object.values(candidates);
      const outcomes = candidates.slice(0,200).map(normalizeOutcome).filter(o=>o && o.name);
      return { id: String(m.id ?? m.marketId ?? ''), name: firstText(m.desc,m.name,m.marketName,m.label) || `Market ${m.id ?? ''}`,
        outcomes, specifier: firstText(m.specifier), group: firstText(m.group,m.marketGroup,m.groupName), status: firstText(m.status) };
    }).filter(m=>m.outcomes.length);
  }
  function matchText(team) {
    if (typeof team === 'string') return team;
    if (team && typeof team === 'object') return firstText(team.name, team.teamName, team.desc, team.shortName);
    return '';
  }
  function parseEvent(raw, context, i) {
    const home = matchText(raw.homeTeamName ?? raw.homeTeam ?? raw.home ?? raw.homeName ?? raw.team1);
    const away = matchText(raw.awayTeamName ?? raw.awayTeam ?? raw.away ?? raw.awayName ?? raw.team2);
    if (!home || !away || home === away) return null;
    const league = firstText(raw.tournamentName,raw.leagueName,raw.categoryName,raw.competitionName, raw.league, context.league) || 'Virtual league';
    const id = String(raw.eventId ?? raw.matchId ?? raw.id ?? `${league}-${home}-${away}-${i}`);
    const time = raw.estimateStartTime ?? raw.startTime ?? raw.starts_at ?? raw.kickoffTime ?? raw.beginTime ?? null;
    return { id:`api-${id}`, home, away, league, gameType:state.family==='Real'?'Real':'vFootball', time, markets: normalizeMarkets(raw),
      origin:state.family==='Real'?'SportyBet real sports API (unofficial)':'SportyBet virtual API (unofficial)', sourceKind:'api', status:firstText(raw.matchStatus,raw.status) };
  }
  function collectEvents(payload) {
    const found = [], seen = new Set(), queue = [{obj: payload, depth:0, context:{league:''}}];
    let visited = 0;
    while (queue.length && visited++ < 200000) {
      const {obj,depth,context} = queue.shift();
      if (!obj || typeof obj !== 'object' || depth > 8 || seen.has(obj)) continue;
      seen.add(obj);
      if (Array.isArray(obj)) {
        for (const next of obj) if (next && typeof next === 'object') queue.push({obj:next,depth:depth+1,context});
        continue;
      }
      const nextLeague = firstText(obj.categoryName,obj.tournamentName,obj.leagueName,obj.competitionName,
        obj.name && (Array.isArray(obj.events) || Array.isArray(obj.eventList)) ? obj.name : '',context.league);
      const event = parseEvent(obj,context,found.length);
      if (event) { found.push(event); continue; }
      // Recurse through containers, never invent a fixture from numerical market objects.
      for (const [key,value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && !['markets','marketList','outcomes','selections','marketOdds','betMarkets','homeTeam','awayTeam'].includes(key))
          queue.push({obj:value,depth:depth+1,context:{league:nextLeague}});
      }
    }
    const ids = new Set();
    return found.filter(e => {
      const key = `${e.id.toLowerCase()}|${e.home.toLowerCase()}|${e.away.toLowerCase()}`;
      if (ids.has(key)) return false;
      ids.add(key); return true;
    });
  }
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
  function detailEvent() { return [...state.apiEvents,...state.importedEvents].find(e=>e.id===state.selectedId); }
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
    const fullMarkets=event.markets.map((m,i)=>`<details class="market-entry" ${i===state.marketIndex?'open':''}><summary><strong>${safe(m.name)}${m.specifier?' · '+safe(m.specifier):''}</strong><span>${m.outcomes.length} outcomes${m.group?' · '+safe(m.group):''}</span></summary><div class="outcome-list">${m.outcomes.map(o=>`<div class="outcome-item"><div><strong>${safe(o.name)}</strong><span>${o.active?'Break-even: '+pct(prob(o.odds)):'Inactive'}</span></div><button type="button" class="outcome-odd slip-pick" data-market="${i}" data-outcome="${m.outcomes.indexOf(o)}" ${!o.active||!numOdds(o.odds)?'disabled':''} title="Add to local bet slip">${fmtOdds(o.odds)}<small>＋ slip</small></button></div>`).join('')}</div></details>`).join('');
    $('detailContent').innerHTML = `<div class="data-label">${safe(event.sourceKind==='api'?'Fetched via unofficial API':'USER-SUPPLIED DATA')}</div>
      <div class="detail-title">${safe(event.home)}<br><span style="color:#839f87">vs</span> ${safe(event.away)}</div>
      <div class="detail-sub">${safe(event.league)}${event.time?' · '+safe(formatTime(event.time)):''}</div>
      <div class="detail-divider"></div>
      <div class="overround"><div class="overround-head"><span>1X2 bookmaker overround</span><b>${margin===null?'—':`${margin>=0?'+':''}${margin.toFixed(1)}%`}</b></div><p>Sum of (1 ÷ decimal odds) minus 100%. This is not your chance of winning.</p></div>
      <div class="market-title">Inspect market <small>${event.markets.length} available</small></div>
      <label class="search-box" style="margin:12px 0;display:flex"><span>⌕</span><input id="marketSearch" type="search" placeholder="Find a market (e.g. handicap, score, corners)" aria-label="Search all markets"></label>
      <p class="model-callout">Showing every market supplied by this response (${event.markets.length}). A listing endpoint may offer fewer than SportyBet’s full event page. Markets aren't fabricated.</p>
      <div id="allMarkets">${fullMarkets || '<p>No priced markets present in this response.</p>'}</div>
      <p class="model-callout">Implied percentages come directly from prices. They are not model predictions, and the bookmaker margin is not guaranteed to be constant across markets.</p>
      <button type="button" class="button subtle detail-action" id="prefillNote">＋ Log this event after results</button>`;
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
  function changeFamily(family) {
    state.family=family;state.league='';state.query='';state.selectedId='';state.marketIndex=0;
    state.loadToken++;
    $('searchInput').value='';
    document.querySelectorAll('[data-family]').forEach(b=>{const active=b.dataset.family===family;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    const possible=canFetch();
    $('familyDescription').textContent=family==='Real'?'REAL SPORTS · Separate real football feed.':family==='vFootball'?'VIRTUAL FOOTBALL · Paginated unofficial SportyBet fixture feed.':`${family.toUpperCase()} · No verified public API adapter. Import genuine data; no invented games.`;
    document.querySelectorAll('[data-mode]').forEach(b=>{b.disabled=family==='Real'&&b.dataset.mode!=='upcoming';});
    if(family==='Real')state.mode='upcoming';
    document.querySelectorAll('[data-mode]').forEach(b=>{const yes=b.dataset.mode===state.mode;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});
    $('fetchBtn').disabled=!possible;
    $('fetchBtn').title=possible?'Refresh this SportyBet feed':'No verified feed for this category';
    state.apiEvents=state.feedCache[feedKey()]?.events||[];
    state.lastFetched=state.feedCache[feedKey()]?.fetchedAt||null;
    setNotice(possible?'Live feed enabled; automatic refresh every 45 seconds while page is visible.':'This category remains manual/import until an authentic endpoint is verified.');
    setConnection(state.apiEvents.length?`${state.apiEvents.length} cached matches`:'Not connected',state.apiEvents.length?'good':'');
    if(state.apiEvents.length)state.selectedId=state.apiEvents[0].id;
    updateAll();
    if(possible)fetchSporty();
  }
  function changeMode(mode) {
    if(state.family==='Real'&&mode!=='upcoming')return;
    state.mode=mode;
    state.loadToken++;
    document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    state.apiEvents=state.feedCache[feedKey()]?.events||[];
    state.lastFetched=state.feedCache[feedKey()]?.fetchedAt||null;
    state.selectedId=state.apiEvents[0]?.id||'';
    updateAll();
    if(canFetch())fetchSporty();
  }
  async function fetchSporty() {
    if(!canFetch()||state.busy)return;
    const key=feedKey();
    const token=++state.loadToken;
    state.busy=true;$('fetchBtn').disabled=true;$('fetchBtn').textContent='↻ Syncing pages…';
    setConnection('Updating…');
    const result=[];const keys=new Set();let reachedEnd=false;let errorMessage='';let pages=0;
    try {
      for(let page=1;page<=100;page++) {
        if(token!==state.loadToken)break;
        const url=state.family==='Real'?`/api/real?page=${page}`:`/api/virtual?mode=${encodeURIComponent(state.mode)}&page=${page}`;
        let response;
        try {response=await fetch(url,{cache:'no-store'});}catch(err){errorMessage=err.message;break;}
        const obj=await response.json().catch(()=>({ok:false,error:'Upstream response was not valid JSON'}));
        if(!response.ok||!obj.ok){errorMessage=obj.error||`HTTP ${response.status}`;break;}
        pages++;
        const events=collectEvents(obj.payload);
        if(!events.length){reachedEnd=true;break;}
        let fresh=0;
        for(const e of events){const id=`${e.id}|${e.home}|${e.away}`;if(!keys.has(id)){keys.add(id);result.push(e);fresh++;}}
        if(fresh===0){reachedEnd=true;break;}
        setConnection(`Loading ${result.length} matches…`);
        // Do not infer the end from a page length: SportyBet may use a smaller default page.
      }
      if(token!==state.loadToken)return;
      if(result.length){
        state.apiEvents=result;
        state.lastFetched=new Date().toISOString();
        state.feedCache[key]={events:result,fetchedAt:state.lastFetched};
        if(!result.some(e=>e.id===state.selectedId))state.selectedId=result[0].id;
        setConnection(`${result.length} matches · ${pages} pages`,'good');
        const tail=errorMessage?` Later pages failed: ${errorMessage}. Showing ${result.length} confirmed records.`:reachedEnd?' All available pages were checked.':' Page safety threshold reached; more pages may exist.';
        setNotice(`Fetched ${result.length} unique matches from ${pages} successful page(s).${tail}` ,errorMessage?'':'good');
      }else{
        setConnection(state.apiEvents.length?'Cached feed · update failed':'Feed unavailable', 'bad');
        setNotice(`Update failed: ${errorMessage||'No identifiable events in response'}. ${state.apiEvents.length?'Previously loaded matches retained.':'No live odds available.'}`,'bad');
      }
      updateAll();
    }finally{
      state.busy=false;$('fetchBtn').disabled=!canFetch();$('fetchBtn').textContent='↻ Refresh now';
      if(token!==state.loadToken&&canFetch())fetchSporty();
    }
  }
  function addSlip(event,market,index){
    const outcome=market?.outcomes?.[index];if(!outcome||!outcome.active||!numOdds(outcome.odds))return;
    const identifier=[event.id,market.id,market.specifier||'',outcome.id||outcome.name].join('::');
    const item={identifier,eventId:event.id,source:event.origin,event:`${event.home} vs ${event.away}`,market:market.name+(market.specifier?' · '+market.specifier:''),outcome:outcome.name,odds:outcome.odds};
    state.slip=state.slip.filter(x=>x.identifier!==identifier);
    // Multiple outcomes from the same market/event cannot occupy the same accumulator.
    state.slip=state.slip.filter(x=>!(x.eventId===event.id&&x.market===item.market));
    state.slip.push(item);save(STORE_SLIP,state.slip);renderSlip();
  }
  function renderSlip(){
    const el=$('slipItems');if(!el)return;
    el.innerHTML=state.slip.length?state.slip.map((s,i)=>`<div class="slip-line"><div><strong>${safe(s.event)}</strong><br><small>${safe(s.market)} · ${safe(s.outcome)} @ ${fmtOdds(s.odds)}</small></div><button type="button" data-remove="${i}" aria-label="Remove selection">×</button></div>`).join(''):'<p class="placeholder">Choose any priced market outcome to build a local slip.</p>';
    $('slipCount').textContent=String(state.slip.length);
    const combined=state.slip.reduce((p,s)=>p*Number(s.odds),1);
    $('slipOdds').textContent=state.slip.length&&Number.isFinite(combined)?combined.toFixed(2):'—';
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
    $('slipItems').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;state.slip.splice(Number(b.dataset.remove),1);save(STORE_SLIP,state.slip);renderSlip();});
    $('clearSlip').addEventListener('click',()=>{state.slip=[];save(STORE_SLIP,[]);renderSlip();});
    $('copySlip').addEventListener('click',async()=>{const text=state.slip.map(s=>`${s.event} | ${s.market} | ${s.outcome} @ ${fmtOdds(s.odds)}`).join('\n');if(!text){$('slipFeedback').textContent='Add a selection first.';return;}try{await navigator.clipboard.writeText(text);$('slipFeedback').textContent='Selections copied. This is NOT a SportyBet booking code.';}catch{$('slipFeedback').textContent='Copy unavailable here. Select text manually.';}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&canFetch()&&!state.busy)fetchSporty();});
    $('searchInput').addEventListener('input',e=>{state.query=e.target.value.toLowerCase().trim();updateEventList();});
    $('leagueFilter').addEventListener('change',e=>{state.league=e.target.value;updateEventList();});
    $('eventList').addEventListener('click',e=>{
      const target=e.target.closest('button[data-select]');if(!target)return;
      state.selectedId=target.dataset.select;state.marketIndex=0;
      updateEventList();updateDetail();
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
    bind();updateAll();updateJournal();renderSlip();
    fetchSporty();
    setInterval(()=>{if(!document.hidden&&canFetch()&&!state.busy)fetchSporty();},state.refreshEvery);
    document.querySelectorAll('[data-family]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.family===state.family)));
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    function time() {$('nowClock').textContent=new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())+' WAT';}
    time();setInterval(time,60000);
  }
  init();
})();
