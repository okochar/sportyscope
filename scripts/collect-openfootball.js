'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'SportyScope-open-data-import'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);return r;}
(async()=>{
 const tree=await (await get('https://api.github.com/repos/openfootball/football.json/git/trees/master?recursive=1')).json();if(!tree.sha||tree.truncated)throw Error('Incomplete source tree');
 const base='https://raw.githubusercontent.com/openfootball/football.json/'+tree.sha+'/';const license=await (await get(base+'LICENSE.md')).text();if(!/CC0|public domain/i.test(license))throw Error('Review source licence');
 const paths=tree.tree.filter(p=>p.type==='blob'&&/^20(?:1\d|2[0-6])(?:-\d{2})?\/[a-z0-9][a-z0-9.-]*\.json$/.test(p.path)&&!p.path.includes('-full.json')).map(p=>p.path);
 const records=new Map(),sources=[],failed=[];let index=0;
 async function worker(){while(index<paths.length){const file=paths[index++],url=base+file;try{const p=await(await get(url)).json(),matches=p.matches||p.rounds?.flatMap(r=>(r.matches||[]).map(m=>({...m,round:r.name||r.round})));if(!Array.isArray(matches))throw Error('Unknown match schema');let count=0,rejected=0;
 for(const m of matches){const ft=Array.isArray(m.score)?m.score:m.score?.ft,ht=m.score?.ht,date=Date.parse(m.date+'T12:00:00Z');if(!Array.isArray(ft)||ft.length!==2||!ft.every(v=>Number.isInteger(v)&&v>=0&&v<100)||!Number.isFinite(date)||date>Date.now()||typeof m.team1!=='string'||typeof m.team2!=='string'||m.team1===m.team2){rejected++;continue;}
 const [season,leagueFile]=file.split('/'),league=leagueFile.replace('.json',''),signature=[league,season,m.date,m.team1,m.team2].join('|'),id=crypto.createHash('sha256').update(signature).digest('hex');
 records.set(id,{id,family:'Real',provider:'OpenFootball',league,season,date:m.date,home:m.team1,away:m.team2,ft,ht:Array.isArray(ht)&&ht.length===2&&ht.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=ft[i])?ht:null,source:url});count++;}
 sources.push({file,url,name:p.name,records:count,rejected});if(sources.length%25===0)console.log('Imported '+sources.length+'/'+paths.length+' files; '+records.size+' completed results');
 }catch(e){failed.push({file,url,error:e.message});}}}
 await Promise.all([worker(),worker(),worker(),worker()]);const rows=[...records.values()].sort((a,b)=>a.date.localeCompare(b.date)),profiles=new Set(rows.flatMap(r=>[r.home,r.away]));
 const value={provider:'OpenFootball',version:2,sourceCommit:tree.sha,licence:'CC0-1.0',licenceUrl:base+'LICENSE.md',retrievedAt:new Date().toISOString(),records:rows,sources,failed,identityPolicy:'Real football only. Exact normalized labels and explicit aliases; ambiguous identities are not joined. Overlapping SportyBet result rows take precedence.'};
 const digest=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');value.digest=digest;
 const summary={...value,records:rows.length,profiles:profiles.size,oldest:rows[0]?.date,newest:rows.at(-1)?.date,coverage:'Completed dated scores and explicit half-time scores. Corners, shots, injuries, xG and every match ever played are not covered.'};
 await fs.writeFile(path.join(root,'data/openfootball-results.json'),JSON.stringify(value));await fs.writeFile(path.join(root,'assets/openfootball-audit.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({records:rows.length,profiles:profiles.size,files:sources.length,failed:failed.length,oldest:summary.oldest,newest:summary.newest,digest}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
