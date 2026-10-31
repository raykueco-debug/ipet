"""The fox without its tail, for the clips the fling game shows it from the front or from behind — the game draws
its tails itself (as many as it has, swaying; fling.js tails()), and a tail painted over its body can't be taken off.
Made as tools/wan_cape.py makes the caped ones: the same prompts (each clip's meta.json, every word of a tail taken
out, "no tail" put in), the same length, seed and end picture, from GPT's tail-less pictures (T01 plain, T02 caped:
assets/fox/wan_in/notail/<pose>.png, wan_in/halloween_notail/<pose>.png, on the same canvas), thinned to the same
frames as the clip they stand for.

usage: python tools/wan_notail.py [clip …]     → assets/fox/clips_notail/, clips_halloween_notail/   (no clips: all)
"""
import json
import os
import re
import shutil
import subprocess
import sys

IPET = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMFY = os.path.join(os.path.expanduser('~'), 'Desktop', 'ComfyUI-master')
FOX = os.path.join(IPET, 'assets', 'fox')
NOTAIL = '牠沒有尾巴，畫面裡完全沒有尾巴。'
# name: (the clip it stands for, start picture, end picture or None, Wan frames, the suffix Wan names it by)
CLIPS = {
    'cheer_loop': ('clips', 'cheer', None, 25, '_loop'),
    'happy_loop': ('clips', 'happy', None, 25, '_loop'),
    'jump_joy_loop': ('clips', 'jump_joy', None, 25, '_loop'),
    'surprised_loop': ('clips', 'surprised', None, 25, '_loop'),
    'back_crouch_to_back_air': ('clips', 'back_crouch', 'back_air', 25, '_to_back_air'),
    'back_air_to_back_crouch': ('clips', 'back_air', 'back_crouch', 25, '_to_back_crouch'),
    'h/cheer_loop': ('clips_halloween', 'cheer', None, 25, '_loop'),
    'h/happy_loop': ('clips_halloween', 'happy', None, 25, '_loop'),
    'h/back_crouch_to_back_air': ('clips_halloween', 'back_crouch', 'back_air', 25, '_to_back_air'),
    'h/back_air_to_back_crouch': ('clips_halloween', 'back_air', 'back_crouch', 25, '_to_back_crouch'),
}


def tailless(prompt):
    """Every mention of a tail out (a clause, or a part of one between 、), and "no tail" in after the fox."""
    prompt = prompt.replace('、蓬鬆的大尾巴有白色尾尖', '')
    out = []
    for sentence in re.split(r'(?<=。)', prompt):
        clauses = []
        for clause in re.split(r'(?<=，)', sentence):
            if not clause:
                continue
            end = clause[-1] if clause[-1] in '，。' else ''
            parts = [p for p in clause.rstrip('，。').split('、') if '尾巴' not in p]
            if parts:
                clauses.append('、'.join(parts) + end)
        out.append(''.join(clauses))
    head, _, rest = ''.join(out).partition('。')
    return f'{head}。{NOTAIL}{rest}'


def make(name):
    src, start, end, length, suffix = CLIPS[name]
    clip = name.split('/')[-1]
    plain = json.load(open(os.path.join(FOX, src, clip, 'meta.json'), encoding='utf-8'))
    ins = os.path.join(FOX, 'wan_in', 'halloween_notail' if src == 'clips_halloween' else 'notail')
    out = os.path.join(FOX, src + '_notail')
    cmd = [os.path.join(COMFY, '.venv', 'Scripts', 'python.exe'), 'tivot_wan.py', '--mode', 'idle',
           '--files', os.path.join(ins, f'{start}.png'), '--length', str(length), '--fps', '16',
           '--seed', str(plain.get('seed', 7)), '--out', out, '--suffix', suffix, '--prompt', tailless(plain['prompt'])]
    if end:
        cmd += ['--end', os.path.join(ins, f'{end}.png')]
    print('===', name, flush=True)
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1', TIVOT_GEN='512x512', TIVOT_FIT='1.0')
    subprocess.run(cmd, cwd=os.path.join(COMFY, 'tivot_wan'), env=env, check=True)
    shutil.rmtree(os.path.join(out, start), ignore_errors=True)  # (the tool's empty folder by the picture's own name)
    keep = plain.get('trimmed', {}).get('kept')
    d = os.path.join(out, clip)
    if keep:  # the clip it stands for was thinned: the same frames of this one
        meta = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))
        full = os.path.join(FOX, 'wan_full_notail', src, clip)
        shutil.rmtree(full, ignore_errors=True); shutil.copytree(d, full)
        for f in meta['frames']:
            os.remove(os.path.join(d, f))
        meta['frames'] = []
        for i, k in enumerate(keep):
            n = f'frame_{i:02d}.webp'
            shutil.copy(os.path.join(full, f'frame_{k:02d}.webp'), os.path.join(d, n)); meta['frames'].append(n)
        meta['trimmed'] = {'from': length, 'kept': keep}
        meta['duration_ms'] = plain['duration_ms']
        json.dump(meta, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('   ', len(json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))['frames']), 'frames', flush=True)


if __name__ == '__main__':
    for c in sys.argv[1:] or CLIPS:
        make(c)
