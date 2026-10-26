"""Quick QA for a GPT grid: report alpha stats and write a preview on blue."""
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
h = im.getchannel("A").histogram()
total = sum(h)
print(im.size, "transparent %.0f%%" % (100 * h[0] / total), "opaque %.0f%%" % (100 * sum(h[240:]) / total),
      "REAL ALPHA" if h[0] / total > 0.2 else "NO ALPHA (reject)")
bg = Image.new("RGBA", im.size, (120, 200, 255, 255))
bg.alpha_composite(im)
bg.convert("RGB").resize((im.width // 2, im.height // 2)).save(out)
