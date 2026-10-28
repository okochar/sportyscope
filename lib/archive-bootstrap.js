'use strict';
const flights=new WeakMap(),data=require('../data/openfootball-results.json'),size=1000,prefix='openfootball-v2-'+data.digest.slice(0,16)+'-',chunks=Math.ceil(data.records.length/size);
async function legacy(store){const id='instant-england-archive-2022-v1',archive=require('../data/legacy-instant-profiles.json');if(!await store.hasModel(id))await store.saveModel(id,'Instant',archive);if(!await store.hasProfiles(id))await store.seedProfiles(id,archive);}
async function ensure(store,cursor=0){
 if(!Number.isInteger(cursor)||cursor<0||cursor>chunks)throw Error('Invalid archive import cursor.');
 if(!flights.has(store))flights.set(store,new Map());const jobs=flights.get(store);if(jobs.has(cursor))return jobs.get(cursor);
 const task=(async()=>{
  if(cursor===0)await legacy(store);
  const saved=new Set((await store.listArchiveChunks(prefix)).map(r=>r.id).filter(id=>/^\d{4}$/.test(id.slice(prefix.length)))),todo=[];let next=cursor;
  while(next<chunks&&todo.length<4){const id=prefix+String(next).padStart(4,'0');if(!saved.has(id))todo.push({id,family:'Real',model:{provider:data.provider,licence:data.licence,sourceCommit:data.sourceCommit,digest:data.digest,records:data.records.slice(next*size,(next+1)*size)}});next++;}
  if(todo.length)await store.saveModels(todo);for(const r of todo)saved.add(r.id);
  const complete=saved.size===chunks;
  if(complete&&!await store.hasModel(prefix+'manifest'))await store.saveModel(prefix+'manifest','Real',{provider:data.provider,licence:data.licence,sourceCommit:data.sourceCommit,digest:data.digest,records:data.records.length,chunks,chunkSize:size,sources:data.sources,oldest:data.records[0]?.date,newest:data.records.at(-1)?.date});
  return {ready:complete,archiveRecords:data.records.length,savedChunks:Math.min(chunks,saved.size),chunks,nextCursor:next<chunks?next:complete?null:0,sourceCommit:data.sourceCommit,licence:data.licence};
 })();jobs.set(cursor,task);task.catch(()=>jobs.delete(cursor));return task;
}
module.exports={ensure,prefix,chunks};
