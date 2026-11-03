"""Reads the probe's JSONL files and prints, per route, what looked wrong for which role."""
import json
import sys
from collections import defaultdict

latest = {}
for path in sys.argv[1:]:
    for line in open(path):
        r = json.loads(line)
        if r['type'] == 'page':
            latest[(r['role'], r['route'])] = r
pages = defaultdict(list)
for (_, route), r in latest.items():
    pages[route].append(r)

def problems(r):
    out = []
    denied = any('ask your admin' in e.lower() or "don't have access" in e.lower() or 'not for' in e or 'is for' in e for e in r.get('errorResult') or [])
    if denied:
        return ['denied']
    for f in r['failed']:
        out.append('api ' + f)
    for c in r['consoleErrors']:
        out.append('console ' + c[:140])
    for e in r.get('errorResult') or []:
        out.append('error page ' + e[:100])
    if not r.get('h1'):
        out.append('no h1')
    if r.get('landed'):
        out.append('landed on ' + r['landed'])
    if r['ms'] > 6000 and r.get('buttons') is None:
        out.append(f"slow {r['ms']} ms")
    for b in r.get('buttons') or []:
        if b['outcome'] in ('NOTHING', 'click-failed', 'probe-error', 'not-found'):
            out.append(f"button '{b['name'][:40]}' {b['outcome']}" + (f" ({b['error'][:80]})" if b.get('error') else ''))
    return out

for route in sorted(pages):
    lines = []
    for r in pages[route]:
        p = problems(r)
        if p and p != ['denied']:
            lines.append(f"  {r['role'].split('@')[0]}: " + '; '.join(p))
    if lines:
        print(route)
        print('\n'.join(lines))
