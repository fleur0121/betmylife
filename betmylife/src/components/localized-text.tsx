/**
 * 共通の翻訳対応Text。表示用の文字列だけを辞書で翻訳する。
 * 数値を含む複数の子要素は一文にまとめて翻訳し、入れ子のTextなどはそのまま維持する。
 * 名前・ID・ユーザー入力などはtranslate={false}で原文を必ず保持する。
 */
import { Children } from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import { useLanguage } from '@/i18n/language';
import { translate as catalogTranslate } from '@/i18n/catalog';
export function Text({
  children,
  translate = true,
  ...props
}: TextProps & { translate?: boolean }) {
  const { locale } = useLanguage();
  const parts = Children.toArray(children);
  const simple = parts.every(
    (part) => typeof part === 'string' || typeof part === 'number',
  );
  const source = simple ? parts.join('') : '';
  const catalogValue = catalogTranslate(source, locale);
  const content = !translate
    ? children
    : simple
      ? catalogValue
      : parts.map((part) =>
          typeof part === 'string' ? catalogTranslate(part, locale) : part,
        );
  return <NativeText {...props}>{content}</NativeText>;
}
