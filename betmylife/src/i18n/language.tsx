/**
 * デバッグ用の表示言語を全画面で共有するContext。
 * 内部コードは標準のja／en、画面上の切り替えラベルはJP／ENを使う。
 * 状態や入力値を初期化せず表示だけ更新する。設定は再読み込み時にENへ戻る。
 */
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import { translate } from './catalog';
type Locale = 'ja' | 'en';
const LanguageContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
} | null>(null);
export function LanguageProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>('en');
  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  return { ...context, t: (text: string) => translate(text, context.locale) };
}
