'use strict';
const {request, FeedError} = require('./upstream');
const key = s => [s.eventId, String(s.marketId), s.specifier || '', String(s.outcomeId)].join('|');
function validate(body) {
  if (!body || !['Real','vFootball'].includes(body.family) || !Array.isArray(body.selections) || !body.selections.length || body.selections.length > 30) throw new FeedError('Choose 1–30 fetched selections from one supported category (real football or vFootball).');
  const seen = new Set();
  const selections = body.selections.map(s => {
    if (!s || !/^sr:match:\d+$/.test(s.eventId || '') || !/^\d+$/.test(s.marketId || '') || !/^\d+$/.test(s.outcomeId || '') || typeof s.specifier !== 'string' || s.specifier.length > 200) throw new FeedError('Invalid selection identifiers.');
    if (seen.has(s.eventId)) throw new FeedError('Only one selection per event is supported.');
    seen.add(s.eventId);
    return {eventId:s.eventId,marketId:s.marketId,outcomeId:s.outcomeId,...(s.specifier ? {specifier:s.specifier} : {})};
  });
  return {family:body.family,selections};
}
function verify(data, selections, family) {
  if (!data || data.isAvailable === false || data.unavailableOutcomes?.length) throw new FeedError('SportyBet reported unavailable selections. Refresh and review the slip.');
  const actual = data.ticket?.selections;
  if (!Array.isArray(actual) || actual.length !== selections.length || !selections.every(s => actual.some(a => key(a) === key(s)))) throw new FeedError('SportyBet booking readback did not match all requested selections. No code will be shown.');
  const sport = family === 'Real' ? 'sr:sport:1' : 'sr:sport:202120001';
  if (actual.some(s => s.sportId !== sport)) throw new FeedError('SportyBet returned selections from a different category.');
}
async function book(body, fetcher) {
  const {family,selections} = validate(body);
  const issued = await request('/orders/share?throwInvalidEvent=true',{body:{selections},fetcher});
  const code = issued.data?.shareCode;
  if (!/^[A-Z0-9]{4,16}$/.test(code || '')) throw new FeedError('SportyBet did not issue a valid booking code.');
  verify(issued.data,selections,family);
  const loaded = await request('/orders/share/'+encodeURIComponent(code),{fetcher});
  if (loaded.data?.shareCode !== code) throw new FeedError('SportyBet returned a different booking code on readback.');
  verify(loaded.data,selections,family);
  return {ok:true,code,url:'https://www.sportybet.com/ng/?shareCode='+encodeURIComponent(code),verifiedAt:new Date().toISOString(),deadline:loaded.data.deadline,selections:loaded.data.ticket.selections,note:'SportyBet issued this reservation code and returned the same selections when loaded. No bet was placed. Prices and availability may change.'};
}
module.exports = {validate,verify,book};
