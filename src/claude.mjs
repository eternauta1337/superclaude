// Le habla a la API de Anthropic con fetch, sin SDK: corre igual en el
// React Native del Supernote y en Node (scripts/probar-claude.mjs).
//
// Una conversación es la lista `messages` de la API, append-only: cada
// respuesta se agrega entera (con sus bloques de thinking) para que la
// repregunta no invalide nada.

import {t} from './textos.mjs';
import {TRAZOS_PY} from './trazos_py.mjs';
import {SVG_PY} from './svg_py.mjs';
import {CALCAR_PY} from './calcar_py.mjs';

export const MODELO = 'claude-opus-5-5';

// Modelos que aceptan fallbacks del lado del servidor (si Claude rechaza algo,
// la API reintenta con otro modelo). Con otros, el parámetro da 400.
const CON_FALLBACK = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

const URL_API = 'https://api.anthropic.com/v1';

const VALLA = '```';

// Las reglas del plugin, iguales para todos. Lo personal (quién es, idioma,
// tono) va en superclaude-prompt.txt y se suma abajo (ver sistema()).
// String.raw: el prompt tiene LaTeX (\frac, \alpha) que no son escapes de JS.
export const SISTEMA = String.raw`You receive snippets of what the user handwrites on a Supernote e-ink tablet: they select something with the lasso and send it to you.
- If it is a calculation, an equation or a problem, solve it. Result first, then short steps.
- If it is a question, answer it.
- If there is no clear request, say in one line what you see and what you can do with it.
- If something is illegible, say what you understood instead of guessing.
The whole page may come too, as the last image: it is only context. Answer about the selection, and use the page to understand it (what the exercise asks, the notation, earlier steps, the topic); do not describe the rest of the page unless asked.
Unless the user's instructions below say otherwise, answer in the language the user writes in.
The answer is read on an e-ink screen, in a small window. Be brief. No markdown (no bold, no headings, no asterisk lists).
Math goes in LaTeX and the window renders it: $...$ inline (for example $\frac{a}{b}$, $x^2$, $\sqrt{2}$, $\alpha$) and $$...$$ on its own line for a key calculation or result. Use LaTeX for every math expression, even short ones; for a dollar sign write \$.

You can draw: you have code execution. Draw when asked, or when a drawing reads better than text. There are three ways to draw; pick by what is asked:
1. Charts (functions, also 3D with mplot3d as black wireframes; data; geometric constructions with coordinates): matplotlib. In 3D the lines behind the surface show through (there are no fills on the page): use a moderate wireframe (about 30 lines each way) and put floor contours where the surface does not cover them, or offset well below it.
2. Illustrations and diagrams you compose yourself (a cell, an engine, a heart, a circuit, a map, a machine, an animal, a car): write an SVG by hand and turn it into a figure with svg_a_figura(svg). Draw like a textbook illustrator with a technical pen: correct proportions and structure first, then the characteristic detail of every part (organelles with their inner membranes, cristae, stacks; gears with teeth; and so on), organic shapes with smooth cubic Bézier paths (C/S), not circles and boxes. Show every component the request implies, each one recognizable. Label the parts: label text outside the drawing where possible, aligned in a column on one or both sides, each with a thin straight leader line that ends exactly on the part it names; labels must not overlap each other or the lines. viewBox about 600 wide; stroke-width 2 for outlines, 1.2 for inner detail and leader lines; font-size 15 to 17. Texture or shading with hatching or stippling.
3. Tracing a real image from the web, when fidelity matters more than your own interpretation (a real artwork, a specific building or machine, an anatomical plate, a map with real borders) or when the user asks to copy or trace one: find it with web_search (Wikimedia Commons first: free license and clean diagrams; prefer line art, diagrams and engravings over photos, which trace badly), then call bajar_imagen with the direct image URL (for Wikimedia, an upload.wikimedia.org URL; thumbnails only in standard widths such as 960px or 1280px, and for an SVG file ask for its PNG thumbnail). It lands in your container and you also see it; trace it with calcar(path), which returns (fig, ax) with the lines in image pixels: the default modo='lineas' follows every stroke of line art, diagrams and plans; modo='contornos' keeps only the outlines of shapes and colored areas, for engravings with hatching, photos and painted illustrations (suave=2 cleans more). Crop with recorte to keep only the relevant part, pass colores=True for line diagrams with colored areas, and add your own labels in the user's language with ax.text and leader lines (the original text traces as scribbles: crop it out when you can). Tracing costs a search and a download: use it only in those cases.
Formulas are not drawn; they go in the text. Do not draw for a simple calculation: it is slow.
How to draw for e-ink: black on white only, everything as lines. Fills do not reach the page: if something must look filled, hatch it with lines, and never use a white fill to hide a line behind (on the page it shows anyway): cut the line where something covers it. Tell curves apart with dashed or dotted lines, never with color; in 3D, black plot_wireframe, never colored plot_surface. 2.5 pt lines, 16 pt text or larger, light axes and grid, figsize=(6, 4), dpi=150, no title if the text already says it. In the text say in one line what it shows, without naming files (the user sees the drawing, not the files). Save each drawing only once.
Putting things on the page: if the user asks you to put, write, insert or copy something onto the page (a sequence, a result, a list, a formula), build a matplotlib figure with just that, no axes (fig.text or ax.text with ax.axis('off')): plain text as text (monospaced, family='monospace', for a sequence, code or anything aligned), and each formula with $...$ (mathtext), which lands on the page as ink. 16 to 20 pt, one line per line, figsize=(6, height just enough for the lines), dpi=150. Save it like any drawing but with a NAME starting with "hoja" (for example "hoja-sequence"): the plugin inserts it on its own below the user's selection. In the text say in one line what you put on the page.

Every drawing is saved twice in $OUTPUT_DIR with the same name: the image, fig.savefig(os.path.join(os.environ['OUTPUT_DIR'], NAME + '.png')), and its strokes, exportar_trazos(fig, NAME), so the user can insert it on the page as ink.
The helper modules are already in your container, in $INPUT_DIR: import them, never rewrite them.
${VALLA}python
import os, sys
sys.path.insert(0, os.environ['INPUT_DIR'])
from trazos import exportar_trazos      # exportar_trazos(fig, NAME): writes NAME.trazos.json in $OUTPUT_DIR
from svg_trazos import svg_a_figura     # svg_a_figura(svg_text) -> fig: outlines and text only, as on the page
from calcar import calcar               # calcar(path, modo='lineas'|'contornos', recorte=(x0, y0, x1, y1) in fractions,
                                        #        colores=False, suave=1.0, detalle=1.0, umbral=None) -> (fig, ax)
${VALLA}
svg_a_figura understands path (all commands, arcs included), rect, circle, ellipse, line, polyline, polygon, g, use, transform, stroke, fill (drawn as an outline), stroke-width, stroke-dasharray, and text with font-size, font-weight and text-anchor; not CSS classes, gradients, markers or clip paths.`;

