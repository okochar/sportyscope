'use strict';
const {query, load} = require('../lib/feeds');
const {json, fail} = require('../lib/upstream');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, {ok: false, error: 'GET only.'}); }
  let q;
  try { q = query(req.query); } catch (e) { return json(res, 400, {ok: false, error: e.message}); }
  try { return json(res, 200, await load(q)); } catch (e) { return fail(res, e); }
};
