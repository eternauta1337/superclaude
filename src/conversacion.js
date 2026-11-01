// El estado de la ventana: una conversación por toque del botón. index.js la
// arranca y App.js la dibuja y la sigue.
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {cargarAjustes, nivelActual} from './ajustes';
import {t} from './textos.mjs';
import {
  bajarDibujos,
  borrarArchivo,
  conPagina,
  mensajeConArchivo,
  mensajeConImagen,
  mensajeConTexto,
  preguntar,
  REVISION,
  subirModulos,
  subirImagen,
  sugerir,
} from './claude.mjs';
import {aBase64, imagenDeLaPagina, imagenDelLazo, pedirPermisos, textoSeleccionado, uri} from './captura';
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
  listo: false, // la selección está tomada y espera que se escriba qué hacer
  esperando: null, // la pregunta que Claude está contestando, para mostrarla
  sugerencia: null, // lo que el modelo barato cree que se va a pedir
  error: null,
};

// En el primer mensaje, el lugar donde va lo que escribe: la selección se
// toma al tocar el botón, pero no se manda hasta que se escribe qué hacer.
const PREGUNTA = '{{pregunta}}';
function conPregunta(m, p) {
  const poner = x => x.split(PREGUNTA).join(p);
  return typeof m.content === 'string'
    ? {...m, content: poner(m.content)}
    : {...m, content: m.content.map(b => (b.type === 'text' ? {...b, text: poner(b.text)} : b))};
}

let estado = vacio;
let mensajes = [];
let contenedor = null; // el del código de Claude, para que la repregunta siga ahí
let hoja = null; // {ruta, pagina, lazo}: dónde insertar los dibujos
let generacion = 0; // descarta respuestas de una conversación vieja
let pendiente = null; // {mensaje, pregunta} mientras Claude piensa
let revivida = false; // reabrir() ya trajo la guardada
let config = null; // los ajustes: clave, prompt, nivel (ver ajustes.js)
let rutaLazo = null; // lazo.png en el directorio del plugin: la foto se relee de ahí
let rutaPagina = null; // pagina.png, la página entera que va de contexto
let datosPagina = null; // su base64, para reconocerla al guardar
let borrador = null; // el primer mensaje, armado, hasta que se escriba la pregunta
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
  const anteriores = estado.turnos;
  mensajes = [];
  contenedor = null;
  hoja = null;
  pendiente = null;
  rutaLazo = null;
  rutaPagina = null;
  datosPagina = null;
  borrador = null;
  estado = vacio;
  poner({ocupado: true, vuelta: yo});
  try {
    await pedirPermisos();
    config = await cargarAjustes();
    if (!config.clave) {
      poner({faltaClave: true});
      throw new Error(t('noKey'));
    }
    // Los dibujos de la conversación que se reemplaza se borran de la Files
    // API (no vencen solos). Si la memoria se perdió al ocultar, salen de la
    // guardada, que se lee antes de que la nueva la pise.
    const viejos = anteriores.length
      ? anteriores
      : (await (await laMemoria()).recuperar().catch(() => null))?.estado?.turnos || [];
    viejos
      .flatMap(tu => [...(tu.archivos || []), ...(tu.subidos || [])])
      .forEach(fileId => borrarArchivo({clave: config.clave, fileId}).catch(() => null));
    let primero;
    let ctx;
    if (origen === 'texto') {
      const seleccion = await textoSeleccionado();
      poner({seleccion});
      primero = mensajeConTexto(seleccion, PREGUNTA);
      ctx = await contexto().catch(() => null);
    } else {
      // dónde está la selección, para insertar los dibujos debajo
      hoja = await contexto().catch(() => null);
      ctx = hoja;
      const ruta = await imagenDelLazo();
      rutaLazo = ruta;
      poner({imagen: uri(ruta) + `?v=${yo}`});
      primero = await mensajeImagen(ruta);
    }
    primero = await sumarPagina(primero, ctx);
    if (yo !== generacion) {
      return;
    }
    borrador = primero;
    poner({ocupado: false, listo: true});
    guardarTodo();
    adivinar(yo, primero);
  } catch (e) {
    if (yo === generacion) {
      poner({ocupado: false, error: texto(e)});
    }
  }
}

export async function repreguntar(pregunta) {
  const p = pregunta.trim();
  if (!p || estado.ocupado || (mensajes.length === 0 && !borrador)) {
    return false;
  }
  const yo = generacion;
  poner({ocupado: true, error: null});
  try {
    await turno(yo, mensajes.length === 0 ? conPregunta(borrador, p) : {role: 'user', content: p}, p);
  } catch (e) {
    if (yo === generacion) {
      poner({ocupado: false, esperando: null, fase: null, error: texto(e)});
    }
  }
  return true;
}

