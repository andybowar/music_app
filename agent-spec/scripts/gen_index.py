#!/usr/bin/env python3
"""Regenerate derived task data from agent-spec/tasks/*.md.

The task files are the source of truth for each task's own fields. This script
derives everything that depends on other tasks, and rewrites it:

  - `wave:`   1 + the highest wave among `depends_on` (1 when there are none)
  - `blocks:` every task that lists this one in `depends_on`
  - tasks.json and INDEX.md, the snapshots for orchestrators and humans

Run it after adding a task or changing any `depends_on`:

  python3 agent-spec/scripts/gen_index.py           # rewrite files
  python3 agent-spec/scripts/gen_index.py --check   # exit 1 if anything is stale
"""
import json, os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS = os.path.join(ROOT, 'tasks')
PHASES = {0: 'Foundations', 1: 'Library', 2: 'Search', 3: 'Lists', 4: 'Sharing', 5: 'Hardening'}
DAYS = {'S': 0.5, 'M': 1, 'L': 2}
FM = re.compile(r'^---\n(.*?)\n---\n', re.S)


def load():
    tasks = {}
    for name in sorted(os.listdir(TASKS)):
        if not name.endswith('.md'):
            continue
        text = open(os.path.join(TASKS, name), encoding='utf-8').read()
        fm = {}
        for line in FM.match(text).group(1).splitlines():
            key, _, value = line.partition(':')
            value = value.strip()
            try:
                fm[key.strip()] = json.loads(value)
            except json.JSONDecodeError:
                fm[key.strip()] = value
        fm['_file'], fm['_text'] = name, text
        tasks[fm['id']] = fm
    return tasks


def derive(tasks):
    waves = {}

    def wave(i):
        if i not in waves:
            deps = tasks[i]['depends_on']
            waves[i] = 1 + max((wave(d) for d in deps), default=0)
        return waves[i]

    for i in tasks:
        wave(i)
    blocks = defaultdict(list)
    for i, t in tasks.items():
        for d in t['depends_on']:
            blocks[d].append(i)
    order = sorted(tasks, key=lambda i: (waves[i], i))
    return waves, {i: sorted(blocks[i], key=lambda b: (waves[b], b)) for i in tasks}, order


def critical_path(tasks, order):
    best = {}
    for i in order:  # dependencies always come earlier in wave order
        prev = max(tasks[i]['depends_on'], key=lambda d: best[d][0], default=None)
        cost = DAYS.get(tasks[i]['size'], 1)
        best[i] = (cost + (best[prev][0] if prev else 0), (best[prev][1] if prev else []) + [i])
    return max(best.values(), key=lambda v: v[0])


def stable_blocks(current, derived):
    """Keep the file's existing order; drop stale entries and append new ones."""
    kept = [b for b in current if b in derived]
    return kept + [b for b in derived if b not in kept]


def rewrite_frontmatter(t, wave, blocks):
    text = re.sub(r'^wave: .*$', f'wave: {wave}', t['_text'], count=1, flags=re.M)
    blocks = stable_blocks(t.get('blocks') or [], blocks)
    return re.sub(r'^blocks: .*$', 'blocks: ' + json.dumps(blocks), text, count=1, flags=re.M)


def tasks_json(tasks, waves, blocks, order):
    out = []
    for i in order:
        t = tasks[i]
        out.append({
            'id': i, 'title': t['title'].strip('"'), 'phase': int(t['phase']), 'wave': waves[i],
            'stream': t['stream'], 'size': t['size'], 'human': t.get('human_required') is True,
            'deps': t['depends_on'], 'blocks': blocks[i], 'owns': t['owns'], 'touches': t['touches'],
            'reqs': t.get('requirements', []), 'file': 'tasks/' + t['_file'], 'status': t['status'],
        })
    return json.dumps({'generated_from': 'agent-spec/tasks/*.md', 'tasks': out}, indent=2) + '\n'


def index_md(tasks, waves, order):
    n_waves = max(waves.values())
    humans = sum(t.get('human_required') is True for t in tasks.values())
    days, path = critical_path(tasks, order)
    lines = [
        '# Task index', '',
        f'{len(tasks)} tasks · {n_waves} waves · {humans} human-required · sizes: S ≤ ½ day, M ≈ 1 day, '
        'L ≈ 2 days of focused agent work.', '',
        '**How to use.** A task is *ready* when every task in `depends_on` is merged. All ready tasks in a '
        'wave can run at the same time — their `owns` paths never overlap (checked by '
        '`scripts/check_tasks.py`). Start a task by setting `status: in_progress` in its file; see '
        '`AGENTS.md` for the full protocol.', '',
        'This file is a generated snapshot (`scripts/gen_index.py`). The `status:` field in each task file '
        'is the source of truth.', '',
        '## Critical path', '',
        ' → '.join(path) + f'  (≈ {days:g} agent-days; everything else runs alongside)', '',
        '## Waves', '',
    ]
    for w in range(1, n_waves + 1):
        ids = [i for i in order if waves[i] == w]
        lines += [f'### Wave {w} — {len(ids)} tasks in parallel', '',
                  '| ID | Title | Phase | Stream | Size | Depends on |', '|---|---|---|---|---|---|']
        for i in ids:
            t = tasks[i]
            human = ' 👤' if t.get('human_required') is True else ''
            phase = int(t['phase'])
            lines.append(f"| [{i}](tasks/{t['_file']}){human} | {t['title'].strip(chr(34))} | "
                         f"{phase} {PHASES.get(phase, '')} | {t['stream']} | {t['size']} | "
                         f"{', '.join(t['depends_on']) or '—'} |")
        lines.append('')
    lines += ['👤 = human required (agents skip).', '', '## By stream', '', '| Stream | Tasks |', '|---|---|']
    streams = defaultdict(list)
    for i in sorted(tasks):
        streams[tasks[i]['stream']].append(i)
    lines += [f"| {s} | {', '.join(ids)} |" for s, ids in sorted(streams.items())]
    lines += ['', '## Requirement coverage', '', '| Requirement | Tasks |', '|---|---|']
    reqs = defaultdict(list)
    for i in order:
        for r in tasks[i].get('requirements', []):
            reqs[r].append(i)
    key = lambda r: (re.sub(r'\d+$', '', r), int(re.search(r'\d+$', r).group()))
    lines += [f"| {r} | {', '.join(reqs[r])} |" for r in sorted(reqs, key=key)]
    return '\n'.join(lines) + '\n'


def main():
    tasks = load()
    waves, blocks, order = derive(tasks)
    outputs = {os.path.join(TASKS, t['_file']): rewrite_frontmatter(t, waves[i], blocks[i]) for i, t in tasks.items()}
    outputs[os.path.join(ROOT, 'tasks.json')] = tasks_json(tasks, waves, blocks, order)
    outputs[os.path.join(ROOT, 'INDEX.md')] = index_md(tasks, waves, order)
    stale = [p for p, text in outputs.items() if not os.path.exists(p) or open(p, encoding='utf-8').read() != text]
    if '--check' in sys.argv:
        for p in stale:
            print('stale:', os.path.relpath(p, ROOT))
        sys.exit(1 if stale else 0)
    for p in stale:
        open(p, 'w', encoding='utf-8').write(outputs[p])
    print(f'{len(tasks)} tasks, {max(waves.values())} waves; updated {len(stale)} file(s)')


if __name__ == '__main__':
    main()
