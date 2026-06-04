// Dedicated config for smoke tests — pure Node, no RN/NativeWind toolchain needed.
// Uses a minimal Babel config to avoid nativewind/babel's dependency on
// react-native-worklets, which is absent in the dev environment.
const path = require('path');

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'babel-jest',
      {
        configFile: path.resolve(__dirname, 'babel.config.test.js'),
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/',
  ],
};
