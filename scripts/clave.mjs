// Escribe src/clave.js con la clave de Anthropic que va adentro del plugin.
// De dónde: $LAZO_CLAUDE_KEY o ~/.config/anthropic/supernote-key (0600).
// Tiene que ser una clave propia del plugin, con tope de gasto: queda en la
// tablet y en el .snplg.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const archivo = join(homedir(), '.config/anthropic/supernote-key');

export function leerClave() {
  if (process.env.LAZO_CLAUDE_KEY) {
    return process.env.LAZO_CLAUDE_KEY.trim();
  }
  return existsSync(archivo) ? readFileSync(archivo, 'utf8').trim() : '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Sin clave es lo normal (la versión para compartir): cada uno pone la suya
  // en MyStyle/superclaude-api-key.txt. Con clave, queda adentro del paquete
  // como respaldo, para una copia personal.
  const clave = (process.env.SUPERCLAUDE_API_KEY || '').trim();
  if (!clave) {
    console.error(`Sin clave adentro del paquete: se lee de MyStyle/superclaude-api-key.txt.`);
  }
  writeFileSync(
    join(raiz, 'src/clave.js'),
    `// Generado por scripts/clave.mjs. No va al repo.\nexport const CLAVE = ${JSON.stringify(clave)};\n`,
    {mode: 0o600},
  );
  console.error(clave ? 'src/clave.js listo, con clave.' : 'src/clave.js listo, vacío.');
}
