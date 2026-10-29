/* Transparent statistical baseline. Football results are evidence, not a guarantee. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScopeResearch=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DAY=86400000,mean=a=>a.length?a.reduce((n,v)=>n+v,0)/a.length:null;
  const ratio=(a,fn)=>a.length?a.filter(fn).length/a.length:null;
  function teamRows(records,id,asOf=Date.now()){
    const seen=new Set();return records.filter(r=>r.time<asOf&&r.ft?.length===2&&(r.homeId===id||r.awayId===id)&&!seen.has(r.id)&&seen.add(r.id)).sort((a,b)=>a.time-b.time).map(r=>{
      const h=r.homeId===id,gf=r.ft[h?0:1],ga=r.ft[h?1:0],ht=r.ht?.[h?0:1],hta=r.ht?.[h?1:0];
      return {...r,venue:h?'home':'away',opponentId:h?r.awayId:r.homeId,opponent:h?r.away:r.home,gf,ga,firstGoals:ht??null,firstAgainst:hta??null,secondGoals:ht===undefined?null:gf-ht,secondAgainst:hta===undefined?null:ga-hta,result:gf>ga?'W':gf<ga?'L':'D'};
    });
  }
  function metrics(rows){return {games:rows.length,wins:rows.filter(r=>r.result==='W').length,draws:rows.filter(r=>r.result==='D').length,losses:rows.filter(r=>r.result==='L').length,scored:mean(rows.map(r=>r.gf)),conceded:mean(rows.map(r=>r.ga)),points:mean(rows.map(r=>r.result==='W'?3:r.result==='D'?1:0)),cleanSheet:ratio(rows,r=>r.ga===0),failedToScore:ratio(rows,r=>r.gf===0),btts:ratio(rows,r=>r.gf>0&&r.ga>0),over15:ratio(rows,r=>r.gf+r.ga>1.5),over25:ratio(rows,r=>r.gf+r.ga>2.5),over35:ratio(rows,r=>r.gf+r.ga>3.5)};}
  function profile(records,id,asOf=Date.now()){
    const rows=teamRows(records,id,asOf),latest=rows.slice(-10),ht=rows.filter(r=>r.firstGoals!==null),opponents=new Map();
    for(const r of rows){if(!opponents.has(r.opponentId))opponents.set(r.opponentId,{id:r.opponentId,name:r.opponent,rows:[]});opponents.get(r.opponentId).rows.push(r);}
    let streak=0;const last=rows.at(-1);for(let i=rows.length-1;i>=0&&rows[i].result===last?.result;i--)streak++;
    return {id,total:metrics(rows),home:metrics(rows.filter(r=>r.venue==='home')),away:metrics(rows.filter(r=>r.venue==='away')),last5:metrics(rows.slice(-5)),previous5:metrics(rows.slice(-10,-5)),last10:metrics(latest),form:latest.map(r=>r.result).join(''),streak:last?{result:last.result,games:streak}:null,firstHalf:{games:ht.length,scored:mean(ht.map(r=>r.firstGoals)),conceded:mean(ht.map(r=>r.firstAgainst))},secondHalf:{games:ht.length,scored:mean(ht.map(r=>r.secondGoals)),conceded:mean(ht.map(r=>r.secondAgainst))},opponents:[...opponents.values()].map(o=>({id:o.id,name:o.name,...metrics(o.rows)})),oldest:rows[0]?.time||null,newest:last?.time||null,restDays:last?(asOf-last.time)/DAY:null,recent:rows.slice(-10).reverse(),seasons:[...new Set(rows.map(r=>{const d=new Date(r.time),y=d.getUTCFullYear()-(d.getUTCMonth()<6?1:0);return y+'/'+String(y+1).slice(-2);} ))]};
  }
  function weighted(rows,field,now){let total=0,w=0;for(const r of rows.slice(-40)){const weight=Math.exp(-(now-r.time)/(180*DAY));total+=r[field]*weight;w+=weight;}return {mean:w?total/w:null,n:rows.length,weight:w};}
  function fit(records,homeId,awayId,asOf=Date.now()){
    const h=teamRows(records,homeId,asOf),a=teamRows(records,awayId,asOf);
    if(h.length<6||a.length<6)return null;
    function rate(rows,venue,field){const overall=weighted(rows,field,asOf),v=weighted(rows.filter(r=>r.venue===venue),field,asOf);return ((v.mean??overall.mean)*v.weight+overall.mean*5)/(v.weight+5);}
    // Pair the home attack with the away defence, and vice versa. No bookmaker
    // prices or provider probabilities enter this fitted result model.
    const home=(rate(h,'home','gf')+rate(a,'away','ga'))/2,away=(rate(a,'away','gf')+rate(h,'home','ga'))/2;
    return {home:Math.max(.15,Math.min(5,home)),away:Math.max(.15,Math.min(5,away)),homeGames:h.length,awayGames:a.length,homeVenue:h.filter(r=>r.venue==='home').length,awayVenue:a.filter(r=>r.venue==='away').length,method:'Recency-weighted home/away scoring and conceding rates, shrunk toward each team’s overall rate; independent Poisson goals. Does not model player availability or opponent strength.'};
  }
  function poisson(lambda){const a=[Math.exp(-lambda)];for(let i=1;i<=24;i++)a.push(a[i-1]*lambda/i);return a;}
  function grid(fit){const h=poisson(fit.home),a=poisson(fit.away),rows=[];for(let i=0;i<h.length;i++)for(let j=0;j<a.length;j++)rows.push({home:i,away:j,p:h[i]*a[j]});return rows;}
  function canonical(m,o){
    if(!String(m.id).startsWith('e:'))return {market:m,outcome:o};
    const ids={'1X2':'1','O/U':'18','Home Team O/U':'19','Away Team O/U':'20','Double Chance':'10','GG/NG':'29','Handicap':'14','Correct Score':'45'},id=ids[m.name];
    if(!id)return {market:{...m,id:'unsupported'},outcome:o};
    const names={'Home':'1','Draw':'2','Away':'3','Home or Draw':'9','Home or Away':'10','Draw or Away':'11','Yes':'74','No':'76'};
    let oid=names[o.name]||o.id,specifier=m.specifier||'';
    if(['18','19','20'].includes(id)){const line=/^(\d+(?:\.\d+)?);Over;Under$/.exec(specifier);if(!line)return {market:{...m,id:'unsupported'},outcome:o};specifier='total='+line[1];oid=o.name==='Over '+line[1]?'12':o.name==='Under '+line[1]?'13':'unsupported';}
    if(id==='14'){if(!/^\d+:\d+$/.test(specifier))return {market:{...m,id:'unsupported'},outcome:o};const prefix=o.name.split(' ')[0];oid={Home:'1711',Draw:'1712',Away:'1713'}[prefix]||'unsupported';specifier='hcp='+specifier;}
    return {market:{...m,id,specifier},outcome:{...o,id:oid}};
  }
  function settlement(m,o){
    const canonicalPair=canonical(m,o);m=canonicalPair.market;o=canonicalPair.outcome;
    const aliases={'60':'1','63':'10','64':'11','65':'14','66':'16','68':'18','69':'19','70':'20','75':'29','81':'45','83':'1','85':'10','87':'14','88':'16','90':'18','91':'19','92':'20'};
    const id=aliases[String(m.id)]||String(m.id),oid=String(o.id),name=o.name||'',line=Number((m.specifier||'').match(/(?:^|\|)total=(-?\d+(?:\.\d+)?)(?:$|\|)/)?.[1]);
    if(id==='1'&&!m.specifier)return (h,a)=>oid==='1'?h>a:oid==='2'?h===a:oid==='3'?h<a:null;
    if(id==='10'&&!m.specifier)return (h,a)=>oid==='9'?h>=a:oid==='10'?h!==a:oid==='11'?h<=a:null;
    if(id==='11'&&!m.specifier&&['4','5'].includes(oid))return (h,a)=>h===a?'void':oid==='4'?h>a:h<a;
    if(id==='16'){
      const match=/^hcp=(-?\d+(?:\.\d+)?)$/.exec(m.specifier||''),handicap=Number(match?.[1]);
      if(!match||![0,.5].includes(Math.abs(handicap)%1)||!['1714','1715'].includes(oid))return null;
      return (h,a)=>{const v=oid==='1714'?h-a+handicap:a-h-handicap;return v===0?'void':v>0;};
    }
    if(['18','19','20'].includes(id)&&Number.isFinite(line)&&line>=0&&(line%1===0||line%1===.5)&&['12','13'].includes(oid))return (h,a)=>{const n=id==='19'?h:id==='20'?a:h+a;return n===line?'void':oid==='12'?n>line:n<line;};
    if(id==='29'&&!m.specifier&&['74','76'].includes(oid))return (h,a)=>oid==='74'?h>0&&a>0:h===0||a===0;
    if(id==='14'){
      const match=/^hcp=(\d+):(\d+)$/.exec(m.specifier||'');if(!match||!['1711','1712','1713'].includes(oid))return null;
      const x=Number(match[1]),y=Number(match[2]);return (h,a)=>oid==='1711'?h+x>a+y:oid==='1712'?h+x===a+y:h+x<a+y;
    }
    if(id==='45'&&!m.specifier){const c=/^(\d+)\s*:\s*(\d+)$/.exec(name);if(c)return (h,a)=>h===Number(c[1])&&a===Number(c[2]);}
    return null;
  }
  function historical(event,records,row){
    const settle=settlement({id:row.marketId,specifier:row.specifier},{id:row.outcomeId,name:row.outcome});if(!settle)return null;
    const samples=[],seen=new Set();
    for(const r of records){
      if(seen.has(r.id))continue;let pair=row.period==='first'?r.ht:row.period==='second'?r.ht&&r.ft.map((v,i)=>v-r.ht[i]):r.ft;if(!pair)continue;
      // Use actual home appearances of the home team and away appearances of
      // the away team; one match contributes once even if both teams appear.
      if(r.homeId!==event.homeId&&r.awayId!==event.awayId)continue;
      seen.add(r.id);const value=settle(...pair);if(value===null)continue;samples.push(value);
    }
    if(!samples.length)return null;const wins=samples.filter(v=>v===true).length,voids=samples.filter(v=>v==='void').length;
    return {samples:samples.length,wins,voids,rate:wins/samples.length,definition:'Observed condition frequency in available home-team home fixtures and away-team away fixtures, deduplicated; not a calibrated future probability.'};
  }
  function compare(event,fitted,records=[]){
    const distributions=fitted?{full:grid(fitted).map(s=>({...s,home:s.home+(fitted.offset?.[0]||0),away:s.away+(fitted.offset?.[1]||0)})),first:fitted.first?grid(fitted.first):null,second:fitted.second?grid(fitted.second):null}:{},rows=[],unsupported=new Map();let assessed=0,modeledMarkets=0;
    const first=new Set(['60','63','64','65','66','68','69','70','75','81']),second=new Set(['83','85','87','88','90','91','92']);
    for(const m of event.markets||[]){let supported=false;const period=first.has(m.id)?'first':second.has(m.id)?'second':'full',distribution=distributions[period];for(const o of m.outcomes||[]){assessed++;const settle=settlement(m,o);if(!settle||!distribution)continue;supported=true;
      let win=0,voidP=0;for(const s of distribution){const v=settle(s.home,s.away);if(v===true)win+=s.p;else if(v==='void')voidP+=s.p;}
      const odds=Number(o.odds),loss=Math.max(0,1-win-voidP),ev=win*(odds-1)-loss;
      if(!Number.isFinite(odds)||odds<1.01)continue;
      const row={marketId:m.id,market:m.name,specifier:m.specifier||'',period,outcomeId:o.id,outcome:o.name,odds,probability:win,voidProbability:voidP,expectedReturn:ev,priceThreshold:(1-voidP)/odds,active:m.active!==false&&o.active!==false};row.empirical=historical(event,records,row);rows.push(row);
    }if(supported)modeledMarkets++;else{const key=m.name||m.id;unsupported.set(key,(unsupported.get(key)||0)+1);}}
    return {rows:rows.sort((a,b)=>b.expectedReturn-a.expectedReturn),marketsReturned:event.markets?.length||0,outcomesAssessed:assessed,modeledMarkets,unmodeled:[...unsupported].map(([name,count])=>({name,count,reason:/corner|booking|card|shot|player|minute/i.test(name)?'Required event/player history is not ingested.':'Settlement or dependency model not verified.'}))};
  }
  function backtest(records,teamId,asOf=Date.now()){
    const rows=teamRows(records,teamId,asOf);let brier=0,baseline=0,n=0;
    for(let i=Math.max(20,rows.length-40);i<rows.length;i++){
      const train=rows.slice(Math.max(0,i-40),i),rate=mean(train.map(r=>r.gf+r.ga)),p=1-poisson(rate).slice(0,3).reduce((s,v)=>s+v,0),base=ratio(train,r=>r.gf+r.ga>2.5),actual=rows[i].gf+rows[i].ga>2.5?1:0;
      brier+=(p-actual)**2;baseline+=(base-actual)**2;n++;
    }
    return {samples:n,brier:n?brier/n:null,baselineBrier:n?baseline/n:null,skill:n&&baseline?1-brier/baseline:null,method:'Rolling historical test: team match total over 2.5 goals, trained strictly before each test fixture. Diagnostic only; does not validate profitability, other markets or accumulator independence.'};
  }
  function build(event,histories,now=Date.now()){
    const records=[...new Map(histories.flatMap(h=>h.records).map(r=>[r.id,r])).values()].filter(r=>r.time<Math.min(now,Number(event.time)||now));
    const home=profile(records,event.homeId,now),away=profile(records,event.awayId,now),h2h=records.filter(r=>(r.homeId===event.homeId&&r.awayId===event.awayId)||(r.homeId===event.awayId&&r.awayId===event.homeId)).sort((a,b)=>b.time-a.time);
    const fitted=fit(records,event.homeId,event.awayId,now);
    if(fitted){const halves=records.filter(r=>r.ht);fitted.first=fit(halves.map(r=>({...r,ft:r.ht})),event.homeId,event.awayId,now);fitted.second=fit(halves.map(r=>({...r,ft:r.ft.map((v,i)=>v-r.ht[i])})),event.homeId,event.awayId,now);}
    const markets=compare(event,fitted,records),validation={home:backtest(records,event.homeId,now),away:backtest(records,event.awayId,now)};
    const issues=[];for(const [label,p]of [['Home',home],['Away',away]]){if(p.total.games<20)issues.push(label+' team has fewer than 20 completed regular-time results.');if(!p.newest||now-p.newest>30*DAY)issues.push(label+' team results are over 30 days old or missing.');}
    if(!histories.every(h=>h.complete))issues.push('History pagination is incomplete.');
    if(fitted&&(fitted.homeVenue<6||fitted.awayVenue<6))issues.push('Fewer than six results for the required home/away venue.');
    const passed=[validation.home,validation.away].every(v=>v.samples>=20&&v.skill>0);
    if(!passed)issues.push('The rolling goal-total diagnostic has not beaten its historical-frequency baseline for both teams.');
    return {home,away,h2h,fitted,markets,validation,eligible:Boolean(fitted),issues,records:records.length,coverage:[
      {name:'Results, opponents, form, home/away splits',status:'ingested',detail:'Up to three years of dated, completed regular-time SportyBet results; team IDs matched exactly.'},
      {name:'Half-time / second-half scoring patterns',status:home.firstHalf.games&&away.firstHalf.games?'ingested':'missing',detail:'Only records with explicit half-time scores contribute.'},
      {name:'Head-to-head',status:h2h.length?'ingested':'missing',detail:h2h.length+' meetings in the retrieved window; absence is not evidence of no earlier meetings.'},
      {name:'Corners, cards, shots, xG, possession',status:'missing',detail:'No verified reusable structured history connected yet. These markets remain visible but are not predicted.'},
      {name:'Lineups, injuries, transfers, tactics, news, standings',status:'reference',detail:'SportyBet exposes match/team research pages. These contextual fields are not yet ingested or included in the statistical model.'}
    ]};
  }
  return {profile,metrics,fit,poisson,grid,canonical,settlement,historical,compare,backtest,build};
});
