"""Fetch checksummed licensed sources, normalize, train, then verify both runtimes."""
import argparse,hashlib,json,subprocess,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,default=ROOT/'.cache/wyscout');a=p.parse_args();a.source_dir.mkdir(parents=True,exist_ok=True)
 manifest=json.loads((ROOT/'ml/sources/wyscout.json').read_text(encoding='utf-8'))
 for f in manifest['files']:
  if Path(f['name']).name!=f['name'] or not f['download_url'].startswith('https://ndownloader.figshare.com/files/'):raise ValueError('Unverified source path')
  dest=a.source_dir/f['name']
  if not dest.exists() or hashlib.sha256(dest.read_bytes()).hexdigest()!=f['sha256']:
   with urllib.request.urlopen(f['download_url'],timeout=180) as response:dest.write_bytes(response.read())
  if hashlib.sha256(dest.read_bytes()).hexdigest()!=f['sha256']:raise ValueError('Source checksum mismatch: '+f['name'])
 (a.source_dir/'wyscout-download-manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
 subprocess.run([sys.executable,str(ROOT/'ml/import_wyscout.py'),'--source-dir',str(a.source_dir)],check=True,cwd=ROOT)
 subprocess.run([sys.executable,str(ROOT/'ml/train.py')],check=True,cwd=ROOT)
 subprocess.run([sys.executable,str(ROOT/'ml/test_temporal.py')],check=True,cwd=ROOT)
 subprocess.run(['node','--test','tests/ml-live-background.test.js'],check=True,cwd=ROOT)
if __name__=='__main__':main()
