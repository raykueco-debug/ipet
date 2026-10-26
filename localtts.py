"""On-device-style neural TTS with Kokoro (sherpa-onnx). Same engine family the iOS app can bundle.

Models live in models/ (Apache-2.0):
  v1_0  kokoro-int8-multi-lang-v1_0  – ~50 English voices (af_heart, af_bella, …) + a few Chinese
  v1_1  kokoro-int8-multi-lang-v1_1  – Chinese-focused (zf_001… / zm_…) + 3 English voices

The chosen voice per language is stored in data/voice.json and picked on the audition page.
"""
import io
import json
import os
import re
import threading
import wave

ROOT = os.path.dirname(os.path.abspath(__file__))
MODELS = {
    "v1_0": os.path.join(ROOT, "models", "kokoro-int8-multi-lang-v1_0"),
    "v1_1": os.path.join(ROOT, "models", "kokoro-int8-multi-lang-v1_1"),
}
CONFIG = os.path.join(ROOT, "data", "voice.json")
# fx = "kid / cartoon" post-processing (Praat "Change gender"):
#   pitch   new median pitch in Hz (0 = leave as is)        – higher = younger
#   formant formant shift ratio (1.0 = none, ~1.1–1.25)      – smaller vocal tract = small creature, not chipmunk
#   range   pitch range factor (1.0 = same intonation)       – bigger = livelier, more playful
DEFAULT_FX = {"pitch": 340, "formant": 1.18, "range": 1.6}  # = "小狐狸" preset
DEFAULT_CONFIG = {
    "en": {"model": "v1_0", "voice": "af_heart", "speed": 1.0, "fx": dict(DEFAULT_FX)},
    "zh": {"model": "v1_1", "voice": "zf_001", "speed": 1.0, "fx": {"pitch": 340, "formant": 1.15, "range": 1.25}},
}

_engines = {}
_names = {}
_lock = threading.Lock()


def available():
    try:
        import sherpa_onnx  # noqa: F401
    except ImportError:
        return False
    return any(os.path.exists(os.path.join(d, "model.int8.onnx")) for d in MODELS.values())


def speaker_names(model):
    """Voice names straight from the ONNX metadata (index = speaker id)."""
    if model not in _names:
        data = open(os.path.join(MODELS[model], "model.int8.onnx"), "rb").read()
        m = re.search(rb"speaker_names.{1,6}?([a-z_0-9,]{20,})", data[data.find(b"speaker_names"):][:8000], re.S)
        _names[model] = m.group(1).decode().split(",") if m else []
    return _names[model]


def _engine(model):
    import sherpa_onnx
    if model not in _engines:
        d = MODELS[model]
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=f"{d}/model.int8.onnx", voices=f"{d}/voices.bin", tokens=f"{d}/tokens.txt",
                    data_dir=f"{d}/espeak-ng-data", dict_dir=f"{d}/dict",
                    lexicon=f"{d}/lexicon-us-en.txt,{d}/lexicon-zh.txt"),
                num_threads=4),
            rule_fsts=f"{d}/date-zh.fst,{d}/phone-zh.fst,{d}/number-zh.fst",
            max_num_sentences=1)
        _engines[model] = sherpa_onnx.OfflineTts(cfg)
    return _engines[model]


def load_config():
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    try:
        with open(CONFIG, encoding="utf-8") as f:
            for lang, v in json.load(f).items():
                if lang in cfg:
                    cfg[lang].update(v)
    except (OSError, ValueError):
        pass
    return cfg


def clean_fx(fx, base=None):
    fx = dict(base or DEFAULT_FX, **{k: v for k, v in (fx or {}).items() if v is not None and v != ""})
    return {"pitch": max(0.0, min(500.0, float(fx["pitch"]))),
            "formant": max(0.8, min(1.4, float(fx["formant"]))),
            "range": max(0.5, min(2.5, float(fx["range"])))}


def save_config(lang, model, voice, speed, fx=None):
    if lang not in DEFAULT_CONFIG or model not in MODELS or voice not in speaker_names(model):
        raise ValueError("bad voice")
    cfg = load_config()
    cfg[lang] = {"model": model, "voice": voice, "speed": max(0.6, min(1.5, float(speed))),
                 "fx": clean_fx(fx, cfg[lang].get("fx"))}
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    return cfg


def voice_for(lang, model=None, voice=None, speed=None, fx=None):
    c = load_config()[lang]
    model = model if model in MODELS else c["model"]
    voice = voice or c["voice"]
    speed = float(speed) if speed else c["speed"]
    return model, voice, max(0.6, min(1.5, speed)), clean_fx(fx, c.get("fx"))


def kidify(samples, sr, fx):
    """Cartoon / kid voice: raise pitch, shrink the vocal tract (formants), widen intonation."""
    if fx["pitch"] <= 0 and fx["formant"] == 1.0 and fx["range"] == 1.0:
        return samples
    import numpy as np
    import parselmouth
    from parselmouth.praat import call
    snd = parselmouth.Sound(np.asarray(samples, dtype=np.float64), sampling_frequency=sr)
    out = call(snd, "Change gender", 75, 600, fx["formant"], fx["pitch"], fx["range"], 1.0)
    y = out.values[0]
    peak = float(np.max(np.abs(y))) or 1.0
    return y * min(1.0, 0.95 / peak)


def synth(text, lang, model=None, voice=None, speed=None, fx=None):
    """WAV bytes. Arguments override the saved choice (used by the audition page)."""
    import numpy as np
    model, voice, speed, fx = voice_for(lang, model, voice, speed, fx)
    names = speaker_names(model)
    sid = names.index(voice) if voice in names else 0
    with _lock:  # one generation at a time; the engine is shared
        audio = _engine(model).generate(text, sid=sid, speed=speed)
    y = kidify(audio.samples, audio.sample_rate, fx)
    pcm = (np.clip(np.asarray(y), -1.0, 1.0) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(audio.sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


def cache_key(lang, model=None, voice=None, speed=None, fx=None):
    model, voice, speed, fx = voice_for(lang, model, voice, speed, fx)
    return f"local|{model}|{voice}|{speed:.2f}|{fx['pitch']:.0f}|{fx['formant']:.3f}|{fx['range']:.2f}"
