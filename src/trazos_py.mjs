// El código que Claude corre en su contenedor después de dibujar: recorre la
// figura de matplotlib con un renderer propio y guarda cada línea como una
// polilínea y cada rótulo como texto, en píxeles de la figura (origen arriba a
// la izquierda). El plugin los convierte en trazos de tinta de la hoja.
// Va dentro del prompt de sistema. Para mirar lo que devuelve, desde la compu:
// scripts/probar-claude.mjs guarda el .trazos.json y scripts/ver-trazos.py lo dibuja.
export const TRAZOS_PY = String.raw`import json, os
import matplotlib
from matplotlib.backend_bases import RendererBase, GraphicsContextBase
from matplotlib.backends.backend_agg import RendererAgg
from matplotlib.path import Path
from matplotlib.textpath import TextToPath
from matplotlib.transforms import Affine2D

class _Grabador(RendererBase):
    def __init__(self, fig):
        super().__init__()
        self.dpi = fig.dpi
        self.w, self.h = fig.bbox.width, fig.bbox.height
        self._agg = RendererAgg(int(self.w), int(self.h), self.dpi)
        self.trazos, self.textos = [], []

    def get_canvas_width_height(self):
        return self.w, self.h

    def points_to_pixels(self, p):
        return p * self.dpi / 72

    def get_text_width_height_descent(self, s, prop, ismath):
        return self._agg.get_text_width_height_descent(s, prop, ismath)

    def new_gc(self):
        return GraphicsContextBase()

    def option_image_nocomposite(self):
        return True

    def draw_image(self, gc, x, y, im):
        pass

    def _gris(self, rgba, alfa=1.0):
        if len(rgba) > 3 and rgba[3] * alfa < 0.15:
            return None
        l = 0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2]
        return None if l > 0.93 else 0 if l < 0.35 else 157 if l < 0.7 else 201

    def draw_path(self, gc, path, transform, rgbFace=None):
        lw = gc.get_linewidth()
        color = self._gris(gc.get_rgb(), gc.get_alpha() if gc.get_alpha() is not None else 1.0)
        if lw <= 0 or color is None:
            return
        caja = gc.get_clip_rectangle()
        self._dashes = gc.get_dashes()
        for poly in path.to_polygons(transform, closed_only=False):
            tramo = []
            for x, y in poly:
                adentro = caja is None or (caja.x0 - 1 <= x <= caja.x1 + 1 and caja.y0 - 1 <= y <= caja.y1 + 1)
                if adentro:
                    tramo.append([round(float(x), 1), round(float(self.h - y), 1)])
                elif tramo:
                    self._guardar(tramo, lw, color)
                    tramo = []
            self._guardar(tramo, lw, color)

    def _guardar(self, pts, lw, color):
        if len(pts) < 2:
            return
        for tramo in self._rayar(pts):
            if len(tramo) >= 2:
                self.trazos.append({'p': tramo, 'g': round(self.points_to_pixels(lw), 2), 'c': color})

    def _rayar(self, pts):
        """Corta la polilínea según el patrón de guiones del gc (to_polygons lo ignora)."""
        offset, patron = self._dashes
        if not patron:
            return [pts]
        patron = [max(self.points_to_pixels(d), 0.5) for d in patron]
        tramos, actual, i, resto, pinta = [], [pts[0]], 0, patron[0], True
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            largo = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
            hecho = 0.0
            while largo - hecho > resto:
                hecho += resto
                t = hecho / largo
                p = [round(x0 + (x1 - x0) * t, 1), round(y0 + (y1 - y0) * t, 1)]
                if pinta:
                    actual.append(p)
                    tramos.append(actual)
                actual = [p]
                pinta = not pinta
                i = (i + 1) % len(patron)
                resto = patron[i]
            resto -= largo - hecho
            if pinta:
                actual.append([x1, y1])
            else:
                actual = [[x1, y1]]
        if pinta and len(actual) >= 2:
            tramos.append(actual)
        return tramos

    def draw_text(self, gc, x, y, s, prop, angle, ismath=False, mtext=None):
        color = self._gris(gc.get_rgb())
        if color is None or not s.strip():
            return
        if ismath:
            # una fórmula ($...$) va armada, como tinta: el contorno de cada glifo es un trazo
            t2p = TextToPath()
            verts, codes = t2p.get_text_path(prop, s, ismath=True)
            tam = self.points_to_pixels(prop.get_size_in_points())
            k = tam / t2p.FONT_SCALE
            # el contorno, trazado con la mitad del ancho de un palo de la letra, la rellena
            grosor = tam * 0.045
            transform = Affine2D().scale(k).rotate_deg(angle).translate(x, self.h - y)
            for poly in Path(verts, codes).to_polygons(transform, closed_only=False):
                pts = [[round(float(px), 1), round(float(self.h - py), 1)] for px, py in poly]
                if len(pts) >= 2:
                    self.trazos.append({'p': pts + [pts[0]], 'g': round(grosor, 2), 'c': color, 'glifo': True})
            return
        ancho, alto, desc = self.get_text_width_height_descent(s, prop, ismath)
        # con flipy() (el default) matplotlib ya pasa la y del texto desde arriba
        self.textos.append({'x': round(float(x), 1), 'base': round(float(y), 1),
                            't': s, 'tam': round(self.points_to_pixels(prop.get_size_in_points()), 1),
                            'ancho': round(float(ancho), 1), 'alto': round(float(alto), 1),
                            'desc': round(float(desc), 1), 'ang': float(angle)})

def exportar_trazos(fig, nombre):
    """Guarda <nombre>.trazos.json en $OUTPUT_DIR, al lado de <nombre>.png."""
    fig.canvas.draw()
    g = _Grabador(fig)
    fig.draw(g)
    ruta = os.path.join(os.environ.get('OUTPUT_DIR', '.'), nombre + '.trazos.json')
    with open(ruta, 'w') as f:
        json.dump({'ancho': g.w, 'alto': g.h, 'trazos': g.trazos, 'textos': g.textos}, f)
    return ruta
`;
