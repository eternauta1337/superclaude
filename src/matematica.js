// LaTeX en la línea, sin WebView ni SVG (el plugin no tiene módulos nativos):
// KaTeX sólo interpreta, y el árbol se dibuja con <Text> y <View> de React
// Native. Cubre lo que aparece en una respuesta corta: fracciones, potencias e
// índices, raíces, sumatorias e integrales, matrices, letras griegas y
// operadores. Lo que no entiende lo muestra como texto; si KaTeX no puede
// leerlo, sale el LaTeX crudo.
import React from 'react';
import {PixelRatio, StyleSheet, Text, View} from 'react-native';
import katex from 'katex';

// Corta el texto en trozos de texto y de matemática: $$…$$ aparte, $…$ en la
// línea. \$ es un signo pesos.
export function partir(original) {
  // \$ se aparta antes (sin lookbehind: no se sabe si Hermes lo tiene)
  const PESOS = '\u0000';
  const texto = original.replace(/\\\$/g, PESOS);
  const trozos = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) {
      trozos.push({tipo: 'texto', valor: texto.slice(ultimo, m.index)});
    }
    trozos.push(
      m[1] !== undefined
        ? {tipo: 'bloque', valor: m[1].trim()}
        : {tipo: 'linea', valor: m[2].trim()},
    );
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) {
    trozos.push({tipo: 'texto', valor: texto.slice(ultimo)});
  }
  return trozos.map(t => ({
    ...t,
    valor: t.valor.split(PESOS).join(t.tipo === 'texto' ? '$' : '\\$'),
  }));
}

// Un párrafo sin fórmulas es un <Text> común. Uno con fórmulas en la línea se
// arma como fila que se parte (flexWrap), palabra por palabra: en Android un
// <Text> con <View> adentro mide mal su alto y corta el último renglón (se vio en
// un Manta, 01/11/2026).
export function TextoConMate({texto, style}) {
  const tam = StyleSheet.flatten(style)?.fontSize || 28;
  const parrafos = [];
  let actual = [];
  const cerrar = () => {
    parrafos.push({tipo: 'parrafo', partes: actual});
    actual = [];
  };
  for (const t of partir(texto)) {
    if (t.tipo === 'bloque') {
      cerrar();
      parrafos.push(t);
    } else if (t.tipo === 'linea') {
      actual.push(t);
    } else {
      t.valor.split('\n').forEach((renglon, k) => {
        if (k > 0) {
          cerrar();
        }
        if (renglon) {
          actual.push({tipo: 'texto', valor: renglon});
        }
      });
    }
  }
  cerrar();

  return (
    <View>
      {parrafos.map((p, i) => {
        if (p.tipo === 'bloque') {
          return (
            <View key={i} style={s.bloque}>
              <Formula fuente={p.valor} tam={tam * 1.1} bloque />
            </View>
          );
        }
        if (p.partes.length === 0) {
          // renglón vacío entre párrafos
          return <View key={i} style={{height: tam * 0.5}} />;
        }
        if (p.partes.every(x => x.tipo === 'texto')) {
          return (
            <Text key={i} style={style}>
              {p.partes.map(x => x.valor).join('')}
            </Text>
          );
        }
        const piezas = [];
        p.partes.forEach((x, j) => {
          if (x.tipo === 'linea') {
            piezas.push(
              <View key={`f${j}`} style={s.enLinea}>
                <Formula fuente={x.valor} tam={tam} />
              </View>,
            );
          } else {
            // cada palabra con su espacio, para que la fila pueda partirse
            (x.valor.match(/[^ ]+ *| +/g) || []).forEach((palabra, k) => {
              piezas.push(
                <Text key={`t${j}-${k}`} style={[style, s.palabra]}>
                  {palabra}
                </Text>,
              );
            });
          }
        });
        return (
          <View key={i} style={s.parrafo}>
            {piezas}
          </View>
        );
      })}
    </View>
  );
}

// Para donde no se puede dibujar (los rótulos insertados en la hoja): el LaTeX
// pasa a texto con Unicode, x^2 → x², \alpha → α, \frac{a}{b} → a/b.
export function aTextoPlano(texto) {
  return partir(texto)
    .map(t => {
      if (t.tipo === 'texto') {
        return t.valor;
      }
      try {
        return plano(katex.__parse(t.valor, {throwOnError: true}));
      } catch {
        return t.valor;
      }
    })
    .join('');
}