// Los módulos de Python que Claude usa para dibujar: el plugin los sube con la
// primera pregunta y van con cada una (quedan en $INPUT_DIR del contenedor).
// Antes iban en el prompt y Claude los reescribía en cada dibujo: ~7.000
// tokens, casi un minuto.
const MODULOS = [
  ['trazos.py', TRAZOS_PY],
  ['svg_trazos.py', SVG_PY],
  ['calcar.py', CALCAR_PY],
];

// En el nivel Best, después de dibujar Claude ve cómo le quedó y lo corrige.
export const REVISION =
  'This is how your drawing came out (automatic check, not the user). Look at it critically as the illustrator: wrong proportions, missing or unrecognizable parts, overlapping labels or lines, leader lines that do not end on the part they name, clutter. If it can be clearly better, redraw it fixing those problems and save it with the same name; if it is already good, do not redraw. Reply in one short line.';
const AVISO_REVISION =
  '\n\nAfter you answer, you will be shown your drawings to check them: do not say you could not see them.';

const IDIOMAS = {en: 'English', es: 'Spanish'};

// El prompt completo: las reglas del plugin, el idioma elegido en Ajustes (si
// no, una cuenta sin palabras salía en inglés aunque la interfaz estuviera en
// español) y, abajo, las instrucciones propias del usuario, que mandan.
export function sistema(promptUsuario, idioma, revisa = false) {
  const propio = String(promptUsuario || '').trim();
  let s = SISTEMA + (revisa ? AVISO_REVISION : '');
  if (IDIOMAS[idioma]) {
    s += `\n\nThe user chose ${IDIOMAS[idioma]} as their language: answer in ${IDIOMAS[idioma]}, even when the selection has no words (a calculation, a drawing request), unless their own instructions below say otherwise.`;
  }
  if (propio) {
    s += `\n\nThe user's own instructions (they take precedence on language, tone and length):\n${propio}`;
  }
  return s;
}

