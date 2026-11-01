// La ventana: lo que seleccionó arriba, la conversación al medio y una caja
// para repreguntar abajo; o la pantalla de Ajustes. Blanco y negro, letra
// grande: es tinta electrónica.
import React, {useEffect, useState} from 'react';
import {
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {cargarAjustes, escucharAjustes, guardarAjustes} from './src/ajustes';
import {descartarSugerencia, escuchar, insertar, reabrir, repreguntar} from './src/conversacion';
import {TextoConMate} from './src/matematica';
import {Niveles, PantallaAjustes} from './src/PantallaAjustes';
import {t} from './src/textos.mjs';
import {escucharVista, mostrar} from './src/vista';
import {versionName as VERSION} from './PluginConfig.json';

export default function App() {
  const [estado, setEstado] = useState(null);
  const [ajustes, setAjustes] = useState(null);
  const [vista, setVista] = useState('chat');
  const [pregunta, setPregunta] = useState('');
  // Con el teclado abierto la ventana sube arriba y se achica a lo que queda
  // libre, para que se vea lo que se escribe. Si la tablet no avisa la altura
  // del teclado, se supone media pantalla.
  const [escribiendo, setEscribiendo] = useState(false);
  const [teclado, setTeclado] = useState(0);
  const {height: alto} = useWindowDimensions();

  useEffect(() => {
    const dejar = [escuchar(setEstado), escucharAjustes(a => setAjustes({...a})), escucharVista(setVista)];
    cargarAjustes();
    // Al ocultar, la tablet tira el JS: si la ventana aparece sin nada en
    // memoria, se trae la conversación guardada (no hace nada si ya está).
    reabrir();
    const mostrado = Keyboard.addListener('keyboardDidShow', e => setTeclado(e?.endCoordinates?.height || 0));
    const oculto = Keyboard.addListener('keyboardDidHide', () => {
      setTeclado(0);
      setEscribiendo(false);
    });
    dejar.push(() => mostrado.remove(), () => oculto.remove());
    return () => dejar.forEach(f => f());
  }, []);

  // Lo que el modelo barato adivina que se va a pedir queda escrito en la caja,
  // salvo que ya se haya empezado a escribir. La ✕ lo borra entero.
  const sugerencia = estado?.sugerencia;
  const vuelta = estado?.vuelta;
  useEffect(() => {
    setPregunta(''); // una selección nueva arranca con la caja vacía
  }, [vuelta]);
  useEffect(() => {
    if (sugerencia) {
      setPregunta(p => (p ? p : sugerencia));
    }
  }, [sugerencia]);

  if (!estado || !ajustes) {
    return null;
  }
  const {ocupado, imagen, seleccion, turnos, error, listo, esperando} = estado;

  const mandar = () => {
    if (!pregunta.trim() || ocupado) {
      return;
    }
    repreguntar(pregunta);
    setPregunta('');
    Keyboard.dismiss();
  };

  const borrar = () => {
    setPregunta('');
    descartarSugerencia();
  };

  const conTeclado = escribiendo || teclado > 0;
  const libre = alto - (teclado > 0 ? teclado : alto * 0.5);
  const arriba = conTeclado ? {justifyContent: 'flex-start', paddingTop: 16} : null;
  const achica = conTeclado ? {maxHeight: Math.max(240, libre - 32)} : null;

  return (
    <View style={[s.fondo, arriba]}>
      <View style={[s.ventana, achica]}>
        <View style={s.barra}>
          <Text style={s.titulo}>
            SuperClaude <Text style={s.version}>{VERSION}</Text>
            {estado.guardando ? <Text style={s.version}>  · {t('saving')}</Text> : null}
          </Text>
          <View style={s.fila}>
            {vista === 'chat' ? (
              <>
                <Niveles nivel={ajustes.nivel} onCambiar={nivel => guardarAjustes({nivel})} />
                <Pressable onPress={() => mostrar('ajustes')} style={[s.boton, s.separado]}>
                  <Text style={s.botonTexto}>⚙</Text>
                </Pressable>
              </>
            ) : null}
            {/* la conversación queda guardada: vuelve con el botón SuperClaude de la barra */}
            <Pressable onPress={() => PluginManager.closePluginView()} style={s.boton}>
              <Text style={s.botonTexto}>{t('hide')}</Text>
            </Pressable>
          </View>
        </View>

        {vista === 'ajustes' ? (
          <PantallaAjustes ajustes={ajustes} onVolver={() => mostrar('chat')} />
        ) : (
          <>
            <ScrollView
              style={s.cuerpo}
              contentContainerStyle={s.cuerpoAdentro}
              persistentScrollbar>
              {imagen ? (
                <Image source={{uri: imagen}} style={s.imagen} resizeMode="contain" />
              ) : null}
              {seleccion ? <Text style={s.seleccion}>“{seleccion}”</Text> : null}

              {turnos.map((tu, i) => (
                <View key={i} style={s.turno}>
                  {tu.pregunta ? <Text style={s.pregunta}>› {tu.pregunta}</Text> : null}
                  <TextoConMate texto={tu.respuesta} style={s.respuesta} />
                  {(tu.dibujos || []).map((d, j) => (
                    <View key={j} style={s.dibujoCaja}>
                      <Image source={{uri: d.uri}} style={s.dibujo} resizeMode="contain" />
                      {d.trazos ? (
                        <Pressable
                          onPress={() => insertar(i, j)}
                          disabled={d.estado === 'insertando'}
                          style={[s.boton, s.insertar]}>
                          <Text style={s.botonTexto}>
                            {d.estado === 'insertando'
                              ? t('inserting')
                              : d.estado === 'insertado'
                              ? t('insertAgain')
                              : t('insert')}
                          </Text>
                        </Pressable>
                      ) : null}
                      {d.nota ? <Text style={s.nota}>{d.nota}</Text> : null}
                    </View>
                  ))}
                </View>
              ))}

              {!ocupado && !error && turnos.length === 0 ? (
                <Text style={s.nota}>{listo ? t('whatToDo') : t('empty')}</Text>
              ) : null}
              {esperando ? <Text style={s.pregunta}>› {esperando}</Text> : null}
              {ocupado ? (
                <Text style={s.nota}>
                  {estado.recuperando ? t('recovering') : t('thinking')}
                </Text>
              ) : null}
              {error ? <Text style={s.error}>{t('couldNot', {error})}</Text> : null}
              {estado.faltaClave && !ajustes.clave ? (
                <Pressable onPress={() => mostrar('ajustes')} style={[s.boton, s.insertar]}>
                  <Text style={s.botonTexto}>⚙ {t('settings')}</Text>
                </Pressable>
              ) : null}
            </ScrollView>

            {turnos.length > 0 || listo ? (
              <View style={s.pie}>
                <TextInput
                  style={s.entrada}
                  value={pregunta}
                  onChangeText={setPregunta}
                  onSubmitEditing={mandar}
                  onFocus={() => setEscribiendo(true)}
                  onBlur={() => setEscribiendo(false)}
                  placeholder={turnos.length > 0 ? t('askAgain') : t('askFirst')}
                  editable={!ocupado}
                  multiline
                  blurOnSubmit
                  returnKeyType="send"
                />
                {pregunta && !ocupado ? (
                  <Pressable onPress={borrar} style={[s.boton, s.cruz]} hitSlop={12}>
                    <Text style={s.botonTexto}>✕</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={mandar} disabled={ocupado} style={s.boton}>
                  <Text style={s.botonTexto}>{t('send')}</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fondo: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  ventana: {
    width: '86%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#000',
    borderRadius: 12,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 2,
    borderColor: '#000',
  },
  fila: {flexDirection: 'row', alignItems: 'center'},
  separado: {marginHorizontal: 12},
  titulo: {fontSize: 30, fontWeight: '700', color: '#000'},
  // la versión a la vista: así se sabe si la tablet tomó la actualización
  version: {fontSize: 18, fontWeight: 'normal'},
  // flexShrink: sin esto el ScrollView no se achica al alto máximo de la
  // ventana, el contenido se corta abajo y no hay nada que escrolear
  cuerpo: {flexGrow: 0, flexShrink: 1},
  cuerpoAdentro: {padding: 20, paddingBottom: 32},
  imagen: {width: '100%', height: 220, marginBottom: 16},
  seleccion: {fontSize: 24, fontStyle: 'italic', color: '#000', marginBottom: 16},
  turno: {marginBottom: 18},
  pregunta: {fontSize: 24, fontWeight: '700', color: '#000', marginBottom: 6},
  respuesta: {fontSize: 28, lineHeight: 40, color: '#000'},
  // los dibujos salen a 6×4 pulgadas: misma proporción
  dibujoCaja: {marginTop: 12, alignItems: 'center'},
  dibujo: {width: '100%', aspectRatio: 1.5},
  insertar: {marginTop: 8, alignSelf: 'center'},
  nota: {fontSize: 26, color: '#000'},
  error: {fontSize: 26, color: '#000', fontWeight: '700'},
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderTopWidth: 2,
    borderColor: '#000',
  },
  // varias líneas, hasta un tope: una pregunta larga se ve entera
  entrada: {
    flex: 1,
    maxHeight: 160,
    textAlignVertical: 'top',
    fontSize: 26,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 12,
    color: '#000',
  },
  boton: {
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  botonTexto: {fontSize: 24, fontWeight: '700', color: '#000'},
  cruz: {marginRight: 12, paddingHorizontal: 12},
});
