'use strict';
const {store}=require('../lib/knowledge-store'),model=require('../data/legacy-instant-profiles.json');
(async()=>{
  if(!store.configured)throw Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) in this server environment first. Do not put credentials in source files.');
  await store.saveModel('instant-england-archive-2022-v1','Instant',model);
  await store.seedProfiles('instant-england-archive-2022-v1',model);
  await store.saveModel('openfootball-results-2024-2027-v1','Real',require('../data/openfootball-results.json'));
  const readback=await store.readModel('instant-england-archive-2022-v1');
  if(readback?.archiveSHA256!==model.archiveSHA256||Object.keys(readback.profiles||{}).length!==20)throw Error('Model readback did not match the seeded archive.');
  console.log('Verified Supabase model readback: 20 Instant England profiles, 380 ordered pairs, 40 conditions.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