// La búsqueda va en su versión básica: la de 2026 filtra con su propio
// contenedor de código, y junto al nuestro confunde al modelo.
export const HERRAMIENTAS = [
  {type: 'code_execution_20260521', name: 'code_execution'},
  {type: 'web_search_20250305', name: 'web_search', max_uses: 4},
  {
    name: 'bajar_imagen',
    description:
      'Downloads an image from a direct URL into your code execution container, to trace it with calcar. Returns the file name; the file is in the container input directory.',
    input_schema: {
      type: 'object',
      properties: {url: {type: 'string', description: 'Direct URL of the image file (png or jpg)'}},
      required: ['url'],
    },
  },
];

export function mensajeConImagen(base64, texto) {
  return {
    role: 'user',
    content: [
      {type: 'image', source: {type: 'base64', media_type: 'image/png', data: base64}},
      {type: 'text', text: texto || 'Look at this.'},
    ],
  };
}

export function mensajeConArchivo(fileId, texto) {
  return {
    role: 'user',
    content: [
      {type: 'image', source: {type: 'file', file_id: fileId}},
      {type: 'text', text: texto || 'Look at this.'},
    ],
  };
}

export function mensajeConTexto(seleccion, texto) {
  return {
    role: 'user',
    content: `Selected text:\n"""\n${seleccion}\n"""\n\n${texto || 'Look at this.'}`,
  };
}

// Suma la página entera al primer mensaje, como última imagen, con una nota
// de dónde está la selección.
export function conPagina(mensaje, base64, lugar) {
  const pct = v => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const donde = lugar
    ? ` The selection is the area from ${pct(lugar.x0)}% to ${pct(lugar.x1)}% across and ${pct(lugar.y0)}% to ${pct(lugar.y1)}% down the page.`
    : '';
  const nota = `The last image is the whole page the selection comes from, only as context.${donde}`;
  const content = typeof mensaje.content === 'string' ? [{type: 'text', text: mensaje.content}] : [...mensaje.content];
  const i = content.findIndex(b => b.type === 'text');
  const img = {type: 'image', source: {type: 'base64', media_type: 'image/png', data: base64}};
  content.splice(i < 0 ? content.length : i, 0, img, {type: 'text', text: nota});
  return {...mensaje, content};
}

// Adivina con el modelo barato qué va a pedir el usuario sobre la selección,
// para dejarlo escrito en la caja. `mensaje` es el primero, ya con un texto en
// el lugar de la pregunta. Devuelve el pedido, o '' si no se le ocurre nada.
export const MODELO_SUGERENCIA = 'claude-haiku-5-5';

export async function sugerir({clave, mensaje, idioma = null, promptUsuario = '', timeoutMs = 20000}) {
  const lengua = IDIOMAS[idioma] || 'the language of the selection';
  const sobre = promptUsuario.trim() ? `\n\nAbout the user:\n${promptUsuario.trim()}` : '';
  const res = await conTimeout(timeoutMs, signal =>
    fetch(`${URL_API}/messages`, {
      method: 'POST',
      signal,
      headers: {'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': '2023-06-01'},
      body: JSON.stringify({
        model: MODELO_SUGERENCIA,
        max_tokens: 80,
        // sin pensar: es una línea, y pensando se come los tokens y no contesta
        thinking: {type: 'disabled'},
        system:
          'The user selected something on a Supernote e-ink tablet and is about to ask an AI assistant about it. ' +
          'Guess the request they are most likely to type about the selection (the first image). The whole page, ' +
          'if it comes, is only context to understand the selection: never suggest something about the rest of the ' +
          'page. If the selection is a calculation, an expression or an equation, the request is to compute or solve ' +
          'it, not to explain it. Reply with only that request, written by the user to the assistant: an ' +
          `instruction or a short question, at most 12 words, in ${lengua}, no quotes, no math markup.` +
          sobre,
        messages: [mensaje],
      }),
    }),
  );
  const cuerpo = await leerJson(res);
  return (cuerpo.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join(' ')
    .replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '')
    .slice(0, 200);
}

