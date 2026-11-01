// Pone un dibujo de Claude en la hoja como tinta: cada línea de la figura es un
// trazo y cada rótulo una caja de texto. No hay otra forma: el plugin no puede
// escribir archivos, así que insertImage con el PNG no está a mano.
//
// Sin probar en el equipo (01/11/2026): el grosor de un trazo (`thickness`)
// no está documentado; se toma el ancho de la lapicera elegida,
// que es la misma unidad que el penWidth de las figuras (mínimo 100).
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {t} from './textos.mjs';
import {pedirEscritura} from './captura';
import {aTextoPlano} from './matematica';

const MARGEN = 40;
const SEPARACION = 24;
const PRESION = 2048;
const POR_TANDA = 100;

// Dónde estaba la selección al tocar el botón: el dibujo va debajo.
export async function contexto() {
  const [ruta, pagina, lazo] = await Promise.all([
    PluginCommAPI.getCurrentFilePath(),
    PluginCommAPI.getCurrentPageNum(),
    PluginCommAPI.getLassoRect(),
  ]);
  if (!ruta?.success || !pagina?.success) {
    return null;
  }
  return {
    ruta: ruta.result,
    pagina: pagina.result,
    lazo: lazo?.success ? lazo.result : null,
  };
}

export async function insertarDibujo(dibujo, ctx) {
  if (!ctx) {
    throw new Error(t('noPage'));
  }
  await pedirEscritura();
  const tamRes = await PluginFileAPI.getPageSize(ctx.ruta, ctx.pagina);
  if (!tamRes?.success) {
    throw new Error(tamRes?.error?.message || t('cannotMeasurePage'));
  }
  const hoja = tamRes.result;
  const lugar = ubicar(dibujo, hoja, ctx.lazo);

  const lapicera = await PluginCommAPI.getPenInfo();
  const ancho = Math.max(100, lapicera?.success ? lapicera.result?.width || 200 : 200);

  // En una nota, el dibujo va a su capa, que queda activa: el lazo es por
  // área pero sólo toma la capa activa, así que agarra el dibujo y no lo que
  // había abajo. Si no hay lugar para otra capa, va a la que esté activa.
  const capa = /\.note$/i.test(ctx.ruta) ? await capaPropia(ctx).catch(() => null) : null;

  const elementos = [];
  try {
    for (const t of dibujo.trazos) {
      const res = await PluginCommAPI.createElement(0);
      if (!res?.success) {
        throw new Error(res?.error?.message || t('cannotCreateStroke'));
      }
      const el = res.result;
      elementos.push(el);
      const puntos = t.p.map(([x, y]) => lugar.punto(x, y));
      // las líneas finas de la figura (grilla, ejes 3D) van más finas
      // (y los contornos de las letras de una fórmula, que van con la fina)
      el.thickness =
        !t.glifo && t.g * lugar.escala >= 3 ? ancho : Math.max(100, Math.round(ancho / 2));
      el.stroke.penColor = t.c;
      el.stroke.penType = 10;
      await el.stroke.points.setRange(0, puntos.length - 1, puntos);
      await el.stroke.pressures.setRange(0, puntos.length - 1, puntos.map(() => PRESION));
    }
    for (let i = 0; i < elementos.length; i += POR_TANDA) {
      const res = await PluginCommAPI.insertPageElements(
        elementos.slice(i, i + POR_TANDA),
        ctx.pagina,
        capa,
      );
      if (!res?.success) {
        throw new Error(res?.error?.message || t('cannotInsertStrokes'));
      }
    }
  } finally {
    for (const el of elementos) {
      el.recycle?.();
    }
  }

  // Los rótulos, como cajas de texto (sólo en notas; en un PDF quedan afuera).
  let rotulos = 0;
  if (/\.note$/i.test(ctx.ruta)) {
    for (const t of dibujo.textos) {
      const [x0, y0] = lugar.puntoXY(t.x, t.base - t.alto + t.desc);
      const [x1, y1] = lugar.puntoXY(t.x + t.ancho, t.base + t.desc);
      const tam = Math.max(16, t.tam * lugar.escala);
      // un poco de aire: la letra de la tablet no mide lo mismo que la de matplotlib
      const textRect = {left: x0 - 4, top: y0 - 4, right: x1 + tam, bottom: y1 + 4};
      lugar.ampliar(textRect);
      const res = await PluginNoteAPI.insertText({
        textContentFull: aTextoPlano(t.t),
        textRect,
        fontSize: tam,
        textAlign: 0,
        textFrameWidthType: 1,
        textFrameStyle: 0,
        textEditable: 0,
      });
      if (res?.success) {
        rotulos++;
      }
    }
  }
  await PluginNoteAPI.saveCurrentNote?.();

  // Queda seleccionado, para moverlo si pisa algo. Sin capa propia, lo que
  // había abajo también entra.
  const caja = lugar.caja();
  const seleccionado = await PluginCommAPI.lassoElements({
    left: Math.max(0, Math.floor(caja.left - 8)),
    top: Math.max(0, Math.floor(caja.top - 8)),
    right: Math.min(hoja.width, Math.ceil(caja.right + 8)),
    bottom: Math.min(hoja.height, Math.ceil(caja.bottom + 8)),
  }).catch(() => null);
  return {trazos: elementos.length, rotulos, seleccionado: !!seleccionado?.success, capa};
}

