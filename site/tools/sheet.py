import sys, glob
from PIL import Image, ImageDraw
d = sys.argv[1]; out = sys.argv[2]
fs = sorted(glob.glob(f'{d}/q*.jpg'))
tw = 300; thumbs = []
for f in fs:
    im = Image.open(f); r = tw/im.width; im = im.resize((tw, max(30,int(im.height*r))))
    c = Image.new('RGB', (tw+4, im.height+18), 'white'); ImageDraw.Draw(c).text((2,2), f.split('/')[-1], fill='red'); c.paste(im,(2,16)); thumbs.append(c)
cols = 6; rows = [thumbs[i:i+cols] for i in range(0, len(thumbs), cols)]
H = sum(max(t.height for t in r) for r in rows); sheet = Image.new('RGB', (cols*(tw+4), H), (230,230,230)); y = 0
for r in rows:
    for i, t in enumerate(r): sheet.paste(t, (i*(tw+4), y))
    y += max(t.height for t in r)
sheet.save(out, quality=70)
