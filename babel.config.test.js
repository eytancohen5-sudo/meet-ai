// Minimal Babel config for Jest smoke tests only.
// Deliberately excludes nativewind/babel and babel-preset-expo's RN toolchain
// since smoke tests are pure Node — no React Native components.
module.exports = {
  presets: [
    ['@babel/preset-typescript'],
  ],
  plugins: [
    ['@babel/plugin-transform-modules-commonjs'],
  ],
};