// Manda la conversación y devuelve {texto, archivos, subidos, mensajes,
// contenedor, uso}. `mensajes` son los turnos nuevos tal cual (el del
// asistente y, si bajó imágenes, las idas y vueltas de bajar_imagen), para
// agregarlos a la conversación; `archivos`, los file_id de lo que dibujó;
// `subidos`, los de las imágenes que bajó la tablet; `contenedor`, el del
// código, para que la repregunta siga en el mismo. `alAvanzar(fase)` cuenta qué
// está haciendo: 'thinking' | 'drawing' | 'searching' | 'downloading' | 'writing'.
// Va en streaming: un dibujo grande tarda minutos, y sin streaming la conexión
// se corta a los 5.
export async function preguntar({
  clave,
  messages,
  contenedor,
  modelo = MODELO,
  esfuerzo = 'medium',
  promptUsuario = '',
  idioma = null,
  revisa = false,
  timeoutMs = 20 * 60000,
  maxTokens = 32000,
  alAvanzar = () => {},
}) {
  let nuevos = [];
  let contenido = [];
  let cuerpo;
  const subidos = [];
  const todo = [];
  for (let i = 0; i < 12; i++) {
    const historia = [...messages, ...nuevos, ...(contenido.length ? [{role: 'assistant', content: contenido}] : [])];
    alAvanzar('thinking');
    cuerpo = await enStreaming({
      clave,
      timeoutMs,
      beta: CON_FALLBACK.has(modelo) ? 'server-side-fallback-2026-07-01' : null,
      cuerpo: {
        model: modelo,
        max_tokens: maxTokens,
        output_config: {effort: esfuerzo},
        ...(CON_FALLBACK.has(modelo) ? {fallbacks: 'default'} : {}),
        // el prompt (con el código de los trazos) es igual en cada pedido
        cache_control: {type: 'ephemeral'},
        system: sistema(promptUsuario, idioma, revisa),
        tools: HERRAMIENTAS,
        ...(contenedor ? {container: contenedor} : {}),
        messages: historia,
        stream: true,
      },
      alBloque: b => alAvanzar(faseDe(b)),
    });
    contenido = [...contenido, ...(cuerpo.content || [])];
    todo.push(...(cuerpo.content || []));
    contenedor = cuerpo.container?.id || contenedor;
    // pause_turn: el servidor cortó un turno largo de herramientas; se reenvía
    // tal cual para que siga.
    if (cuerpo.stop_reason === 'pause_turn') {
      continue;
    }
    if (cuerpo.stop_reason !== 'tool_use') {
      break;
    }
    // bajar_imagen: la tablet la baja y la sube a la Files API, y entra al
    // contenedor con container_upload, al lado del resultado.
    const resultados = [];
    const entradas = [];
    for (const u of contenido.filter(b => b.type === 'tool_use')) {
      if (u.name !== 'bajar_imagen') {
        resultados.push({type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Unknown tool.'});
        continue;
      }
      alAvanzar('downloading');
      try {
        const s = await bajarYSubir({clave, url: u.input?.url});
        subidos.push(s.id);
        // la imagen va también en el resultado, para que Claude vea lo que calca
        resultados.push({
          type: 'tool_result',
          tool_use_id: u.id,
          content: [
            {
              type: 'text',
              text: `Downloaded ${s.kb} KB as ${s.nombre}; it is in your container input directory (find it with: find / -name '${s.nombre}' 2>/dev/null). This is the image:`,
            },
            {type: 'image', source: {type: 'file', file_id: s.id}},
          ],
        });
        entradas.push({type: 'container_upload', file_id: s.id});
      } catch (e) {
        resultados.push({type: 'tool_result', tool_use_id: u.id, is_error: true, content: String(e?.message || e)});
      }
    }
    nuevos = [...nuevos, {role: 'assistant', content: contenido}, {role: 'user', content: [...resultados, ...entradas]}];
    contenido = [];
  }
  if (cuerpo.stop_reason === 'refusal') {
    throw new Error(t('refused'));
  }
  nuevos = [...nuevos, {role: 'assistant', content: contenido}];
  const texto = contenido
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  const cortado = cuerpo.stop_reason === 'max_tokens' ? `\n\n${t('truncated')}` : '';
  return {
    texto: (texto || t('noAnswer')) + cortado,
    archivos: archivosGenerados(todo),
    subidos,
    mensajes: nuevos,
    contenedor,
    uso: cuerpo.usage,
  };
}

function faseDe(b) {
  if (b.type === 'server_tool_use') {
    return b.name === 'web_search' ? 'searching' : 'drawing';
  }
  if (b.type === 'tool_use') {
    return 'downloading';
  }
  return b.type === 'text' ? 'writing' : 'thinking';
}

function archivosGenerados(contenido) {
  const ids = new Set();
  for (const b of contenido) {
    if (b.type !== 'bash_code_execution_tool_result') {
      continue;
    }
    for (const salida of b.content?.content || []) {
      if (salida.type === 'bash_code_execution_output' && salida.file_id) {
        ids.add(salida.file_id);
      }
    }
  }
  return [...ids];
}

// Un pedido a /messages en streaming (SSE), armado de vuelta en el mensaje
// entero. En la tablet va con XMLHttpRequest, que en React Native entrega el
// texto de a pedazos (su fetch no); en Node, con fetch.
async function enStreaming({clave, cuerpo, beta, timeoutMs, alBloque}) {
  const sse = lectorSse(alBloque);
  const headers = {
    'content-type': 'application/json',
    'x-api-key': clave,
    'anthropic-version': '2023-06-01',
    ...(beta ? {'anthropic-beta': beta} : {}),
  };
  if (typeof XMLHttpRequest !== 'undefined') {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let visto = 0;
      const leer = () => {
        const txt = xhr.responseText || '';
        if (txt.length > visto) {
          sse.agregar(txt.slice(visto));
          visto = txt.length;
        }
      };
      xhr.open('POST', `${URL_API}/messages`);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.responseType = 'text';
      xhr.timeout = timeoutMs;
      xhr.onprogress = () => {
        if (xhr.status === 200) {
          try {
            leer();
          } catch (e) {
            xhr.abort();
            reject(e);
          }
        }
      };
      xhr.onload = () => {
        if (xhr.status !== 200) {
          reject(errorHttp(xhr.status, xhr.responseText));
          return;
        }
        try {
          leer();
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = () => reject(new Error(t('networkError')));
      xhr.ontimeout = () => reject(new Error(`no answer in ${Math.round(timeoutMs / 60000)} min`));
      xhr.send(JSON.stringify(cuerpo));
    });
  } else {
    await conTimeout(timeoutMs, async signal => {
      const res = await fetch(`${URL_API}/messages`, {method: 'POST', signal, headers, body: JSON.stringify(cuerpo)});
      if (!res.ok) {
        throw errorHttp(res.status, await res.text());
      }
      const dec = new TextDecoder();
      for await (const parte of res.body) {
        sse.agregar(dec.decode(parte, {stream: true}));
      }
    });
  }
  return sse.mensaje();
}

function errorHttp(status, crudo) {
  let msj = crudo;
  try {
    msj = JSON.parse(crudo)?.error?.message || crudo;
  } catch {
    // queda el texto crudo
  }
  return new Error(`${status}: ${String(msj).slice(0, 300)}`);
}

// Junta los eventos SSE de la API en el mensaje que daría la versión sin streaming.
export function lectorSse(alBloque = () => {}) {
  let buf = '';
  let msg = null;
  const bloques = [];
  const json = [];
  const evento = d => {
    if (d.type === 'message_start') {
      msg = d.message;
    } else if (d.type === 'content_block_start') {
      bloques[d.index] = {...d.content_block};
      json[d.index] = '';
      alBloque(d.content_block);
    } else if (d.type === 'content_block_delta') {
      const b = bloques[d.index];
      const x = d.delta;
      if (x.type === 'text_delta') {
        b.text = (b.text || '') + x.text;
      } else if (x.type === 'thinking_delta') {
        b.thinking = (b.thinking || '') + x.thinking;
      } else if (x.type === 'signature_delta') {
        b.signature = x.signature;
      } else if (x.type === 'input_json_delta') {
        json[d.index] += x.partial_json;
      } else if (x.type === 'citations_delta') {
        b.citations = [...(b.citations || []), x.citation];
      }
    } else if (d.type === 'content_block_stop') {
      if (json[d.index]) {
        bloques[d.index].input = JSON.parse(json[d.index]);
      }
    } else if (d.type === 'message_delta') {
      Object.assign(msg, d.delta);
      if (d.usage) {
        msg.usage = {...msg.usage, ...d.usage};
      }
    } else if (d.type === 'error') {
      throw new Error(d.error?.message || 'stream error');
    }
  };
  return {
    agregar(texto) {
      buf += texto;
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const ev = buf.slice(0, k);
        buf = buf.slice(k + 2);
        const linea = ev.split('\n').find(l => l.startsWith('data: '));
        if (linea) {
          evento(JSON.parse(linea.slice(6)));
        }
      }
    },
    mensaje() {
      if (!msg) {
        throw new Error(t('noAnswer'));
      }
      return {...msg, content: bloques.filter(Boolean)};
    },
  };
}

// bajar_imagen: la tablet baja la imagen (tiene internet; el contenedor no) y
// la sube a la Files API (ver subirArchivo).
const MAX_IMAGEN = 15 * 1024 * 1024;

async function bajarYSubir({clave, url, timeoutMs = 90000}) {
  if (!/^https?:\/\//i.test(url || '')) {
    throw new Error('Not an http(s) URL.');
  }
  const {bytes, tipo} = await bajarBinario(url, timeoutMs);
  if (!/^image\/(png|jpe?g|gif|webp)/i.test(tipo)) {
    throw new Error(`The URL is ${tipo || 'not an image'}, not a PNG or JPEG image.`);
  }
  if (bytes.length > MAX_IMAGEN) {
    throw new Error(`The image is ${Math.round(bytes.length / 1048576)} MB; use a smaller thumbnail.`);
  }
  const ext = tipo.includes('png') ? 'png' : tipo.includes('gif') ? 'gif' : tipo.includes('webp') ? 'webp' : 'jpg';
  const base =
    decodeURIComponent(url.split('?')[0].split('/').pop() || 'imagen')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .slice(-60) || 'imagen';
  const nombre = `${base}.${ext}`;
  const id = await subirArchivo({clave, nombre, tipo, bytes, timeoutMs});
  return {id, nombre, kb: Math.round(bytes.length / 1024)};
}

// Sube los módulos de dibujo al contenedor (ver MODULOS). Devuelve los
// bloques container_upload para la primera pregunta y sus file_id, para
// borrarlos con el resto de la conversación.
export async function subirModulos({clave}) {
  const ids = await Promise.all(
    MODULOS.map(([nombre, codigo]) => subirArchivo({clave, nombre, tipo: 'text/x-python', bytes: utf8(codigo)})),
  );
  return {ids, bloques: ids.map(file_id => ({type: 'container_upload', file_id}))};
}

// UTF-8 a mano: Hermes (el motor JS de la tablet) no tiene unescape, y
// TextEncoder no está garantizado.
export function utf8(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return Uint8Array.from(out);
}

// Multipart armado a mano: el FormData de React Native sólo sube archivos del
// disco, y el plugin no puede escribir uno.
async function subirArchivo({clave, nombre, tipo, bytes, timeoutMs = 90000}) {
  const borde = `superclaude${Date.now()}${Math.random().toString(36).slice(2)}`;
  const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);
  const cabeza = ascii(
    `--${borde}\r\nContent-Disposition: form-data; name="file"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`,
  );
  const cola = ascii(`\r\n--${borde}--\r\n`);
  const cuerpo = new Uint8Array(cabeza.length + bytes.length + cola.length);
  cuerpo.set(cabeza, 0);
  cuerpo.set(bytes, cabeza.length);
  cuerpo.set(cola, cabeza.length + bytes.length);
  const res = await conTimeout(timeoutMs, signal =>
    fetch(`${URL_API}/files`, {
      method: 'POST',
      signal,
      headers: {
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
        'content-type': `multipart/form-data; boundary=${borde}`,
      },
      body: cuerpo.buffer,
    }),
  );
  const r = await leerJson(res);
  if (!r.id) {
    throw new Error('upload returned no id');
  }
  return r.id;
}

