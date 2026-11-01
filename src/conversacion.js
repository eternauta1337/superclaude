// El estado de la ventana: una conversación por toque del botón. index.js la
// arranca y App.js la dibuja y la sigue.
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {cargarAjustes, nivelActual} from './ajustes';
import {t} from './textos.mjs';
import {
  bajarDibujos,
  mensajeConArchivo,
  mensajeConImagen,
  mensajeConTexto,
  preguntar,
  subirImagen,
} from './claude.mjs';
import {aBase64, imagenDelLazo, pedirPermisos, textoSeleccionado, uri} from './captura';
import {contexto, insertarDibujo} from './insertar';
import {crearMemoria} from './memoria.mjs';

// La memoria en la tablet: carpetas en el directorio privado del plugin.
let memoria = null;
async function laMemoria() {
  if (!memoria) {
    const dir = await PluginManager.getPluginDirPath();
    if (!dir) {
      throw new Error('no encontré el directorio del plugin');
    }
    memoria = crearMemoria({
      dir,
      makeDir: p => FileUtils.makeDir(p),
      listFiles: p => FileUtils.listFiles(p),
      deleteDir: p => FileUtils.deleteDir(p),
      renameToFile: (a, b) => FileUtils.renameToFile(a, b),
    });
  }
  return memoria;
}

const vacio = {
  ocupado: false,
  imagen: null, // ruta del PNG del lazo, para mostrarlo arriba
  seleccion: null, // texto subrayado en un DOC
  turnos: [], // {pregunta, respuesta, dibujos: [{nombre, uri, trazos, estado, nota}]}
  error: null,
};

let estado = vacio;
let mensajes = [];
let contenedor = null; // el del código de Claude, para que la repregunta siga ahí
let hoja = null; // {ruta, pagina, lazo}: dónde insertar los dibujos
let generacion = 0; // descarta respuestas de una conversación vieja
let pendiente = null; // {mensaje, pregunta} mientras Claude piensa
let revivida = false; // reabrir() ya trajo la guardada
let config = null; // los ajustes: clave, prompt, nivel (ver ajustes.js)
let rutaLazo = null; // lazo.png en el directorio del plugin: la foto se relee de ahí
let guardados = 0; // para apagar "guardando…" sólo con el último
const oyentes = new Set();

export function escuchar(fn) {
  oyentes.add(fn);
  fn(estado);
  return () => oyentes.delete(fn);
}

function poner(cambios) {
  estado = {...estado, ...cambios};
  oyentes.forEach(fn => fn(estado));
}

// origen: 'lazo' | 'texto'
export async function empezar(origen) {
  const yo = ++generacion;
  mensajes = [];
  contenedor = null;
  hoja = null;
  pendiente = null;
  rutaLazo = null;
  estado = vacio;
  poner({ocupado: true});
  try {
    await pedirPermisos();
    config = await cargarAjustes();
    if (!config.clave) {
      poner({faltaClave: true});
      throw new Error(t('noKey'));
    }
    let primero;
    if (origen === 'texto') {
      const seleccion = await textoSeleccionado();
      poner({seleccion});
      primero = mensajeConTexto(seleccion);
    } else {
      // dónde está la selección, para insertar los dibujos debajo
      hoja = await contexto().catch(() => null);
      const ruta = await imagenDelLazo();
      rutaLazo = ruta;
      poner({imagen: uri(ruta) + `?v=${yo}`});
      primero = await mensajeImagen(ruta);
    }
    if (yo !== generacion) {
      return;
    }
    await turno(yo, primero, null);
  } catch (e) {
    if (yo === generacion) {
      poner({ocupado: false, error: texto(e)});
    }
  }
}

export async function repreguntar(pregunta) {
  const p = pregunta.trim();
  if (!p || estado.ocupado || mensajes.length === 0) {
    return;
  }
  const yo = generacion;
  poner({ocupado: true, error: null});
  try {
    await turno(yo, {role: 'user', content: p}, p);
  } catch (e) {
    if (yo === generacion) {
      poner({ocupado: false, error: texto(e)});
    }
  }
}

