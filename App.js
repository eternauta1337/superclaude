// La ventana: lo que seleccionó arriba, la conversación al medio y una caja
// para repreguntar abajo. Blanco y negro, letra grande: es tinta electrónica.
import React, {useEffect, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {escuchar, insertar, reabrir, repreguntar} from './src/conversacion';
import {TextoConMate} from './src/matematica';
import {t} from './src/textos.mjs';
import {versionName as VERSION} from './PluginConfig.json';

export default function App() {
  const [estado, setEstado] = useState(null);
  const [pregunta, setPregunta] = useState('');

  useEffect(() => {
    const dejar = escuchar(setEstado);
    // Al ocultar, la tablet tira el JS: si la ventana aparece sin nada en
    // memoria, se trae la conversación guardada (no hace nada si ya está).
    reabrir();
    return dejar;
  }, []);

  if (!estado) {
    return null;
  }
  const {ocupado, imagen, seleccion, turnos, error} = estado;

  const mandar = () => {
    repreguntar(pregunta);
    setPregunta('');
  };

  return (
    <View style={s.fondo}>
      <View style={s.ventana}>
        <View style={s.barra}>
          <Text style={s.titulo}>
            SuperClaude <Text style={s.version}>{VERSION}</Text>
            {estado.guardando ? <Text style={s.version}>  · {t('saving')}</Text> : null}
          </Text>
          {/* la conversación queda guardada: vuelve con el botón SuperClaude de la barra */}
          <Pressable onPress={() => PluginManager.closePluginView()} style={s.boton}>
            <Text style={s.botonTexto}>{t('hide')}</Text>
          </Pressable>
        </View>

        <ScrollView
          style={s.cuerpo}
          contentContainerStyle={s.cuerpoAdentro}
          persistentScrollbar>
          {imagen ? (
            <Image source={{uri: imagen}} style={s.imagen} resizeMode="contain" />
          ) : null}
          {seleccion ? <Text style={s.seleccion}>“{seleccion}”</Text> : null}

          {turnos.map((t, i) => (
            <View key={i} style={s.turno}>
              {t.pregunta ? <Text style={s.pregunta}>› {t.pregunta}</Text> : null}
              <TextoConMate texto={t.respuesta} style={s.respuesta} />
              {(t.dibujos || []).map((d, j) => (
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
            <Text style={s.nota}>{t('empty')}</Text>
          ) : null}
          {ocupado ? (
            <Text style={s.nota}>
              {estado.recuperando ? t('recovering') : t('thinking')}
            </Text>
          ) : null}
          {error ? <Text style={s.error}>{t('couldNot', {error})}</Text> : null}
        </ScrollView>

        {turnos.length > 0 ? (
          <View style={s.pie}>
            <TextInput
              style={s.entrada}
              value={pregunta}
              onChangeText={setPregunta}
              onSubmitEditing={mandar}
              placeholder={t('askAgain')}
              editable={!ocupado}
              returnKeyType="send"
            />
            <Pressable onPress={mandar} disabled={ocupado} style={s.boton}>
              <Text style={s.botonTexto}>{t('send')}</Text>
            </Pressable>
          </View>
        ) : null}
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
  entrada: {
    flex: 1,
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
});
