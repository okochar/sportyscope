"""Causal, multi-market football ML training and portable inference artifacts.

Training, model selection, calibration and the final test use four disjoint,
chronological periods. No current-match statistics, outcomes, lineups or odds
enter its predictors. An old archive can train a research model, never satisfy
the freshness requirement for current betting recommendations.
"""
import argparse,collections,datetime,hashlib,json,math,os,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
if os.environ.get('SPORTYSCOPE_ML_PACKAGES'):sys.path.insert(0,os.environ['SPORTYSCOPE_ML_PACKAGES'])
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss,log_loss,roc_auc_score

METRICS=['goals','corners','shots','accurateShots','yellowCards','redCards','fouls','passes','accuratePasses','crosses','duelsWon','offsides']
TARGETS=[(metric,line) for metric,lines in [('corners',[6.5,8.5,9.5,10.5]),('yellowCards',[2.5,3.5,4.5]),('shots',[18.5,22.5,26.5]),('accurateShots',[6.5,8.5]),('goals',[1.5,2.5])] for line in lines]+[('btts',0)]

def stamp(text):return datetime.datetime.fromisoformat(text.replace('Z','+00:00')).timestamp()
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,separators=(',',':'),allow_nan=False),encoding='utf-8')

def feature_rows(data):
 history=collections.defaultdict(list);pairs=collections.defaultdict(list);elo=collections.defaultdict(lambda:1500.0);rows=[];names=None
 for m in data['matches']:
  if not m['regularTime'] or m['league'] not in ['England','France','Germany','Italy','Spain']:continue
  if not all(m['stats'][side] and m['stats'][side]['events']>100 for side in ['home','away']):continue
  day=m['playedAt'][:10];ids=[m['homeId'],m['awayId']];f={};max_time=0
  for side,tid in zip(['home','away'],ids):
   past=[r for r in history[tid] if r['playedAt'][:10]<day]
   f[side+'_historyCount']=min(100,len(past));f[side+'_elo']=elo[tid]
   f[side+'_daysRest']=min(35,(stamp(m['playedAt'])-stamp(past[-1]['playedAt']))/86400) if past else None
   if past:max_time=max(max_time,stamp(past[-1]['playedAt']))
   for window in [5,15]:
    subset=past[-window:]
    for metric in METRICS:
     for direction in ['for','against']:
      values=[r[direction][metric] for r in subset if r[direction].get(metric) is not None]
      f[f'{side}_{metric}_{direction}_{window}']=sum(values)/len(values) if values else None
   starters=[set(r['starters']) for r in past[-2:] if len(r['starters'])==11]
   f[side+'_previousLineupContinuity']=len(starters[0]&starters[1])/11 if len(starters)==2 else None
   same_venue=[r for r in past if r['venue']==side][-8:]
   for metric in ['goals','corners','shots','yellowCards']:
    f[f'{side}_{metric}_sameVenue']=sum(r['for'][metric] for r in same_venue)/len(same_venue) if same_venue else None
  pair=tuple(sorted(ids));h2h=[r for r in pairs[pair] if r['playedAt'][:10]<day][-6:]
  f['h2h_count']=len(h2h)
  for metric in ['goals','corners','shots','yellowCards']:f['h2h_'+metric]=sum(r[metric] for r in h2h)/len(h2h) if h2h else None
  for league in ['England','France','Germany','Italy','Spain']:f['league_'+league]=int(m['league']==league)
  if names is None:names=list(f)
  totals={metric:sum(m['stats'][s][metric] if metric!='goals' else m['score'][i] for i,s in enumerate(['home','away'])) for metric in METRICS}
  if all(f[s+'_historyCount']>=5 for s in ['home','away']):
   assert max_time<stamp(day+'T00:00:00Z'),'Future match leaked into features'
   labels={metric+('_over_'+str(line) if metric!='btts' else ''):int(totals[metric]>line) if metric!='btts' else int(all(v>0 for v in m['score'])) for metric,line in TARGETS}
   rows.append({'matchId':m['matchId'],'playedAt':m['playedAt'],'historyLatestAt':datetime.datetime.fromtimestamp(max_time,datetime.timezone.utc).isoformat().replace('+00:00','Z'),'homeId':ids[0],'awayId':ids[1],'values':[f[k] for k in names],'labels':labels})
  # Updates happen after constructing this match's features. The day restriction
  # also excludes other fixtures from the prediction day.
  expected=1/(1+10**((elo[ids[1]]-elo[ids[0]]-60)/400));actual=1 if m['score'][0]>m['score'][1] else .5 if m['score'][0]==m['score'][1] else 0
  delta=20*(actual-expected);elo[ids[0]]+=delta;elo[ids[1]]-=delta
  for i,side in enumerate(['home','away']):
   other=['away','home'][i]
   history[ids[i]].append({'playedAt':m['playedAt'],'venue':side,'for':{**m['stats'][side],'goals':m['score'][i]},'against':{**m['stats'][other],'goals':m['score'][1-i]},'starters':m['lineups'][side]['starters']})
  pairs[pair].append({'playedAt':m['playedAt'],**totals})
 return names,rows

