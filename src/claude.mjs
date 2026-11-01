// Le habla a la API de Anthropic con fetch, sin SDK: corre igual en el
// React Native del Supernote y en Node (scripts/probar-claude.mjs).
//
// Una conversación es la lista `messages` de la API, append-only: cada
// respuesta se agrega entera (con sus bloques de thinking) para que la
// repregunta no invalide nada.

import {t} from './textos.mjs';
import {TRAZOS_PY} from './trazos_py.mjs';

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

You can draw: you have code execution with matplotlib. Draw when asked, or when a drawing reads better than text:
- a chart: a function (also 3D, with mplot3d: surfaces as wireframes), data or a geometric figure;
- anything else you are asked to draw (a car, a diagram, a map, an object): make it a line drawing, as someone would by hand with a technical pen. Use matplotlib.patches and Path (Bézier curves) for outlines, ax.set_aspect('equal'), ax.axis('off'), no axes or grid. Prefer a few clean, well-proportioned lines over lots of detail; labels, if needed, with ax.text.
Formulas are not drawn; they go in the text. Do not draw for a simple calculation: it is slow.
How to draw for e-ink: black on white only, everything as lines. Fills do not reach the page: if something must look filled, hatch it with lines, and never use a white fill to hide a line behind (on the page it shows anyway): cut the line where something covers it. Tell curves apart with dashed or dotted lines, never with color; in 3D, black plot_wireframe, never colored plot_surface. 2.5 pt lines, 16 pt text or larger, light axes and grid, figsize=(6, 4), dpi=150, no title if the text already says it. In the text say in one line what it shows, without naming files (the user sees the drawing, not the files). Save each drawing only once.
Putting things on the page: if the user asks you to put, write, insert or copy something onto the page (a sequence, a result, a list, a formula), build a matplotlib figure with just that, no axes (fig.text or ax.text with ax.axis('off')): plain text as text (monospaced, family='monospace', for a sequence, code or anything aligned), and each formula with $...$ (mathtext), which lands on the page as ink. 16 to 20 pt, one line per line, figsize=(6, height just enough for the lines), dpi=150. Save it like any drawing but with a NAME starting with "hoja" (for example "hoja-sequence"): the plugin inserts it on its own below the user's selection. In the text say in one line what you put on the page.

Every drawing is saved twice in $OUTPUT_DIR with the same name: the image, fig.savefig(os.path.join(os.environ['OUTPUT_DIR'], NAME + '.png')), and its strokes, exportar_trazos(fig, NAME), so the user can insert it on the page as ink. exportar_trazos is this code: write it verbatim to /tmp/trazos.py the first time and then import it (sys.path.insert(0, '/tmp'); from trazos import exportar_trazos).
${VALLA}python
${TRAZOS_PY}${VALLA}`;

const IDIOMAS = {en: 'English', es: 'Spanish'};

// El prompt completo: las reglas del plugin, el idioma elegido en Ajustes (si
// no, una cuenta sin palabras salía en inglés aunque la interfaz estuviera en
// español) y, abajo, las instrucciones propias del usuario, que mandan.
export function sistema(promptUsuario, idioma) {
  const propio = String(promptUsuario || '').trim();
  let s = SISTEMA;
  if (IDIOMAS[idioma]) {
    s += `\n\nThe user chose ${IDIOMAS[idioma]} as their language: answer in ${IDIOMAS[idioma]}, even when the selection has no words (a calculation, a drawing request), unless their own instructions below say otherwise.`;
  }
  if (propio) {
    s += `\n\nThe user's own instructions (they take precedence on language, tone and length):\n${propio}`;
  }
  return s;
}

export const HERRAMIENTAS = [{type: 'code_execution_20260521', name: 'code_execution'}];

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

// Manda la conversación y devuelve {texto, archivos, mensaje, contenedor, uso}.
// `mensaje` es el turno del asistente tal cual, para agregarlo a la
// conversación; `archivos`, los file_id de lo que dibujó; `contenedor`, el del
// código, para que la repregunta siga en el mismo.
export async function preguntar({
  clave,
  messages,
  contenedor,
  modelo = MODELO,
  esfuerzo = 'medium',
  promptUsuario = '',
  idioma = null,
  timeoutMs = 120000,
}) {
  let contenido = [];
  let cuerpo;
  // pause_turn: el servidor cortó un turno largo de herramientas; se reenvía
  // tal cual para que siga.
  for (let i = 0; i < 4; i++) {
    const historia =
      contenido.length > 0 ? [...messages, {role: 'assistant', content: contenido}] : messages;
    const res = await conTimeout(timeoutMs, signal =>
      fetch(`${URL_API}/messages`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': clave,
          'anthropic-version': '2023-06-01',
          ...(CON_FALLBACK.has(modelo) ? {'anthropic-beta': 'server-side-fallback-2026-07-01'} : {}),
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 8000,
          output_config: {effort: esfuerzo},
          ...(CON_FALLBACK.has(modelo) ? {fallbacks: 'default'} : {}),
          // el prompt (con el código de los trazos) es igual en cada pedido
          cache_control: {type: 'ephemeral'},
          system: sistema(promptUsuario, idioma),
          tools: HERRAMIENTAS,
          ...(contenedor ? {container: contenedor} : {}),
          messages: historia,
        }),
      }),
    );
    cuerpo = await leerJson(res);
    contenido = [...contenido, ...(cuerpo.content || [])];
    contenedor = cuerpo.container?.id || contenedor;
    if (cuerpo.stop_reason !== 'pause_turn') {
      break;
    }
  }
  if (cuerpo.stop_reason === 'refusal') {
    throw new Error(t('refused'));
  }
  const texto = contenido
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  const cortado = cuerpo.stop_reason === 'max_tokens' ? `\n\n${t('truncated')}` : '';
  return {
    texto: (texto || t('noAnswer')) + cortado,
    archivos: archivosGenerados(contenido),
    mensaje: {role: 'assistant', content: contenido},
    contenedor,
    uso: cuerpo.usage,
  };
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
    dibujos.push({nombre: raiz(a.filename || 'dibujo'), uri, trazos});
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
