'use strict';
let data=require('../data/legacy-instant-profiles.json');
const R=require('../assets/research'),{store}=require('./knowledge-store');
let lastRead=0,pending;
async function warm(){
  if(!store.configured||Date.now()-lastRead<900000)return;
  if(pending)return pending;
  pending=(async()=>{try{const value=await store.readModel('instant-england-archive-2022-v1');if(value?.family==='Instant'&&value.competition==='England'&&value.version===1&&value.conditionCount===40&&value.profiles&&value.pairs)data=value;}catch{}finally{lastRead=Date.now();pending=null;}})();return pending;
}
function profile(code){
  const p=data.profiles[code];if(!p)return null;
  const empty=R.metrics([]);
  return {...p,last5:empty,previous5:empty,last10:empty,form:'Unavailable: archive rows have no match timestamps',streak:null,firstHalf:{games:0,scored:null,conceded:null},secondHalf:{games:0,scored:null,conceded:null},restDays:null,oldest:null,newest:null,recent:[],opponents:Object.entries(data.pairs).filter(([key])=>key.startsWith(code+'|')).map(([key,pair])=>{const rows=pair.scores.flatMap(([gf,ga,n])=>Array.from({length:n},()=>({gf,ga,result:gf>ga?'W':gf<ga?'L':'D'})));return {id:'legacy:Instant:England:2022:'+key.split('|')[1],name:key.split('|')[1],...R.metrics(rows)};})};
}
function report(event){
  if(event.gameType!=='Instant'||event.league!=='England'||!data.profiles[event.home]||!data.profiles[event.away])return null;
  const home=profile(event.home),away=profile(event.away),pair=data.pairs[event.home+'|'+event.away],weight=pair?Math.min(.3,pair.samples/(pair.samples+50)):0;
  const pairMean=i=>pair.scores.reduce((n,r)=>n+r[i]*r[2],0)/pair.samples;
  const fitted={home:(home.home.scored+away.away.conceded)/2*(1-weight)+(pair?pairMean(0)*weight:0),away:(away.away.scored+home.home.conceded)/2*(1-weight)+(pair?pairMean(1)*weight:0),homeGames:home.total.games,awayGames:away.total.games,method:'Archival Instant England goal rates by team and venue, blended with same-direction head-to-head averages (maximum 30% weight), then an independent Poisson score model. No inferred dates, current form, measured xG or real-club data.'};
  const markets=R.compare(event,fitted),diagnostic={samples:0,brier:null,baselineBrier:null,skill:null};
  return {evidenceMode:'archive',status:'modeled',eligible:true,home,away,h2h:[],archivePair:pair||null,conditions:{home:home.conditions,away:away.conditions,pair:pair?.conditions||[]},fitted,markets,comparisons:markets.rows,validation:{home:diagnostic,away:diagnostic},records:home.total.games+away.total.games,issues:['2022 archival samples. Current simulator version and long-term comparability are unverified. Matching uses exact Instant England labels, not claimed stable provider IDs.','Repeated identical row signatures were collapsed conservatively; independent game identities and chronology cannot be reconstructed. No chronological backtest is claimed.','The diagnostic is informational and does not veto a pick. Missing or closed outcomes still cannot be selected.'],coverage:[{name:'Archival team and head-to-head profiles',status:'ingested',detail:data.audit.uniqueObservations+' distinct scored row signatures; 20 team profiles, 380 ordered pairs. '+home.total.games+' / '+away.total.games+' samples involve these teams.'},{name:'40 final-score market conditions',status:'ingested',detail:'Observed condition-met counts and denominators for results, double chance, totals, team goals, BTTS, clean sheets, parity and European handicaps.'},{name:'Current form, time sequence, round IDs, player and corner history',status:'missing',detail:'Not recorded in this archive. No corners, Asian quarter-line outcomes, first-goal sequence, or current simulator calibration are inferred.'}],sources:[{name:'User archive: sporty-master.zip · aggregated migration audit',url:'/assets/legacy-audit.json',retrievedAt:new Date().toISOString(),records:data.audit.uniqueObservations}]};
}
module.exports={report,profile,warm,audit:data.audit};
