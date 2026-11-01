import {AppRegistry, Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import App from './App';
import {name as appName} from './app.json';
import {empezar, reabrir} from './src/conversacion';
import {mostrar} from './src/vista';

const BOTON_LAZO = 7101;
const BOTON_TEXTO = 7102;
const BOTON_BARRA = 7103;

const icono = Image.resolveAssetSource(require('./assets/icon.png')).uri;

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// En el lazo: trazos, títulos, imágenes, texto y figuras (no links solos).
PluginManager.registerButton(2, ['NOTE', 'DOC'], {
  id: BOTON_LAZO,
  name: 'SuperClaude',
  icon: icono,
  editDataTypes: [0, 1, 2, 3, 5],
  showType: 1,
});

// Texto subrayado en un PDF o EPUB.
PluginManager.registerButton(3, ['DOC'], {
  id: BOTON_TEXTO,
  name: 'SuperClaude',
  icon: icono,
  showType: 1,
});

// En la barra de herramientas: vuelve a abrir la última conversación. Al
// ocultar la ventana la tablet tira la memoria, así que la trae guardada
// (src/memoria.js). No pregunta nada nuevo.
PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: BOTON_BARRA,
  name: 'SuperClaude',
  icon: icono,
  showType: 1,
});

PluginManager.registerButtonListener({
  onButtonPress(event) {
    mostrar('chat');
    if (event?.id === BOTON_LAZO) {
      empezar('lazo');
    } else if (event?.id === BOTON_TEXTO) {
      empezar('texto');
    } else if (event?.id === BOTON_BARRA) {
      reabrir();
    }
  },
});

// El botón de configuración que la tablet muestra en Ajustes → Apps → Plugins:
// abre la pantalla de Ajustes del plugin (clave, modelo, idioma, prompt).
PluginManager.registerConfigButton();
PluginManager.registerConfigButtonListener({
  onClick() {
    mostrar('ajustes');
    PluginManager.showPluginView();
  },
});