async function bajarBinario(url, timeoutMs) {
  const headers = {'User-Agent': 'SuperClaude (Supernote plugin)'};
  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.responseType = 'arraybuffer';
      xhr.timeout = timeoutMs;
      xhr.onload = () =>
        xhr.status === 200
          ? resolve({bytes: new Uint8Array(xhr.response), tipo: (xhr.getResponseHeader('content-type') || '').split(';')[0]})
          : reject(new Error(`HTTP ${xhr.status} downloading the image.`));
      xhr.onerror = () => reject(new Error('Could not download the image.'));
      xhr.ontimeout = () => reject(new Error('The image download timed out.'));
      xhr.send();
    });
  }
  const res = await conTimeout(timeoutMs, signal => fetch(url, {signal, headers}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading the image.`);
  }
  return {bytes: new Uint8Array(await res.arrayBuffer()), tipo: (res.headers.get('content-type') || '').split(';')[0]};
}

// Baja los dibujos de un turno: cada uno es NOMBRE.png más NOMBRE.trazos.json
// (los trazos para insertarlo en la hoja; puede faltar). Devuelve
// [{nombre, uri, trazos}], con la imagen como data URI.
export async function bajarDibujos({clave, ids}) {
  const todos = await Promise.all(
    ids.map(async id => ({id, ...(await pedirJson(clave, `${URL_API}/files/${id}`))})),
  );
  // si Claude guardó dos veces el mismo nombre (lo rehízo), vale la última
  const porNombre = new Map(todos.map(a => [a.filename || a.id, a]));
  const archivos = [...porNombre.values()];
  const raiz = n => n.replace(/\.trazos\.json$|\.png$|\.jpe?g$/i, '');
  const dibujos = [];
  for (const a of archivos.filter(x => (x.mime_type || '').startsWith('image/'))) {
    const par = archivos.find(
      x => x.filename && x.filename.endsWith('.trazos.json') && raiz(x.filename) === raiz(a.filename || ''),
    );
    const [uri, trazos] = await Promise.all([
      bajarImagen({clave, fileId: a.id, tipo: a.mime_type}),
      par ? pedirJson(clave, `${URL_API}/files/${par.id}/content`) : null,
    ]);
    dibujos.push({nombre: raiz(a.filename || 'dibujo'), id: a.id, uri, trazos});
  }
  return dibujos;
}

async function pedirJson(clave, url, timeoutMs = 60000) {
  const res = await conTimeout(timeoutMs, signal =>
    fetch(url, {signal, headers: {'x-api-key': clave, 'anthropic-version': '2023-06-01'}}),
  );
  return leerJson(res);
}

// La imagen como data URI, que <Image> muestra directo (no hay sistema de
// archivos sin módulo nativo).
async function bajarImagen({clave, fileId, tipo, timeoutMs = 60000}) {
  const res = await conTimeout(timeoutMs, signal =>
    fetch(`${URL_API}/files/${fileId}/content`, {
      signal,
      headers: {'x-api-key': clave, 'anthropic-version': '2023-06-01'},
    }),
  );
  if (!res.ok) {
    throw new Error(`${res.status} downloading the drawing`);
  }
  if (typeof FileReader === 'undefined') {
    // Node (scripts/probar-claude.mjs)
    return `data:${tipo};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    // el blob de RN puede venir sin tipo: se lo pone el de la respuesta
    lector.onloadend = () =>
      resolve(String(lector.result).replace(/^data:[^;,]*;/, `data:${tipo};`));
    lector.onerror = () => reject(new Error(t('cannotReadImage')));
    lector.readAsDataURL(blob);
  });
}