const SUPER = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ', i: 'ⁱ'};
const SUB = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋'};

function plano(nodos) {
  return []
    .concat(nodos || [])
    .map(n => {
      if (!n) {
        return '';
      }
      switch (n.type) {
        case 'supsub': {
          const base = plano(n.base);
          const sup = n.sup ? plano(n.sup) : '';
          const sub = n.sub ? plano(n.sub) : '';
          const conv = (t, m, a) => ([...t].every(c => m[c]) ? [...t].map(c => m[c]).join('') : `${a}(${t})`);
          return base + (sub ? conv(sub, SUB, '_') : '') + (sup ? conv(sup, SUPER, '^') : '');
        }
        case 'genfrac':
          return `${parentesis(plano(n.numer))}/${parentesis(plano(n.denom))}`;
        case 'sqrt':
          return `√${parentesis(plano(n.body))}`;
        case 'op':
          return n.symbol ? simbolo(n.name) : n.name ? n.name.replace(/^\\/, '') : plano(n.body);
        case 'leftright':
          return delim(n.left) + plano(n.body) + delim(n.right);
        case 'font':
          return n.font === 'mathbb' ? [...plano(n.body)].map(c => DOBLE[c] || c).join('') : plano(n.body);
        case 'spacing':
        case 'kern':
          return ' ';
        default:
          if (n.text !== undefined) {
            return simbolo(n.text);
          }
          return plano(n.body || n.base || []);
      }
    })
    .join('');
}

function parentesis(t) {
  return t.length > 1 ? `(${t})` : t;
}

function Formula({fuente, tam, bloque}) {
  let arbol;
  try {
    arbol = katex.__parse(fuente, {displayMode: !!bloque, throwOnError: true});
  } catch {
    return <Text style={{fontSize: tam, color: '#000'}}>{fuente}</Text>;
  }
  return (
    <View style={s.fila}>{lista(arbol, {tam, bloque: !!bloque})}</View>
  );
}

const MIN = 14;
const CURSIVA = false;

// Grosor de las rayas (fracción, raíz): un número entero de píxeles reales y
// no menos de 2. Con 1,75 px la raya salía gris, y la tinta electrónica la
// mostraba a pedazos: una rayita corta sobre la raíz y un "=" en las
// fracciones (se vio en un Manta, 01/11/2026).
function raya(tam) {
  const px = Math.max(2, Math.round(PixelRatio.getPixelSizeForLayoutSize(tam / 14)));
  return px / PixelRatio.get();
}
const chico = tam => Math.max(MIN, tam * 0.7);

function lista(nodos, ctx) {
  return (nodos || []).map((n, i) => <Nodo key={i} n={n} ctx={ctx} />);
}

function grupo(n, ctx) {
  if (!n) {
    return null;
  }
  if (n.type === 'ordgroup') {
    return <View style={s.fila}>{lista(n.body, ctx)}</View>;
  }
  return <Nodo n={n} ctx={ctx} />;
}

function T({children, tam, italica, negrita, margen = 0}) {
  return (
    <Text
      style={{
        fontSize: tam,
        color: '#000',
        // Sin cursiva aunque la pidan: la letra de la tablet no tiene, Android
        // la fabrica inclinando el glifo y la parte de arriba se corre fuera de
        // su caja (la raya de √x quedaba corta y a la izquierda, 01/11/2026).
        fontStyle: italica && CURSIVA ? 'italic' : 'normal',
        fontWeight: negrita ? '700' : 'normal',
        marginHorizontal: margen,
      }}>
      {children}
    </Text>
  );
}

