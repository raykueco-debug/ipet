"""Re-ingest every accepted grid in assets/source/ (e.g. after changing the slicer rules).

usage: python tools/rebuild_all.py

Grid files are named fox_<code>.png (fox_E4.png, fox_3-D07.png, fox_D01_expressions.png).
Derived *_alpha.png / *_flat.png files are regenerated, not used as inputs.
"""
import glob
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "assets", "source")

# GPT delivered these expression grids with cells 3 (smile) and 6 (playful) swapped
SWAPPED = {"E4", "E5", "E6"}  # drop each code once its fox-only redo is ingested (check order!)
# groups waiting for a fox-only redo: keep them out of the app until the new grid passes
PENDING = set()


def run(src, code):
    subprocess.run([sys.executable, "-I", os.path.join(HERE, "ingest.py"), src, code], check=True)


def main():
    jobs = []
    # E1 (fox-only redo) supersedes the original D01 sheet
    if not os.path.exists(os.path.join(SRC, "fox_E1.png")) and os.path.exists(os.path.join(SRC, "fox_D01_expressions.png")):
        jobs.append(("fox_D01_expressions.png", "D01"))
    for path in sorted(glob.glob(os.path.join(SRC, "fox_*.png"))):
        name = os.path.basename(path)
        m = re.fullmatch(r"fox_(E\d|\d-D\d\d)\.png", name)
        if m:
            jobs.append((name, m.group(1)))

    for name, code in jobs:
        if code in PENDING:
            continue
        run(os.path.join(SRC, name), code)
        if code in SWAPPED:
            d = os.path.join(ROOT, "assets", "fox", f"t{code[1:]}")
            a, b = os.path.join(d, "smile.png"), os.path.join(d, "playful.png")
            tmp = a + ".tmp"
            shutil.move(a, tmp)
            shutil.move(b, a)
            shutil.move(tmp, b)


if __name__ == "__main__":
    main()
