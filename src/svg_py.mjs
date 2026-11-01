// El lector de SVG que Claude corre en su contenedor: convierte un SVG escrito a mano
// en una figura de matplotlib (sólo contornos y textos, como queda en la hoja), que
// después pasa por exportar_trazos como cualquier dibujo. En el contenedor no hay
// librerías de SVG (ni svgpathtools ni cairosvg): por eso es propio, con lxml.
// Va dentro del prompt de sistema.
export const SVG_PY = String.raw`import re, math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch
from matplotlib.transforms import Affine2D
from lxml import etree

_NUM = re.compile(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
_HEREDA = ('stroke', 'fill', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight',
           'text-anchor', 'font-family', 'font-style', 'opacity', 'stroke-opacity')


def _nums(s):
    return [float(x) for x in _NUM.findall(s or '')]


def _transform(s):
    t = Affine2D()
    for nombre, args in re.findall(r'(\w+)\s*\(([^)]*)\)', s or ''):
        a = _nums(args)
        if nombre == 'matrix' and len(a) == 6:
            m = Affine2D(np.array([[a[0], a[2], a[4]], [a[1], a[3], a[5]], [0, 0, 1]]))
        elif nombre == 'translate':
            m = Affine2D().translate(a[0], a[1] if len(a) > 1 else 0)
        elif nombre == 'scale':
            m = Affine2D().scale(a[0], a[1] if len(a) > 1 else a[0])
        elif nombre == 'rotate':
            m = Affine2D().rotate_deg_around(a[1], a[2], a[0]) if len(a) == 3 else Affine2D().rotate_deg(a[0])
        elif nombre == 'skewX':
            m = Affine2D().skew_deg(a[0], 0)
        elif nombre == 'skewY':
            m = Affine2D().skew_deg(0, a[0])
        else:
            continue
        t = m + t  # SVG aplica de derecha a izquierda
    return t


def _estilo(el, padre):
    e = dict(padre)
    for k in _HEREDA:
        if el.get(k) is not None:
            e[k] = el.get(k)
    for decl in (el.get('style') or '').split(';'):
        if ':' in decl:
            k, v = decl.split(':', 1)
            if k.strip() in _HEREDA:
                e[k.strip()] = v.strip()
    return e


def _arco(x0, y0, rx, ry, fi, grande, barrido, x, y):
    """Arco elíptico de SVG como puntos (sin el inicial)."""
    if rx == 0 or ry == 0:
        return [(x, y)]
    fi = math.radians(fi)
    c, s = math.cos(fi), math.sin(fi)
    dx, dy = (x0 - x) / 2, (y0 - y) / 2
    x1, y1 = c * dx + s * dy, -s * dx + c * dy
    rx, ry = abs(rx), abs(ry)
    lam = x1 ** 2 / rx ** 2 + y1 ** 2 / ry ** 2
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1 ** 2 - ry ** 2 * x1 ** 2
    den = rx ** 2 * y1 ** 2 + ry ** 2 * x1 ** 2
    k = math.sqrt(max(0, num / den)) if den else 0
    if grande == barrido:
        k = -k
    cx1, cy1 = k * rx * y1 / ry, -k * ry * x1 / rx
    cx, cy = c * cx1 - s * cy1 + (x0 + x) / 2, s * cx1 + c * cy1 + (y0 + y) / 2
    ang = lambda ux, uy, vx, vy: math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if not barrido and dt > 0:
        dt -= 2 * math.pi
    elif barrido and dt < 0:
        dt += 2 * math.pi
    n = max(4, int(abs(dt) / (math.pi / 16)))
    pts = []
    for i in range(1, n + 1):
        t = t1 + dt * i / n
        px, py = rx * math.cos(t), ry * math.sin(t)
        pts.append((c * px - s * py + cx, s * px + c * py + cy))
    return pts


def _path_d(d):
    toks = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]|' + _NUM.pattern, d or '')
    v, cod = [], []
    i, cmd = 0, None
    x = y = sx = sy = 0.0
    ultimo_c = ultimo_q = None

    def tomar(n):
        nonlocal i
        a = [float(t) for t in toks[i:i + n]]
        i += n
        return a

    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]):
            cmd = toks[i]
            i += 1
            if cmd in 'Zz':
                if v:
                    v.append((sx, sy)); cod.append(Path.CLOSEPOLY)
                x, y = sx, sy
                ultimo_c = ultimo_q = None
                continue
        if cmd is None:
            break
        rel = cmd.islower()
        C = cmd.upper()
        ox, oy = (x, y) if rel else (0.0, 0.0)
        if C == 'M':
            a = tomar(2); x, y = a[0] + ox, a[1] + oy; sx, sy = x, y
            v.append((x, y)); cod.append(Path.MOVETO)
            cmd = 'l' if rel else 'L'
            ultimo_c = ultimo_q = None
        elif C == 'L':
            a = tomar(2); x, y = a[0] + ox, a[1] + oy
            v.append((x, y)); cod.append(Path.LINETO); ultimo_c = ultimo_q = None
        elif C == 'H':
            a = tomar(1); x = a[0] + (x if rel else 0)
            v.append((x, y)); cod.append(Path.LINETO); ultimo_c = ultimo_q = None
        elif C == 'V':
            a = tomar(1); y = a[0] + (y if rel else 0)
            v.append((x, y)); cod.append(Path.LINETO); ultimo_c = ultimo_q = None
        elif C in 'CS':
            if C == 'C':
                a = tomar(6); c1 = (a[0] + ox, a[1] + oy); c2 = (a[2] + ox, a[3] + oy); p = (a[4] + ox, a[5] + oy)
            else:
                a = tomar(4)
                c1 = (2 * x - ultimo_c[0], 2 * y - ultimo_c[1]) if ultimo_c else (x, y)
                c2 = (a[0] + ox, a[1] + oy); p = (a[2] + ox, a[3] + oy)
            v += [c1, c2, p]; cod += [Path.CURVE4] * 3
            ultimo_c, ultimo_q = c2, None; x, y = p
        elif C in 'QT':
            if C == 'Q':
                a = tomar(4); q = (a[0] + ox, a[1] + oy); p = (a[2] + ox, a[3] + oy)
            else:
                a = tomar(2)
                q = (2 * x - ultimo_q[0], 2 * y - ultimo_q[1]) if ultimo_q else (x, y)
                p = (a[0] + ox, a[1] + oy)
            v += [q, p]; cod += [Path.CURVE3] * 2
            ultimo_q, ultimo_c = q, None; x, y = p
        elif C == 'A':
            a = tomar(7)
            px, py = a[5] + ox, a[6] + oy
            for q in _arco(x, y, a[0], a[1], a[2], bool(a[3]), bool(a[4]), px, py):
                v.append(q); cod.append(Path.LINETO)
            x, y = px, py; ultimo_c = ultimo_q = None
        else:
            i += 1
    if not v:
        return None
    if cod[0] != Path.MOVETO:
        cod[0] = Path.MOVETO
    return Path(v, cod)


def _elipse(cx, cy, rx, ry):
    t = np.linspace(0, 2 * np.pi, 73)
    return Path(np.c_[cx + rx * np.cos(t), cy + ry * np.sin(t)], closed=True)


def _forma(tag, el):
    g = lambda k, d=0.0: float(_nums(el.get(k))[0]) if _nums(el.get(k)) else d
    if tag == 'path':
        return _path_d(el.get('d'))
    if tag == 'rect':
        x, y, w, h = g('x'), g('y'), g('width'), g('height')
        rx = g('rx', g('ry')); ry = g('ry', rx)
        if rx or ry:
            rx, ry = min(rx, w / 2), min(ry, h / 2)
            d = (f'M{x+rx},{y} H{x+w-rx} A{rx},{ry} 0 0 1 {x+w},{y+ry} V{y+h-ry} A{rx},{ry} 0 0 1 {x+w-rx},{y+h} '
                 f'H{x+rx} A{rx},{ry} 0 0 1 {x},{y+h-ry} V{y+ry} A{rx},{ry} 0 0 1 {x+rx},{y} Z')
            return _path_d(d)
        return Path([(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)], closed=True)
    if tag == 'circle':
        return _elipse(g('cx'), g('cy'), g('r'), g('r'))
    if tag == 'ellipse':
        return _elipse(g('cx'), g('cy'), g('rx'), g('ry'))
    if tag == 'line':
        return Path([(g('x1'), g('y1')), (g('x2'), g('y2'))])
    if tag in ('polyline', 'polygon'):
        n = _nums(el.get('points'))
        pts = list(zip(n[0::2], n[1::2]))
        if len(pts) < 2:
            return None
        if tag == 'polygon':
            pts.append(pts[0])
        return Path(pts)
    return None


def _color(c):
    if not c or c in ('none', 'transparent'):
        return None
    if c.startswith('url('):
        return None
    return c


def svg_a_figura(svg, ancho_pulgadas=6, dpi=150):
    """Convierte un SVG (texto) en una figura de matplotlib: sólo contornos y textos,
    como va a quedar en la hoja. Después: fig.savefig(png) y exportar_trazos(fig, NOMBRE)."""
    raiz = etree.fromstring(svg.encode() if isinstance(svg, str) else svg)
    vb = _nums(raiz.get('viewBox'))
    if len(vb) != 4:
        vb = [0, 0, _nums(raiz.get('width'))[0], _nums(raiz.get('height'))[0]]
    x0, y0, W, H = vb
    fig = plt.figure(figsize=(ancho_pulgadas, ancho_pulgadas * H / W), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(x0, x0 + W)
    ax.set_ylim(y0 + H, y0)
    ax.set_aspect('equal')
    ax.axis('off')
    pt = ancho_pulgadas * 72 / W  # puntos por unidad del SVG
    defs = {}
    for el in raiz.iter():
        if isinstance(el.tag, str) and el.get('id'):
            defs[el.get('id')] = el

    def recorrer(el, t, e):
        if not isinstance(el.tag, str):
            return
        tag = etree.QName(el).localname
        if tag in ('defs', 'style', 'title', 'desc', 'metadata', 'clipPath', 'mask', 'marker', 'symbol', 'linearGradient', 'radialGradient', 'pattern'):
            return
        t = _transform(el.get('transform')) + t
        e = _estilo(el, e)
        if tag == 'use':
            ref = el.get('href') or el.get('{http://www.w3.org/1999/xlink}href') or ''
            obj = defs.get(ref.lstrip('#'))
            if obj is not None:
                tt = Affine2D().translate(float(el.get('x', 0)), float(el.get('y', 0))) + t
                recorrer(obj, tt, e)
            return
        if tag in ('svg', 'g', 'a'):
            for h in el:
                recorrer(h, t, e)
            return
        escala = math.sqrt(abs(np.linalg.det(t.get_matrix()[:2, :2]))) or 1
        if tag == 'text':
            texto = ' '.join(s.strip() for s in el.itertext() if s.strip())
            if not texto:
                return
            xs, ys = _nums(el.get('x')), _nums(el.get('y'))
            if not xs:
                hijo = next((h for h in el if isinstance(h.tag, str) and h.get('x')), None)
                if hijo is not None:
                    xs, ys = _nums(hijo.get('x')), _nums(hijo.get('y'))
            px, py = t.transform((xs[0] if xs else 0, ys[0] if ys else 0))
            tam = float(_nums(e.get('font-size', '16'))[0]) * escala * pt
            ha = {'middle': 'center', 'end': 'right'}.get(e.get('text-anchor'), 'left')
            color = _color(e.get('fill', 'black')) or _color(e.get('stroke')) or 'black'
            negrita = e.get('font-weight') in ('bold', '600', '700', '800', '900')
            mono = 'mono' in (e.get('font-family') or '')
            ax.text(px, py, texto, fontsize=tam, ha=ha, va='baseline', color=color,
                    fontweight='bold' if negrita else 'normal', family='monospace' if mono else 'sans-serif')
            return
        forma = _forma(tag, el)
        if forma is None:
            return
        forma = forma.transformed(t)
        trazo = _color(e.get('stroke'))
        relleno = _color(e.get('fill', 'black'))
        ancho = float(_nums(e.get('stroke-width', '1'))[0]) if _nums(e.get('stroke-width', '1')) else 1.0
        if trazo is None:
            if relleno is None:
                return
            trazo, ancho = relleno, 1.0  # en la hoja no hay rellenos: queda el contorno
        lw = max(0.3, ancho * escala * pt)
        estilo = 'solid'
        guiones = _nums(e.get('stroke-dasharray')) if e.get('stroke-dasharray') not in (None, 'none') else []
        if guiones and sum(guiones) > 0:
            if len(guiones) % 2:
                guiones = guiones * 2
            estilo = (0, [max(0.1, g * escala * pt / lw) for g in guiones])
        ax.add_patch(PathPatch(forma, facecolor='none', edgecolor=trazo, lw=lw, linestyle=estilo,
                               capstyle='round', joinstyle='round'))

    recorrer(raiz, Affine2D(), {'stroke': None, 'fill': 'black'})
    return fig
`;
