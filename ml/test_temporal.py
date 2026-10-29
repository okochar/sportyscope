import copy,json,unittest
from pathlib import Path
from train import feature_rows

class CausalFeatures(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.data=json.loads((Path(__file__).resolve().parents[1]/'data/real-event-facts.json').read_text(encoding='utf-8'));cls.names,cls.rows=feature_rows(cls.data)
 def test_current_outcome_and_lineup_never_enter_its_own_predictors(self):
  changed=copy.deepcopy(self.data);target=self.rows[100]['matchId']
  for m in changed['matches']:
   if m['matchId']==target:m['score']=[19,17];m['lineups']['home']['starters']=[999999]*11;m['stats']['home']['shots']=999
  _,rows=feature_rows(changed)
  self.assertEqual(next(r['values'] for r in rows if r['matchId']==target),self.rows[100]['values'])
 def test_future_changes_cannot_modify_past_features(self):
  changed=copy.deepcopy(self.data)
  for m in changed['matches'][-20:]:
   m['score']=[18,18]
   for side in ['home','away']:m['stats'][side]['corners']=999
  _,rows=feature_rows(changed);self.assertEqual(rows[:100],self.rows[:100])
 def test_unknown_lineups_and_absence_are_never_injury_features(self):
  self.assertTrue(all('injur' not in n.lower() for n in self.names));self.assertTrue(any('LineupContinuity' in n for n in self.names))

if __name__=='__main__':unittest.main()
