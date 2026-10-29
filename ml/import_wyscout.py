"""Normalize the original CC BY 4.0 archive; retain its raw, checksummed source manifest.

No current-season or injury information is inferred from this historical dataset.
Run: python ml/import_wyscout.py --source-dir ../source-research
"""
import argparse,collections,datetime,hashlib,json,struct,zipfile
from pathlib import Path

PROVIDER='Wyscout open dataset'
SOURCE_ID='wyscout-pappalardo-2019-v1'
DEFINITIONS={
 'corners':'Normal-time events with subEventId=30 (corners taken, not corners awarded).',
 'shots':'Normal-time eventId=10, plus free-kick shots (33) and penalties (35).',
 'accurateShots':'Those shots carrying tag 1801 (accurate); kept as source-defined, not relabelled as operator shots on target.',
 'yellowCards':'Normal-time events with tag 1702 or 1703, counted once per player/period/time.',
 'redCards':'Normal-time events with tag 1701 or 1703; second yellow is separately recorded.',
 'passes':'eventId=8; accurate passes have tag 1801.',
 'lineups':'Historical, final match formation records. Not evidence of pre-match announcement time.',
 'injuries':'Not supplied. Absence from a lineup is never interpreted as an injury.'}

def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

def normalize(source,out):
 manifest=json.loads((source/'wyscout-download-manifest.json').read_text())
 players=json.loads((source/'players.json').read_text())
 teams={str(t['wyId']):t for t in json.loads((source/'teams.json').read_text())}
 competitions={str(c['wyId']):c for c in json.loads((source/'competitions.json').read_text())}
 raw=[]
 for f in manifest['files']:
  p=source/f['name'];checksum=hashlib.md5(p.read_bytes()).hexdigest()
  if f.get('computed_md5') and checksum!=f['computed_md5']:raise ValueError('MD5 mismatch: '+f['name'])
  if p.suffix=='.zip':
   with zipfile.ZipFile(p) as z, p.open('rb') as stream:
    for info in z.infolist():
     if not info.filename.endswith('.json'):continue
     stream.seek(info.header_offset);header=stream.read(30);fields=struct.unpack('<IHHHHHIIIHH',header)
     start=info.header_offset+30+fields[-2]+fields[-1]
     stream.seek(start);blob=stream.read(info.compress_size)
     raw.append({'name':info.filename+'.deflate','url':f['download_url'],'start':start,'bytes':len(blob),'uncompressedBytes':info.file_size,'compression':'raw-deflate','crc32':info.CRC,'sha256':hashlib.sha256(blob).hexdigest(),'doi':f['doi']})
  else:
   blob=p.read_bytes();raw.append({'name':p.name,'url':f['download_url'],'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'doi':f['doi']})
 facts=[];event_count=0;ignored=collections.Counter()
 with zipfile.ZipFile(source/'matches.zip') as mz,zipfile.ZipFile(source/'events.zip') as ez:
  for name in mz.namelist():
   if not name.endswith('.json'):continue
   matches=json.loads(mz.read(name));league=name.removeprefix('matches_').removesuffix('.json')
   entries={str(m['wyId']):m for m in matches};aggregates={};seen=set();card_seen=set()
   def stats(mid,tid):
    return aggregates.setdefault((mid,tid),dict.fromkeys(['events','corners','shots','accurateShots','yellowCards','redCards','secondYellowCards','fouls','passes','accuratePasses','crosses','duels','duelsWon','offsides'],0))
   # One league at a time bounds peak memory; events from extra time and shootouts
   # cannot be silently added to 90-minute statistics.
   events=json.loads(ez.read('events_'+league+'.json'))
   for e in events:
    eid=e['id']
    if eid in seen:continue
    seen.add(eid);event_count+=1
    if e['matchPeriod'] not in ['1H','2H']:continue
    mid,tid=str(e['matchId']),str(e['teamId'])
    if mid not in entries or tid not in entries[mid]['teamsData']:continue
    s=stats(mid,tid);s['events']+=1;tags={t['id'] for t in e.get('tags',[])};kind=e.get('eventId');sub=e.get('subEventId')
    s['corners']+=sub==30
    shot=kind==10 or sub in [33,35]
    s['shots']+=shot;s['accurateShots']+=shot and 1801 in tags
    s['fouls']+=kind==2;s['passes']+=kind==8;s['accuratePasses']+=kind==8 and 1801 in tags
    s['crosses']+=sub in [32,80];s['duels']+=kind==1;s['duelsWon']+=kind==1 and 703 in tags;s['offsides']+=kind==6
    for label,present in [('yellowCards',bool(tags&{1702,1703})),('redCards',bool(tags&{1701,1703})),('secondYellowCards',1703 in tags)]:
     marker=(mid,tid,e.get('playerId'),e['matchPeriod'],e['eventSec'],label)
     if present and marker not in card_seen:s[label]+=1;card_seen.add(marker)
   del events,seen,card_seen
   for m in matches:
    mid=str(m['wyId']);sides={v['side']:(str(k),v) for k,v in m['teamsData'].items()}
    if m['status']!='Played' or not {'home','away'}<=sides.keys():ignored['unplayed_or_no_sides']+=1;continue
    # score is the final score and can include extra time. Retain those fixtures
    # separately but never treat that score as a regulation-time training label.
    regular=m.get('duration')=='Regular'
    when=datetime.datetime.strptime(m['dateutc'],'%Y-%m-%d %H:%M:%S').replace(tzinfo=datetime.timezone.utc).isoformat().replace('+00:00','Z')
    row={'provider':PROVIDER,'sourceId':SOURCE_ID,'matchId':mid,'playedAt':when,'competitionId':str(m['competitionId']),'seasonId':str(m['seasonId']),'league':league,'regularTime':regular,'homeId':sides['home'][0],'awayId':sides['away'][0],'score':[],'halfTime':[],'stats':{},'lineups':{},'quality':{}}
    for side in ['home','away']:
     tid,t=sides[side];row['score'].append(t['score']);row['halfTime'].append(t.get('scoreHT'));f=t.get('formation') or {};lineup=f.get('lineup') or [];bench=f.get('bench') or []
     row['lineups'][side]={'starters':[p['playerId'] for p in lineup],'bench':[p['playerId'] for p in bench],'substitutions':f.get('substitutions') if isinstance(f.get('substitutions'),list) else [],'coachId':t.get('coachId'),'knownBeforeMatch':False}
     observed=aggregates.get((mid,tid));row['stats'][side]=observed
     row['quality'][side]={'eventsPresent':bool(observed),'starters':len(lineup),'hasFullLineup':bool(t.get('hasFormation')) and len(lineup)==11}
    facts.append(row)
   print(json.dumps({'league':league,'matches':len(matches),'normalized':len(facts),'eventsRead':event_count}),flush=True)
 facts.sort(key=lambda r:(r['playedAt'],r['matchId']))
 payload={'schemaVersion':1,'sourceId':SOURCE_ID,'provider':PROVIDER,'license':'CC BY 4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','attribution':manifest['attribution'],'sourceUrl':manifest['collection'],'paper':'https://www.nature.com/articles/s41597-019-0247-7','retrievedAt':manifest['retrievedAt'],'definitions':DEFINITIONS,'raw':raw,'events':event_count,'teams':[{'id':tid,'name':t['name'],'officialName':t.get('officialName'),'country':t['area']['name'],'type':t['type']} for tid,t in teams.items()],'competitions':list(competitions.values()),'players':[{'id':str(p['wyId']),'name':p['shortName'],'role':p['role']['name'],'foot':p.get('foot')} for p in players],'matches':facts}
 payload['digest']=hashlib.sha256(json.dumps(facts,separators=(',',':'),sort_keys=True).encode()).hexdigest()
 write(out,payload)
 print(json.dumps({'output':str(out),'matches':len(facts),'regular':sum(r['regularTime'] for r in facts),'teams':len(teams),'players':len(players),'events':event_count,'rawBytes':sum(r['bytes'] for r in raw),'digest':payload['digest']}),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[1]/'data/real-event-facts.json');a=p.parse_args();normalize(a.source_dir,a.out)
