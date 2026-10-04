/**
 * CSSをTypeScriptから読み込むための型宣言。
 * CSS Modulesはクラス名の辞書、通常のCSSは副作用としてのimportを許可する。
 * 既存スターターのCSS importに対応するための宣言で、実行時の処理は持たない。
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
declare module '*.css';
