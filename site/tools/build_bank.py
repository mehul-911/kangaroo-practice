#!/usr/bin/env python3
"""Scan ../bank/<paper>/q*.jpg + keys.json -> bank/<paper>/paper.json and bank/manifest.json.
Run after adding a new paper folder (images from extract.py) and a keys.json entry."""
import json, glob, os, re
base = os.path.join(os.path.dirname(__file__), '..', 'bank')
keys = json.load(open(os.path.join(os.path.dirname(__file__), 'keys.json')))
manifest = []
for pid, meta in sorted(keys.items(), key=lambda kv: kv[1]['year']):
    imgs = sorted(glob.glob(f'{base}/{pid}/q*.jpg'))
    qs = []
    for f in imgs:
        n = int(re.search(r'q(\d+)\.jpg', f).group(1))
        if n > len(meta['key']): continue
        q = dict(n=n, points=3 if n <= 8 else 4 if n <= 16 else 5, img=f'{pid}/q{n:02d}.jpg', answer=meta['key'][n-1], status='ok')
        rv = meta.get('review', {})
        if str(n) in rv:
            q['status'] = 'review'; q['note'] = rv[str(n)] if rv[str(n)] != 'x' else meta.get('reviewDefault', '')
        qs.append(q)
    paper = dict(id=pid, year=meta['year'], title=meta['title'], minutes=meta['minutes'], questions=qs)
    json.dump(paper, open(f'{base}/{pid}/paper.json', 'w'), indent=1)
    manifest.append(dict(id=pid, year=meta['year'], title=meta['title'], path=f'{pid}/paper.json',
                         usable=sum(q['status']=='ok' for q in qs), total=len(qs)))
json.dump(dict(papers=manifest), open(f'{base}/manifest.json', 'w'), indent=1)
print(json.dumps(manifest))
