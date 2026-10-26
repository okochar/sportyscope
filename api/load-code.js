'use strict';
const {loadCode}=require('../lib/booking'),{json,fail}=require('../lib/upstream');
module.exports=async(req,res)=>{
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{ok:false,error:'GET only.'});}
  if(!/^[A-Za-z0-9]{4,16}$/.test(req.query?.code||''))return json(res,400,{ok:false,error:'Enter a 4–16 character SportyBet booking code.'});
  try{return json(res,200,await loadCode(req.query.code));}catch(e){return fail(res,e);}
};
