'use strict';
const {request, json, fail} = require('../lib/upstream');
const model = require('../assets/model');
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, {ok:false, error:'GET only.'}); }
  const {family, eventId, productId='3', roundId=''} = req.query || {};
  if (family === 'Instant') {
    if (!/^[A-Za-z0-9]{10,80}$/.test(eventId || '') || !/^[A-Za-z0-9]{10,80}$/.test(roundId)) return json(res,400,{ok:false,error:'Valid Instant event and round identifiers are required.'});
    try {
      const [p,round]=await Promise.all([
        request('/instantwin/api/v2/iwqk/event/details_without_login?'+new URLSearchParams({eventId,featureCode:'6',sportId:'sr:sport:1'})),
        request('/instantwin/api/v3/iwqk/event/prepare_round_without_login?sportId=sr:sport:1&filterTournament=true&featureCode=6&forceNew=false')
      ]);
      if (p.roundId !== roundId || round.roundId !== roundId || p.events?.[0]?.eventId !== eventId) throw new Error('The anonymous Instant round changed. Refresh before loading its markets.');
      const raw=p.events[0],league=round.leagues?.find(l=>l.leagueId===raw.leagueId)?.name || raw.leagueId;
      const event=model.event(raw,'Instant',{league,roundId,status:'Anonymous round snapshot',sportId:'sr:sport:1'});
      return json(res,200,{ok:true,event,fetchedAt:new Date().toISOString()});
    }catch(e){return fail(res,e);}
  }
  if (!['Real','vFootball'].includes(family) || !/^sr:match:\d+$/.test(eventId || '') || !['1','3'].includes(String(productId))) return json(res, 400, {ok:false,error:'A valid sports event is required.'});
  try {
    const p = await request('/factsCenter/event?' + new URLSearchParams({productId:String(productId),eventId,_t:String(Date.now())}));
    const event = model.sports(p,family)[0];
    const expected = family === 'Real' ? 'sr:sport:1' : 'sr:sport:202120001';
    if (!event || event.rawEventId !== eventId || event.sportId !== expected) throw new Error('Event response did not match the requested category.');
    return json(res,200,{ok:true,event,fetchedAt:new Date().toISOString()});
  } catch (e) { return fail(res,e); }
};
