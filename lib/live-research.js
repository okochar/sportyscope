'use strict';
const R=require('../assets/research');
function apply(event,report,raw,now=Date.now()){
 const live=require('./live-state').normalize(raw,event.gameType,now);if(!live||live.state!=='live')return report;
 report.live=live;report.evidenceMode='live-scenario';const clock=/^(\d+):(\d+)$/.exec(live.clock||''),minutes=clock?Number(clock[1])+Number(clock[2])/60:null;
 if(!report.fitted||minutes===null||minutes>=90||!['H1','H2','HT'].includes(live.phase)){report.eligible=false;report.comparisons=[];report.markets={...(report.markets||{}),rows:[]};report.issues.push('Live clock, regular-time phase or historical rates are insufficient for a score-conditioned scenario. The ticket remains readable.');return report;}
 const fraction=(90-minutes)/90;
 report.fitted={...report.fitted,home:report.fitted.home*fraction,away:report.fitted.away*fraction,first:null,second:null,offset:live.score,live:true,method:'Experimental remaining-goals Poisson scenario conditioned on the provider score and clock; assumes constant scoring intensity through 90 minutes.'};
 report.markets=R.compare(event,report.fitted,[]);report.comparisons=report.markets.rows;
 report.issues.push('This live scenario has no independent live backtest. Red cards, stoppage time, injuries and changing match intensity are not modeled. Its percentages are not a calibrated win rate. Closed/suspended markets cannot be selected.');return report;
}
module.exports={apply};
