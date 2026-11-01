const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const base = getDefaultConfig(__dirname);

// claude.mjs es ESM para que lo importe también Node (scripts/probar-claude.mjs).
module.exports = mergeConfig(base, {
  resolver: {sourceExts: [...base.resolver.sourceExts, 'mjs']},
});
