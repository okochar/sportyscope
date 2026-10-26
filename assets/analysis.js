/* Evidence-based selection and target-odds assembly. Shared by browser and server. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScopeAnalysis=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const families=['Real','vFootball','Scheduled','Instant'];
  const defaults=Object.freeze({legs:30,minOdds:1.15,maxOdds:3,targetOdds:5,window:'today',family:'vFootball'});
  const capabilities={Real:{booking:true,label:'Real football'},vFootball:{booking:true,label:'vFootball',reason:'Uses this product’s own dated results and team profiles. Genuine reservations are verified by readback.'},Scheduled:{booking:false,label:'Scheduled Football',reason:'Provider statistics support exploratory local picks. Transferable booking codes have not been verified.'},Instant:{booking:false,label:'Instant Football',reason:'2022 Instant England profiles support matching labels; other fixtures use a marked price fallback. Transferable codes have not been verified.'}};
  function settings(input={}){
    const s={...defaults,...input};for(const k of ['legs','minOdds','maxOdds','targetOdds'])s[k]=Number(s[k]);
    if(!Number.isInteger(s.legs)||s.legs<1||s.legs>30)throw Error('Choose 1–30 maximum selections.');
    if(!Number.isFinite(s.minOdds)||!Number.isFinite(s.maxOdds)||s.minOdds<1.01||s.maxOdds>10||s.minOdds>s.maxOdds)throw Error('Choose decimal odds between 1.01 and 10.');
    if(!['today','24h','7days'].includes(s.window)||!['All',...families].includes(s.family))throw Error('Choose a valid game type and time window.');
    if(!Number.isFinite(s.targetOdds)||s.targetOdds<1.1||s.targetOdds>1000)throw Error('Target combined odds must be 1.10–1000.');return s;
  }
  function open(e,family,now,opts={}){
    if(e.sourceKind!=='api'||e.gameType!==family)return false;if(family==='Instant')return Boolean(e.roundId);
    const window=opts.window||defaults.window,t=Number(e.time),lead=family==='Scheduled'?30000:300000,end=window==='7days'?now+7*86400000:window==='24h'?now+86400000:Math.floor((now+3600000)/86400000)*86400000+86400000-3600000;
    return Number.isFinite(t)&&t>now+lead&&t<end&&(!e.closeAt||Number(e.closeAt)>now+lead)&&(!e.openAt||Number(e.openAt)<=now)&&e.productId!==1;
  }
  function candidate(e,m,o,opts={},now=Date.now(),report){
    const s=settings(opts),age=now-new Date(report?.analyzedAt||0).getTime();
    if(!report?.eligible||report.family!==e.gameType||report.eventId!==e.rawEventId||age>900000||age< -60000||!open(e,e.gameType,now,s)||m.active===false||o.active===false)return null;
    const row=report.comparisons?.find(r=>r.marketId===m.id&&r.specifier===(m.specifier||'')&&r.outcomeId===o.id),odds=Number(o.odds);
    if(!row||!row.active||Math.abs(row.odds-odds)>.0001||odds<s.minOdds||odds>s.maxOdds)return null;
    const reason=report.evidenceMode==='price'?`Market-price fallback: ${(100*row.probability).toFixed(1)}% normalized price share. No historical win prediction is available.`:`${report.evidenceMode==='archive'?'2022 archival model':'Experimental model'} ${(100*row.probability).toFixed(1)}% win / ${(100*row.voidProbability).toFixed(1)}% void; ${report.home.total.games} + ${report.away.total.games} recorded rows. Estimated return ${(100*row.expectedReturn).toFixed(1)}% is model-dependent, not a proven edge.`;
    return {eventId:e.id,rawEventId:e.rawEventId,family:e.gameType,home:e.home,away:e.away,league:e.league,time:e.time,roundId:e.roundId||'',marketId:m.id,specifier:m.specifier||'',market:m.name,outcomeId:o.id,outcome:o.name,odds,probability:row.probability,voidProbability:row.voidProbability,expectedReturn:row.expectedReturn,score:Math.log(Math.max(.001,row.probability+row.voidProbability))+.05*row.expectedReturn,evidenceMode:report.evidenceMode||'dated-history',sourceKind:'api',source:e.origin,reason};
  }
  const fingerprint=(family,picks)=>family+'|'+picks.map(p=>[p.rawEventId,p.marketId,p.specifier||'',p.outcomeId].join(':')).sort().join('|');
  function assemble(candidates,opts={}){
    const s=settings(opts),groups=new Map();for(const c of candidates){const key=c.rawEventId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
    let beam=[{picks:[],odds:1,score:0}];
    const distance=b=>Math.abs(Math.log(b.odds/s.targetOdds));
    for(const choices of groups.values()){
      const next=beam.filter(b=>b.picks.length<s.legs).flatMap(b=>choices.map(c=>({picks:[...b.picks,c],odds:b.odds*c.odds,score:b.score+c.score})));
      const unique=new Map();for(const b of [...beam,...next]){const k=b.picks.length+':'+Math.round(Math.log(b.odds)*10000);const prev=unique.get(k);if(!prev||b.score>prev.score)unique.set(k,b);}
      beam=[...unique.values()].sort((a,b)=>distance(a)-distance(b)||b.score-a.score).slice(0,128);
      if(!beam.some(b=>!b.picks.length))beam.push({picks:[],odds:1,score:0});
    }
    const minimum=groups.size>=2&&s.legs>=2?2:1;
    return beam.filter(b=>b.picks.length>=minimum).sort((a,b)=>distance(a)-distance(b)||b.score-a.score)[0]?.picks||[];
  }
  function analyze(snapshot,family,opts={},now=Date.now(),reports={},feedback={markets:{}}){
    const s=settings(opts),age=now-new Date(snapshot?.fetchedAt||0).getTime(),base={family,settings:s,analyzedAt:new Date(now).toISOString(),picks:[],combinedOdds:null,scannedEvents:snapshot?.events?.length||0,eligibleEvents:0,scannedMarkets:0,researchedEvents:0,capability:capabilities[family],method:'Separate product histories, transparent statistical estimates, informational diagnostics, current market comparison and target-odds search; explicit price fallback where history is unavailable.'};
    if(!families.includes(family))throw Error('Unknown category.');
    if(!Array.isArray(snapshot?.events)||!snapshot.fetchedAt||age>120000||age< -60000||!snapshot.complete||snapshot.error)return {...base,status:'waiting',message:'Waiting for a complete, fresh, successful feed.'};
    const candidates=[];for(const listing of snapshot.events){if(!open(listing,family,now,s))continue;base.eligibleEvents++;const r=reports[listing.rawEventId],e=r?.event||listing;if(r)base.researchedEvents++;base.scannedMarkets+=r?.markets?.marketsReturned||r?.marketsReturned||listing.markets?.length||0;if(family==='Instant'&&r?.event?.roundId!==listing.roundId)continue;for(const row of r?.comparisons||[]){const m={id:row.marketId,name:row.market,specifier:row.specifier,active:row.active},o={id:row.outcomeId,name:row.outcome,odds:row.odds,active:row.active};const p=candidate(e,m,o,s,now,r);if(p)candidates.push(p);}}
    for(const p of candidates){const k=[p.family,p.marketId,p.specifier||'',p.outcomeId].join('|'),learned=feedback.markets?.[k];if(learned?.n){p.score+=learned.residual/(20+learned.n);p.reason+=' Local ranking calibration uses '+learned.n+' verified earlier outcomes, with shrinkage toward the base model.';}}
    const picks=assemble(candidates,s),combined=picks.length?picks.reduce((n,p)=>n*p.odds,1):null;
    return {...base,status:picks.length?'ready':'empty',picks,combinedOdds:combined,fingerprint:fingerprint(family,picks),message:picks.length?`Ranked combination ${combined.toFixed(2)} toward target ${s.targetOdds.toFixed(2)}; ${picks.length} of up to ${s.legs} legs. Model-test results are informational. Evidence modes are shown per pick.`:'No currently open, researched selections meet the chosen odds filters. Research continues; closed or missing outcomes cannot be invented.',expiresAt:picks.length?Math.min(...picks.map(p=>Number(p.time)||now+60000)):null};
  }
  return {families,defaults,capabilities,settings,open,candidate,analyze,assemble,fingerprint};
});
