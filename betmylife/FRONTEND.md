# Predict My Life frontend

Run `npm start` (or `npx expo start`) and open the project in an SDK 57-compatible Expo client. Press `w` for web.

## Screens and files

- `src/app/(tabs)/`: Home (`index.tsx`), Create, Leaderboard, Shop, Profile, and tab layout.
- `src/app/habit-dna.tsx`: analytics, opened from Profile.
- `src/app/_layout.tsx`: root stack and shared state provider.
- `src/components/app-navigation.tsx`: shared five-tab navigation; the existing `app-tabs` platform entry files forward to it.
- `src/components/ui-kit.tsx`: screen, card, avatar, pill, button, heading, statistics, segments, and progress bar primitives.
- `src/components/challenge-card.tsx`, `leaderboard-row.tsx`, `reward-card.tsx`: reusable feature cards.
- `src/constants/design.ts`: color, spacing, radius, and type tokens.
- `src/mock/data.ts`: typed fixtures for challenges, users, rewards, and insights.
- `src/state/app-state.tsx`: reducer and context for predictions, challenge creation, purchases, and equipped rewards.
- `src/styles.d.ts`: declarations for the starter’s CSS imports.
- `src/hooks/use-color-scheme.web.ts`: hydration-safe starter theme hook compatible with the new lint rules.
- `eslint.config.js`, `package.json`, `package-lock.json`: Expo-compatible lint tooling.

The starter Home and Explore routes were replaced with the tab screens. Unused starter components and assets remain available.

## Demo behavior

All changes live in memory and reset on reload. Selecting a prediction again does not add another friend; switching YES/NO updates that single selection. Creating a challenge adds it at the top of Home. Its probability is a fixed mock estimate, and deadline choices are illustrative labels, not live countdowns.

The 980 profile points are **weekly earned points**, also used on the leaderboard. The shop starts with a separate **1,250 spendable-point wallet**. Buying cannot overdraw the wallet or charge twice for an owned reward. Purchased items can be equipped from Profile. Built-in equipped cosmetics are separate starter items.

## API handoff

Replace the fixtures/provider initialization with fetched responses and connect the reducer actions to API mutations. UI components consume typed data and the shared context. Authentication, persistence, live deadlines, and model inference are intentionally outside this frontend demo.

## Checks

```sh
npx expo lint
npx tsc --noEmit
npx expo export --platform web
```

Manual demo path: select YES and then NO → open My picks → create a challenge → view it on Home → switch leaderboard metrics → purchase a reward → equip it in Profile → open Habit DNA and go back.

## 友達追加・JP／ENデバッグ切り替え

プロフィールの「ID・QRで友達を追加 →」（ENでは「Add friends by ID or QR →」）から友達画面を開きます。

- **IDで追加**：`noah-1250`、`liam-0580`、`mia-0420`を検索して相手を確認し、追加します。前後の空白・先頭の`@`・英大文字を正規化します。
- **QR読み取り**：カメラ起動後に権限を要求し、QRを読み取ったらカメラを止めて相手を表示します。追加は確認ボタンから行います。
- **自分のQR**：`fuuka-0980`の実際に読み取り可能なQRを端末内で生成します。
- カメラのない環境では、`predict-my-life:friend:v1:noah-1250`を「QRの内容を貼り付け」に入力して同じ追加フローを確認できます。
- 初期の友達はAlexとSarahです。自己追加・重複・未知のユーザー・別形式のQRは追加しません。
- 友達は端末内のモック状態です。別端末への同期や相手への通知は行わず、再読み込みでリセットします。デモの自分は全端末でFuukaなので、複数端末での確認にはデモIDのQR内容を使ってください。

各画面の上部にある**JP／EN**で表示言語を切り替えます。フォーム・予想・購入・友達の状態は保持します。名前、ID、投稿本文は翻訳対象外です。言語設定は再読み込みでENへ戻ります。ネイティブOSのカメラ権限ダイアログはこのスイッチの対象外です。

追加ファイル：

- `src/app/friends.tsx`：検索、相手の確認、QR表示、友達一覧。
- `src/mock/friends.ts`：検索用ユーザー、自分のID、初期の友達。
- `src/utils/friend-id.ts`：ID正規化とQRデータの検証。
- `src/components/friend-qr.tsx`：QR生成と表示。
- `src/components/friend-scanner.tsx`：カメラ権限、読み取り、画面離脱時の停止。
- `src/i18n/catalog.ts`：表示文言の日本語辞書。新しい文言はここへ追加します。
- `src/i18n/language.tsx`：言語の共有状態。
- `src/components/localized-text.tsx`：表示テキストの翻訳。ユーザー入力は`translate={false}`で保持します。
- `src/components/language-switch.tsx`：JP／EN切り替え。

`expo-camera`と`qrcode-generator`を追加しました。既存の開発ビルドを使う場合は、カメラのネイティブモジュールを含む開発ビルドの再作成が必要です。SDK 57対応のExpo Goに含まれるカメラモジュールでも確認できます。ブラウザーのカメラはHTTPSまたはlocalhostと権限が必要です。実機カメラの読み取りは別途確認してください。

## コメントを書けない設定ファイルの説明

JSONはコメントを許可しないため、ファイル形式を壊さないようここに説明をまとめています。

- `app.json`：Expoのアプリ識別子、画面設定、アイコン、プラグイン、EASプロジェクト設定。今回のカメラ権限とQR読み取り設定もここにあります。
- `package.json`：起動・lintコマンドと、実行時／開発時の依存パッケージ。
- `package-lock.json`：npmが自動生成する依存バージョンの固定情報。手動でコメントを追加しません。
- `tsconfig.json`：Expoの標準設定を継承したTypeScript設定。strictと`@/`パス別名を有効にしています。

既存スターターを含む`src`配下のコード・CSSと開発スクリプトの先頭に、日本語の役割説明を追加しています。
