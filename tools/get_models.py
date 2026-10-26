"""Download the Kokoro TTS models used by localtts.py into models/ (Apache-2.0, from k2-fsa/sherpa-onnx).

usage: python tools/get_models.py [v1_0] [v1_1]     (default: v1_0 only – English)
"""
import os
import sys
import tarfile
import urllib.request

BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/"
MODELS = {"v1_0": "kokoro-int8-multi-lang-v1_0", "v1_1": "kokoro-int8-multi-lang-v1_1"}
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")


def main():
    wanted = sys.argv[1:] or ["v1_0"]
    os.makedirs(ROOT, exist_ok=True)
    for key in wanted:
        name = MODELS[key]
        if os.path.exists(os.path.join(ROOT, name, "model.int8.onnx")):
            print(f"{name}: already there")
            continue
        tmp = os.path.join(ROOT, name + ".tar.bz2")
        print(f"downloading {name} …")
        urllib.request.urlretrieve(BASE + name + ".tar.bz2", tmp)
        with tarfile.open(tmp) as t:
            t.extractall(ROOT, filter="data")
        os.remove(tmp)
        print(f"{name}: ok")


if __name__ == "__main__":
    main()
