// Qué muestra la ventana: el chat o Ajustes. Aparte del estado de la
// conversación, que se reemplaza entero al recuperarla.
let vista = 'chat';
const oyentes = new Set();

export function mostrar(v) {
  vista = v;
  oyentes.forEach(fn => fn(vista));
}

export function escucharVista(fn) {
  oyentes.add(fn);
  fn(vista);
  return () => oyentes.delete(fn);
}