function Nodo({n, ctx}) {
  const {tam} = ctx;
  switch (n.type) {
    case 'mathord': {
      const t = doble(simbolo(n.text), ctx);
      return <T tam={tam} italica={/^[a-zA-Z]$/.test(t) && !ctx.recto} negrita={ctx.negrita}>{t}</T>;
    }
    case 'textord':
      return <T tam={tam} negrita={ctx.negrita}>{doble(simbolo(n.text), ctx)}</T>;
    case 'atom': {
      const margen = n.family === 'bin' || n.family === 'rel' ? tam * 0.22 : 0;
      return <T tam={tam} margen={margen}>{simbolo(n.text)}</T>;
    }
    case 'spacing':
    case 'kern':
      return <View style={{width: tam * 0.2}} />;
    case 'ordgroup':
    case 'styling':
    case 'sizing':
    case 'color':
    case 'mclass':
    case 'horizBrace':
      return <View style={s.fila}>{lista(n.body ? [].concat(n.body) : [n.base], ctx)}</View>;
    case 'text':
      return <T tam={tam}>{textoPlano(n.body)}</T>;
    case 'font': {
      const sub = {
        ...ctx,
        recto: ['mathrm', 'mathbb', 'mathsf', 'mathtt', 'text', 'textrm'].includes(n.font),
        negrita: n.font === 'mathbf' || n.font === 'boldsymbol' || ctx.negrita,
        doble: n.font === 'mathbb',
      };
      return grupo(n.body, sub);
    }
    case 'operatorname':
      return <T tam={tam} margen={tam * 0.1}>{textoPlano(n.body)}</T>;
    case 'op':
      if (n.symbol) {
        return <T tam={tam * (ctx.bloque ? 1.5 : 1.2)}>{simbolo(n.name)}</T>;
      }
      return <T tam={tam} margen={tam * 0.1}>{n.name ? n.name.replace(/^\\/, '') : textoPlano(n.body)}</T>;
    case 'supsub':
      return <SupSub n={n} ctx={ctx} />;
    case 'genfrac':
      return <Fraccion n={n} ctx={ctx} />;
    case 'sqrt': {
      // Sin techito: en un Manta la raya, una View aparte, salía alta, corta y
      // corrida respecto de la letra, y no hubo forma de alinearla a ciegas
      // (0.4.1–0.4.3). Al estilo texto: √x, y con paréntesis si hay más de
      // una cosa adentro, √(x²+1).
      const simple = esSimple(n.body);
      return (
        <View style={s.fila}>
          {n.index ? (
            <View style={{marginBottom: tam * 0.5}}>{grupo(n.index, {...ctx, tam: chico(tam) * 0.85})}</View>
          ) : null}
          <T tam={tam}>√</T>
          {simple ? null : <T tam={tam * (contieneAlto([n.body]) ? 1.5 : 1)}>(</T>}
          {grupo(n.body, ctx)}
          {simple ? null : <T tam={tam * (contieneAlto([n.body]) ? 1.5 : 1)}>)</T>}
        </View>
      );
    }
    case 'leftright': {
      const alto = contieneAlto(n.body) ? 1.6 : 1;
      return (
        <View style={s.fila}>
          <T tam={tam * alto}>{delim(n.left)}</T>
          {lista(n.body, ctx)}
          <T tam={tam * alto}>{delim(n.right)}</T>
        </View>
      );
    }
    case 'middle':
    case 'delimsizing':
      return <T tam={tam * (n.size ? 1 + n.size * 0.2 : 1)}>{delim(n.delim)}</T>;
    case 'array':
      return <Matriz n={n} ctx={ctx} />;
    case 'accent':
      // el acento flota arriba sin ocupar lugar, así la letra no se corre
      return (
        <View>
          {grupo(n.base, ctx)}
          <Text
            style={{position: 'absolute', top: -tam * 0.55, left: 0, right: 0, textAlign: 'center', fontSize: tam * 0.7, color: '#000'}}>
            {acento(n.label)}
          </Text>
        </View>
      );
    case 'overline':
      return <View style={{borderTopWidth: raya(tam), borderColor: '#000'}}>{grupo(n.body, ctx)}</View>;
    case 'underline':
      return <View style={{borderBottomWidth: raya(tam), borderColor: '#000'}}>{grupo(n.body, ctx)}</View>;
    case 'htmlmathml':
      return <View style={s.fila}>{lista(n.html, ctx)}</View>;
    default:
      return <T tam={tam}>{n.text ? simbolo(n.text) : ''}</T>;
  }
}

