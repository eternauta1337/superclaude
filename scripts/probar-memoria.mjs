// Prueba src/memoria.mjs en la compu, con un fs de mentira sobre node:fs que se
// porta como el FileUtils de la tablet (carpetas, sin escribir archivos):
//   node scripts/probar-memoria.mjs [respuesta.json]
// Con una respuesta real de la API (por ejemplo una con dibujo) mide cuántas
// carpetas ocupa.
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crearMemoria} from '../src/memoria.mjs';

const dir = mkdtempSync(join(tmpdir(), 'superclaude-'));
const fs = {
  dir,
  makeDir: async p => (mkdirSync(p, {recursive: true}), true),
  listFiles: async p => {
    if (!existsSync(p)) {
      throw new Error('Dir is not exists');
    }
    const l = readdirSync(p).map(n => ({path: join(p, n), type: 0}));
    return l.length ? l : null;
  },
  deleteDir: async p => (rmSync(p, {recursive: true, force: true}), true),
  renameToFile: async (a, b) => (renameSync(a, b), true),
};

const respuesta = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : null;
const datos = {
  mensajes: [
    {role: 'user', content: [{type: 'image', source: {type: 'lazo'}}, {type: 'text', text: 'Mirá esto.'}]},
    {role: 'assistant', content: respuesta?.content || [{type: 'text', text: 'Da $391$. ñandú √x → ∫ 🙂'}]},
    {role: 'user', content: 'y dividido 3? “comillas” y \\$ pesos'},
  ],
  pendiente: null,
  contenedor: respuesta?.container?.id || null,
  hoja: {ruta: '/storage/emulated/0/Note/Prueba.note', pagina: 3, lazo: {left: 10, top: 20, right: 300, bottom: 400}},
  rutaLazo: '/data/plugins/x/lazo.png',
  estado: {imagen: 'file:///data/plugins/x/lazo.png?v=1', seleccion: null, turnos: [{pregunta: null, respuesta: 'Da $391$', dibujos: [], archivos: []}]},
};

const m = crearMemoria(fs);
console.log('vacía al principio:', (await m.recuperar()) === null);
const t0 = Date.now();
await m.guardar(datos);
await m.guardar({...datos, segunda: true}); // la segunda reemplaza a la primera
const carpetas = readdirSync(join(dir, 'memoria')).length;
const vuelta = await m.recuperar();
const igual = JSON.stringify(vuelta.mensajes) === JSON.stringify(datos.mensajes) && vuelta.segunda === true;
console.log(`ida y vuelta igual: ${igual}; ${carpetas} carpetas; sin "memoria-nueva": ${!existsSync(join(dir, 'memoria-nueva'))}; ${Date.now() - t0} ms`);
console.log('JSON:', JSON.stringify(datos).length, 'caracteres');

// tres seguidos sin esperar (pregunta pendiente, respuesta, dibujo insertado):
// tiene que quedar el último
m.guardar({...datos, n: 1});
m.guardar({...datos, n: 2});
await m.guardar({...datos, n: 3});
const ultimo = await m.recuperar();
console.log('tres seguidos, queda el último:', ultimo.n === 3);
await m.olvidar();
console.log('olvidada:', (await m.recuperar()) === null);
rmSync(dir, {recursive: true, force: true});
process.exit(igual ? 0 : 1);
