/**
 * 友達IDの正規化とアプリ専用QR形式のエンコード／検証。
 * QRは文字列データとして解析し、URLを開いたり外部サイトへ送信したりしない。
 * バージョンと形式が一致するQRだけを受け付け、実在するユーザーかは別途一覧検索で確認する。
 */
const prefix = 'predict-my-life:friend:v1:';
export function normalizeFriendId(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}
export function isFriendId(value: string) {
  return /^[a-z][a-z0-9-]{2,63}$/.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function encodeFriendQR(id: string) {
  if (!isFriendId(id)) throw new Error('Invalid friend ID');
  return `${prefix}${id}`;
}
export function parseFriendQR(value: string): string | null {
  const text = value.trim();
  if (!text.startsWith(prefix)) return null;
  const id = text.slice(prefix.length);
  return isFriendId(id) ? id : null;
}
