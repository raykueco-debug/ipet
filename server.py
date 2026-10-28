"""iPet prototype server: static files + a tiny parent→child API (stand-in for the real backend).

usage: python server.py [port]        (default 8000, listens on all interfaces)

One JSON file per family in data/. A family is identified by a pairing code (?family=XXXX).
Endpoints (all JSON unless noted):
  POST /api/schedule       {kind:'line'|'tts'|'voice', text, lineId?, audioId?, at(ms), repeat:'once'|'daily'}
  GET  /api/schedule       list scheduled speech (parent view)
  POST /api/schedule/delete {id}
  POST /api/gift           {item}
  POST /api/audio          raw audio body (parent recording) -> {audioId}
  GET  /audio/<id>         the recording
  GET  /api/inbox?since=   child polls: due speech + gifts since a timestamp
  GET  /api/tts?text=&lang=zh|en[&model=&voice=&speed=]   neural TTS audio (cached); 501 when no provider
  GET  /api/tts/status     {provider}
  GET  /api/voices         local voices + current choice (audition page)
  POST /api/voice-config   {lang, model, voice, speed}
  POST /api/fox3d-rig?model=   tail attachment from tools/rig_editor.html -> assets/fox3d/<model>/rig.json

TTS providers (TTS_PROVIDER=local|azure|openai forces one; otherwise the first available wins):
  local   Kokoro via sherpa-onnx, models in models/ – the same engine the iOS app can bundle (default)
  azure   AZURE_SPEECH_KEY + AZURE_SPEECH_REGION   [AZURE_TTS_VOICE_ZH / AZURE_TTS_VOICE_EN]
  openai  OPENAI_API_KEY                            [OPENAI_TTS_VOICE, default coral]
"""
import hashlib
import json
import os
import re
import sys
import threading
import time
import uuid
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape

import localtts

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
AUDIO = os.path.join(DATA, "audio")
TTS_CACHE = os.path.join(DATA, "tts")
os.makedirs(AUDIO, exist_ok=True)
os.makedirs(TTS_CACHE, exist_ok=True)

# how the fox should sound, for providers that take a style prompt
FOX_STYLE = {
    "zh": ("用台灣口音的華語說話。你是一隻調皮、好奇又可愛的小狐狸，正在跟小朋友說話："
           "聲音明亮輕快、帶一點撒嬌和笑意，語速稍快但咬字清楚，句尾自然上揚。"),
    "en": ("You are a playful, curious little fox talking to a young child. Speak clear, friendly "
           "American English: bright, warm and a bit giggly, slightly slower than normal so a child "
           "learning English can follow every word."),
}
AZURE_VOICE = {"zh": ("AZURE_TTS_VOICE_ZH", "zh-TW-HsiaoYuNeural", "zh-TW", "+12%", "+6%"),
               "en": ("AZURE_TTS_VOICE_EN", "en-US-AnaNeural", "en-US", "+0%", "-6%")}


LOCAL_OK = localtts.available()


def tts_provider():
    forced = os.environ.get("TTS_PROVIDER")
    if forced:
        return forced
    if LOCAL_OK:
        return "local"
    if os.environ.get("AZURE_SPEECH_KEY") and os.environ.get("AZURE_SPEECH_REGION"):
        return "azure"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    return None


def azure_voice(lang):
    env, default, xml_lang, pitch, rate = AZURE_VOICE[lang]
    return os.environ.get(env, default), xml_lang, pitch, rate


def tts_azure(text, lang):
    voice, xml_lang, pitch, rate = azure_voice(lang)
    ssml = (f'<speak version="1.0" xml:lang="{xml_lang}"><voice name="{voice}">'
            f'<prosody pitch="{pitch}" rate="{rate}">{escape(text)}</prosody></voice></speak>')
    req = Request(f"https://{os.environ['AZURE_SPEECH_REGION']}.tts.speech.microsoft.com/cognitiveservices/v1",
                  data=ssml.encode(), method="POST", headers={
                      "Ocp-Apim-Subscription-Key": os.environ["AZURE_SPEECH_KEY"],
                      "Content-Type": "application/ssml+xml",
                      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                      "User-Agent": "ipet-prototype"})
    with urlopen(req, timeout=20) as r:
        return r.read()


