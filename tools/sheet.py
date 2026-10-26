"""Contact sheet of every sprite in a folder (dark bg) for a quick visual check."""
import os, sys
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
files = sorted(f for f in os.listdir(d) if f.endswith(".png"))
if "home.png" in files:
    files.remove("home.png"); files.insert(0, "home.png")
cols = 3
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (512 * cols, 512 * rows), (40, 40, 60))
for i, f in enumerate(files):
    im = Image.open(os.path.join(d, f))
    sheet.paste(im, ((i % cols) * 512, (i // cols) * 512), im)
sheet.resize((256 * cols, 256 * rows)).save(out)
print(files)
