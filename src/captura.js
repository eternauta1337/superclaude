// Saca del Supernote lo que se seleccionó: la imagen del lazo (NOTE y DOC)
// o el texto subrayado en un DOC.
import {PluginCommAPI, PluginDocAPI, PluginManager} from 'sn-plugin-lib';
import {t} from './textos.mjs';

const LEER = 'plugin.permission.FILE:READ';
const RED = 'plugin.permission.INTERNET';

const ESCRIBIR = 'plugin.permission.FILE:WRITE';

export async function pedirPermisos() {
  await pedir(LEER, t('noReadPermission'));
  await pedir(RED, t('noInternetPermission'));
}

// Escribir sólo hace falta para insertar un dibujo: se pide recién ahí.
export function pedirEscritura() {
  return pedir(ESCRIBIR, t('noWritePermission'));
}

async function pedir(p, error) {
  if ((await PluginManager.hasPermission(p)) === 1) {
    return;
  }
  const r = await PluginManager.requestPermission(p);
  if (r !== 1 && r !== 2) {
    throw new Error(error);
  }
}

// Devuelve la ruta del PNG del lazo. Va al directorio privado del plugin, que
// no pide permisos, y se pisa en cada uso.
export async function imagenDelLazo() {
  const dir = await PluginManager.getPluginDirPath();
  if (!dir) {
    throw new Error(t('noPluginDir'));
  }
  const ruta = `${dir}/lazo.png`;
  const res = await PluginCommAPI.generateLassoPreview(ruta);
  if (!res?.success || !res.result?.imagePath) {
    throw new Error(res?.error?.message || t('noLassoImage'));
  }
  return res.result.imagePath;
}

export async function textoSeleccionado() {
  const res = await PluginDocAPI.getLastSelectedText();
  if (!res?.success || !res.result) {
    throw new Error(res?.error?.message || t('noSelectedText'));
  }
  return String(res.result);
}

export function uri(ruta) {
  return ruta.startsWith('file://') ? ruta : `file://${ruta}`;
}

// PNG → base64 sin módulos nativos: XHR con blob y FileReader.
export function aBase64(ruta) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => {
      const lector = new FileReader();
      lector.onloadend = () => {
        const url = String(lector.result || '');
        const coma = url.indexOf(',');
        if (coma < 0 || coma === url.length - 1) {
          reject(new Error(t('emptyImage')));
        } else {
          resolve(url.slice(coma + 1));
        }
      };
      lector.onerror = () => reject(new Error(t('cannotReadImage')));
      lector.readAsDataURL(xhr.response);
    };
    xhr.onerror = () => reject(new Error(t('cannotOpenImage')));
    xhr.open('GET', uri(ruta));
    xhr.send();
  });
}
