// Everything that is the user's, in plain files next to the plugin, in the
// MyStyle folder (it exists on the tablet and in Supernote Cloud, so the files
// can be edited from a computer and sync back):
//   superclaude-api-key.txt   the Anthropic API key
//   superclaude-prompt.txt    who you are, how and in what language to answer
//   superclaude-config.txt    model, effort, UI language ("name = value" lines;
//                             Supernote Cloud refuses .json files)
// The first time, missing files are copied from the templates shipped inside
// the plugin (plantillas/). The plugin cannot write files, only copy them.
// Read again on every lasso, so edits apply without reinstalling.
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {CLAVE} from './clave';
import {ponerIdioma} from './textos.mjs';

const RAIZ = '/storage/emulated/0';
export const ARCHIVOS = {
  clave: 'superclaude-api-key.txt',
  prompt: 'superclaude-prompt.txt',
  ajustes: 'superclaude-config.txt',
};
const POR_DEFECTO = {model: 'claude-opus-5-5', effort: 'medium', language: 'en'};

export async function cargarConfig() {
  const carpeta = await carpetaMyStyle();
  const plantillas = `${await PluginManager.getPluginDirPath()}/plantillas`;
  const leer = async nombre => {
    const ruta = `${carpeta}/${nombre}`;
    if (!(await FileUtils.exists(ruta).catch(() => false))) {
      // primera vez: la plantilla (si no se puede copiar, sigue con lo de fábrica)
      await FileUtils.copyFile(`${plantillas}/${nombre}`, ruta).catch(() => null);
    }
    return leerTexto(ruta).catch(() => '');
  };
  const [clave, prompt, ajustes] = await Promise.all([
    leer(ARCHIVOS.clave),
    leer(ARCHIVOS.prompt),
    leer(ARCHIVOS.ajustes),
  ]);
  const json = leerAjustes(ajustes);
  const config = {
    carpeta,
    // la del archivo; si no hay, la que se armó adentro del paquete (copias personales)
    clave: sinComentarios(clave).split(/\s+/)[0] || CLAVE || '',
    prompt: sinComentarios(prompt),
    modelo: json.model || POR_DEFECTO.model,
    esfuerzo: json.effort || POR_DEFECTO.effort,
    idioma: json.language || POR_DEFECTO.language,
  };
  ponerIdioma(config.idioma);
  return config;
}

async function carpetaMyStyle() {
  for (const nombre of ['MyStyle', 'Mystyle', 'mystyle']) {
    if (await FileUtils.exists(`${RAIZ}/${nombre}`).catch(() => false)) {
      return `${RAIZ}/${nombre}`;
    }
  }
  return `${RAIZ}/MyStyle`;
}

// "name = value" per line; anything else is ignored, so a typo never blocks.
export function leerAjustes(texto) {
  const ajustes = {};
  for (const linea of sinComentarios(texto).split('\n')) {
    const m = linea.match(/^\s*([a-zA-Z_]+)\s*[=:]\s*(.+?)\s*$/);
    if (m) {
      ajustes[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return ajustes;
}

// Lines starting with # are comments for the person editing the file.
function sinComentarios(texto) {
  return String(texto || '')
    .split('\n')
    .filter(l => !l.trim().startsWith('#'))
    .join('\n')
    .trim();
}

// Plain text from a file, through the same XHR that reads the lasso image.
function leerTexto(ruta) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(String(xhr.responseText || ''));
    xhr.onerror = () => reject(new Error(`cannot read ${ruta}`));
    xhr.open('GET', `file://${ruta}`);
    xhr.send();
  });
}
