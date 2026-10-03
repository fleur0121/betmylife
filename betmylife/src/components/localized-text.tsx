/**
 * 共通の翻訳対応Text。表示用の文字列だけを辞書で翻訳する。
 * 数値を含む複数の子要素は一文にまとめて翻訳し、入れ子のTextなどはそのまま維持する。
 * 名前・ID・ユーザー入力などはtranslate={false}で原文を必ず保持する。
 */
import { Children } from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import { useLanguage } from '@/i18n/language';
export function Text({
  children,
  translate = true,
  ...props
}: TextProps & { translate?: boolean }) {
  const { t } = useLanguage();
  const parts = Children.toArray(children);
  const simple = parts.every(
    (part) => typeof part === 'string' || typeof part === 'number',
  );
  const content = !translate
    ? children
    : simple
      ? t(parts.join(''))
      : parts.map((part) => (typeof part === 'string' ? t(part) : part));
  return <NativeText {...props}>{content}</NativeText>;
}