// Plan B para la imagen: subirla con multipart (lo único que está probado en
// el equipo, vía FormData con {uri}) y referenciarla por file_id.
export async function subirImagen({clave, archivo, timeoutMs = 60000}) {
  const form = new FormData();
  form.append('file', archivo);
  const res = await conTimeout(timeoutMs, signal =>
    fetch(`${URL_API}/files`, {
      method: 'POST',
      signal,
      headers: {'x-api-key': clave, 'anthropic-version': '2023-06-01'},
      body: form,
    }),
  );
  const cuerpo = await leerJson(res);
  if (!cuerpo.id) {
    throw new Error('upload returned no id');
  }
  return cuerpo.id;
}

// Los archivos que dejó Claude (dibujos y sus trazos) no vencen solos: se
// borran cuando la conversación que los usaba se reemplaza.
export async function borrarArchivo({clave, fileId, timeoutMs = 30000}) {
  await conTimeout(timeoutMs, signal =>
    fetch(`${URL_API}/files/${fileId}`, {
      method: 'DELETE',
      signal,
      headers: {'x-api-key': clave, 'anthropic-version': '2023-06-01'},
    }),
  );
}

async function leerJson(res) {
  const crudo = await res.text();
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    // queda null
  }
  if (!res.ok) {
    const msj = cuerpo?.error?.message || crudo.slice(0, 300) || res.statusText;
    throw new Error(`${res.status}: ${msj}`);
  }
  if (!cuerpo) {
    throw new Error('response is not JSON');
  }
  return cuerpo;
}

async function conTimeout(ms, hacer) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await hacer(ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted) {
      throw new Error(`no answer in ${Math.round(ms / 1000)} s`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