async function turno(yo, mensaje, pregunta) {
  // Se guarda antes de preguntar: si se oculta la ventana mientras Claude
  // piensa, la tablet corta el pedido, y al reabrir se vuelve a mandar.
  pendiente = {mensaje, pregunta};
  guardarTodo();
  config = await cargarAjustes(); // por si cambiaron la clave o el nivel en Ajustes
  const r = await preguntar({
    clave: config.clave,
    messages: [...mensajes, mensaje],
    contenedor,
    modelo: nivelActual().modelo,
    esfuerzo: nivelActual().esfuerzo,
    promptUsuario: config.prompt,
  });
  if (yo !== generacion) {
    return;
  }
  pendiente = null;
  mensajes = [...mensajes, mensaje, r.mensaje];
  contenedor = r.contenedor;
  let respuesta = r.texto;
  let dibujos = [];
  if (r.archivos.length) {
    try {
      dibujos = await bajarDibujos({clave: config.clave, ids: r.archivos});
    } catch (e) {
      respuesta += `\n\n(${t('couldNotDownload', {error: texto(e)})})`;
    }
  }
  if (yo !== generacion) {
    return;
  }
  poner({
    ocupado: false,
    turnos: [...estado.turnos, {pregunta, respuesta, dibujos, archivos: r.archivos}],
  });
  guardarTodo();
  // Lo que Claude arma para bajar a la hoja (nombre "hoja…") se inserta solo.
  const i = estado.turnos.length - 1;
  for (let j = 0; j < dibujos.length; j++) {
    if (/^hoja/i.test(dibujos[j].nombre) && dibujos[j].trazos) {
      await insertar(i, j);
    }
  }
}

// Pone en la hoja el dibujo j del turno i, como tinta, debajo de la selección.
export async function insertar(i, j) {
  const dibujo = estado.turnos[i]?.dibujos[j];
  if (!dibujo?.trazos || dibujo.estado === 'insertando') {
    return false;
  }
  marcar(i, j, {estado: 'insertando', nota: null});
  try {
    const r = await insertarDibujo(dibujo.trazos, hoja);
    marcar(i, j, {estado: 'insertado', nota: t('inserted', {trazos: r.trazos, rotulos: r.rotulos})});
    if (r.seleccionado) {
      // quedó seleccionado: se cierra la ventana para poder arrastrarlo
      await PluginManager.closePluginView();
    }
    return true;
  } catch (e) {
    marcar(i, j, {estado: null, nota: t('couldNotInsert', {error: texto(e)})});
    return false;
  }
}

function marcar(i, j, cambios) {
  const turnos = estado.turnos.map((t, ti) =>
    ti !== i ? t : {...t, dibujos: t.dibujos.map((d, dj) => (dj !== j ? d : {...d, ...cambios}))},
  );
  poner({turnos});
  if (cambios.estado !== 'insertando') {
    guardarTodo();
  }
}

// Lo que se guarda, liviano: la foto del lazo (base64) se cambia por una marca
// y se vuelve a leer de lazo.png; de los dibujos quedan los ids, y la imagen y
// los trazos se vuelven a bajar (lo generado por Claude sí se puede bajar).
function guardarTodo() {
  const sinFoto = m =>
    Array.isArray(m?.content)
      ? {
          ...m,
          content: m.content.map(b =>
            b.type === 'image' && b.source?.type === 'base64' ? {type: 'image', source: {type: 'lazo'}} : b,
          ),
        }
      : m;
  const {imagen, seleccion, turnos} = estado;
  const datos = {
    mensajes: mensajes.map(sinFoto),
    pendiente: pendiente && {...pendiente, mensaje: sinFoto(pendiente.mensaje)},
    contenedor,
    hoja,
    rutaLazo,
    estado: {
      imagen,
      seleccion,
      turnos: turnos.map(t => ({
        ...t,
        dibujos: (t.dibujos || []).map(({nombre, estado: e, nota}) => ({nombre, estado: e, nota})),
      })),
    },
  };
  // "guardando…" en la ventana hasta que se escribe lo último: recién ahí se
  // puede ocultar sin perder nada
  const yo = ++guardados;
  poner({guardando: true});
  laMemoria()
    .then(m => m.guardar(datos))
    .catch(e => console.warn('[superclaude] no pude guardar', e))
    .finally(() => {
      if (yo === guardados) {
        poner({guardando: false});
      }
    });
}

