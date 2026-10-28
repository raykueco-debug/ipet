"""Image → 3D shape with Hunyuan3D-2 through a running ComfyUI (native nodes, shape only, no texture).

usage: python tools/hunyuan3d.py assets/fox/cub/normal.png assets/fox3d/raw/cub.glb [--seed 1] [--steps 30] [--octree 384]
       python tools/hunyuan3d.py --mv assets/fox3d/views/standing assets/fox3d/raw/standing.glb
         (--mv DIR: front_hy / left_hy / back_hy / right_hy.png from tools/split_turnaround.py,
          uses models/checkpoints/hunyuan3d-dit-v2-mv.safetensors)

Needs ComfyUI at http://127.0.0.1:8188 with models/checkpoints/hunyuan3d-dit-v2-0.safetensors
(tencent/Hunyuan3D-2 hunyuan3d-dit-v2-0/model.fp16.safetensors, renamed).
The colours are projected from the same image later, in tools/blender/rig_fox.py.
"""
import argparse
import glob
import json
import os
import shutil
import time
import urllib.request
import uuid

from PIL import Image

COMFY = os.environ.get('COMFY_DIR', os.path.expanduser('~/Desktop/ComfyUI-master'))
URL = os.environ.get('COMFY_URL', 'http://127.0.0.1:8188')


def prep(src, name):
    """Transparent sprite → square, centred, white background (what Hunyuan3D expects)."""
    im = Image.open(src).convert('RGBA')
    im = im.crop(im.getchannel('A').getbbox())
    side = int(max(im.size) / 0.85)
    out = Image.new('RGB', (side, side), 'white')
    out.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    out.resize((1024, 1024), Image.LANCZOS).save(os.path.join(COMFY, 'input', name))


def workflow(images, prefix, seed, steps, octree):
    """images: {'front': name} for single view, or front/left/back/right for the multi-view model."""
    mv = len(images) > 1
    wf = {
        '1': {'class_type': 'ImageOnlyCheckpointLoader',
              'inputs': {'ckpt_name': 'hunyuan3d-dit-v2-mv.safetensors' if mv else 'hunyuan3d-dit-v2-0.safetensors'}},
    }
    cond = {}
    for i, (view, name) in enumerate(images.items()):
        wf[f'img_{view}'] = {'class_type': 'LoadImage', 'inputs': {'image': name}}
        wf[f'enc_{view}'] = {'class_type': 'CLIPVisionEncode', 'inputs': {'clip_vision': ['1', 1], 'image': [f'img_{view}', 0], 'crop': 'none'}}
        cond[view] = [f'enc_{view}', 0]
    wf['4'] = ({'class_type': 'Hunyuan3Dv2ConditioningMultiView', 'inputs': cond} if mv else
               {'class_type': 'Hunyuan3Dv2Conditioning', 'inputs': {'clip_vision_output': cond['front']}})
    return {**wf, **{
        '5': {'class_type': 'EmptyLatentHunyuan3Dv2', 'inputs': {'resolution': 3072, 'batch_size': 1}},
        '6': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': ['1', 0], 'shift': 1.0}},
        '7': {'class_type': 'KSampler', 'inputs': {
            'model': ['6', 0], 'seed': seed, 'steps': steps, 'cfg': 5.0, 'sampler_name': 'euler',
            'scheduler': 'normal', 'positive': ['4', 0], 'negative': ['4', 1], 'latent_image': ['5', 0], 'denoise': 1.0}},
        '8': {'class_type': 'VAEDecodeHunyuan3D', 'inputs': {'samples': ['7', 0], 'vae': ['1', 2], 'num_chunks': 8000, 'octree_resolution': octree}},
        '9': {'class_type': 'VoxelToMesh', 'inputs': {'voxel': ['8', 0], 'algorithm': 'surface net', 'threshold': 0.6}},
        '10': {'class_type': 'SaveGLB', 'inputs': {'mesh': ['9', 0], 'filename_prefix': prefix}},
    }}


def post(path, data):
    req = urllib.request.Request(URL + path, json.dumps(data).encode(), {'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mv', action='store_true', help='src is a folder of *_hy.png views')
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--steps', type=int, default=30)
    ap.add_argument('--octree', type=int, default=384)
    a = ap.parse_args()

    tag = 'ipet_' + uuid.uuid4().hex[:8]
    if a.mv:
        images = {}
        for view in ('front', 'left', 'back', 'right'):
            p = os.path.join(a.src, view + '_hy.png')
            if os.path.exists(p):
                images[view] = f'{tag}_{view}.png'
                shutil.copy(p, os.path.join(COMFY, 'input', images[view]))
    else:
        prep(a.src, tag + '.png')
        images = {'front': tag + '.png'}
    pid = post('/prompt', {'prompt': workflow(images, 'mesh/' + tag, a.seed, a.steps, a.octree)})['prompt_id']
    print('queued', pid)
    t0 = time.time()
    while True:
        time.sleep(3)
        h = json.load(urllib.request.urlopen(f'{URL}/history/{pid}')).get(pid)
        if h and h.get('status', {}).get('completed'):
            break
        if h and h.get('status', {}).get('status_str') == 'error':
            raise SystemExit('ComfyUI error: ' + json.dumps(h['status'].get('messages', []))[:2000])
    files = glob.glob(os.path.join(COMFY, 'output', 'mesh', tag + '*.glb'))
    if not files:
        raise SystemExit('no glb in ComfyUI/output/mesh')
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    shutil.copy(files[0], a.out)
    print(f'wrote {a.out} ({os.path.getsize(a.out) // 1024} KB) in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
