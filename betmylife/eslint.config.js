/**
 * ESLintの設定。Expo推奨のルールを適用してコードの問題を検出する。
 * ビルド出力のdistは検査対象から除外する。実行コマンドはnpx expo lint。
 */
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  }
]);
