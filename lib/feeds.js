'use strict';
const {request, FeedError} = require('./upstream');
const model = require('../assets/model');
const FAMILIES = ['Real', 'vFootball', 'Scheduled', 'Instant'];
function query(q = {}, forcedFamily) {
  const family = forcedFamily || q.family || 'vFootball';
  if (!FAMILIES.includes(family)) throw new FeedError('Unknown feed category.');
  const mode = q.mode || 'upcoming';
  if (!['upcoming', 'live'].includes(mode) || (family === 'Instant' && mode !== 'upcoming')) throw new FeedError('This feed mode has not been verified.');
  const page = Number(q.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1) throw new FeedError('Page must be a positive integer.');
  return {family, mode, page};
}
async function load(q, fetcher) {
  const {family, mode, page} = q;
  const sportId = family === 'Real' ? 'sr:sport:1' : 'sr:sport:202120001';
  let events, more = false, endpoint;
  if (family === 'Scheduled') {
    endpoint = '/scheduledFootball/api/v1/event/active?sportId=sr:sport:10000';
    events = model.scheduled(await request(endpoint, {fetcher}), mode);
  } else if (family === 'Instant') {
    endpoint = '/instantwin/api/v2/iwqk/event/list_all_with_popular_markets_non_login?sportId=sr:sport:1&featureCode=6';
    const [round, payload] = await Promise.all([
      request('/instantwin/api/v3/iwqk/event/prepare_round_without_login?sportId=sr:sport:1&filterTournament=true&featureCode=6&forceNew=false', {fetcher}),
      request(endpoint, {fetcher})
    ]);
    if (!payload.roundId || payload.roundId !== round.roundId) throw new FeedError('Instant round changed during refresh. Retry to obtain a consistent snapshot.');
    events = model.instant(payload, round);
  } else if (mode === 'live') {
    endpoint = `/factsCenter/configurableLiveOrPrematchEvents?sportId=${encodeURIComponent(sportId)}&withTwoUpMarket=true&withOneUpMarket=true&_t=${Date.now()}`;
    events = model.sports(await request(endpoint, {fetcher}), family);
  } else {
    endpoint = '/factsCenter/wapConfigurableEventsByOrder';
    const payload = await request(endpoint, {fetcher, body: {productId: 3, sportId, order: 0, pageNum: page, pageSize: 100, withTwoUpMarket: true, withOneUpMarket: true}});
    events = model.sports(payload, family);
    if (typeof payload.data?.moreEvents !== 'boolean') throw new FeedError('SportyBet omitted its pagination flag; completeness is unknown.');
    more = payload.data.moreEvents;
  }
  return {ok: true, family, mode, page, events, more, nextPage: more ? page + 1 : null, fetchedAt: new Date().toISOString(), endpoint,
    note: family === 'Instant' ? 'Anonymous SportyBet round snapshot, separate from your logged-in round. No match is kicked off and no bet is placed.' : family === 'Scheduled' ? 'Sporty Scheduled Football. Other Scheduled Virtuals use a separate provider and are not connected here.' : ''};
}
module.exports = {query, load};