def metrics(y,p):
 p=np.clip(p,1e-7,1-1e-7);bins=[]
 for low in np.arange(0,1,.1):
  mask=(p>=low)&(p<low+.1)
  if mask.any():bins.append({'lower':round(float(low),2),'n':int(mask.sum()),'predicted':float(p[mask].mean()),'observed':float(y[mask].mean())})
 return {'n':len(y),'positives':int(y.sum()),'brier':float(brier_score_loss(y,p)),'logLoss':float(log_loss(y,p,labels=[0,1])),'auc':float(roc_auc_score(y,p)) if len(np.unique(y))==2 else None,'ece':sum(b['n']*abs(b['predicted']-b['observed']) for b in bins)/len(y),'reliability':bins}

def export_estimator(model):
 if isinstance(model,LogisticRegression):return {'type':'logistic','weights':model.coef_[0].tolist(),'intercept':float(model.intercept_[0])}
 trees=[]
 for estimator in model.estimators_:
  t=estimator.tree_;values=t.value[:,0,:];den=values.sum(axis=1);p=np.divide(values[:,1],den,out=np.zeros(len(den)),where=den>0)
  trees.append({'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),'threshold':t.threshold.tolist(),'positive':p.tolist()})
 return {'type':'random-forest','trees':trees}

def train(data_path,out,features_path,parity_path):
 data=json.loads(data_path.read_text(encoding='utf-8'));names,rows=feature_rows(data)
 if len(rows)<800:raise ValueError('At least 800 causal feature rows are required for this pipeline.')
 X=np.array([[np.nan if v is None else v for v in r['values']] for r in rows],dtype=float)
 days=sorted({r['playedAt'][:10] for r in rows});cuts=[days[int(len(days)*q)] for q in [.55,.70,.85]]
 split=np.array([sum(r['playedAt'][:10]>=c for c in cuts) for r in rows]);train,select,calibrate,test=[split==i for i in range(4)]
 median=np.nanmedian(X[train],axis=0);median=np.where(np.isnan(median),0,median)
 missing=np.isnan(X);imputed=np.where(missing,median,X);mean=imputed[train].mean(axis=0);scale=imputed[train].std(axis=0);scale=np.where(scale<1e-10,1,scale)
 Z=np.concatenate([(imputed-mean)/scale,missing.astype(float)],axis=1)
 descriptor={'schemaVersion':1,'family':'Real','pipeline':'multi-market-supervised-v1','sourceId':data['sourceId'],'datasetDigest':data['digest'],'features':names,'preprocessing':{'median':median.tolist(),'mean':mean.tolist(),'scale':scale.tolist(),'missingIndicators':True},'causality':'Predictors use only completed earlier-day matches; current-match lineups, injuries, outcomes and prices are excluded. Retrospective availability is assumed, not a live recorded announcement timestamp.','cuts':cuts,'splits':{},'models':[]}
 for label,mask in zip(['train','selection','calibration','test'],[train,select,calibrate,test]):
  selected=[r for i,r in enumerate(rows) if mask[i]];descriptor['splits'][label]={'rows':len(selected),'first':selected[0]['playedAt'],'last':selected[-1]['playedAt']}
 parity=[]
 for target in rows[0]['labels']:
  y=np.array([r['labels'][target] for r in rows]);prior=float(y[train].mean());candidates=[]
  lr=LogisticRegression(C=.05,max_iter=2000,random_state=1729)
  rf=RandomForestClassifier(n_estimators=80,max_depth=5,min_samples_leaf=16,max_features=.65,n_jobs=2,random_state=1729)
  for estimator in [lr,rf]:
   estimator.fit(Z[train],y[train]);p=estimator.predict_proba(Z[select])[:,1];candidates.append((brier_score_loss(y[select],p),estimator))
  chosen=min(candidates,key=lambda p:p[0])[1]
  raw=chosen.predict_proba(Z[calibrate])[:,1];logits=np.log(np.clip(raw,1e-6,1-1e-6)/(1-np.clip(raw,1e-6,1-1e-6))).reshape(-1,1)
  platt=LogisticRegression(C=10,max_iter=1000).fit(logits,y[calibrate]);a,b=float(platt.coef_[0,0]),float(platt.intercept_[0])
  p=chosen.predict_proba(Z[test])[:,1];p=1/(1+np.exp(-np.clip(a*np.log(np.clip(p,1e-6,1-1e-6)/(1-np.clip(p,1e-6,1-1e-6)))+b,-35,35)))
  assessment=metrics(y[test],p);baseline=metrics(y[test],np.full(test.sum(),prior))
  quality=assessment['n']>=150 and assessment['brier']<baseline['brier'] and assessment['logLoss']<=baseline['logLoss'] and assessment['ece']<=.10
  cutoff_recent=datetime.datetime.now(datetime.timezone.utc).timestamp()-180*86400
  recent=sum(stamp(r['playedAt'])>=cutoff_recent for i,r in enumerate(rows) if test[i])>=150
  artifact={'target':target,'estimator':export_estimator(chosen),'calibration':{'type':'platt','slope':a,'intercept':b},'selectionBrier':float(min(c[0] for c in candidates)),'test':assessment,'baseline':baseline,'qualityPassed':bool(quality),'freshnessPassed':recent,'status':'research-only','deploymentReason':'Historical archive ends in 2018; current matching feature coverage and settlement validation are required.','importance':sorted([{'feature':(names+['missing:'+n for n in names])[i],'weight':float(v)} for i,v in enumerate(abs(chosen.coef_[0]) if isinstance(chosen,LogisticRegression) else chosen.feature_importances_)],key=lambda x:x['weight'],reverse=True)[:12]}
  descriptor['models'].append(artifact)
  # Cross-runtime parity covers held-out rows and both missing-data paths.
  for index in np.flatnonzero(test)[:3]:
   raw=float(chosen.predict_proba(Z[index:index+1])[0,1]);pred=1/(1+math.exp(-max(-35,min(35,a*math.log(max(1e-6,min(1-1e-6,raw))/(1-max(1e-6,min(1-1e-6,raw))))+b))))
   parity.append({'target':target,'values':rows[index]['values'],'probability':pred})
  print(json.dumps({'target':target,'model':artifact['estimator']['type'],'testBrier':round(assessment['brier'],5),'baselineBrier':round(baseline['brier'],5),'qualityPassed':quality,'freshnessPassed':recent}),flush=True)
 descriptor['trainedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
 feature_digest=hashlib.sha256(json.dumps({'features':names,'rows':rows},sort_keys=True,separators=(',',':')).encode()).hexdigest()
 descriptor['featureDigest']=feature_digest
 fingerprint=hashlib.sha256(json.dumps({'source':data['digest'],'featureDigest':feature_digest,'targets':list(rows[0]['labels']),'cuts':cuts,'seed':1729,'pipeline':descriptor['pipeline'],'hyperparameters':{'logisticC':.05,'trees':80,'maxDepth':5,'minLeaf':16,'maxFeatures':.65,'calibrationC':10}},sort_keys=True).encode()).hexdigest()
 descriptor['id']='real-multimarket-'+fingerprint[:20];descriptor['fingerprint']=fingerprint
 descriptor['software']={package:__import__(package).__version__ for package in ['numpy','sklearn']}
 write(out,descriptor);write(features_path,{'datasetDigest':data['digest'],'featureDigest':feature_digest,'features':names,'rows':rows});write(parity_path,parity)
 print(json.dumps({'run':descriptor['id'],'features':len(names),'rows':len(rows),'models':len(descriptor['models']),'splits':descriptor['splits']}),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--data',type=Path,default=ROOT/'data/real-event-facts.json');p.add_argument('--out',type=Path,default=ROOT/'data/real-trained-models.json');p.add_argument('--features',type=Path,default=ROOT/'data/real-training-features.json');p.add_argument('--parity',type=Path,default=ROOT/'tests/fixtures/ml-parity.json');a=p.parse_args();train(a.data,a.out,a.features,a.parity)
