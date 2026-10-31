"""The fox in its vampire cape (Halloween), with the local Wan 2.2 tool: the same clips as without it, made the
same way — the same prompts (from each clip's meta.json, the cape added), the same length, seed and end picture
— from GPT's caped pictures (V02, assets/fox/wan_in/halloween/<pose>.png, on the same canvas as the plain ones),
and thinned to the very same frames as the plain clip where that was trimmed. So they play frame for frame.

usage: python tools/wan_cape.py [clip …]     → assets/fox/clips_halloween/<clip>/   (no clips: all)
"""
import json
import os
import shutil
import subprocess
import sys

IPET = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMFY = os.path.join(os.path.expanduser('~'), 'Desktop', 'ComfyUI-master')
IN = os.path.join(IPET, 'assets', 'fox', 'wan_in', 'halloween')
PLAIN = os.path.join(IPET, 'assets', 'fox', 'clips')
OUT = os.path.join(IPET, 'assets', 'fox', 'clips_halloween')
CAPE = '牠穿著一件吸血鬼披風（外面黑色、內裡鮮紅色、高高的尖領子、胸口一顆橙色扣子），披風隨著動作自然飄動。'
# clip: (start picture, end picture or None, Wan frames, the suffix Wan names it by)
CLIPS = {
    'cheer_loop': ('cheer', None, 25, '_loop'),
    'happy_loop': ('happy', None, 25, '_loop'),
    'back_crouch_to_back_air': ('back_crouch', 'back_air', 25, '_to_back_air'),
    'back_air_to_back_crouch': ('back_air', 'back_crouch', 25, '_to_back_crouch'),
}


def make(clip):
    start, end, length, suffix = CLIPS[clip]
    plain = json.load(open(os.path.join(PLAIN, clip, 'meta.json'), encoding='utf-8'))
    head, _, rest = plain['prompt'].partition('。')  # (after the fox's own description)
    prompt = f'{head}。{CAPE}{rest}'
    cmd = [os.path.join(COMFY, '.venv', 'Scripts', 'python.exe'), 'tivot_wan.py', '--mode', 'idle',
           '--files', os.path.join(IN, f'{start}.png'), '--length', str(length), '--fps', '16',
           '--seed', str(plain.get('seed', 7)), '--out', OUT, '--suffix', suffix, '--prompt', prompt]
    if end:
        cmd += ['--end', os.path.join(IN, f'{end}.png')]
    print('===', clip, flush=True)
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1', TIVOT_GEN='512x512', TIVOT_FIT='1.0')
    subprocess.run(cmd, cwd=os.path.join(COMFY, 'tivot_wan'), env=env, check=True)
    keep = plain.get('trimmed', {}).get('kept')
    if keep:  # the plain clip was thinned: the same frames of this one
        d = os.path.join(OUT, clip)
        meta = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))
        full = os.path.join(IPET, 'assets', 'fox', 'wan_full_halloween', clip)
        shutil.rmtree(full, ignore_errors=True); shutil.copytree(d, full)
        for f in meta['frames']:
            os.remove(os.path.join(d, f))
        meta['frames'] = []
        for i, k in enumerate(keep):
            name = f'frame_{i:02d}.webp'
            shutil.copy(os.path.join(full, f'frame_{k:02d}.webp'), os.path.join(d, name)); meta['frames'].append(name)
        meta['trimmed'] = {'from': length, 'kept': keep}
        meta['duration_ms'] = plain['duration_ms']
        json.dump(meta, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('   ', len(json.load(open(os.path.join(OUT, clip, 'meta.json'), encoding='utf-8'))['frames']), 'frames', flush=True)


if __name__ == '__main__':
    for c in sys.argv[1:] or CLIPS:
        make(c)
