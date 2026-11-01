// El calcador que Claude corre en su contenedor: convierte una imagen bajada de la
// web en líneas (fondo normalizado, umbral, esqueleto, polilíneas) sobre una figura
// de matplotlib, a la que Claude le suma sus rótulos. Usa OpenCV y scikit-image,
// que están en el contenedor. Va dentro del prompt de sistema.
export const CALCAR_PY = String.raw`import numpy as np
import cv2
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from skimage.morphology import skeletonize

_VECINOS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def _esqueleto_a_lineas(esq):
    """Recorre el esqueleto (1 px de ancho) y lo parte en polilíneas."""
    ys, xs = np.nonzero(esq)
    pix = set(zip(ys.tolist(), xs.tolist()))
    vec = {p: [(p[0] + dy, p[1] + dx) for dy, dx in _VECINOS if (p[0] + dy, p[1] + dx) in pix] for p in pix}
    usados = set()
    lineas = []

    def caminar(a, b):
        linea = [a, b]
        usados.add((a, b)); usados.add((b, a))
        prev, cur = a, b
        while len(vec[cur]) == 2:
            sig = vec[cur][0] if vec[cur][0] != prev else vec[cur][1]
            if (cur, sig) in usados:
                break
            usados.add((cur, sig)); usados.add((sig, cur))
            linea.append(sig)
            prev, cur = cur, sig
        return linea

    nodos = [p for p in pix if len(vec[p]) != 2]
    for n in nodos:
        for v in vec[n]:
            if (n, v) not in usados:
                lineas.append(caminar(n, v))
    for p in pix:  # lazos cerrados, sin puntas
        for v in vec[p]:
            if (p, v) not in usados:
                lineas.append(caminar(p, v))
    return lineas


def _contornos(img, gris, esc, suave):
    """Modo contornos: bordes de las formas grandes y de las zonas de color, sin el
    sombreado fino (grabados con rayado, fotos, ilustraciones pintadas)."""
    color = img if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    color = cv2.resize(color, (gris.shape[1], gris.shape[0]), interpolation=cv2.INTER_CUBIC)
    k = max(3, int(round(suave * 4 * max(esc, 1))) | 1)
    liso = cv2.medianBlur(color, k)
    for _ in range(2):
        liso = cv2.bilateralFilter(liso, 9, 60, 9)
    g = cv2.cvtColor(liso, cv2.COLOR_BGR2GRAY)
    # el sombreado se vuelve un gris parejo; los bordes que quedan son los de las formas
    g = cv2.morphologyEx(g, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    bordes = cv2.Canny(g, 30, 90)
    sat = cv2.cvtColor(liso, cv2.COLOR_BGR2HSV)[:, :, 1]
    _, manchas = cv2.threshold(sat, 70, 255, cv2.THRESH_BINARY)
    manchas = cv2.morphologyEx(manchas, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    bordes = cv2.bitwise_or(bordes, cv2.morphologyEx(manchas, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)))
    # el contorno exterior de la figura, siempre
    _, figura = cv2.threshold(g, 235, 255, cv2.THRESH_BINARY_INV)
    figura = cv2.morphologyEx(figura, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    bordes = cv2.bitwise_or(bordes, cv2.morphologyEx(figura, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)))
    return cv2.dilate(bordes, np.ones((2, 2), np.uint8))


def calcar(ruta, ancho_px=1400, detalle=1.0, umbral=None, min_largo=10, invertir=False, colores=False,
           recorte=None, modo='lineas', suave=1.0, ancho_pulgadas=6, dpi=150, grosor=1.6):
    """Calca una imagen y devuelve (fig, ax): sus líneas como trazos de matplotlib, con el
    origen arriba a la izquierda y en píxeles de la imagen escalada. Sobre ax se pueden
    sumar rótulos (ax.text) y líneas.
    modo='lineas' (por defecto) para dibujos de línea, diagramas y planos: sigue cada trazo.
    modo='contornos' para grabados con sombreado, fotos e ilustraciones pintadas: deja los
    bordes de las formas y de las zonas de color, sin el rayado; suave > 1 limpia más.
    detalle < 1 simplifica más; umbral (0-255) fuerza el corte de lo oscuro; invertir para
    líneas claras sobre fondo oscuro; colores=True para diagramas con zonas pintadas;
    recorte=(x0, y0, x1, y1) en fracciones de la imagen, para quedarse con una parte."""
    img = cv2.imread(ruta, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError('no pude leer ' + ruta)
    if img.ndim == 3 and img.shape[2] == 4:  # transparencia: sobre blanco
        alfa = img[:, :, 3:4] / 255.0
        img = (img[:, :, :3] * alfa + 255 * (1 - alfa)).astype(np.uint8)
    if recorte:
        h, w = img.shape[:2]
        img = img[int(recorte[1] * h):int(recorte[3] * h), int(recorte[0] * w):int(recorte[2] * w)]
    if invertir:
        img = 255 - img
    gris = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    esc = ancho_px / gris.shape[1]
    gris = cv2.resize(gris, None, fx=esc, fy=esc, interpolation=cv2.INTER_AREA if esc < 1 else cv2.INTER_CUBIC)
    if modo == 'contornos':
        tinta = _contornos(img, gris, esc, suave)
    else:
        # el fondo (papel, sombras, manchas) se divide: queda blanco parejo y la tinta oscura
        fondo = cv2.morphologyEx(gris, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
        fondo = cv2.GaussianBlur(fondo, (0, 0), 9)
        plano = cv2.divide(gris, np.maximum(fondo, 1), scale=255)
        plano = cv2.GaussianBlur(plano, (3, 3), 0)
        if umbral is None:
            umbral, _ = cv2.threshold(plano, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            umbral = min(umbral, 215)
        _, tinta = cv2.threshold(plano, umbral, 255, cv2.THRESH_BINARY_INV)
        if colores:
            # diagramas con zonas de color: los bordes entre colores también son líneas
            bordes = cv2.Canny(cv2.GaussianBlur(gris, (5, 5), 0), 40, 120)
            tinta = cv2.bitwise_or(tinta, cv2.dilate(bordes, np.ones((2, 2), np.uint8)))
    if modo == 'contornos':
        min_largo = max(min_largo, 30)
    tinta = cv2.morphologyEx(tinta, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))  # une cortes chicos
    # sin las manchitas sueltas (a mano: remove_small_objects cambió de firma entre versiones)
    n, etiquetas, stats, _ = cv2.connectedComponentsWithStats((tinta > 0).astype(np.uint8), connectivity=8)
    grandes = np.zeros(n, bool)
    grandes[1:] = stats[1:, cv2.CC_STAT_AREA] > int(40 * esc + 10)
    esq = skeletonize(grandes[etiquetas])
    alto, ancho = gris.shape
    fig = plt.figure(figsize=(ancho_pulgadas, ancho_pulgadas * alto / ancho), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, ancho)
    ax.set_ylim(alto, 0)
    ax.set_aspect('equal')
    ax.axis('off')
    eps = 0.9 / max(detalle, 0.05)
    n = 0
    for linea in _esqueleto_a_lineas(esq):
        if len(linea) < min_largo:
            continue
        pts = np.array([[x, y] for y, x in linea], dtype=np.float32).reshape(-1, 1, 2)
        pts = cv2.approxPolyDP(pts, eps, False).reshape(-1, 2)
        if len(pts) >= 2:
            ax.plot(pts[:, 0], pts[:, 1], color='black', lw=grosor, solid_capstyle='round', solid_joinstyle='round')
            n += 1
    ax.set_title('')
    return fig, ax
`;
