(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { family: 'vFootball', mode: 'upcoming', apiEvents: [], importedEvents: [], selectedId: '', marketIndex: 0,
    selectedOutcome: 0, allMarkets: true, query: '', league: '', origin: 'none', lastFetched: null, busy: false, journal: [] };
  const STORE_EVENTS = 'virtualscope.imported.v1';
  const STORE_JOURNAL = 'virtualscope.journal.v1';
  const MAX_IMPORT_BYTES = 2_000_000;
  const MAX_ROWS = 500;

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
    while (queue.length && visited++ < 14000 && found.length < 500) {
      const {obj,depth,context} = queue.shift();
      if (!obj || typeof obj !== 'object' || depth > 8 || seen.has(obj)) continue;
      seen.add(obj);
      if (Array.isArray(obj)) {
        for (const next of obj.slice(0,700)) if (next && typeof next === 'object') queue.push({obj:next,depth:depth+1,context});
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
    }).slice(0,MAX_ROWS);
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
    const fullMarkets=event.markets.map((m,i)=>`<details class="market-entry" ${i===state.marketIndex?'open':''}><summary><strong>${safe(m.name)}${m.specifier?' · '+safe(m.specifier):''}</strong><span>${m.outcomes.length} outcomes${m.group?' · '+safe(m.group):''}</span></summary><div class="outcome-list">${m.outcomes.map(o=>`<div class="outcome-item"><div><strong>${safe(o.name)}</strong><span>${o.active?'Break-even: '+pct(prob(o.odds)):'Inactive'}</span></div><div class="outcome-odd">${fmtOdds(o.odds)}<small>decimal</small></div></div>`).join('')}</div></details>`).join('');
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
    state.apiEvents=[];state.lastFetched=null;setConnection('Not connected');
    state.family=family;state.league='';state.query='';state.selectedId='';state.marketIndex=0;
    $('searchInput').value='';
    document.querySelectorAll('[data-family]').forEach(b=>{const active=b.dataset.family===family;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    const possible=family==='vFootball' || family==='Real';
    $('familyDescription').textContent=family==='Real' ? 'REAL SPORTS · Football fixtures via separate real-match endpoint. More sports require separate, verified integrations.' : 'VIRTUAL GAMES · '+family+' is separate from real sports. Never mix match or market records.';
    document.querySelectorAll('[data-mode]').forEach(b=>{b.disabled=family==='Real' && b.dataset.mode!=='upcoming';});
    if(family==='Real') {state.mode='upcoming';document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode==='upcoming');});}
    $('fetchBtn').disabled=!possible;
    $('fetchBtn').title=possible?'Attempt unofficial SportyBet market endpoint':'No verified endpoint for this game family. Use manual or CSV/JSON import.';
    setNotice(possible
      ? family==='Real' ? 'REAL FOOTBALL: separate SportyBet pcUpcomingEvents endpoint; only markets actually returned will be shown.' : 'VIRTUAL FOOTBALL: separate unofficial virtual endpoint; not verified here.'
      : `${family} Virtuals: direct API integration is not verified. Use Add event or Import CSV/JSON; prices you enter will be clearly labeled user data.`);
    updateAll();
  }
  function changeMode(mode) {
    if(state.family==='Real' && mode!=='upcoming') return;
    state.mode=mode;state.apiEvents=[];state.selectedId='';state.marketIndex=0;
    document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    setConnection('Not connected');
    updateAll();
  }
  async function fetchSporty() {
    if(state.busy || !['vFootball','Real'].includes(state.family)) return;
    state.busy=true; $('fetchBtn').disabled=true; $('fetchBtn').textContent='↻ Connecting…';
    setConnection('Checking endpoint');setNotice('Connecting to SportyBet virtual endpoint. No odds shown until match data is confirmed.');
    try {
      const response=await fetch(state.family==='Real' ? '/api/real?page=1' : `/api/virtual?mode=${encodeURIComponent(state.mode)}&page=1`,{cache:'no-store'});
      const obj=await response.json().catch(()=>({ok:false,error:'Server returned an unreadable response.'}));
      if(!response.ok || !obj.ok) throw new Error(obj.error || `Proxy error ${response.status}`);
      const events=collectEvents(obj.payload);
      if(!events.length) {
        const bizCode=obj.payload?.bizCode;
        throw new Error(`Endpoint responded, but no valid match records were found${bizCode!==undefined?' (code '+bizCode+')':''}. This is NOT a verified live feed.`);
      }
      state.apiEvents=events; state.lastFetched=obj.fetchedAt;state.origin='api';
      setConnection(`${events.length} actual records parsed`,'good');
      const priced=events.filter(e=>oneXTwo(e)).length;
      setNotice(`Received ${events.length} parsed match records from the separate ${state.family==='Real'?'REAL':'VIRTUAL'} SportyBet endpoint. ${priced} have recognizable 1X2 markets. Every supplied market is visible in match details. Cross-check prices with SportyBet before use.`,'good');
      state.selectedId=events[0].id;state.marketIndex=0;
      updateAll();
    } catch(error) {
      state.apiEvents=[];state.lastFetched=null;
      setConnection('Feed unavailable','bad');
      setNotice(`No live prices available: ${error.message} You can still use manual entry or file import.`,'bad');
      updateAll();
    } finally {state.busy=false;$('fetchBtn').disabled=!['vFootball','Real'].includes(state.family);$('fetchBtn').textContent='↻ Try SportyBet feed';}
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
    bind();updateAll();updateJournal();
    document.querySelectorAll('[data-family]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.family===state.family)));
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    function time() {$('nowClock').textContent=new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())+' WAT';}
    time();setInterval(time,60000);
  }
  init();
})();
