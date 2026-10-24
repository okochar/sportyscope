/**
 * Unofficial, read-only SportyBet virtual football upstream adapter.
 * No authentication, credential collection, staking, or booking endpoints.
 * These URLs are reverse-engineered and not guaranteed to work or stay stable.
 */
const UPSTREAM = 'https://www.sportybet.com';
const PATHS = Object.freeze({
  upcoming: '/api/ng/factsCenter/wapConfigurableUpcomingEvents',
  live: '/api/ng/factsCenter/wapConfigurableIndexLiveEvents',
  results: '/api/ng/factsCenter/eventResultList',
  real: '/api/ng/factsCenter/pcUpcomingEvents'
});
const SPORT_ID = 'sr:sport:202120001';

function sanitizeQuery(query = {}) {
  const mode = ['upcoming', 'live', 'results', 'real'].includes(query.mode) ? query.mode : 'upcoming';
  const n = Number(query.page);
  const page = Number.isFinite(n) ? Math.max(1, Math.min(15, Math.trunc(n))) : 1;
  const category = typeof query.category === 'string' && /^sv:category:20212000[1-5]$/.test(query.category)
    ? query.category : '';
  return { mode, page, category };
}

function buildUrl(query) {
  const { mode, page, category } = sanitizeQuery(query);
  const params = new URLSearchParams();
  params.set('sportId', mode === 'real' ? 'sr:sport:1' : SPORT_ID);
  params.set('pageNum', String(page));
  params.set('pageSize', '50');
  if (mode === 'real') { params.set('todayGames','false'); params.set('timeline','168'); }
  if (category) params.set('categoryId', category);
  params.set('_t', String(Date.now()));
  return { url: `${UPSTREAM}${PATHS[mode]}?${params}`, mode };
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'Read-only endpoint. GET only.' });
  }
  const { url, mode } = buildUrl(req.query || {});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10500);
  try {
    const upstream = await fetch(url, {
      method: 'GET', signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Current-Country': 'NG',
        'User-Agent': 'Mozilla/5.0 (compatible; VirtualScope/1.0; read-only research)'
      },
      redirect: 'error', cache: 'no-store'
    });
    const dataText = await upstream.text();
    if (dataText.length > 2_000_000) {
      return json(res, 502, { ok: false, mode, error: 'Upstream response exceeded safety limit.' });
    }
    if (!upstream.ok) {
      return json(res, 502, { ok: false, mode, upstreamStatus: upstream.status,
        error: 'SportyBet upstream did not return a successful response.' });
    }
    let payload;
    try { payload = JSON.parse(dataText); }
    catch { return json(res, 502, { ok: false, mode, error: 'Upstream did not return JSON (possibly bot protection).' }); }
    if (!payload || typeof payload !== 'object') {
      return json(res, 502, { ok: false, mode, error: 'Upstream returned an invalid payload.' });
    }
    // A successful transport connection is NOT necessarily a valid virtual-football payload.
    if (payload.bizCode !== undefined && String(payload.bizCode) !== '10000') {
      return json(res, 502, {ok:false,mode,error:`SportyBet rejected the request (business code ${String(payload.bizCode).slice(0,30)}).`});
    }
    return json(res, 200, { ok: true, mode, fetchedAt: new Date().toISOString(),
      source: 'SportyBet Nigeria unofficial internal web endpoint', payload });
  } catch (error) {
    const timedOut = error && error.name === 'AbortError';
    return json(res, 502, { ok: false, mode,
      error: timedOut ? 'SportyBet upstream request timed out.' : 'Unable to reach SportyBet virtual endpoint from this server.' });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = handler;
module.exports.buildUrl = buildUrl;
module.exports.sanitizeQuery = sanitizeQuery;
