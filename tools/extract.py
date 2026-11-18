#!/usr/bin/env python3
"""Crop every question of a Kangaroo PDF into its own image.
usage: extract.py --pdf F.pdf --pages 2-6 --id ksf2012 --cols 1 [--out ../bank] [--dpi 170]
Finds question numbers by OCR, crops number->next number, stitches page breaks."""
import argparse, csv, io, json, os, re, subprocess, sys, tempfile
import fitz
from PIL import Image

HDR = re.compile(r'(time|allowed|international|kangaroo|ksf|contest|level|ecolier|math|page|copyright|canguru|problems ecolier)', re.I)
FTR = re.compile(r'(\bof\b|nfp|copyright|canguru|level ecolier|page \d|mathkangaroo|\d+ of \d+)', re.I)
SEP = re.compile(r'^(section|problems? \d|\d ?points?( problems?)?$|\d ?point problems)', re.I)

def ocr(img):
    with tempfile.NamedTemporaryFile(suffix='.png') as f:
        img.save(f.name)
        out = subprocess.run(['tesseract', f.name, '-', '--psm', '11', 'tsv'],
                             capture_output=True, text=True).stdout
    rows = list(csv.DictReader(io.StringIO(out), delimiter='\t', quoting=csv.QUOTE_NONE))
    words = []
    for r in rows:
        if r.get('level') != '5' or not r['text'].strip(): continue
        try: conf = float(r['conf'])
        except: continue
        words.append(dict(t=r['text'].strip(), x=int(r['left']), y=int(r['top']), w=int(r['width']),
                          h=int(r['height']), c=conf, line=(r['block_num'], r['par_num'], r['line_num'])))
    return words