function SupSub({n, ctx}) {
  const {tam} = ctx;
  const peq = {...ctx, tam: chico(tam), bloque: false};
  const base = n.base;
  // ∑, ∏, lím: en un bloque los límites van arriba y abajo
  const limites =
    base && base.type === 'op' && (base.limits || base.name === '\\lim') && ctx.bloque;
  if (limites) {
    return (
      <View style={[s.columna, {marginHorizontal: tam * 0.1}]}>
        {n.sup ? grupo(n.sup, peq) : null}
        <Nodo n={base} ctx={ctx} />
        {n.sub ? grupo(n.sub, peq) : null}
      </View>
    );
  }
  let lado;
  if (n.sup && n.sub) {
    lado = (
      <View style={{justifyContent: 'space-between'}}>
        {grupo(n.sup, peq)}
        {grupo(n.sub, peq)}
      </View>
    );
  } else if (n.sup) {
    lado = <View style={{paddingBottom: tam * 0.55}}>{grupo(n.sup, peq)}</View>;
  } else {
    lado = <View style={{paddingTop: tam * 0.5}}>{grupo(n.sub, peq)}</View>;
  }
  return (
    <View style={s.fila}>
      {base ? <Nodo n={base} ctx={ctx} /> : null}
      {lado}
    </View>
  );
}

function Fraccion({n, ctx}) {
  const tam = ctx.bloque ? ctx.tam : Math.max(MIN, ctx.tam * 0.8);
  const sub = {...ctx, tam, bloque: false};
  const cuerpo = (
    <View style={[s.columna, {marginHorizontal: ctx.tam * 0.1}]}>
      {/* el aire a los costados alarga la raya más allá del número */}
      <View style={{paddingHorizontal: tam * 0.1}}>{grupo(n.numer, sub)}</View>
      {n.hasBarLine ? (
        <View style={{alignSelf: 'stretch', height: raya(tam), backgroundColor: '#000', marginVertical: Math.max(3, Math.round(tam * 0.16))}} />
      ) : (
        <View style={{height: tam * 0.2}} />
      )}
      <View style={{paddingHorizontal: tam * 0.1}}>{grupo(n.denom, sub)}</View>
    </View>
  );
  if (!n.leftDelim && !n.rightDelim) {
    return cuerpo;
  }
  return (
    <View style={s.fila}>
      <T tam={ctx.tam * 1.6}>{delim(n.leftDelim)}</T>
      {cuerpo}
      <T tam={ctx.tam * 1.6}>{delim(n.rightDelim)}</T>
    </View>
  );
}

