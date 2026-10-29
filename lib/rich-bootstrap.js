'use strict';
const crypto=require('node:crypto'),{data,run}=require('./real-ml'),features=require('../data/real-training-features.json');
const size=100,id='rich-'+data.digest.slice(0,20),factChunks=Math.ceil(data.matches.length/size),featureChunks=Math.ceil(features.rows.length/size),modelStart=1+factChunks+featureChunks,runStep=modelStart+run.models.length,rawStart=runStep+1,total=rawStart+data.raw.length;
async function rawObject(item,fetcher=fetch){
 if(!/^https:\/\/ndownloader\.figshare\.com\/files\/\d+$/.test(item.url))throw Error('Unverified archive source URL.');
 const partial=Number.isInteger(item.start),r=await fetcher(item.url,{headers:partial?{Range:'bytes='+item.start+'-'+(item.start+item.bytes-1)}:{},signal:AbortSignal.timeout(35000)});
 if(![200,206].includes(r.status))throw Error('Source archive download failed ('+r.status+').');
 const body=Buffer.from(await r.arrayBuffer()),blob=partial&&r.status===200?body.subarray(item.start,item.start+item.bytes):body;
 if(partial&&r.status===206&&!String(r.headers.get('content-range')).startsWith('bytes '+item.start+'-'))throw Error('Source range mismatch.');
 if(blob.length!==item.bytes||crypto.createHash('sha256').update(blob).digest('hex')!==item.sha256)throw Error('Source archive checksum mismatch.');return blob;
}
async function ensure(db,cursor=0){
 if(!Number.isInteger(cursor)||cursor<0||cursor>=total)throw Error('Invalid training import cursor.');
 const progress=await db.readIngestion(id)||{completed:[],facts:0,features:0,models:0,rawObjects:0};
 if(!progress.completed.includes(cursor)){
  if(cursor===0){const {matches,players,...metadata}=data;await db.saveSource(data.sourceId,{...metadata,matches:matches.length,players,trainedRun:run.id});}
  else if(cursor<=factChunks){await db.saveFacts(data.sourceId,data.provider,data.matches.slice((cursor-1)*size,cursor*size));progress.facts=Math.max(progress.facts,Math.min(data.matches.length,cursor*size));}
  else if(cursor<modelStart){const i=cursor-factChunks-1;await db.saveFeatures(data.sourceId,features.featureDigest||data.digest,features.rows.slice(i*size,(i+1)*size));progress.features=Math.max(progress.features,Math.min(features.rows.length,(i+1)*size));}
  else if(cursor<runStep){const model=run.models[cursor-modelStart];await db.saveModel(run.id+':'+model.target,'Real',{...model,features:run.features,preprocessing:run.preprocessing,runId:run.id,datasetDigest:run.datasetDigest});progress.models++;}
  else if(cursor===runStep)await db.saveTrainingRun(run);
  else {const item=data.raw[cursor-rawStart];await db.saveSourceBlob(data.sourceId+'/'+data.digest.slice(0,16)+'/'+item.name,await rawObject(item));progress.rawObjects++;}
  progress.completed.push(cursor);progress.ready=progress.completed.length===total;progress.updatedAt=new Date().toISOString();await db.saveIngestion(id,data.provider,progress);
 }
 return {...progress,total,nextCursor:cursor+1<total?cursor+1:null,sourceId:data.sourceId,runId:run.id};
}
async function repair(db,after=''){if(!/^$|^sr:competitor:\d+$/.test(after))throw Error('Invalid repair cursor.');const queue=await db.repairQueue(after),results=[];await Promise.all(queue.map(async t=>{try{const h=await require('./history').team(t.team_id);results.push({id:t.team_id,name:t.name,before:t.records,after:h.records.length,newOrCorrected:h.newOrCorrectedRecords,storage:h.storage});}catch(e){results.push({id:t.team_id,error:e.message});}}));return {results,nextCursor:queue.length?queue.at(-1).team_id:null};}
module.exports={ensure,repair,id,total,rawObject};
