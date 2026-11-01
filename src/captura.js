// Saca del Supernote lo que se seleccionó: la imagen del lazo (NOTE y DOC)
// o el texto subrayado en un DOC.
import {PluginCommAPI, PluginDocAPI, PluginFileAPI, PluginManager, PluginNoteAPI} from 'sn-plugin-lib';
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

// La página entera, sólo de contexto para Claude: la ventana sigue mostrando
// la selección. En una nota se guarda antes, para que salga lo último que se
// escribió; en un DOC sale con el subrayado. Devuelve {ruta, lugar}, con
// `lugar` la caja del lazo en fracciones de la página (o null).
export async function imagenDeLaPagina(ctx) {
  const dir = await PluginManager.getPluginDirPath();
  if (!dir || !ctx?.ruta) {
    throw new Error(t('noPage'));
  }
  const ruta = `${dir}/pagina.png`;
  let res;
  let tam = null;
  if (/\.note$/i.test(ctx.ruta)) {
    await PluginNoteAPI.saveCurrentNote().catch(() => null);
    const t2 = await PluginFileAPI.getPageSize(ctx.ruta, ctx.pagina).catch(() => null);
    tam = t2?.success ? t2.result : null;
    res = await PluginFileAPI.generateNotePng({notePath: ctx.ruta, page: ctx.pagina, times: 1, pngPath: ruta, type: 1});
  } else {
    const t2 = await PluginCommAPI.getPageDisplaySize().catch(() => null);
    tam = t2?.success ? t2.result : null;
    const size = tam?.width > 0 && tam?.height > 0
      ? {width: Math.min(5120, Math.round(tam.width)), height: Math.min(5120, Math.round(tam.height))}
      : {width: 1200, height: 1600};
    res = await PluginDocAPI.generateCurrentDocImage(ctx.pagina, ruta, size, 1);
  }
  if (!res?.success || res.result === false) {
    throw new Error(res?.error?.message || t('noPage'));
  }
  const l = ctx.lazo;
  const lugar = l && tam?.width > 0 && tam?.height > 0
    ? {x0: l.left / tam.width, y0: l.top / tam.height, x1: l.right / tam.width, y1: l.bottom / tam.height}
    : null;
  return {ruta, lugar};
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
