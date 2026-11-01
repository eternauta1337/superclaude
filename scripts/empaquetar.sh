#!/bin/bash
# Arma build/outputs/superclaude.snplg: el bundle de JS, sus assets, el icono y
# PluginConfig.json en un zip. Es lo mismo que hace el buildPlugin.sh de la
# plantilla de Ratta cuando el plugin no tiene código nativo (este no tiene),
# así que no hace falta Android SDK.
set -euo pipefail
cd "$(dirname "$0")/.."

nombre="$(node -p "require('./package.json').name")"
gen=build/generated
out=build/outputs

# src/semilla.js: vacía salvo que se arme con SUPERCLAUDE_SEMILLA_CLAVE, para
# una copia personal que trae la clave para cargarla la primera vez. No va al
# repo (.gitignore); lo que se comparte se arma sin la variable.
node -e '
  const fs = require("fs");
  const clave = (process.env.SUPERCLAUDE_SEMILLA_CLAVE || "").trim();
  fs.writeFileSync("src/semilla.js",
    "// Generado por scripts/empaquetar.sh. No va al repo.\nexport const SEMILLA_CLAVE = " + JSON.stringify(clave) + ";\n",
    {mode: 0o600});
  console.error(clave ? "con clave semilla (copia personal)" : "sin clave");
'

rm -rf "$gen" && mkdir -p "$gen" "$out"
npx react-native bundle --entry-file index.js --platform android --dev false \
  --bundle-output "$gen/$nombre.bundle" --assets-dest "$gen"

cp assets/icon.png "$gen/icon.png"
node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync("PluginConfig.json", "utf8"));
  cfg.iconPath = "/icon.png";
  fs.writeFileSync(process.argv[1], JSON.stringify(cfg, null, 2));
' "$gen/PluginConfig.json"

rm -f "$out/$nombre.snplg"
# sin depender de que esté instalado zip: python lo trae.
python3 -c '
import os, sys, zipfile
gen, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
    for raiz, _, archivos in os.walk(gen):
        for a in archivos:
            p = os.path.join(raiz, a)
            z.write(p, os.path.relpath(p, gen))
' "$gen" "$out/$nombre.snplg"
chmod 600 "$out/$nombre.snplg"
echo "$out/$nombre.snplg"
