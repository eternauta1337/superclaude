// Prueba desde la compu el mismo pedido que hace la tablet, con un PNG cualquiera:
//   node scripts/probar-claude.mjs muestra.png ["repregunta"]
// Con SUPERCLAUDE_PROMPT=archivo.txt usa ese prompt de usuario (lo mismo que
// "Tus instrucciones para Claude" en Ajustes).
// Los dibujos que haga Claude quedan al lado del PNG: muestra-dibujo-1.png y
// muestra-dibujo-1.trazos.json (lo que se insertaría en la hoja), ...
import {readFileSync, writeFileSync} from 'node:fs';
import {bajarDibujos, mensajeConImagen, preguntar} from '../src/claude.mjs';


const [png, repregunta] = process.argv.slice(2);
if (!png) {
  console.error('Uso: node scripts/probar-claude.mjs imagen.png ["repregunta"]');
  process.exit(2);
}
const clave = (process.env.SUPERCLAUDE_API_KEY || '').trim();
if (!clave) {
  console.error('Falta la clave: SUPERCLAUDE_API_KEY=sk-ant-… node scripts/probar-claude.mjs …');
  process.exit(1);
}

const promptUsuario = process.env.SUPERCLAUDE_PROMPT
  ? readFileSync(process.env.SUPERCLAUDE_PROMPT, 'utf8')
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .join('\n')
      .trim()
  : '';

let n = 0;
async function mostrar(r, t0) {
  console.log(r.texto);
  for (const d of await bajarDibujos({clave, ids: r.archivos})) {
    const destino = png.replace(/\.png$/i, '') + `-dibujo-${++n}`;
    writeFileSync(`${destino}.png`, Buffer.from(d.uri.split(',')[1], 'base64'));
    if (d.trazos) {
      writeFileSync(`${destino}.trazos.json`, JSON.stringify(d.trazos));
    }
    const t = d.trazos ? `${d.trazos.trazos.length} trazos, ${d.trazos.textos.length} rótulos` : 'sin trazos';
    console.log(`[dibujo "${d.nombre}": ${destino}.png, ${t}]`);
  }
  console.error(`-- ${((Date.now() - t0) / 1000).toFixed(1)} s, ${r.uso?.output_tokens} tokens de salida`);
}

let mensajes = [mensajeConImagen(readFileSync(png).toString('base64'))];
let t0 = Date.now();
const r = await preguntar({clave, messages: mensajes, promptUsuario});
await mostrar(r, t0);

if (repregunta) {
  mensajes = [...mensajes, r.mensaje, {role: 'user', content: repregunta}];
  t0 = Date.now();
  console.log(`\n› ${repregunta}`);
  await mostrar(await preguntar({clave, messages: mensajes, contenedor: r.contenedor, promptUsuario}), t0);
}
