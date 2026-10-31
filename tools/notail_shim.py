"""Stands in for ComfyUI's tivot_wan.py when the pet's clips are made again without the tail (docs/tailless.md):
the tools/wan_*.sh scripts run as they are, through tools/wan_tailless.sh, which calls this instead.

It takes tivot_wan.py's own arguments and changes three: the pictures (assets/fox/wan_in/<pose>.png → wan_in/notail/,
GPT's tail-less ones), the output (assets/fox/clips → clips_notail) and the prompt (every tail taken out:
tools/wan_notail.py tailless()). A clip whose pictures have no tail-less version (the tail is what it's about: chasing
it, hugging it…), or that's made already, is skipped. After Wan: thinned to the frames the plain clip kept, the plain
clip's exits / near / speed copied over, and the cheer's third leg mirrored away.
"""
import json
import os
import runpy
import shutil
import sys

IPET = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOX = os.path.join(IPET, 'assets', 'fox')
sys.path.insert(0, os.path.join(IPET, 'tools'))
from wan_notail import tailless  # noqa: E402

TIVOT = os.path.join(os.path.expanduser('~'), 'Desktop', 'ComfyUI-master', 'tivot_wan', 'tivot_wan.py')
args = sys.argv[1:]


def arg(flag):
    return args[args.index(flag) + 1] if flag in args else None


def setarg(flag, v):
    args[args.index(flag) + 1] = v


def notail(pic):
    p = os.path.join(FOX, 'wan_in', 'notail', os.path.basename(pic))
    return p if os.path.exists(p) else None


start, end, out, suffix = arg('--files'), arg('--end'), arg('--out'), arg('--suffix') or ''
name = os.path.splitext(os.path.basename(start))[0] + suffix
if os.path.normpath(out) != os.path.normpath(os.path.join(FOX, 'clips')):
    sys.exit(print(f'skip {name}: not a clip of the pet ({out})'))
nout = os.path.join(FOX, 'clips_notail')
if os.path.exists(os.path.join(nout, name, 'meta.json')):
    sys.exit(print(f'skip {name}: made already'))
if not notail(start) or (end and not notail(end)):
    sys.exit(print(f'skip {name}: its pictures have a tail of their own'))
setarg('--files', notail(start))
if end:
    setarg('--end', notail(end))
setarg('--out', nout)
setarg('--prompt', tailless(arg('--prompt')))

sys.argv = [TIVOT] + args
os.chdir(os.path.dirname(TIVOT))
try:
    runpy.run_path(TIVOT, run_name='__main__')
except SystemExit:
    pass
shutil.rmtree(os.path.join(nout, os.path.splitext(os.path.basename(start))[0]), ignore_errors=True)

# after: as the plain clip is
d, plain_path = os.path.join(nout, name), os.path.join(FOX, 'clips', name, 'meta.json')
if os.path.exists(os.path.join(d, 'meta.json')) and os.path.exists(plain_path):
    plain = json.load(open(plain_path, encoding='utf-8'))
    meta = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))
    keep = plain.get('trimmed', {}).get('kept')
    if keep:
        full = os.path.join(FOX, 'wan_full_notail', 'clips', name)
        shutil.rmtree(full, ignore_errors=True); shutil.copytree(d, full)
        for f in meta['frames']:
            os.remove(os.path.join(d, f))
        meta['frames'] = []
        for i, k in enumerate(keep):
            n = f'frame_{i:02d}.webp'
            shutil.copy(os.path.join(full, f'frame_{k:02d}.webp'), os.path.join(d, n)); meta['frames'].append(n)
        meta['trimmed'] = plain['trimmed']
    for k in ('exits', 'near', 'speed', 'duration_ms'):
        if k in plain:
            meta[k] = plain[k]
    json.dump(meta, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if name.startswith('cheer_loop'):
        import subprocess
        subprocess.run([sys.executable, os.path.join(IPET, 'tools', 'cheer_leg.py'), d])
    print(f'{name}: {len(meta["frames"])} frames (plain {len(plain["frames"])})')
