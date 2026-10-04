type Locale = 'en' | 'ja';

const cache = new Map<string, string>();
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function translateMissingText(
  text: string,
  locale: Locale,
): Promise<string> {
  if (locale === 'en') return text;

  const cacheKey = `${locale}:${text}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${apiUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        source_language: 'en',
        target_language: locale,
      }),
    });
    if (!response.ok) return text;
    const result = (await response.json()) as { translated_text?: string };
    const translated = result.translated_text?.trim();
    if (!translated) return text;
    cache.set(cacheKey, translated);
    return translated;
  } catch {
    return text;
  }
}
