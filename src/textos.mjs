// UI strings. The language comes from superclaude-config.json ("language");
// English by default. Claude's answers follow the user's prompt, not this.
const TEXTOS = {
  en: {
    hide: 'Hide',
    send: 'Send',
    askAgain: 'Ask a follow-up…',
    thinking: 'Thinking…',
    recovering: 'Recovering the conversation…',
    saving: 'saving…',
    empty: 'Nothing here yet. Lasso something and tap SuperClaude.',
    insert: 'Insert on page',
    inserting: 'Inserting…',
    insertAgain: 'Insert again',
    inserted: 'On the page: {trazos} strokes, {rotulos} labels.',
    couldNot: 'Could not: {error}',
    couldNotInsert: 'Could not insert it: {error}',
    couldNotRecover: 'could not recover the conversation: {error}',
    couldNotDownload: 'could not download the drawing: {error}',
    noKey:
      'No Anthropic API key. Put yours in {carpeta}/superclaude-api-key.txt (console.anthropic.com → API Keys).',
    noReadPermission: 'No permission to read files.',
    noInternetPermission: 'No internet permission.',
    noWritePermission: 'No permission to write on the page.',
    noPluginDir: 'Plugin folder not found.',
    noLassoImage: 'Could not get the lasso image.',
    noSelectedText: 'No text selected.',
    emptyImage: 'The image came out empty.',
    cannotReadImage: 'Could not read the image.',
    cannotOpenImage: 'Could not open the image.',
    noPage: 'Unknown page.',
    cannotMeasurePage: 'Could not measure the page.',
    cannotCreateStroke: 'Could not create a stroke.',
    cannotInsertStrokes: 'Could not insert the strokes.',
    refused: 'Claude declined to answer this.',
    truncated: '(cut off: too long)',
    noAnswer: '(no answer)',
  },
  es: {
    hide: 'Ocultar',
    send: 'Mandar',
    askAgain: 'Repreguntar…',
    thinking: 'Pensando…',
    recovering: 'Recuperando la conversación…',
    saving: 'guardando…',
    empty: 'Todavía no hay nada. Seleccioná algo con el lazo y tocá SuperClaude.',
    insert: 'Insertar en la hoja',
    inserting: 'Insertando…',
    insertAgain: 'Insertar otra vez',
    inserted: 'En la hoja: {trazos} trazos, {rotulos} rótulos.',
    couldNot: 'No pude: {error}',
    couldNotInsert: 'No pude insertarlo: {error}',
    couldNotRecover: 'no pude recuperar la conversación: {error}',
    couldNotDownload: 'no pude bajar el dibujo: {error}',
    noKey:
      'Falta la clave de Anthropic. Ponela en {carpeta}/superclaude-api-key.txt (console.anthropic.com → API Keys).',
    noReadPermission: 'Sin permiso de lectura.',
    noInternetPermission: 'Sin permiso de internet.',
    noWritePermission: 'Sin permiso para escribir en la hoja.',
    noPluginDir: 'No encontré el directorio del plugin.',
    noLassoImage: 'No pude sacar la imagen del lazo.',
    noSelectedText: 'No hay texto seleccionado.',
    emptyImage: 'La imagen salió vacía.',
    cannotReadImage: 'No pude leer la imagen.',
    cannotOpenImage: 'No pude abrir la imagen.',
    noPage: 'No sé en qué hoja estás.',
    cannotMeasurePage: 'No pude medir la hoja.',
    cannotCreateStroke: 'No pude crear un trazo.',
    cannotInsertStrokes: 'No pude insertar los trazos.',
    refused: 'Claude no quiso contestar esto.',
    truncated: '(se cortó: muy larga)',
    noAnswer: '(sin respuesta)',
  },
};

let idioma = 'en';

export function ponerIdioma(i) {
  idioma = TEXTOS[i] ? i : 'en';
}

export function t(clave, datos = {}) {
  const s = TEXTOS[idioma][clave] ?? TEXTOS.en[clave] ?? clave;
  return s.replace(/\{(\w+)\}/g, (_, k) => (datos[k] ?? `{${k}}`));
}