const CAPA = 'SuperClaude';

// La capa "SuperClaude" de la página (la crea si falta, en el primer lugar
// libre: una página tiene Main y hasta tres más) y la deja activa. Devuelve
// su número, o null si no hay lugar.
async function capaPropia(ctx) {
  await PluginNoteAPI.saveCurrentNote?.();
  const leer = async () => {
    const res = await PluginFileAPI.getLayers(ctx.ruta, ctx.pagina);
    if (!res?.success || !Array.isArray(res.result)) {
      throw new Error(res?.error?.message || 'getLayers');
    }
    return res.result;
  };
  let capas = await leer();
  let mia = capas.find(c => c.name === CAPA);
  if (!mia) {
    const libre = [1, 2, 3].find(id => !capas.some(c => c.layerId === id));
    if (libre == null) {
      return null;
    }
    const res = await PluginFileAPI.insertLayer(ctx.ruta, ctx.pagina, {
      layerId: libre,
      name: CAPA,
      isCurrentLayer: true,
      isVisible: true,
    });
    if (!res?.success || res.result === false) {
      return null;
    }
    capas = await leer();
    mia = capas.find(c => c.name === CAPA);
    if (!mia) {
      return null;
    }
  }
  if (!mia.isCurrentLayer || !mia.isVisible) {
    const res = await PluginFileAPI.modifyLayers(
      ctx.ruta,
      ctx.pagina,
      capas.map(c => ({
        layerId: c.layerId,
        name: c.name,
        isCurrentLayer: c.layerId === mia.layerId,
        isVisible: c.layerId === mia.layerId ? true : c.isVisible !== false,
      })),
    );
    if (!res?.success || res.result === false) {
      return null;
    }
  }
  await PluginCommAPI.reloadFile?.().catch(() => null);
  return mia.layerId;
}

// Recorta la figura a lo que tiene dibujado y la acomoda debajo de la
// selección, a lo ancho de media hoja; si no entra abajo, la sube.
function ubicar(dibujo, hoja, lazo) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ver = (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  dibujo.trazos.forEach(t => t.p.forEach(([x, y]) => ver(x, y)));
  dibujo.textos.forEach(t => {
    ver(t.x, t.base - t.alto);
    ver(t.x + t.ancho, t.base + t.desc);
  });
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const anchoMax = Math.min(hoja.width * 0.6, hoja.width - 2 * MARGEN);
  const altoMax = hoja.height * 0.45;
  // tope: un renglón corto no se estira a media hoja con letra gigante (la
  // figura sale a 150 dpi; 1,4 la deja cerca del tamaño de la letra a mano)
  const escala = Math.min(anchoMax / w, altoMax / h, 1.4);
  const W = w * escala;
  const H = h * escala;
  let left = lazo ? lazo.left : MARGEN;
  let top = lazo ? lazo.bottom + SEPARACION : MARGEN;
  left = Math.min(Math.max(MARGEN, left), hoja.width - MARGEN - W);
  if (top + H > hoja.height - MARGEN) {
    top = Math.max(MARGEN, hoja.height - MARGEN - H);
  }
  // lo que de verdad se insertó, para seleccionarlo después (las cajas de
  // texto llevan aire de más: ver insertText arriba)
  const usado = {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity};
  const puntoXY = (x, y) => {
    const p = [left + (x - minX) * escala, top + (y - minY) * escala];
    usado.left = Math.min(usado.left, p[0] - 6);
    usado.right = Math.max(usado.right, p[0] + 6);
    usado.top = Math.min(usado.top, p[1] - 6);
    usado.bottom = Math.max(usado.bottom, p[1] + 6);
    return p;
  };
  return {
    escala,
    puntoXY,
    caja: () => usado,
    ampliar: (r) => {
      usado.left = Math.min(usado.left, r.left);
      usado.top = Math.min(usado.top, r.top);
      usado.right = Math.max(usado.right, r.right);
      usado.bottom = Math.max(usado.bottom, r.bottom);
    },
    punto: (x, y) => {
      const [px, py] = puntoXY(x, y);
      return {x: Math.round(px), y: Math.round(py)};
    },
  };
}