def ocr_strip(img, frac=.30, scale=2):
    W, H = img.size
    strip = img.crop((0, 0, int(W*frac), H)).resize((int(W*frac*scale), H*scale), Image.LANCZOS)
    with tempfile.NamedTemporaryFile(suffix='.png') as f:
        strip.save(f.name)
        out = subprocess.run(['tesseract', f.name, '-', '--psm', '11', '-c', 'tessedit_char_whitelist=0123456789.#', 'tsv'],
                             capture_output=True, text=True).stdout
    res = []
    for r in csv.DictReader(io.StringIO(out), delimiter='\t', quoting=csv.QUOTE_NONE):
        if r.get('level') != '5' or not r['text'].strip(): continue
        try: conf = float(r['conf'])
        except: continue
        res.append(dict(t=r['text'].strip(), x=int(r['left'])//scale, y=int(r['top'])//scale, w=int(r['width'])//scale,
                        h=int(r['height'])//scale, c=conf, line=('s', r['line_num'], r['word_num'])))
    return res

def analyse(img, cols, page=None, dpi=150):
    W, H = img.size
    words = ocr(img)
    if cols == 1: words = words + ocr_strip(img)
    if page is not None and len(page.get_text()) > 200:
        k = dpi/72
        for x0, y0, x1, y1, t, b, l, wn in page.get_text('words'):
            words.append(dict(t=t.strip(), x=int(x0*k), y=int(y0*k), w=int((x1-x0)*k), h=int((y1-y0)*k), c=95, line=('t', b, l)))
    cands, seps = [], []
    top_cut, bot_cut = int(.07*H), int(.93*H)
    lines = {}
    for w in words: lines.setdefault(w['line'], []).append(w)
    for ws in lines.values():
        ws.sort(key=lambda w: w['x'])
        txt = ' '.join(w['t'] for w in ws); y = min(w['y'] for w in ws); yb = max(w['y']+w['h'] for w in ws)
        if y < .14*H and HDR.search(txt) and len(txt) < 90 and not re.match(r'^#?\s*\d{1,2}[.,]\s', txt): top_cut = max(top_cut, yb+10)
        if y > .90*H and FTR.search(txt) and len(txt) < 90: bot_cut = min(bot_cut, y-6)
        if SEP.match(txt.strip()) and .06*H < y < .95*H: seps.append((ws[0]['x'], y))
    for w in words:
        m = re.fullmatch(r'#?\s*(\d{1,2})[.,]?', w['t']) or re.fullmatch(r'#?(\d{1,2})\.[A-Za-z].*', w['t'])
        if not m or w['c'] < 20: continue
        if not (.05*H < w['y'] < .93*H): continue
        xr = w['x']/W
        col = 0
        if cols == 2:
            if xr < .2: col = 0
            elif .46 < xr < .62: col = 1
            else: continue
        else:
            if xr > .22: continue
        cands.append(dict(n=int(m.group(1)), x=w['x'], y=w['y'], col=col, dot=('.' in w['t'])))
    uniq = []
    for c in sorted(cands, key=lambda c: (c['n'], c['y'])):
        if uniq and uniq[-1]['n'] == c['n'] and abs(uniq[-1]['y'] - c['y']) < 25: 
            if c['dot'] and not uniq[-1]['dot']: uniq[-1] = c
            continue
        uniq.append(c)
    cands = uniq
    dotted = {c['n'] for c in cands if c['dot']}
    cands = [c for c in cands if c['dot'] or c['n'] not in dotted]
    return dict(W=W, H=H, cands=cands, seps=seps, top=top_cut, bot=bot_cut)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf'); ap.add_argument('--pages'); ap.add_argument('--id')
    ap.add_argument('--cols', type=int, default=1); ap.add_argument('--out', default='../bank')
    ap.add_argument('--dpi', type=int, default=170); ap.add_argument('--maxq', type=int, default=24)
    ap.add_argument('--hdr1', type=float, default=0, help='page-1 header height fraction'); ap.add_argument('--fromtop', default=''); ap.add_argument('--shift', default=''); ap.add_argument('--manual', default=''); ap.add_argument('--skip', default='', help='question numbers to skip, comma list')
    a = ap.parse_args()
    doc = fitz.open(a.pdf)
    p0, p1 = [int(v) for v in a.pages.split('-')]
    imgs, info = [], []
    for pn in range(p0-1, p1):
        pix = doc[pn].get_pixmap(dpi=a.dpi, alpha=False)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        imgs.append(im); info.append(analyse(im, a.cols, doc[pn], a.dpi))
    # reading order + sequential assignment
    order = []
    for pi, inf in enumerate(info):
        for c in inf['cands']: order.append((pi, c['col'], c['y'], c))
    order.sort(key=lambda t: t[:3])
    seq = [t for t in order if 1 <= t[3]['n'] <= a.maxq]
    best = [1]*len(seq); prev = [-1]*len(seq)
    for i in range(len(seq)):
        for j in range(i):
            if seq[j][3]['n'] < seq[i][3]['n'] and best[j]+1 > best[i]: best[i] = best[j]+1; prev[i] = j
    anchors = {}
    if seq:
        i = max(range(len(seq)), key=lambda k: best[k])
        while i >= 0:
            pi, col, y, c = seq[i]; anchors[c['n']] = dict(p=pi, col=col, y=y, x=c['x']); i = prev[i]
    for mt in [t for t in a.manual.split(',') if t]:
        q_, pg_, y_ = mt.split(':'); anchors[int(q_)] = dict(p=int(pg_)-1, col=0, y=int(y_), x=100)
    for sh in [t for t in a.shift.split(',') if t]:
        n_, px = sh.split(':'); anchors[int(n_)]['y'] += int(px)
    if a.hdr1: info[0]['top'] = max(info[0]['top'], int(a.hdr1*info[0]['H']))
    fromtop = {int(t) for t in a.fromtop.split(',') if t}
    missing = [n for n in range(1, a.maxq+1) if n not in anchors]
    skip = {int(s) for s in a.skip.split(',') if s}
    os.makedirs(f'{a.out}/{a.id}', exist_ok=True)
    keyf = lambda n: (anchors[n]['p'], anchors[n]['col'], anchors[n]['y'])
    done = {}
    for n in sorted(anchors):
        an = anchors[n]; inf = info[an['p']]; H, W = inf['H'], inf['W']
        pieces = []
        def span(pi, col, y0):
            """bottom limit on page pi/col below y0"""
            f = info[pi]; lim = f['bot']
            for m, o in anchors.items():
                if m != n and o['p'] == pi and o['col'] == col and o['y'] > y0 + 5: lim = min(lim, o['y'] - 14)
            for sx, sy in f['seps']:
                colsep = 0 if (a.cols == 1 or sx < .4*f['W']) else 1
                if colsep == col and sy > y0 + 5: lim = min(lim, sy - 2)
            return lim
        def xrange_(pi, col):
            f = info[pi]
            return (0, f['W']) if a.cols == 1 else ((0, f['W']//2) if col == 0 else (f['W']//2 - 10, f['W']))
        y0 = inf['top'] if n in fromtop else max(an['y'] - 14, inf['top'] if an['y'] < inf['top'] else 0)
        lim = span(an['p'], an['col'], an['y'])
        x0, x1 = xrange_(an['p'], an['col'])
        pieces.append(imgs[an['p']].crop((x0, y0, x1, lim)))
        # continuation onto following page(s) (single column only)
        if lim >= inf['bot'] - 2 and a.cols == 1 and an['p'] + 1 < len(imgs):
            nxt = an['p'] + 1; f = info[nxt]
            first = min([o['y'] for o in anchors.values() if o['p'] == nxt] + [s[1] for s in f['seps']] + [f['bot']])
            if first - f['top'] > 70:
                pieces.append(imgs[nxt].crop((0, f['top'], f['W'], first - 4)))
        wmax = max(p.width for p in pieces); hsum = sum(p.height for p in pieces)
        canvas = Image.new('RGB', (wmax, hsum), 'white'); yy = 0
        for p in pieces: canvas.paste(p, (0, yy)); yy += p.height
        if canvas.width > 1000:
            canvas = canvas.resize((1000, int(canvas.height*1000/canvas.width)), Image.LANCZOS)
        if n not in skip:
            canvas.save(f'{a.out}/{a.id}/q{n:02d}.jpg', quality=82, optimize=True)
            done[n] = canvas.size
    json.dump(dict(id=a.id, found=sorted(done), missing=missing), sys.stdout)
    print()
if __name__ == '__main__': main()
