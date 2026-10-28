'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bootstrap=require('../lib/archive-bootstrap');
test('Archive import is bounded, resumable and verified by its source digest',async()=>{
 const rows=new Map(),db={hasModel:async id=>rows.has(id)||id==='instant-england-archive-2022-v1',hasProfiles:async()=>true,async listArchiveChunks(prefix){return [...rows.keys()].filter(id=>id.startsWith(prefix)).map(id=>({id}));},async saveModels(batch){assert.ok(batch.length<=4);for(const r of batch)rows.set(r.id,r.model);},async saveModel(id,family,data){rows.set(id,data);}};
 let cursor=0,r;do{r=await bootstrap.ensure(db,cursor);cursor=r.nextCursor;}while(cursor!==null);assert.equal(r.ready,true);const archive=[...rows.entries()].filter(([id])=>/\d{4}$/.test(id)).flatMap(([,model])=>model.records);assert.equal(archive.length,r.archiveRecords);assert.equal(new Set(archive.map(r=>r.id)).size,archive.length);assert.ok(rows.has(bootstrap.prefix+'manifest'));assert.equal(rows.get(bootstrap.prefix+'manifest').licence,'CC0-1.0');
});
