'use strict';
const R=require('../assets/research'),C=require('../assets/conditions');
module.exports=(event,stats)=>{
  const all=[...stats.homeTeam.recentMatches,...stats.awayTeam.recentMatches,...stats.headToHead.matches],unique=[...new Map(all.map(r=>[[r.homeTeamId,r.awayTeamId,r.homeScore,r.awayScore].join('|'),r])).values()];
  function profile(team){
    const xs=unique.filter(r=>r.homeTeamId===team.teamId||r.awayTeamId===team.teamId).map(r=>{const home=r.homeTeamId===team.teamId,gf=Number(home?r.homeScore:r.awayScore),ga=Number(home?r.awayScore:r.homeScore);return {gf,ga,venue:home?'home':'away',result:gf>ga?'W':gf<ga?'L':'D'};}).filter(r=>Number.isInteger(r.gf)&&Number.isInteger(r.ga)&&r.gf>=0&&r.ga>=0),empty=R.metrics([]);
    return {id:team.teamId,total:R.metrics(xs),home:R.metrics(xs.filter(r=>r.venue==='home')),away:R.metrics(xs.filter(r=>r.venue==='away')),last5:empty,previous5:empty,last10:empty,form:'Provider records are undated',oldest:null,newest:null,restDays:null,firstHalf:{games:0,scored:null,conceded:null},secondHalf:{games:0,scored:null,conceded:null},opponents:[],recent:[],conditions:C.counts(xs.map(r=>[r.gf,r.ga,1]))};
  }
  const home=profile(stats.homeTeam),away=profile(stats.awayTeam);if(!home.total.games||!away.total.games)return null;
  const fitted={home:(home.total.scored+away.total.conceded)/2,away:(away.total.scored+home.total.conceded)/2,method:'Small undated provider sample: team scoring and conceding averages with independent Poisson goals. No chronological training, simulator calibration or proven edge.'},markets=R.compare(event,fitted),d={samples:0,brier:null,baselineBrier:null,skill:null};
  return {evidenceMode:'provider-undated',status:'modeled',eligible:true,home,away,h2h:[],fitted,markets,comparisons:markets.rows,conditions:{home:home.conditions,away:away.conditions,pair:[]},validation:{home:d,away:d},records:unique.length};
};
