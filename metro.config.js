const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

const emptyShim = path.resolve(__dirname, 'shims/empty.js');

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'node:fs': emptyShim,
  'node:fs/promises': emptyShim,
  'node:path': emptyShim,
  'node:os': emptyShim,
  'node:crypto': emptyShim,
  'node:stream': emptyShim,
  'node:stream/promises': emptyShim,
  'node:util': emptyShim,
  'node:readline': emptyShim,
  'node:child_process': emptyShim,
};

module.exports = withNativeWind(config, { input: './global.css' });
