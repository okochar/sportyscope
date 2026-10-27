'use strict';
const flights=new WeakMap();
async function ensure(store){
  if(flights.has(store))return flights.get(store);
  const work=(async()=>{
    const legacyId='instant-england-archive-2022-v1';
    const legacy=require('../data/legacy-instant-profiles.json');
    if(!await store.hasModel(legacyId))await store.saveModel(legacyId,'Instant',legacy);
    if(!await store.hasProfiles(legacyId))await store.seedProfiles(legacyId,legacy);
    const realId='openfootball-results-2024-2027-v1';
    if(!await store.hasModel(realId))await store.saveModel(realId,'Real',require('../data/openfootball-results.json'));
    return {ready:true,legacyTeams:Object.keys(legacy.profiles).length,legacyPairs:Object.keys(legacy.pairs).length,supplementaryArchive:'OpenFootball'};
  })();flights.set(store,work);work.catch(()=>flights.delete(store));return work;
}
module.exports={ensure};
