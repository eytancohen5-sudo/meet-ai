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

// T10 fix: Metro parses 'node:fs/promises' as package 'node:fs' + subpath
// './promises', so the composite extraNodeModules keys above never match
// subpath specifiers — Release export:embed failed resolving
// @anthropic-ai/sdk/tools/agent-toolset/node.mjs (node:fs/promises).
// Intercept every node: builtin specifier and resolve it to the empty shim.
// These are dead code paths on device (beta session tools, never invoked by
// lib/organization.ts which uses the plain messages API).
const priorResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('node:')) {
    return { type: 'sourceFile', filePath: emptyShim };
  }
  if (priorResolveRequest) {
    return priorResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