def tts_openai(text, lang):
    body = {"model": "gpt-4o-mini-tts", "voice": os.environ.get("OPENAI_TTS_VOICE", "coral"),
            "input": text, "instructions": FOX_STYLE[lang], "response_format": "mp3"}
    req = Request("https://api.openai.com/v1/audio/speech", data=json.dumps(body).encode(), method="POST",
                  headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"})
    with urlopen(req, timeout=30) as r:
        return r.read()


def tts(text, lang, model=None, voice=None, speed=None, fx=None):
    """(audio bytes, mime) for text, cached on disk so each line is only generated / paid for once."""
    provider = tts_provider()
    if not provider:
        return None, None
    if provider == "local":
        tag, ext, mime = localtts.cache_key(lang, model, voice, speed, fx), ".wav", "audio/wav"
    elif provider == "azure":
        tag, ext, mime = f"azure|{azure_voice(lang)[0]}", ".mp3", "audio/mpeg"
    else:
        tag, ext, mime = f"openai|{os.environ.get('OPENAI_TTS_VOICE', 'coral')}", ".mp3", "audio/mpeg"
    key = hashlib.sha1(f"{tag}|{lang}|{text}".encode()).hexdigest()
    path = os.path.join(TTS_CACHE, key + ext)
    if not os.path.exists(path):
        if provider == "local":
            data = localtts.synth(text, lang, model, voice, speed, fx)
        elif provider == "azure":
            data = tts_azure(text, lang)
        else:
            data = tts_openai(text, lang)
        with open(path, "wb") as f:
            f.write(data)
    with open(path, "rb") as f:
        return f.read(), mime


def warm_lines():
    """Pre-generate the fixed phrases (both languages) so they play instantly."""
    try:
        src = open(os.path.join(ROOT, "voice.js"), encoding="utf-8").read()
        for _zh, en in re.findall(r"zh: '([^']+)', en: \"([^\"]+)\"", src):
            tts(en, "en")  # Foxy speaks English only for now
    except Exception as e:  # warming is best-effort
        print("warm-up skipped:", e)


def now_ms():
    return int(time.time() * 1000)


def family_path(code):
    code = re.sub(r"[^A-Za-z0-9]", "", code or "demo")[:12] or "demo"
    return os.path.join(DATA, f"family_{code}.json")


def load(code):
    try:
        with open(family_path(code), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"schedule": [], "events": []}


def save(code, fam):
    with open(family_path(code), "w", encoding="utf-8") as f:
        json.dump(fam, f, ensure_ascii=False)


def release_due(fam):
    """Turn schedule entries whose time has come into inbox events; roll daily ones forward."""
    t = now_ms()
    for s in fam["schedule"]:
        while s.get("next", 0) <= t and not s.get("done"):
            fam["events"].append({"id": uuid.uuid4().hex[:10], "type": "speech", "at": s["next"],
                                  "kind": s["kind"], "text": s.get("text", ""), "audioId": s.get("audioId")})
            if s["repeat"] == "daily":
                s["next"] += 24 * 3600 * 1000
            else:
                s["done"] = True
    fam["schedule"] = [s for s in fam["schedule"] if not s.get("done")]
    fam["events"] = fam["events"][-200:]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 5 * 1024 * 1024:
            raise ValueError("too large")
        return self.rfile.read(n)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        fam_code = q.get("family", ["demo"])[0]
        if u.path == "/api/schedule":
            fam = load(fam_code)
            release_due(fam)
            save(fam_code, fam)
            return self._json(sorted(fam["schedule"], key=lambda s: s["next"]))
        if u.path == "/api/inbox":
            fam = load(fam_code)
            release_due(fam)
            save(fam_code, fam)
            since = int(q.get("since", ["0"])[0])
            return self._json({"now": now_ms(), "events": [e for e in fam["events"] if e["at"] > since]})
        if u.path == "/api/tts/status":
            return self._json({"provider": tts_provider()})
        if u.path == "/api/voices":
            if not LOCAL_OK:
                return self._json({"error": "local models not installed"}, 501)
            return self._json({"config": localtts.load_config(),
                               "models": {m: localtts.speaker_names(m) for m in localtts.MODELS}})
        if u.path == "/api/tts":
            text = q.get("text", [""])[0].strip()[:120]
            lang = "en" if q.get("lang", [""])[0] == "en" else "zh"
            if not text:
                return self._json({"error": "no text"}, 400)
            pick = lambda k: q.get(k, [None])[0]
            try:
                fx = {k: pick(k) for k in ("pitch", "formant", "range")} if any(pick(k) for k in ("pitch", "formant", "range")) else None
                data, mime = tts(text, lang, pick("model"), pick("voice"), pick("speed"), fx)
            except Exception as e:  # provider error: let the client fall back to device TTS
                return self._json({"error": f"tts failed: {e}"}, 502)
            if data is None:
                return self._json({"error": "no tts provider configured"}, 501)
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Cache-Control", "public, max-age=31536000")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        m = re.fullmatch(r"/audio/([0-9a-f]{12})", u.path)
        if m:
            p = os.path.join(AUDIO, m.group(1))
            if not os.path.exists(p):
                return self._json({"error": "not found"}, 404)
            with open(p + ".type", encoding="utf-8") as f:
                ctype = f.read()
            data = open(p, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if u.path.startswith("/data/"):
            return self._json({"error": "forbidden"}, 403)
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        fam_code = parse_qs(u.query).get("family", ["demo"])[0]
        try:
            if u.path == "/api/audio":
                data = self._body()
                aid = uuid.uuid4().hex[:12]
                with open(os.path.join(AUDIO, aid), "wb") as f:
                    f.write(data)
                with open(os.path.join(AUDIO, aid + ".type"), "w", encoding="utf-8") as f:
                    f.write((self.headers.get("Content-Type") or "audio/webm").split(";")[0])
                return self._json({"audioId": aid})
            body = json.loads(self._body() or b"{}")
        except ValueError as e:
            return self._json({"error": str(e)}, 400)

        if u.path == "/api/voice-config":
            try:
                cfg = localtts.save_config(body.get("lang"), body.get("model"), body.get("voice"), body.get("speed", 1.0), body.get("fx"))
            except (ValueError, TypeError) as e:
                return self._json({"error": str(e)}, 400)
            threading.Thread(target=warm_lines, daemon=True).start()
            return self._json(cfg)

        if u.path == "/api/fox3d-rig":  # tools/rig_editor.html → assets/fox3d/<model>/rig.json
            model = parse_qs(u.query).get("model", [""])[0]
            if not re.fullmatch(r"[a-z0-9_-]*", model):
                return self._json({"error": "bad model"}, 400)
            path = os.path.join(ROOT, "assets", "fox3d", model, "rig.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(body, f, ensure_ascii=False, indent=1)
            return self._json({"saved": os.path.relpath(path, ROOT)})

        fam = load(fam_code)
        if u.path == "/api/schedule":
            kind = body.get("kind")
            text = str(body.get("text", ""))[:120]
            if kind not in ("line", "tts", "voice") or (kind != "voice" and not text):
                return self._json({"error": "bad request"}, 400)
            at = int(body.get("at") or now_ms())
            entry = {"id": uuid.uuid4().hex[:10], "kind": kind, "text": text, "audioId": body.get("audioId"),
                     "repeat": "daily" if body.get("repeat") == "daily" else "once", "next": at,
                     "label": datetime.fromtimestamp(at / 1000).strftime("%m/%d %H:%M")}
            fam["schedule"].append(entry)
            release_due(fam)
            save(fam_code, fam)
            return self._json(entry)
        if u.path == "/api/schedule/delete":
            fam["schedule"] = [s for s in fam["schedule"] if s["id"] != body.get("id")]
            save(fam_code, fam)
            return self._json({"ok": True})
        if u.path == "/api/gift":
            item = str(body.get("item", ""))[:20]
            fam["events"].append({"id": uuid.uuid4().hex[:10], "type": "gift", "at": now_ms(), "item": item,
                                  "from": str(body.get("from", "爸媽"))[:10]})
            save(fam_code, fam)
            return self._json({"ok": True})
        return self._json({"error": "not found"}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"iPet server on http://0.0.0.0:{port}  (child: /  parent: /parent.html)")
    print(f"neural TTS: {tts_provider() or 'off (device voice fallback)'}")
    if tts_provider():
        threading.Thread(target=warm_lines, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