function Matriz({n, ctx}) {
  const filas = n.body || [];
  const columnas = Math.max(0, ...filas.map(f => f.length));
  const sub = {...ctx, bloque: false};
  return (
    <View style={s.fila}>
      {Array.from({length: columnas}, (_, c) => (
        <View key={c} style={[s.columna, {marginHorizontal: ctx.tam * 0.3}]}>
          {filas.map((f, r) => (
            <View key={r} style={{minHeight: ctx.tam * 1.3, justifyContent: 'center'}}>
              {f[c] ? grupo(f[c], sub) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// Un solo símbolo, número o nombre (x, 2, 10, \pi): la raíz no lleva paréntesis.
function esSimple(n) {
  const cuerpo = n && n.type === 'ordgroup' ? n.body : [n];
  if (!cuerpo || cuerpo.length === 0) {
    return true;
  }
  if (cuerpo.every(x => x && x.type === 'textord' && /^[0-9.]$/.test(x.text))) {
    return true; // un número de varias cifras
  }
  return cuerpo.length === 1 && ['mathord', 'textord'].includes(cuerpo[0]?.type);
}

function contieneAlto(nodos) {
  const tipos = new Set(['genfrac', 'array']);
  const ver = n =>
    n && typeof n === 'object' &&
    (tipos.has(n.type) || Object.values(n).some(v => (Array.isArray(v) ? v.some(ver) : ver(v))));
  return (nodos || []).some(ver);
}

function textoPlano(body) {
  return []
    .concat(body || [])
    .map(n => (n.text !== undefined ? simbolo(n.text) : n.body ? textoPlano(n.body) : ''))
    .join('');
}

function doble(t, ctx) {
  return ctx.doble ? DOBLE[t] || t : t;
}

function delim(d) {
  if (!d || d === '.') {
    return '';
  }
  return DELIM[d] || simbolo(d);
}

function acento(label) {
  return {'\\vec': '→', '\\hat': '^', '\\widehat': '^', '\\bar': '¯', '\\overline': '¯', '\\dot': '˙', '\\ddot': '¨', '\\tilde': '~', '\\widetilde': '~'}[label] || '';
}

function simbolo(t) {
  if (!t) {
    return '';
  }
  return SIMBOLOS[t] ?? (t.startsWith('\\') ? t.slice(1) : t);
}

const DOBLE = {R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', E: '𝔼'};

const DELIM = {
  '\\{': '{', '\\}': '}', '\\lbrace': '{', '\\rbrace': '}', '\\langle': '⟨', '\\rangle': '⟩',
  '\\lvert': '|', '\\rvert': '|', '\\vert': '|', '\\|': '‖', '\\lVert': '‖', '\\rVert': '‖',
  '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉', '\\lbrack': '[', '\\rbrack': ']',
};

const SIMBOLOS = {
  // griegas
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ϵ', '\\varepsilon': 'ε',
  '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\vartheta': 'ϑ', '\\iota': 'ι', '\\kappa': 'κ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\varpi': 'ϖ', '\\rho': 'ρ',
  '\\varrho': 'ϱ', '\\sigma': 'σ', '\\varsigma': 'ς', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'ϕ',
  '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
  '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ', '\\Pi': 'Π',
  '\\Sigma': 'Σ', '\\Upsilon': 'Υ', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
  // operadores grandes
  '\\sum': '∑', '\\prod': '∏', '\\coprod': '∐', '\\int': '∫', '\\iint': '∬', '\\iiint': '∭',
  '\\oint': '∮', '\\bigcup': '⋃', '\\bigcap': '⋂', '\\bigoplus': '⨁', '\\bigotimes': '⨂',
  // binarios
  '\\cdot': '·', '\\times': '×', '\\div': '÷', '\\pm': '±', '\\mp': '∓', '\\ast': '∗', '\\star': '⋆',
  '\\circ': '∘', '\\bullet': '•', '\\cup': '∪', '\\cap': '∩', '\\setminus': '∖', '\\oplus': '⊕',
  '\\otimes': '⊗', '\\wedge': '∧', '\\land': '∧', '\\vee': '∨', '\\lor': '∨', '\\neg': '¬', '\\lnot': '¬',
  '-': '−', '*': '∗',
  // relaciones
  '\\le': '≤', '\\leq': '≤', '\\ge': '≥', '\\geq': '≥', '\\ne': '≠', '\\neq': '≠', '\\approx': '≈',
  '\\equiv': '≡', '\\sim': '∼', '\\simeq': '≃', '\\cong': '≅', '\\propto': '∝', '\\ll': '≪', '\\gg': '≫',
  '\\in': '∈', '\\notin': '∉', '\\ni': '∋', '\\subset': '⊂', '\\supset': '⊃', '\\subseteq': '⊆',
  '\\supseteq': '⊇', '\\perp': '⊥', '\\parallel': '∥', '\\mid': '∣', '\\models': '⊨', '\\vdash': '⊢',
  '\\to': '→', '\\rightarrow': '→', '\\leftarrow': '←', '\\gets': '←', '\\leftrightarrow': '↔',
  '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔', '\\iff': '⟺', '\\implies': '⟹',
  '\\mapsto': '↦', '\\longrightarrow': '⟶', '\\longmapsto': '⟼', '\\uparrow': '↑', '\\downarrow': '↓',
  // varios
  '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇', '\\forall': '∀', '\\exists': '∃', '\\nexists': '∄',
  '\\emptyset': '∅', '\\varnothing': '∅', '\\angle': '∠', '\\triangle': '△', '\\degree': '°',
  '\\ldots': '…', '\\dots': '…', '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱', '\\prime': '′',
  '\\hbar': 'ℏ', '\\ell': 'ℓ', '\\Re': 'ℜ', '\\Im': 'ℑ', '\\aleph': 'ℵ', '\\%': '%', '\\_': '_',
  '\\&': '&', '\\#': '#', '\\{': '{', '\\}': '}', '\\lbrace': '{', '\\rbrace': '}', '\\|': '‖',
  '\\colon': ':', '\\quad': '  ', '\\qquad': '    ', '\\checkmark': '✓', '\\square': '□',
  '\\langle': '⟨', '\\rangle': '⟩', '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉',
  '\\backslash': '\\', '\\circledR': '®',
};

const s = StyleSheet.create({
  fila: {flexDirection: 'row', alignItems: 'center'},
  columna: {flexDirection: 'column', alignItems: 'center'},
  bloque: {alignItems: 'center', marginVertical: 8},
  parrafo: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  palabra: {lineHeight: undefined},
  enLinea: {marginVertical: 2},
});
