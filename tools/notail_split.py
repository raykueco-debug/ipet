"""The tail-less clips Wan still grows the tail back in halfway (turning side on, lying down, getting up: no seed is
free of it — docs/tailless.md) made in two halves instead: start → a tail-less side-on picture → end, each half its
own Wan run with tail-less pictures at both ends, so there's nowhere left for the tail to come back. The halves are
put together (13 + 12 frames, as many as the clip had) into assets/fox/wan_tries_notail/<clip>/split_<seed>/ to look
over; --use puts that one into assets/fox/clips_notail/<clip> (its meta as the clip's was, the frames new).

usage: python tools/notail_split.py [--seeds 7,11] [clip …]          (each ~2 min a seed)
       python tools/notail_split.py --use <clip> <seed>
"""
import json
import os
import shutil
import subprocess
import sys

IPET = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOX = os.path.join(IPET, 'assets', 'fox')
sys.path.insert(0, os.path.join(IPET, 'tools'))
from wan_notail import tailless  # noqa: E402

COMFY = os.path.join(os.path.expanduser('~'), 'Desktop', 'ComfyUI-master')
TIVOT = os.path.join(COMFY, 'tivot_wan', 'tivot_wan.py')
PY = os.path.join(COMFY, '.venv', 'Scripts', 'python.exe')

SIT = '一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），在純綠色背景前的原地。'
WALK = '一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），在純綠色背景前。'
KEEP = '畫面裡只有這隻狐狸，沒有手、沒有任何特效符號。鏡頭完全固定不動，背景始終是純綠色，主體大小不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
# clip: (start, middle, end, first half, second half) — the middle one of GPT's tail-less pictures, side on
CLIPS = {
    'walk_back_to_walk_front': ('walk_back', 'walk', 'walk_front', WALK + '牠背對你站著，慢慢轉身，變成側身朝左站著。動作自然流暢。',
                                WALK + '牠側身朝左站著，慢慢轉身面向你，抬起一隻前腳準備朝你走過來。動作自然流暢。'),
    'walk_front_to_walk_back': ('walk_front', 'walk', 'walk_back', WALK + '牠面向你站著，慢慢轉身，變成側身朝左站著。動作自然流暢。',
                                WALK + '牠側身朝左站著，慢慢轉身背對你，準備往遠處走。動作自然流暢。'),
    'drowsy_to_sleep': ('drowsy', 'rest', 'sleep', SIT + '牠閉著眼睛坐著，慢慢趴下來，側躺在地上，頭還抬著。動作自然流暢。',
                        SIT + '牠側躺在地上，閉上眼睛，把身體捲成一團，安穩地睡著了。動作自然流暢。'),
    'sleep_belly_to_sleep': ('sleep_belly', 'rest', 'sleep', SIT + '牠肚子朝上仰睡，在睡夢中翻回身，變成側躺在地上。動作自然流暢。',
                             SIT + '牠側躺在地上，閉上眼睛，把身體捲成一團，繼續睡。動作自然流暢。'),
    'sleep_to_normal': ('sleep', 'stretch', 'normal', SIT + '牠睡醒了，睜開眼睛，抬起頭，前腳往前伸，伸了個懶腰。動作自然流暢。',
                        SIT + '牠伸完懶腰，坐起來，恢復平常乖乖坐好的樣子。動作自然流暢。'),
    'eat_to_normal': ('eat', 'lick', 'normal', SIT + '牠吃飽了，抬起頭坐好，滿足地舔一舔嘴巴。四隻腳留在原地。動作自然流暢。',
                      SIT + '牠舔完嘴巴，恢復平常乖乖坐好的樣子。四隻腳留在原地。動作自然流暢。'),
}

# Wan's negative prompt with tails in (as tools/notail_shim.py does)
RUN = r'''
import sys, os
src = open(sys.argv[1], encoding='utf-8').read().replace("伸手')", "伸手，尾巴，大尾巴，蓬鬆的尾巴，白色尾尖，狐狸尾巴')", 1)
sys.path.insert(0, os.path.dirname(sys.argv[1])); sys.argv = sys.argv[1:]
exec(compile(src, sys.argv[0], 'exec'), {'__name__': '__main__', '__file__': sys.argv[0]})
'''


def pic(n):
    return os.path.join(FOX, 'wan_in', 'notail', n + '.png')


def half(a, b, prompt, seed, out, suffix):
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1', TIVOT_GEN='512x512', TIVOT_FIT='1.0')
    subprocess.run([PY, '-c', RUN, TIVOT, '--mode', 'idle', '--files', pic(a), '--end', pic(b), '--length', '13', '--fps', '16',
                    '--seed', str(seed), '--out', out, '--suffix', suffix, '--prompt', tailless(prompt) + KEEP],
                   cwd=os.path.dirname(TIVOT), env=env, check=True)
    d = os.path.join(out, a + suffix)
    return d, json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))['frames']


def make(clip, seed):
    a, mid, b, p1, p2 = CLIPS[clip]
    out = os.path.join(FOX, 'wan_tries_notail', clip, f'split_{seed}')
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    d1, f1 = half(a, mid, p1, seed, out, '_a')
    d2, f2 = half(mid, b, p2, seed, out, '_b')
    frames = [os.path.join(d1, f) for f in f1] + [os.path.join(d2, f) for f in f2[1:]]  # (the middle picture once)
    for i, f in enumerate(frames):
        shutil.copy(f, os.path.join(out, f'frame_{i:02d}.webp'))
    meta = json.load(open(os.path.join(FOX, 'clips_notail', clip, 'meta.json'), encoding='utf-8'))
    meta.update(frames=[f'frame_{i:02d}.webp' for i in range(len(frames))], seed=seed, split=mid,
                prompt=[tailless(p1), tailless(p2)])
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{clip} seed {seed}: {len(frames)} frames through {mid}', flush=True)


def use(clip, seed):
    src, d = os.path.join(FOX, 'wan_tries_notail', clip, f'split_{seed}'), os.path.join(FOX, 'clips_notail', clip)
    shutil.rmtree(d)
    os.makedirs(d)
    for f in os.listdir(src):
        if f.endswith('.webp') or f == 'meta.json':
            shutil.copy(os.path.join(src, f), d)
    print(clip, '<- split', seed)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--use']:
        use(args[1], int(args[2]))
        sys.exit()
    seeds = [7, 11]
    if args[:1] == ['--seeds']:
        seeds, args = [int(s) for s in args[1].split(',')], args[2:]
    for seed in seeds:
        for clip in args or CLIPS:
            make(clip, seed)
