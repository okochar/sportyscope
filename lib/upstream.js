'use strict';
const VERSION = require('./version');
const BASE = 'https://www.sportybet.com/api/ng';
class FeedError extends Error {
  constructor(message, details = {}) { super(message); Object.assign(this, details); }
}
async function request(path, {body, fetcher = fetch} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(BASE + path, {
      method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: {'Accept': 'application/json', 'country-code':'ng', platform:'wap', ...((path.startsWith('/orders/')||path.startsWith('/factsCenter/eventResultList'))?{OperId:'2'}:{}), ...(body ? {'Content-Type': 'application/json'} : {})},
      signal: controller.signal, redirect: 'error', cache: 'no-store'
    });
    let size = 0; const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 24_000_000) { controller.abort(); throw new FeedError('SportyBet response exceeded the transport limit.'); }
      chunks.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new FeedError('SportyBet returned non-JSON data.', {upstreamStatus: response.status}); }
    if (!response.ok || (data.bizCode !== undefined && String(data.bizCode) !== '10000')) {
      throw new FeedError(`SportyBet rejected the request${data.bizCode ? ` (code ${data.bizCode})` : ''}${typeof data.message==='string'?': '+data.message.slice(0,160):'.'}`, {upstreamStatus: response.status, bizCode: data.bizCode});
    }
    return data;
  } catch (e) {
    if (e instanceof FeedError) throw e;
    throw new FeedError(e.name === 'AbortError' ? 'SportyBet request timed out.' : 'Unable to reach SportyBet from this server.');
  } finally { clearTimeout(timer); }
}
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-VirtualScope-Version', VERSION);
  res.end(JSON.stringify({version: VERSION, ...body}));
}
function fail(res, e) { return json(res, 502, {ok: false, error: e.message, upstreamStatus: e.upstreamStatus, bizCode: e.bizCode}); }
module.exports = {request, json, fail, FeedError};
