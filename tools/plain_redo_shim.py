"""Stands in for ComfyUI's tivot_wan.py to make some of the pet's clips (the ones with their tail, assets/fox/clips)
again after their pictures were fixed: tools/plain_redo.sh runs the tools/wan_*.sh scripts as they are through it.
Only the clips named in REDO are made (the rest skipped); each is made into assets/fox/clips_redo, then given what
the old one had been through (its kept frames, exits, near, speed) and put in its place, the old one moved to
assets/fox/wan_tries_plain/<clip>/old.
"""
import json
import os
import shutil
import sys

IPET = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOX = os.path.join(IPET, 'assets', 'fox')
TIVOT = os.path.join(os.path.expanduser('~'), 'Desktop', 'ComfyUI-master', 'tivot_wan', 'tivot_wan.py')
args = sys.argv[1:]


def arg(flag):
    return args[args.index(flag) + 1] if flag in args else None


start, end, out, suffix = arg('--files'), arg('--end'), arg('--out'), arg('--suffix') or ''
name = os.path.splitext(os.path.basename(start))[0] + suffix
if name not in os.environ.get('REDO', '').split():
    sys.exit()
plain = os.path.join(FOX, 'clips', name)
redo = os.path.join(FOX, 'clips_redo')
args[args.index('--out') + 1] = redo
sys.argv = [TIVOT] + args
os.chdir(os.path.dirname(TIVOT))
sys.path.insert(0, os.path.dirname(TIVOT))
try:
    exec(compile(open(TIVOT, encoding='utf-8').read(), TIVOT, 'exec'), {'__name__': '__main__', '__file__': TIVOT})
except SystemExit:
    pass
shutil.rmtree(os.path.join(redo, os.path.splitext(os.path.basename(start))[0]), ignore_errors=True)

d = os.path.join(redo, name)
if not os.path.exists(os.path.join(d, 'meta.json')):
    sys.exit(print(f'{name}: not made'))
meta = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))
old = json.load(open(os.path.join(plain, 'meta.json'), encoding='utf-8')) if os.path.exists(os.path.join(plain, 'meta.json')) else {}
keep = old.get('trimmed', {}).get('kept')
if keep:  # (thinned as the old one was)
    full = os.path.join(d, '_full'); os.makedirs(full)
    for f in meta['frames']:
        shutil.move(os.path.join(d, f), os.path.join(full, f))
    meta['frames'] = []
    for i, k in enumerate(keep):
        n = f'frame_{i:02d}.webp'
        shutil.copy(os.path.join(full, f'frame_{k:02d}.webp'), os.path.join(d, n)); meta['frames'].append(n)
    shutil.rmtree(full)
    meta['trimmed'] = old['trimmed']
for k in ('exits', 'near', 'speed', 'duration_ms'):
    if k in old:
        meta[k] = old[k]
meta['rev'] = int(__import__('time').time())
json.dump(meta, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
tries = os.path.join(FOX, 'wan_tries_plain', name)
os.makedirs(tries, exist_ok=True)
if os.path.exists(plain):
    shutil.rmtree(os.path.join(tries, 'old'), ignore_errors=True)
    shutil.move(plain, os.path.join(tries, 'old'))
shutil.move(d, plain)
print(f'{name}: {len(meta["frames"])} frames, in place (old one: wan_tries_plain/{name}/old)')
