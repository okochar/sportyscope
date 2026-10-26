'use strict';
const {json,fail}=require('../lib/upstream'),service=require('../lib/research-service');
module.exports=async(req,res)=>{
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{ok:false,error:'GET only.'});}
  try{service.validate(req.query||{});}catch(e){return json(res,400,{ok:false,error:e.message});}
  try{return json(res,200,await service.load(req.query));}catch(e){return fail(res,e);}
};