async function turno(yo, mensaje, pregunta) {
  poner({esperando: pregunta});
  config = await cargarAjustes(); // por si cambiaron la clave o el nivel en Ajustes
  // La primera pregunta lleva los módulos de dibujo, que quedan en el
  // contenedor para toda la conversación. Si no suben, se pregunta igual:
  // sólo los dibujos van a fallar.
  const lista = c => (typeof c === 'string' ? [{type: 'text', text: c}] : c);
  let sinModulos = null;
  if (mensajes.length === 0 && !lista(mensaje.content).some(b => b.type === 'container_upload')) {
    try {
      const m = await subirModulos({clave: config.clave});
      mensaje = {...mensaje, content: [...m.bloques, ...lista(mensaje.content)]};
    } catch (e) {
      console.warn('[superclaude] no subieron los módulos de dibujo', e);
      sinModulos = texto(e);
    }
  }
  // Se guarda antes de preguntar: si se oculta la ventana mientras Claude
  // piensa, la tablet corta el pedido, y al reabrir se vuelve a mandar.
  pendiente = {mensaje, pregunta};
  guardarTodo();
  const nivel = nivelActual();
  const pedir = (messages, cont) =>
    preguntar({
      clave: config.clave,
      messages,
      contenedor: cont,
      modelo: nivel.modelo,
      esfuerzo: nivel.esfuerzo,
      maxTokens: nivel.maxTokens,
      revisa: !!nivel.revisa,
      promptUsuario: config.prompt,
      idioma: config.idioma,
      alAvanzar: fase => yo === generacion && estado.fase !== fase && poner({fase}),
    });
  const r = await pedir([...mensajes, mensaje], contenedor);
  if (yo !== generacion) {
    return;
  }
  pendiente = null;
  borrador = null;
  // los módulos van en el primer mensaje (también si se reenvió al reabrir)
  const delPrimero =
    mensajes.length === 0 ? lista(mensaje.content).filter(b => b.type === 'container_upload').map(b => b.file_id) : [];
  mensajes = [...mensajes, mensaje, ...r.mensajes];
  contenedor = r.contenedor;
  let respuesta = r.texto;
  if (sinModulos) {
    respuesta += `\n\n(${t('noModules', {error: sinModulos})})`;
  }
  let archivos = r.archivos;
  const subidos = [...delPrimero, ...r.subidos];
  let dibujos = [];
  if (archivos.length) {
    try {
      dibujos = await bajarDibujos({clave: config.clave, ids: archivos});
    } catch (e) {
      respuesta += `\n\n(${t('couldNotDownload', {error: texto(e)})})`;
    }
  }
  // Best: Claude mira cómo le quedaron los dibujos (no lo que va a la hoja
  // sin pedirlo) y los rehace si puede mejorarlos. Si la revisión falla, vale
  // lo que ya había.
  const aRevisar = dibujos.filter(d => !/^hoja/i.test(d.nombre));
  if (nivel.revisa && aRevisar.length && yo === generacion) {
    poner({fase: 'reviewing'});
    try {
      const revision = {
        role: 'user',
        content: [
          // por file_id y no en base64: la conversación se guarda en la tablet
          ...aRevisar.map(d => ({type: 'image', source: {type: 'file', file_id: d.id}})),
          {type: 'text', text: REVISION},
        ],
      };
      const r2 = await pedir([...mensajes, revision], contenedor);
      if (yo !== generacion) {
        return;
      }
      mensajes = [...mensajes, revision, ...r2.mensajes];
      contenedor = r2.contenedor;
      subidos.push(...r2.subidos);
      if (r2.archivos.length) {
        archivos = [...archivos, ...r2.archivos];
        dibujos = await bajarDibujos({clave: config.clave, ids: archivos});
      }
    } catch (e) {
      console.warn('[superclaude] la revisión falló', e);
    }
  }
  if (yo !== generacion) {
    return;
  }
  poner({
    ocupado: false,
    esperando: null,
    fase: null,
    listo: false,
    sugerencia: null,
    turnos: [...estado.turnos, {pregunta, respuesta, dibujos, archivos, subidos}],
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
    const nota = t(r.capa != null ? 'insertedLayer' : 'inserted', {trazos: r.trazos, rotulos: r.rotulos});
    marcar(i, j, {estado: 'insertado', nota: r.aviso ? `${nota} ${r.aviso}` : nota});
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
            b.type === 'image' && b.source?.type === 'base64'
              ? {type: 'image', source: {type: datosPagina && b.source.data === datosPagina ? 'pagina' : 'lazo'}}
              : b,
          ),
        }
      : m;
  const {imagen, seleccion, turnos} = estado;
  const datos = {
    mensajes: mensajes.map(sinFoto),
    pendiente: pendiente && {...pendiente, mensaje: sinFoto(pendiente.mensaje)},
    borrador: borrador && sinFoto(borrador),
    contenedor,
    hoja,
    rutaLazo,
    rutaPagina,
    estado: {
      imagen,
      seleccion,
      listo: estado.listo,
      sugerencia: estado.sugerencia,
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
  const marcas = Array.isArray(m?.content) ? m.content.map(b => b.source?.type) : [];
  if (!marcas.includes('lazo') && !marcas.includes('pagina')) {
    return m;
  }
  const data = marcas.includes('lazo') ? await aBase64(rutaLazo) : null;
  // la página es contexto: si no se puede releer, se sigue sin ella
  const pagina = marcas.includes('pagina') && rutaPagina ? await aBase64(rutaPagina).catch(() => null) : null;
  datosPagina = pagina;
  const png = d => ({type: 'image', source: {type: 'base64', media_type: 'image/png', data: d}});
  return {
    ...m,
    content: m.content.flatMap(b =>
      b.source?.type === 'lazo' ? [png(data)] : b.source?.type === 'pagina' ? (pagina ? [png(pagina)] : []) : [b],
    ),
  };
}

// El botón de la barra. Si la memoria sigue (la tablet no tiró el JS), no
// hace nada: la ventana ya muestra la conversación. Si no, la trae de la Files
// API, y si quedó una pregunta sin respuesta, la vuelve a mandar.
export async function reabrir() {
  if (revivida || generacion > 0 || estado.ocupado || estado.turnos.length > 0 || borrador) {
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
      rutaPagina = datos.rutaPagina || null;
      datos.mensajes = await Promise.all((datos.mensajes || []).map(conFoto));
      if (datos.pendiente) {
        datos.pendiente.mensaje = await conFoto(datos.pendiente.mensaje);
      }
      if (datos.borrador) {
        datos.borrador = await conFoto(datos.borrador);
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
  borrador = datos.borrador || null;
  estado = {...vacio, ...datos.estado, listo: !!borrador};
  if (datos.pendiente) {
    poner({ocupado: true, recuperando: false});
    try {
      await turno(yo, datos.pendiente.mensaje, datos.pendiente.pregunta);
    } catch (e) {
      if (yo === generacion) {
        poner({ocupado: false, fase: null, error: texto(e)});
      }
    }
  } else {
    poner({ocupado: false, recuperando: false});
  }
}

async function mensajeImagen(ruta) {
  try {
    return mensajeConImagen(await aBase64(ruta), PREGUNTA);
  } catch (e) {
    console.warn('[superclaude] base64 falló, subo el archivo', e);
    const id = await subirImagen({
      clave: config.clave,
      archivo: {uri: uri(ruta), name: 'lazo.png', type: 'image/png'},
    });
    return mensajeConArchivo(id, PREGUNTA);
  }
}

// La sugerencia para la caja, sólo para la primera pregunta. Si falla o
// tarda, no pasa nada: la caja queda vacía.
function adivinar(yo, primero) {
  sugerir({
    clave: config.clave,
    mensaje: conPregunta(primero, '(not written yet)'),
    idioma: config.idioma,
    promptUsuario: config.prompt,
  })
    .then(texto => {
      if (yo === generacion && borrador && texto) {
        poner({sugerencia: texto});
        guardarTodo();
      }
    })
    .catch(e => console.warn('[superclaude] sin sugerencia', e));
}

// La ✕ de la caja: la sugerencia no vuelve, ni al reabrir.
export function descartarSugerencia() {
  if (estado.sugerencia) {
    poner({sugerencia: null});
    guardarTodo();
  }
}

// La página entera, de contexto. Si no sale (un formato raro, un firmware
// viejo), la pregunta va igual, sólo con la selección.
async function sumarPagina(mensaje, ctx) {
  try {
    const {ruta, lugar} = await imagenDeLaPagina(ctx);
    const data = await aBase64(ruta);
    rutaPagina = ruta;
    datosPagina = data;
    return conPagina(mensaje, data, lugar);
  } catch (e) {
    console.warn('[superclaude] sin la página de contexto', e);
    return mensaje;
  }
}

function texto(e) {
  return e instanceof Error ? e.message : String(e);
}
