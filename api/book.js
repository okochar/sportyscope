'use strict';
const {book,validate} = require('../lib/booking');
const {json,fail} = require('../lib/upstream');
module.exports = async (req,res) => {
  if (req.method !== 'POST') {res.setHeader('Allow','POST');return json(res,405,{ok:false,error:'POST only. Booking is never automatic.'});}
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return json(res,403,{ok:false,error:'Use the booking button on this app.'}); }
    catch {return json(res,403,{ok:false,error:'Invalid origin.'});}
  }
  let body;
  try {body=typeof req.body === 'string' ? JSON.parse(req.body) : req.body;validate(body);}
  catch(e){return json(res,400,{ok:false,error:e.message});}
  try {return json(res,200,await book(body));} catch(e){return fail(res,e);}
};
