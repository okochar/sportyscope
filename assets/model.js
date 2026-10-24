/* Shared normalization for verified SportyBet responses. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScopeModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const text = (...values) => values.find(v => typeof v === 'string' && v.trim())?.trim() || '';
  const list = v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];
  const odds = v => v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 1 ? Number(v) : null;
  const enabled = v => ![false, 0, '0', 'false'].includes(v);
  function unpack(wrap) {
    if (!wrap || !Array.isArray(wrap.value) || !wrap.keys || typeof wrap.keys !== 'object') throw new Error('Unexpected compact feed schema.');
    function decode(v) {
      if (Array.isArray(v)) return v.map(decode);
      if (!v || typeof v !== 'object') return v;
      return Object.fromEntries(Object.entries(v).map(([k, value]) => [wrap.keys[k] || k, decode(value)]));
    }
    return decode(wrap.value);
  }
  function markets(raw) {
    return list(raw.markets || raw.marketList || raw.marketOdds || raw.betMarkets).map(m => ({
      id: String(m.id ?? m.marketId ?? ''), poolId: String(m.marketPoolId ?? ''),
      name: text(m.desc, m.name, m.marketName, m.title, m.label) || `Market ${m.id ?? m.marketId ?? ''}`,
      specifier: text(m.specifier, m.subTitle), type: text(m.type), group: text(m.group, m.marketGroup, m.groupName),
      active: enabled(m.active) && !m.banned && (m.status === undefined || [0, '0', 'Active'].includes(m.status)),
      outcomes: list(m.outcomes || m.outcomeList || m.selections || m.options).map(o => ({
        id: String(o.id ?? o.outcomeId ?? ''), name: text(o.desc, o.name, o.outcomeName, o.label, o.shortName) || String(o.id ?? o.outcomeId ?? ''),
        odds: odds(o.odds ?? o.price ?? o.decimalOdds ?? o.decimal),
        active: enabled(o.active) && enabled(o.isActive) && enabled(o.enable) && o.status !== 'Suspended'
      }))
    }));
  }
  function event(raw, family, context = {}) {
    const home = text(raw.homeTeamName, raw.home, raw.homeTeam?.name, raw.homeTeam);
    const away = text(raw.awayTeamName, raw.away, raw.awayTeam?.name, raw.awayTeam);
    const id = String(raw.eventId ?? raw.id ?? '');
    if (!home || !away || !id) return null;
    const category = raw.sport?.category;
    const league = family === 'Real' ? [category?.name, category?.tournament?.name || context.league].filter(Boolean).join(' · ') : text(raw.leagueName, category?.name, context.league);
    return {
      id: `api-${family}-${id}`, rawEventId: id, sportId: raw.sport?.id || context.sportId || '', productId: Number(raw.markets?.[0]?.product || context.productId || (raw.status===1?1:3)),
      home, away, league: league || 'SportyBet', gameType: family,
      time: raw.estimateStartTime ?? raw.startTime ?? context.time ?? null,
      markets: markets(raw), totalMarketSize: raw.totalMarketSize ?? raw.marketCount ?? null,
      origin: `SportyBet ${family === 'Instant' ? 'anonymous Instant Football round' : family} response (unofficial)`, sourceKind: 'api',
      status: text(raw.matchStatus, raw.status, context.status), roundId: context.roundId || '',
      closeAt: context.closeAt || null, openAt: context.openAt || null
    };
  }
  function sports(payload, family) {
    const d = payload.data;
    const raw = Array.isArray(d) ? d.flatMap(t => Array.isArray(t.events) ? t.events : [t]) : Array.isArray(d?.tournaments) ? d.tournaments.flatMap(t => t.events || []) : d?.eventId ? [d] : null;
    if (!raw) throw new Error('Unexpected sports feed schema.');
    const events = raw.map(r => event(r, family)).filter(Boolean);
    if (raw.length && !events.length) throw new Error('Response contained no identifiable fixtures.');
    // SportyBet puts SRL simulations in sport 1 alongside real football.
    const excluded = family === 'Real' ? new Set(raw.filter(r => r.sport?.category?.name === 'Simulated Reality League').map(r => String(r.eventId))) : new Set();
    return events.filter(e => !excluded.has(e.rawEventId));
  }
  function scheduled(payload, mode) {
    const leagues = unpack(payload.data?.wrapLeagueMatchdayList);
    return leagues.flatMap(l => list(l.matchdays).filter(day => mode === 'live' ? day.status === 'KICKOFF' : !['KICKOFF', 'FINISHED'].includes(day.status)).flatMap(day =>
      list(day.events).map(r => event(r, 'Scheduled', {league: `${l.leagueName} · Season ${day.season} · Matchday ${day.matchday}`, time: day.kickoffTime, status: day.status, closeAt: day.betCloseTime, openAt: day.betOpenTime, sportId: 'sr:sport:10000'})).filter(Boolean)
    ));
  }
  function instant(payload, round) {
    const leagues = new Map(list(round?.leagues).map(l => [l.leagueId, l.name]));
    return unpack(payload.wrapEventList).map(r => event(r, 'Instant', {league: leagues.get(r.leagueId) || r.leagueId, roundId: payload.roundId, status: 'Anonymous round snapshot', sportId: 'sr:sport:1'})).filter(Boolean);
  }
  return {unpack, markets, event, sports, scheduled, instant, odds, enabled};
});
