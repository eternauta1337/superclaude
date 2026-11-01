"""Dibuja un .trazos.json (lo que se insertaría en la hoja) como PNG, para mirarlo en la compu.

    python scripts/ver-trazos.py muestra-dibujo-1.trazos.json salida.png

Necesita Pillow. Sirve para comparar con el PNG que hizo Claude: si coinciden, la tablet recibe
lo mismo (salvo el grosor y la letra, que pone ella).
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

d = json.load(open(sys.argv[1]))
im = Image.new('RGB', (int(d['ancho']), int(d['alto'])), 'white')
dr = ImageDraw.Draw(im)
for t in d['trazos']:
    dr.line([tuple(p) for p in t['p']], fill=(t['c'],) * 3, width=max(1, round(t['g'])))
for t in d['textos']:
    try:
        f = ImageFont.truetype('DejaVuSans.ttf', max(8, int(t['tam'])))
    except OSError:
        f = ImageFont.load_default()
    dr.text((t['x'], t['base'] - t['alto'] + t['desc']), t['t'], fill='black', font=f)
im.save(sys.argv[2])
