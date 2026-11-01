// Los ajustes del usuario: clave de API, prompt propio, nivel de modelo e
// idioma de la interfaz. Se editan en la pantalla de Ajustes (el botón de
// configuración del plugin en Ajustes → Apps → Plugins, o ⚙ en la ventana) y
// se guardan como la conversación, en carpetas del directorio privado del
// plugin (ver memoria.mjs): no hay otra forma de guardar nada.
//
// Antes (0.7.0) iban en archivos de texto en MyStyle, pero un plugin no los
// puede leer ("cannot read /storage/…", visto en un Manta): ahora eso queda
// como "Importar de MyStyle", por si algún día se puede.
//
// Nada viene de fábrica: sin clave, la ventana pide ir a Ajustes.
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {crearMemoria} from './memoria.mjs';
import {ponerIdioma} from './textos.mjs';

// Tres niveles en vez de una lista de modelos.
export const NIVELES = {
  rapido: {modelo: 'claude-haiku-5-5', esfuerzo: 'low'},
  normal: {modelo: 'claude-sonnet-5-5', esfuerzo: 'medium'},
  maximo: {modelo: 'claude-opus-5-5', esfuerzo: 'medium'},
};

const POR_DEFECTO = {clave: '', prompt: '', nivel: 'maximo', idioma: 'en'};

let almacen = null;
let actuales = null;
const oyentes = new Set();

async function elAlmacen() {
  if (!almacen) {
    const dir = await PluginManager.getPluginDirPath();
    almacen = crearMemoria(
      {
        dir,
        makeDir: p => FileUtils.makeDir(p),
        listFiles: p => FileUtils.listFiles(p),
        deleteDir: p => FileUtils.deleteDir(p),
        renameToFile: (a, b) => FileUtils.renameToFile(a, b),
      },
      'ajustes',
    );
  }
  return almacen;
}

export async function cargarAjustes() {
  if (!actuales) {
    const guardados = await (await elAlmacen()).recuperar().catch(() => null);
    actuales = {...POR_DEFECTO};
    for (const k of Object.keys(POR_DEFECTO)) {
      if (typeof guardados?.[k] === 'string') {
        actuales[k] = guardados[k];
      }
    }
    ponerIdioma(actuales.idioma);
    avisar();
  }
  return actuales;
}

export async function guardarAjustes(cambios) {
  actuales = {...(await cargarAjustes()), ...cambios};
  ponerIdioma(actuales.idioma);
  avisar();
  const {clave, prompt, nivel, idioma} = actuales;
  await (await elAlmacen()).guardar({clave, prompt, nivel, idioma});
}

export function nivelActual() {
  return NIVELES[actuales?.nivel] || NIVELES.maximo;
}

export function escucharAjustes(fn) {
  oyentes.add(fn);
  if (actuales) {
    fn(actuales);
  }
  return () => oyentes.delete(fn);
}

function avisar() {
  oyentes.forEach(fn => fn(actuales));
}

// "Importar de MyStyle": superclaude-api-key.txt y superclaude-prompt.txt, si
// están. Leerlos directo falla; se prueba copiarlos primero al directorio del
// plugin (FileUtils.copyFile es nativo y pasa por el permiso de lectura) y
// leer la copia. Devuelve lo que encontró, o tira el error de lectura.
export async function importarDeMyStyle() {
  const dir = await PluginManager.getPluginDirPath();
  const encontrados = {};
  let ultimoError = null;
  for (const carpeta of ['MyStyle', 'Mystyle']) {
    for (const [campo, archivo] of [
      ['clave', 'superclaude-api-key.txt'],
      ['prompt', 'superclaude-prompt.txt'],
    ]) {
      const origen = `/storage/emulated/0/${carpeta}/${archivo}`;
      if (encontrados[campo] !== undefined || !(await FileUtils.exists(origen).catch(() => false))) {
        continue;
      }
      const copia = `${dir}/importado-${archivo}`;
      try {
        await FileUtils.copyFile(origen, copia);
        const texto = sinComentarios(await leerTexto(copia));
        encontrados[campo] = campo === 'clave' ? texto.split(/\s+/)[0] || '' : texto;
      } catch (e) {
        ultimoError = e;
      } finally {
        FileUtils.deleteFile(copia).catch(() => null);
      }
    }
  }
  if (Object.keys(encontrados).length === 0 && ultimoError) {
    throw ultimoError;
  }
  return encontrados;
}

function sinComentarios(texto) {
  return String(texto || '')
    .split('\n')
    .filter(l => !l.trim().startsWith('#'))
    .join('\n')
    .trim();
}

function leerTexto(ruta) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(String(xhr.responseText || ''));
    xhr.onerror = () => reject(new Error(`cannot read ${ruta}`));
    xhr.open('GET', `file://${ruta}`);
    xhr.send();
  });
}
