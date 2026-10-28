"""ipet's own anichk: the same player as ComfyUI-master/tivot_wan/out/player.html, kept apart from TIVOT.

usage: python tools/anichk/serve.py [port]      → http://localhost:8131/player.html

Serves ipet's animation folders only (assets/fox/wan_idle/<clip>/frame_XX.webp). player_list.js is rebuilt on
every load, so new clips show up on refresh. The player's 「輸出」 button copies the kept frames, renumbered, to
assets/fox/wan_idle/export/<name>/ (never overwrites: adds a suffix).
player.html is copied from tivot_wan on first run (python tools/anichk/serve.py --refresh-player to update it).
"""
import json
import os
import shutil
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
IPET = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.join(IPET, 'assets', 'fox', 'wan_idle')  # served as /
PLAYER = os.path.join(HERE, 'player.html')
TIVOT_PLAYER = os.path.join(os.path.expanduser('~'), 'Desktop', 'ComfyUI-master', 'tivot_wan', 'out', 'player.html')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORT = int(args[0]) if args else 8131
GROUPS = [('', 'ipet 待機'), ('export', '輸出')]  # sub-folder of ROOT → group name in the player

if '--refresh-player' in sys.argv or not os.path.exists(PLAYER):
    shutil.copy(TIVOT_PLAYER, PLAYER)


def player_list():
    items = []
    for sub, group in GROUPS:
        base = os.path.join(ROOT, sub)
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            d = os.path.join(base, name)
            if not os.path.isdir(d) or (not sub and name == 'export'):
                continue
            fs = sorted(f for f in os.listdir(d) if f.startswith('frame_') and f.endswith('.webp'))
            if not fs:
                continue
            fps = None
            for meta in ('meta.json', 'export.json'):
                try:
                    fps = json.load(open(os.path.join(d, meta), encoding='utf-8')).get('fps') or fps
                except (OSError, ValueError):
                    pass
            items.append({'group': group, 'name': name, 'dir': os.path.relpath(d, ROOT).replace(os.sep, '/'),
                          'frames': fs, 'fps': fps, 'mtime': os.path.getmtime(d)})
    items.sort(key=lambda x: ([g for _, g in GROUPS].index(x['group']), -x['mtime']))
    return 'window.ANIMS=' + json.dumps(items, ensure_ascii=False) + ';'


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_text(self, text, ctype):
        body = text.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = unquote(urlsplit(self.path).path)
        if p in ('/', '/player.html'):
            return self.send_text(open(PLAYER, encoding='utf-8').read(), 'text/html; charset=utf-8')
        if p == '/player_list.js':
            return self.send_text(player_list(), 'application/javascript; charset=utf-8')
        return super().do_GET()

    def do_POST(self):
        if self.path != '/export':
            return self.send_error(404)
        try:
            req = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            src = os.path.normpath(os.path.join(ROOT, req['dir']))
            if not src.startswith(ROOT):
                raise ValueError('bad folder')
            miss = [f for f in req['frames'] if not os.path.exists(os.path.join(src, f))]
            if miss:
                raise FileNotFoundError(f'來源資料夾不見了（{req["dir"]}，缺 {len(miss)} 格），請重新整理')
            name = ''.join(c for c in req['name'] if c.isalnum() or c in '_-.') or 'export'
            dst = os.path.join(ROOT, 'export', name)
            if os.path.exists(dst):  # never overwrite
                n = 2
                while os.path.exists(f'{dst}_{n}'):
                    n += 1
                dst = f'{dst}_{n}'
            os.makedirs(dst)
            for j, f in enumerate(req['frames']):
                shutil.copy(os.path.join(src, f), os.path.join(dst, f'frame_{j:02d}.webp'))
            json.dump({'from': req['dir'], 'kept_index': req['keep'], 'holds': req.get('holds'), 'fps': req.get('fps'),
                       'time': time.strftime('%Y-%m-%d %H:%M')},
                      open(os.path.join(dst, 'export.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            body = {'ok': True, 'path': dst, 'count': len(req['frames'])}
        except Exception as e:  # report to the player
            body = {'ok': False, 'error': str(e)}
        self.send_text(json.dumps(body, ensure_ascii=False), 'application/json; charset=utf-8')


print(f'http://localhost:{PORT}/player.html', flush=True)
ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
