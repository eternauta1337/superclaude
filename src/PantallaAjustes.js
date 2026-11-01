// La pantalla de Ajustes y el selector de nivel de modelo (que también va en
// la barra del chat).
import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {guardarAjustes, importarDeMyStyle} from './ajustes';
import {t} from './textos.mjs';

export function Niveles({nivel, onCambiar, grande}) {
  return (
    <View style={s.segmentos}>
      {['rapido', 'normal', 'maximo'].map((n, i) => (
        <Pressable
          key={n}
          onPress={() => onCambiar(n)}
          style={[s.segmento, i > 0 && s.segmentoSeparado, nivel === n && s.elegido]}>
          <Text style={[grande ? s.segmentoTextoGrande : s.segmentoTexto, nivel === n && s.elegidoTexto]}>
            {t(n)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Opciones({valor, opciones, onCambiar}) {
  return (
    <View style={s.segmentos}>
      {opciones.map(([v, etiqueta], i) => (
        <Pressable
          key={v}
          onPress={() => onCambiar(v)}
          style={[s.segmento, i > 0 && s.segmentoSeparado, valor === v && s.elegido]}>
          <Text style={[s.segmentoTextoGrande, valor === v && s.elegidoTexto]}>{etiqueta}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PantallaAjustes({ajustes, onVolver}) {
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [prompt, setPrompt] = useState(ajustes.prompt);
  const [nota, setNota] = useState(null);

  const guardar = async () => {
    const cambios = {prompt};
    if (clave.trim()) {
      cambios.clave = clave.trim();
    }
    await guardarAjustes(cambios);
    setClave('');
    setNota(t('saved'));
  };

  const importar = async () => {
    setNota(null);
    try {
      const r = await importarDeMyStyle();
      const que = Object.keys(r);
      if (que.length === 0) {
        setNota(t('importNothing'));
        return;
      }
      if (r.prompt !== undefined) {
        setPrompt(r.prompt);
      }
      await guardarAjustes(r);
      setNota(t('imported', {que: que.map(q => (q === 'clave' ? t('apiKey') : t('prompt'))).join(', ')}));
    } catch (e) {
      setNota(`${t('couldNot', {error: e instanceof Error ? e.message : String(e)})}`);
    }
  };

  const guardada = ajustes.clave ? `…${ajustes.clave.slice(-6)}` : '—';

  return (
    <ScrollView style={s.cuerpo} contentContainerStyle={s.adentro} keyboardShouldPersistTaps="handled">
      <Text style={s.etiqueta}>{t('apiKey')}</Text>
      <Text style={s.ayuda}>{t('apiKeyHint')}</Text>
      <Text style={s.ayuda}>{t('apiKeySaved', {fin: guardada})}</Text>
      <View style={s.fila}>
        <TextInput
          style={[s.entrada, s.flex]}
          value={clave}
          onChangeText={setClave}
          placeholder="sk-ant-…"
          secureTextEntry={!verClave}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={() => setVerClave(!verClave)} style={[s.boton, s.margenIzq]}>
          <Text style={s.botonTexto}>{verClave ? t('hideKey') : t('show')}</Text>
        </Pressable>
      </View>

      <Text style={s.etiqueta}>{t('model')}</Text>
      <Niveles nivel={ajustes.nivel} onCambiar={nivel => guardarAjustes({nivel})} grande />

      <Text style={s.etiqueta}>{t('language')}</Text>
      <Opciones
        valor={ajustes.idioma}
        opciones={[
          ['en', 'English'],
          ['es', 'Español'],
        ]}
        onCambiar={idioma => guardarAjustes({idioma})}
      />

      <Text style={s.etiqueta}>{t('prompt')}</Text>
      <Text style={s.ayuda}>{t('promptHint')}</Text>
      <TextInput
        style={[s.entrada, s.multilinea]}
        value={prompt}
        onChangeText={setPrompt}
        multiline
        textAlignVertical="top"
      />

      <View style={[s.fila, s.botones]}>
        <Pressable onPress={guardar} style={s.boton}>
          <Text style={s.botonTexto}>{t('save')}</Text>
        </Pressable>
        <Pressable onPress={importar} style={[s.boton, s.margenIzq]}>
          <Text style={s.botonTexto}>{t('import')}</Text>
        </Pressable>
        <Pressable onPress={onVolver} style={[s.boton, s.margenIzq]}>
          <Text style={s.botonTexto}>{t('back')}</Text>
        </Pressable>
      </View>
      {nota ? <Text style={s.nota}>{nota}</Text> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  cuerpo: {flexGrow: 0, flexShrink: 1},
  adentro: {padding: 20, paddingBottom: 32},
  etiqueta: {fontSize: 26, fontWeight: '700', color: '#000', marginTop: 20, marginBottom: 6},
  ayuda: {fontSize: 20, color: '#000', marginBottom: 6},
  fila: {flexDirection: 'row', alignItems: 'center'},
  flex: {flex: 1},
  margenIzq: {marginLeft: 12},
  botones: {marginTop: 24, flexWrap: 'wrap'},
  entrada: {
    fontSize: 24,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#000',
  },
  multilinea: {minHeight: 180},
  boton: {borderWidth: 2, borderColor: '#000', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16},
  botonTexto: {fontSize: 24, fontWeight: '700', color: '#000'},
  nota: {fontSize: 22, color: '#000', marginTop: 12},
  segmentos: {flexDirection: 'row', borderWidth: 2, borderColor: '#000', borderRadius: 8, overflow: 'hidden', alignSelf: 'flex-start'},
  segmento: {paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff'},
  segmentoSeparado: {borderLeftWidth: 2, borderColor: '#000'},
  elegido: {backgroundColor: '#000'},
  segmentoTexto: {fontSize: 20, fontWeight: '700', color: '#000'},
  segmentoTextoGrande: {fontSize: 24, fontWeight: '700', color: '#000'},
  elegidoTexto: {color: '#fff'},
});
