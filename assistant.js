'use strict';
/**
 * VirtualScope Assistant Bridge (read-only, server-rendered HTML)
 * Drop into the EXISTING VirtualScope V4 repository at api/assistant.js.
 * Reuses the working same-deployment /api/virtual and /api/real adapters.
 * Never places bets, accesses accounts, or invents missing markets.
 */
const APP_NAME = 'VirtualScope assistant data view';
const MAX_EVENT_VISITS = 200000;
const MODES = new Set(['upcoming', 'live', 'results']);
const KINDS = Object.freeze({ virtual: '/api/virtual', real: '/api/real' });

function htmlEsc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function first(...values) { return values.find(v => typeof v === 'string' && v.trim())?.trim() || ''; }
function teamName(team) { return typeof team === 'string' ? team : team && typeof team === 'object' ? first(team.name, team.teamName, team.desc, team.shortName) : ''; }
function odds(raw) {
  const x = Number(raw);
  return Number.isFinite(x) && x > 1 && x < 100000 ? x.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : 'Unavailable';
}
function asList(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.values(x) : []); }
function getMarkets(event) {
  const source = event.markets || event.marketList || event.marketOdds || event.betMarkets || [];
  return asList(source).filter(m => m && typeof m === 'object').map(m => ({
    id: String(m.id ?? m.marketId ?? ''),
    name: first(m.desc, m.name, m.marketName, m.label) || String(m.id ?? m.marketId ?? 'Unnamed market'),
    specifier: first(m.specifier),
    group: first(m.group, m.marketGroup, m.groupName),
    outcomes: asList(m.outcomes || m.outcomeList || m.selections || m.options || []).filter(Boolean).map(o => ({
      id: String(o.id ?? ''),
      name: first(o.desc, o.name, o.outcomeName, o.label, o.shortName, o.value) || String(o.id ?? 'Unnamed outcome'),
      odds: odds(o.odds ?? o.price ?? o.decimalOdds ?? o.decimal),
      available: o.isActive !== false && !['Suspended', 'Inactive', 'Closed'].includes(String(o.status ?? '')),
    }))
  }));
}
function collectEvents(root) {
  const queue = [{ x: root, depth: 0, league: '' }];
  const visited = new Set();
  const ids = new Set();
  const events = [];
  let ix = 0;
  // BFS traversal, preserving original fixture objects including full returned market arrays.
  for (let cursor = 0; cursor < queue.length && cursor < MAX_EVENT_VISITS; cursor++) {
    const { x, depth, league } = queue[cursor];
    if (!x || typeof x !== 'object' || depth > 10 || visited.has(x)) continue;
    visited.add(x);
    if (Array.isArray(x)) {
      for (const item of x) if (item && typeof item === 'object') queue.push({x:item,depth:depth+1,league});
      continue;
    }
    const nextLeague = first(x.tournamentName, x.leagueName, x.categoryName, x.competitionName,
      (Array.isArray(x.events) || Array.isArray(x.eventList)) ? x.name : '', league);
    const home = teamName(x.homeTeamName ?? x.homeTeam ?? x.home ?? x.homeName ?? x.team1);
    const away = teamName(x.awayTeamName ?? x.awayTeam ?? x.away ?? x.awayName ?? x.team2);
    if (home && away && home !== away) {
      const id = String(x.eventId ?? x.matchId ?? x.id ?? `${home}-${away}-${ix++}`);
      const key = `${id}|${home}|${away}`;
      if (!ids.has(key)) {
        ids.add(key);
        events.push({id,home,away,league:nextLeague || 'Unspecified league',
          startsAt: x.estimateStartTime ?? x.startTime ?? x.starts_at ?? x.kickoffTime ?? x.beginTime ?? '',
          status: first(x.matchStatus,x.status), markets:getMarkets(x)});
      }
      continue;
    }
    for (const [key,val] of Object.entries(x)) {
      if (val && typeof val === 'object' && !['markets','marketList','outcomes','outcomeList','selections','options','marketOdds','betMarkets','homeTeam','awayTeam'].includes(key)) {
        queue.push({x:val,depth:depth+1,league:nextLeague});
      }
    }
  }
  return events;
}
function cleanParams(q={}) {
  const kind = Object.hasOwn(KINDS, q.kind) ? q.kind : 'virtual';
  const mode = MODES.has(q.mode) ? q.mode : 'upcoming';
  const number = Number(q.page);
  const page = Number.isSafeInteger(number) && number >= 1 && number <= 200 ? number : 1;
  const event = typeof q.event === 'string' ? q.event.slice(0,200) : '';
  return {kind,mode,page,event};
}
function makeUrl({kind,mode,page,event=''}) {
  const params = new URLSearchParams({kind,mode,page:String(page)});
  if (event) params.set('event',event);
  return `/api/assistant?${params.toString()}`;
}
function renderDocument(body, meta={}) {
  const header = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${htmlEsc(APP_NAME)}</title><style>body{font:16px/1.55 system-ui, sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#1b2635}a{color:#155eab}article{border:1px solid #d5dce5;border-radius:8px;padding:1rem;margin:1rem 0}h1,h2{line-height:1.25}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #dde3eb;padding:.4rem .5rem;vertical-align:top}small{color:#506070}.muted{color:#506070}nav a{margin-right:1rem}details{border-top:1px solid #ccd5de;padding:.6rem 0}summary{cursor:pointer;font-weight:600}code{overflow-wrap:anywhere}</style></head><body><header><h1>${APP_NAME}</h1><p class="muted">Public read-only SportyBet feed projection. No accounts, staking, or booking. All values originate from the existing VirtualScope APIs; markets absent from those APIs are NOT supplied here.</p><nav><a href="${makeUrl({kind:'virtual',mode:'upcoming',page:1})}">Virtual football</a><a href="${makeUrl({kind:'real',mode:'upcoming',page:1})}">Real football</a></nav></header>`;
  return header + body + '<footer><hr><small>Generated by VirtualScope Assistant Bridge. Not affiliated with SportyBet. Odds may change. No claim of predictive advantage.</small></footer></body></html>';
}
function sendHtml(res, status, body) {
  res.statusCode=status;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=30');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(renderDocument(body));
}
function eventDetails(ev) {
  let out = `<h2>${htmlEsc(ev.home)} vs ${htmlEsc(ev.away)}</h2><p>${htmlEsc(ev.league)} • Event ID <code>${htmlEsc(ev.id)}</code> • ${htmlEsc(ev.startsAt)} • ${htmlEsc(ev.status)}</p>`;
  out += `<p><strong>${ev.markets.length} market(s) included in this API response.</strong> This does not guarantee all SportyBet markets.</p>`;
  if (!ev.markets.length) out += '<p>No markets were included in this fixture response. A separate event-detail feed may be required.</p>';
  for (const m of ev.markets) {
    out += `<details open><summary>${htmlEsc(m.name)} ${m.specifier ? '('+htmlEsc(m.specifier)+')' : ''} — ${m.outcomes.length} outcomes</summary><p><small>Market ID: ${htmlEsc(m.id)} ${htmlEsc(m.group)}</small></p><table><thead><tr><th>Outcome</th><th>Decimal odds</th><th>Status</th></tr></thead><tbody>`;
    for (const o of m.outcomes) out += `<tr><td>${htmlEsc(o.name)}</td><td>${htmlEsc(o.odds)}</td><td>${o.available?'Available':'Inactive'}</td></tr>`;
    out += '</tbody></table></details>';
  }
  return out;
}
async function handler(req,res) {
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return sendHtml(res,405,'<p>GET requests only.</p>'); }
  const opts=cleanParams(req.query || {});
  // Trust the Vercel deployment's own hostname, not user-supplied Host / Origin headers.
  // VERCEL_URL is supplied by Vercel; a specific environment variable is useful locally.
  const deployment=process.env.VIRTUALSCOPE_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  let base;
  try {base=new URL(deployment); if (!['https:','http:'].includes(base.protocol)) throw new Error('invalid protocol');}
  catch {return sendHtml(res,500,'<p>Invalid server configuration for source API URL.</p>');}
  const upstreamParams = new URLSearchParams({page:String(opts.page)});
  if(opts.kind==='virtual') upstreamParams.set('mode', opts.mode);
  const url = new URL(`${KINDS[opts.kind]}?${upstreamParams}`,base);
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'},cache:'no-store'});
    if(!response.ok) return sendHtml(res,502,`<h2>Feed error</h2><p>${htmlEsc(opts.kind)} page ${opts.page}: source API responded HTTP ${response.status}.</p>`);
    const raw=await response.text();
    if(raw.length > 10_000_000) return sendHtml(res,502,'<p>The source response exceeded the safety size. Try a smaller page.</p>');
    let data;
    try {data=JSON.parse(raw);} catch {return sendHtml(res,502,'<p>The source API returned data that is not JSON.</p>');}
    if(data.ok===false) return sendHtml(res,502,`<h2>Source API error</h2><p>${htmlEsc(data.error || 'Unknown upstream error')}</p>`);
    const events=collectEvents(data.payload || data);
    const sourceTime=data.fetchedAt || new Date().toISOString();
    let output=`<h2>${opts.kind==='virtual'?'Virtual football':'Real football'} — ${htmlEsc(opts.mode)}, page ${opts.page}</h2><p>Fetched at (UTC): <time>${htmlEsc(sourceTime)}</time> • ${events.length} distinct event(s) on this API page.</p>`;
    if(opts.event){
      const found=events.find(e=>e.id===opts.event);
      output+=`<p><a href="${makeUrl({...opts,event:''})}">← Page ${opts.page} fixtures</a></p>`;
      output+=found?eventDetails(found):'<p>Event ID not found on this page. Select an event from the fixture list.</p>';
    }else{
      output+='<ol>';
      for(const e of events) output+=`<li><a href="${makeUrl({...opts,event:e.id})}">${htmlEsc(e.home)} vs ${htmlEsc(e.away)}</a> — ${htmlEsc(e.league)} — ${e.markets.length} market(s); ${htmlEsc(e.startsAt)}</li>`;
      output+='</ol>';
      if(!events.length) output+='<p>No fixtures found in this response. The feed may have ended or returned a different structure.</p>';
      output+=`<p><a href="${makeUrl({...opts,page:Math.max(1,opts.page-1)})}">Previous page</a> · <a href="${makeUrl({...opts,page:opts.page+1})}">Next page</a></p>`;
      output+='<p><small>Each page is read independently; keep following Next page while new fixtures appear. Stop at an empty or repeating page. This is not a fixed ten-game display limit.</small></p>';
    }
    return sendHtml(res,200,output);
  }catch(e){
    return sendHtml(res,502,`<h2>Connection unavailable</h2><p>Could not read the ${htmlEsc(opts.kind)} feed: ${e.name==='AbortError'?'request timed out':'internal request failed'}.</p>`);
  }finally{clearTimeout(timeout);}
}
module.exports=handler;
module.exports._test={collectEvents,getMarkets,cleanParams,htmlEsc,makeUrl};