async function conFoto(m) {
  if (!Array.isArray(m?.content) || !m.content.some(b => b.source?.type === 'lazo')) {
    return m;
  }
  const data = await aBase64(rutaLazo);
  return {
    ...m,
    content: m.content.map(b =>
      b.source?.type === 'lazo' ? {type: 'image', source: {type: 'base64', media_type: 'image/png', data}} : b,
    ),
  };
}

// El botón de la barra. Si la memoria sigue (la tablet no tiró el JS), no
// hace nada: la ventana ya muestra la conversación. Si no, la trae de la Files
// API, y si quedó una pregunta sin respuesta, la vuelve a mandar.
export async function reabrir() {
  if (revivida || generacion > 0 || estado.ocupado || estado.turnos.length > 0) {
    return;
  }
  revivida = true;
  const yo = generacion;
  poner({ocupado: true, error: null, recuperando: true});
  let datos = null;
  try {
    await pedirPermisos();
    config = await cargarAjustes();
    datos = config.clave ? await (await laMemoria()).recuperar() : null;
    if (datos) {
      rutaLazo = datos.rutaLazo || null;
      datos.mensajes = await Promise.all((datos.mensajes || []).map(conFoto));
      if (datos.pendiente) {
        datos.pendiente.mensaje = await conFoto(datos.pendiente.mensaje);
      }
      // los dibujos, de vuelta desde la Files API, con lo que se sabía de cada uno
      for (const tu of datos.estado?.turnos || []) {
        if (tu.archivos?.length) {
          const bajados = await bajarDibujos({clave: config.clave, ids: tu.archivos}).catch(() => []);
          tu.dibujos = bajados.map(d => ({...d, ...(tu.dibujos || []).find(x => x.nombre === d.nombre)}));
        }
      }
    }
  } catch (e) {
    if (yo === generacion) {
      poner({ocupado: false, recuperando: false, error: t('couldNotRecover', {error: texto(e)})});
    }
    return;
  }
  if (yo !== generacion) {
    return; // mientras tanto empezó otra con el lazo
  }
  if (!datos) {
    poner({ocupado: false, recuperando: false});
    return;
  }
  mensajes = datos.mensajes || [];
  contenedor = datos.contenedor || null;
  hoja = datos.hoja || null;
  estado = {...vacio, ...datos.estado};
  if (datos.pendiente) {
    poner({ocupado: true, recuperando: false});
    try {
      await turno(yo, datos.pendiente.mensaje, datos.pendiente.pregunta);
    } catch (e) {
      if (yo === generacion) {
        poner({ocupado: false, error: texto(e)});
      }
    }
  } else {
    poner({ocupado: false, recuperando: false});
  }
}

async function mensajeImagen(ruta) {
  try {
    return mensajeConImagen(await aBase64(ruta));
  } catch (e) {
    console.warn('[superclaude] base64 falló, subo el archivo', e);
    const id = await subirImagen({
      clave: config.clave,
      archivo: {uri: uri(ruta), name: 'lazo.png', type: 'image/png'},
    });
    return mensajeConArchivo(id);
  }
}

function texto(e) {
  return e instanceof Error ? e.message : String(e);
}
