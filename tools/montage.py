import sys
from PIL import Image, ImageDraw
out = sys.argv[1]; items = sys.argv[2:]; cols = 2; W = 760
tiles = []
for it in items:
    pid, n = it.split(':'); im = Image.open(f'../bank/{pid}/q{int(n):02d}.jpg').convert('RGB')
    im = im.resize((W, int(im.height*W/im.width))); c = Image.new('RGB', (W+8, im.height+24), 'white')
    ImageDraw.Draw(c).text((4,4), f'{pid} Q{n}', fill='red'); c.paste(im, (4, 22)); tiles.append(c)
rows = [tiles[i:i+cols] for i in range(0, len(tiles), cols)]
H = sum(max(t.height for t in r) for r in rows); sh = Image.new('RGB', (cols*(W+8), H), (210,210,210)); y = 0
for r in rows:
    for i, t in enumerate(r): sh.paste(t, (i*(W+8), y))
    y += max(t.height for t in r)
sh.save(out, quality=85)
