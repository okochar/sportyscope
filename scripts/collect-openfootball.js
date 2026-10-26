'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const base='https://raw.githubusercontent.com/openfootball/football.json/master/',leagues=['en.1','en.2','de.1','es.1','fr.1','it.1','nl.1','pt.1'],seasons=['2024-25','2025-26','2026-27'];
(async()=>{
  const licence=await fetch(base+'LICENSE.md').then(r=>r.text());if(!licence.includes('CC0'))throw Error('Expected CC0 licence was not found; review source terms.');
  const tasks=seasons.flatMap(season=>leagues.map(league=>({season,league}))),records=[],sources=[],failed=[];let index=0;
  async function worker(){while(index<tasks.length){const {season,league}=tasks[index++],url=base+season+'/'+league+'.json';try{
    const res=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error('HTTP '+res.status);const p=await res.json();if(!Array.isArray(p.matches))throw Error('Unknown schema');let count=0;
    for(const m of p.matches){const ft=m.score?.ft,date=Date.parse(m.date+'T12:00:00Z');if(!Array.isArray(ft)||ft.length!==2||!ft.every(n=>Number.isInteger(n)&&n>=0)||!Number.isFinite(date)||date>Date.now())continue;
      const signature=[league,season,m.date,m.round,m.team1,m.team2,...ft].join('|'),id=crypto.createHash('sha256').update(signature).digest('hex');records.push({id,family:'Real',provider:'OpenFootball',league,season,date:m.date,home:m.team1,away:m.team2,ft,ht:m.score?.ht||null,source:url});count++;
    }sources.push({league,season,name:p.name,records:count,url});
  }catch(e){failed.push({league,season,error:e.message});}}}
  await Promise.all([worker(),worker(),worker()]);records.sort((a,b)=>a.date.localeCompare(b.date));
  const value={provider:'OpenFootball',licence:'CC0-1.0',licenceUrl:base+'LICENSE.md',retrievedAt:new Date().toISOString(),records,sources,failed,identityPolicy:'Separate provider namespace. No fuzzy joins or duplicate cross-provider matches are added to the SportyBet model.'};
  const profiles=new Set(records.flatMap(r=>[r.league+'|'+r.home,r.league+'|'+r.away])),summary={provider:value.provider,licence:value.licence,licenceUrl:value.licenceUrl,retrievedAt:value.retrievedAt,records:records.length,profiles:profiles.size,oldest:records[0]?.date,newest:records.at(-1)?.date,sources,failed,coverage:'Dated results and available half-time scores. No corners, shots, cards, possession, player or xG coverage is implied.',identityPolicy:value.identityPolicy};
  await fs.writeFile(path.join(__dirname,'../data/openfootball-results.json'),JSON.stringify(value));await fs.writeFile(path.join(__dirname,'../assets/openfootball-audit.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({records:summary.records,profiles:summary.profiles,sourceFiles:sources.length,failedFiles:failed.length,oldest:summary.oldest,newest:summary.newest}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
