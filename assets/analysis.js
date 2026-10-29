/* Supported probability is a gate; bounded price utility balances qualifying legs. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScopeAnalysis=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const families=['Real','vFootball','Scheduled','Instant'];
  const minimumUsefulOdds=1.15,priceUtilityCap=1.6;
  const defaults=Object.freeze({legs:50,minOdds:minimumUsefulOdds,maxOdds:10,targetOdds:5,minProbability:.8,window:'today',family:'vFootball'});
  const capabilities={Real:{booking:true,label:'Real football'},vFootball:{booking:true,label:'vFootball',reason:'Uses this simulator’s own dated results. Estimates do not establish a predictable advantage over a random generator.'},Scheduled:{booking:false,label:'Scheduled Football',reason:'Small undated provider samples are exploratory. Transferable codes are unverified.'},Instant:{booking:false,label:'Instant Football',reason:'Exact Instant England labels can use the 2022 archive. Current simulator comparability and transferable codes are unverified.'}};
  function settings(input={}){
    const s={...defaults,...input};for(const k of ['legs','minOdds','maxOdds','targetOdds','minProbability'])s[k]=Number(s[k]);
    if(!Number.isInteger(s.legs)||s.legs<1||s.legs>50)throw Error('Choose 1–50 maximum selections.');
    if(!Number.isFinite(s.minOdds)||!Number.isFinite(s.maxOdds)||s.minOdds<1.01||s.maxOdds>100000||s.minOdds>s.maxOdds)throw Error('Choose valid minimum and maximum decimal odds (at least 1.01).');
    // Upgrade old 1.01 defaults without breaking previously saved preferences.
    s.minOdds=Math.max(minimumUsefulOdds,s.minOdds);s.maxOdds=Math.max(s.minOdds,s.maxOdds);
    if(!Number.isFinite(s.minProbability)||s.minProbability<.75||s.minProbability>.99)throw Error('Choose a minimum model estimate from 75% to 99%.');
    if(!['today','24h','7days'].includes(s.window)||!['All',...families].includes(s.family))throw Error('Choose a valid game type and time window.');
    if(!Number.isFinite(s.targetOdds)||s.targetOdds<1.1)throw Error('Enter finite target combined odds of at least 1.10.');return s;
  }
  function open(e,family,now,opts={}){
    if(e.sourceKind!=='api'||e.gameType!==family)return false;if(family==='Instant')return Boolean(e.roundId);
    const window=opts.window||defaults.window,t=Number(e.time),lead=family==='Scheduled'?30000:300000,end=window==='7days'?now+7*86400000:window==='24h'?now+86400000:Math.floor((now+3600000)/86400000)*86400000+86400000-3600000;
    return Number.isFinite(t)&&t>now+lead&&t<end&&(!e.closeAt||Number(e.closeAt)>now+lead)&&(!e.openAt||Number(e.openAt)<=now)&&e.productId!==1;
  }
  function strength(row){return Number.isFinite(row?.empirical?.rate)?Math.min(row.probability,row.empirical.rate):row?.probability;}
  function balancedScore(row){
    const support=strength(row)??row.score,price=Number(row.odds);
    if(!Number.isFinite(support)||!Number.isFinite(price)||price<minimumUsefulOdds)return -Infinity;
    // This is an explicit ranking heuristic, not a probability or a claimed
    // betting edge. The price bonus saturates: odds of 3 do not get a bigger
    // bonus than 1.60. Evidence still has to clear the separate hard floor.
    return .65*support+.35*Math.min(1,Math.log(price)/Math.log(priceUtilityCap));
  }
  function compareBalanced(a,b){return balancedScore(b)-balancedScore(a)||(strength(b)??b.score)-(strength(a)??a.score)||a.odds-b.odds||String(a.rawEventId||a.marketId||'').localeCompare(String(b.rawEventId||b.marketId||''));}
  function qualified(row,report,floor=.8){return Boolean(row?.active&&report?.eligible&&report.evidenceMode!=='price'&&Number.isFinite(row.probability)&&row.probability>=floor&&Number.isFinite(strength(row))&&strength(row)>=floor&&(!row.empirical||row.empirical.samples>=20)&&(report.home?.total?.games||0)>=20&&(report.away?.total?.games||0)>=20);}
  function candidate(e,m,o,opts={},now=Date.now(),report){
    const s=settings(opts),age=now-new Date(report?.analyzedAt||0).getTime();
    if(!report?.eligible||report.family!==e.gameType||report.eventId!==e.rawEventId||!Number.isFinite(age)||age>900000||age< -60000||!open(e,e.gameType,now,s)||m.active===false||o.active===false)return null;
    const row=report.comparisons?.find(r=>r.marketId===m.id&&r.specifier===(m.specifier||'')&&r.outcomeId===o.id),odds=Number(o.odds);
    if(!qualified(row,report,s.minProbability)||Math.abs(row.odds-odds)>.0001||odds<s.minOdds||odds>s.maxOdds)return null;
    const empirical=row.empirical,reason=`${report.evidenceMode==='archive'?'2022 archive model':'History model'} ${(100*row.probability).toFixed(1)}% estimated win${empirical?`; observed ${(100*empirical.rate).toFixed(1)}% (${empirical.wins}/${empirical.samples} comparisons)`:''}. ${report.home.total.games} home-team / ${report.away.total.games} away-team rows. Meets your ${(100*s.minProbability).toFixed(0)}% filter; ranked for history support and useful odds, not maximum confidence alone. Not a calibrated guarantee.`;
    return {eventId:e.id,rawEventId:e.rawEventId,family:e.gameType,home:e.home,away:e.away,league:e.league,time:e.time,roundId:e.roundId||'',marketId:m.id,specifier:m.specifier||'',market:m.name,outcomeId:o.id,outcome:o.name,odds,probability:row.probability,baseProbability:row.baseProbability??row.probability,forecastAt:report.analyzedAt,modelVersion:row.modelVersion||'history-goals-v1',voidProbability:row.voidProbability||0,empirical,expectedReturn:row.expectedReturn,score:balancedScore(row),evidenceMode:report.evidenceMode||'dated-history',sourceKind:'api',source:e.origin,reason};
  }
  const fingerprint=(family,picks)=>family+'|'+picks.map(p=>[p.rawEventId,p.marketId,p.specifier||'',p.outcomeId].join(':')).sort().join('|');
  function assemble(candidates,opts={}){
    const s=settings(opts),groups=new Map();
    // Balance supported markets per match before using other matches to reach
    // the target. An unsupported longshot cannot fill a target shortfall.
    const compare=compareBalanced;
    for(const c of candidates){if(!Number.isFinite(c.odds)||c.odds<s.minOdds||c.odds>s.maxOdds||!Number.isFinite(balancedScore(c))||Number.isFinite(c.probability)&&(c.probability<s.minProbability||strength(c)<s.minProbability))continue;const old=groups.get(c.rawEventId);if(!old||compare(c,old)<0)groups.set(c.rawEventId,c);}
    const ordered=[...groups.values()].sort(compare),picks=[];let logOdds=0;
    for(const c of ordered){if(picks.length>=s.legs||picks.length&&logOdds>=Math.log(s.targetOdds))break;picks.push(c);logOdds+=Math.log(c.odds);}return picks;
  }
  function analyze(snapshot,family,opts={},now=Date.now(),reports={},feedback={markets:{}}){
    const s=settings(opts),age=now-new Date(snapshot?.fetchedAt||0).getTime(),base={family,settings:s,analyzedAt:new Date(now).toISOString(),picks:[],combinedOdds:null,scannedEvents:snapshot?.events?.length||0,eligibleEvents:0,scannedMarkets:0,researchedEvents:0,capability:capabilities[family],method:'Probability floor first, then bounded balance of historical support and useful odds. One market per match; additional matches can reach the target. Tiny prices and unsupported longshots cannot fill a shortfall.'};
    if(!families.includes(family))throw Error('Unknown category.');
    if(!Array.isArray(snapshot?.events)||!snapshot.fetchedAt||age>120000||age< -60000||!snapshot.complete||snapshot.error)return {...base,status:'waiting',message:'Waiting for a complete, fresh, successful feed.'};
    const candidates=[];for(const listing of snapshot.events){if(!open(listing,family,now,s))continue;base.eligibleEvents++;const r=reports[listing.rawEventId],e=r?.event||listing;if(r)base.researchedEvents++;base.scannedMarkets+=r?.markets?.marketsReturned||r?.marketsReturned||listing.markets?.length||0;if(family==='Instant'&&r?.event?.roundId!==listing.roundId)continue;for(const row of r?.comparisons||[]){const m={id:row.marketId,name:row.market,specifier:row.specifier,active:row.active},o={id:row.outcomeId,name:row.outcome,odds:row.odds,active:row.active};const p=candidate(e,m,o,s,now,r);if(p)candidates.push(p);}}
    // Feedback never lifts a low-estimate leg through the probability floor.
    for(const p of candidates){const learned=feedback.markets?.[[p.family,p.marketId,p.specifier||'',p.outcomeId].join('|')];if(learned?.n)p.reason+=' '+learned.n+' verified tracked outcomes are available for this market.';}
    const picks=assemble(candidates,s),combined=picks.length?picks.reduce((n,p)=>n*p.odds,1):null,reached=Boolean(combined&&combined>=s.targetOdds);
    return {...base,status:picks.length?'ready':'empty',picks,combinedOdds:combined,targetReached:reached,qualifiedEvents:new Set(candidates.map(c=>c.rawEventId)).size,fingerprint:fingerprint(family,picks),message:picks.length?`${picks.length} balanced qualifying legs · ${combined.toFixed(2)} combined odds. ${reached?'Target reached.':'Target not reached: no weaker filler will be added.'} Each estimate meets your ${(s.minProbability*100).toFixed(0)}% filter; leg odds start at ${s.minOdds.toFixed(2)}.`:`No researched selection currently meets your ${(s.minProbability*100).toFixed(0)}% probability filter and minimum ${s.minOdds.toFixed(2)} odds. Missing history and price-only estimates cannot qualify.`,expiresAt:picks.length?Math.min(...picks.map(p=>Number(p.time)||now+60000)):null};
  }
  return {families,defaults,capabilities,minimumUsefulOdds,priceUtilityCap,settings,open,strength,qualified,balancedScore,compareBalanced,candidate,analyze,assemble,fingerprint};
});
