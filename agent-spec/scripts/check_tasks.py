#!/usr/bin/env python3
"""Validate agent-spec task files and list ready work.

Usage (from repo root or agent-spec/):
  python3 agent-spec/scripts/check_tasks.py            # validate; exit 1 on problems
  python3 agent-spec/scripts/check_tasks.py --ready    # list tasks whose deps are all done and status is todo
  python3 agent-spec/scripts/check_tasks.py --status   # counts by status

Reads YAML-ish frontmatter from agent-spec/tasks/*.md (flat keys, JSON-style lists). No dependencies.
"""
import json, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS = os.path.join(ROOT, 'tasks')
STATUSES = {'todo', 'in_progress', 'review', 'done', 'blocked'}

def load():
    out = {}
    for f in sorted(os.listdir(TASKS)):
        if not f.endswith('.md'): continue
        txt = open(os.path.join(TASKS, f), encoding='utf-8').read()
        m = re.match(r'^---\n(.*?)\n---\n', txt, re.S)
        if not m: sys.exit(f'{f}: missing frontmatter')
        fm = {}
        for line in m.group(1).splitlines():
            k, _, v = line.partition(':'); v = v.strip()
            try: fm[k.strip()] = json.loads(v)
            except json.JSONDecodeError: fm[k.strip()] = v
        fm['_file'] = f
        out[fm['id']] = fm
    return out

def overlap(a, b):
    return a == b or (a.endswith('/') and b.startswith(a)) or (b.endswith('/') and a.startswith(b))

def validate(ts):
    errs = []
    for i, t in ts.items():
        if t.get('status') not in STATUSES: errs.append(f"{i}: bad status {t.get('status')!r}")
        for d in t['depends_on']:
            if d not in ts: errs.append(f'{i}: unknown dependency {d}')
            elif t.get('status') in ('in_progress', 'review', 'done') and ts[d].get('status') != 'done':
                errs.append(f"{i} is {t['status']} but dependency {d} is {ts[d].get('status')}")
    seen, stack = set(), []
    def visit(i):
        if i in stack: errs.append('cycle: ' + ' -> '.join(stack[stack.index(i):] + [i])); return
        if i in seen: return
        stack.append(i)
        for d in ts[i]['depends_on']:
            if d in ts: visit(d)
        stack.pop(); seen.add(i)
    for i in ts: visit(i)
    owners = [(p, i) for i, t in ts.items() for p in t['owns']]
    for x in range(len(owners)):
        for y in range(x + 1, len(owners)):
            (a, ia), (b, ib) = owners[x], owners[y]
            if ia != ib and overlap(a, b): errs.append(f'ownership overlap: {ia}:{a} <-> {ib}:{b}')
    return errs

def main():
    ts = load(); errs = validate(ts)
    if '--ready' in sys.argv:
        ready = [t for t in ts.values() if t['status'] == 'todo' and not t.get('human_required') is True
                 and all(ts[d]['status'] == 'done' for d in t['depends_on'] if d in ts)]
        for t in sorted(ready, key=lambda t: (int(t['wave']), t['id'])):
            print(f"{t['id']:9} wave {t['wave']:>2}  {t['size']}  {t['stream']:9} {t['title']}")
        if not ready: print('(no ready tasks)')
    if '--status' in sys.argv:
        print(dict(Counter(t['status'] for t in ts.values())))
    if errs:
        print('\n'.join(errs), file=sys.stderr); sys.exit(1)
    if len(sys.argv) == 1: print(f'OK: {len(ts)} tasks valid')

if __name__ == '__main__': main()
