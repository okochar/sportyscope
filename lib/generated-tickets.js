'use strict';
const M=require('../assets/tracking-model'),{hash,sanitize}=require('./ticket-store');
async function save(db,user,picks,code,generatedBy='automatic'){
 const now=Date.now(),family=picks[0].family,id=family+'|'+picks.map(M.key).sort().join('~'),ticket=sanitize({id,family,code,createdAt:now,updatedAt:now,generatedBy,picks:picks.map(p=>({...p,status:'pending',forecastAt:p.forecastAt||new Date(now).toISOString()}))});
 await db.saveTicket(hash('scope-account-v1:'+user),hash(id),ticket);await db.enqueueTicket(user,ticket);
 const forecasts=picks.filter(p=>Number.isFinite(p.probability)&&Number(p.time)>Date.now()).map(p=>({...p,forecastAt:p.forecastAt||new Date(now).toISOString()}));if(db.recordPredictions)await db.recordPredictions(user,forecasts);else for(const p of forecasts)await db.recordPrediction(user,p);return ticket;
}
module.exports={save};
