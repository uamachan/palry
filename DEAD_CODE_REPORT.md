# Dead Code / Unused File Audit

調査日: 2026-06-12
対象ブランチ: `main`

## 結論

- 削除済み: `server/lib/payments.js`
- 削除済み: `client/public/landing-mobile-final.js`
- 削除済み: `client/public/match-fullscreen.css`
- 削除済み: `client/public/mobile-fixes.css`
- 削除済み: `client/public/hero-section-align.css`
- 削除済み: `client/public/profile-setup-hotfix.css`
- `client/index.html` から public の後付けCSS/JS読み込みを削除済み。
- スマホアプリ画面の調整は `client/src/mobile-fixes.css` に移動済み。
- プロフィール作成select表示の調整は `client/src/profile-setup.css` に移動済み。
- 今後は後入れJSでCSSを注入せず、public hotfix CSSも増やさず、元のCSSまたは既存の責務に合う `client/src` 側CSSを直接整理する。

## A. 削除済み / 停止済み

| path | 理由 | 対応 | 削除リスク |
|---|---|---|---|
| `server/lib/payments.js` | 決済プロバイダ統合の将来用 shim だが、現行コードから import されていなかった。 | 削除済み | 低。ただし将来 Stripe 統合をする場合は再作成が必要。 |
| `client/public/landing-mobile-final.js` | JSでCSSを後入れ注入する方式は、既存CSSを後から上書きしてスマホUIの原因追跡を難しくする。 | 読み込み停止後、ファイル本体も削除済み。 | 低。戻す場合もJS注入ではなく元CSSを編集すること。 |
| `client/public/match-fullscreen.css` | PCマッチ画面をpublic CSSから強く上書きしていた。`client/src/app-format-polish.css` に同系統のPC調整があるためpublic側は重複。 | `client/index.html` の読み込みを削除し、ファイル本体も削除済み。 | 低〜中。PCのマッチング画面の表示確認は必要。 |
| `client/public/mobile-fixes.css` | publicから読み込むスマホ上書きCSSだった。`client/src/main.jsx` が `client/src/mobile-fixes.css` をimportしているため、src側へ統合可能。 | アプリ画面のスマホ調整を `client/src/mobile-fixes.css` へ移し、public側は削除済み。 | 中。スマホのログイン後画面、DM、通知、足あと確認が必要。 |
| `client/public/hero-section-align.css` | ランディングhero/headerのpublic上書きCSSだった。 | public側は削除済み。ランディングは `client/src/styles.css` の基本スタイルへ戻す。 | 中。スマホ/PCのトップ、料金、安全規約確認が必要。 |
| `client/public/profile-setup-hotfix.css` | プロフィール作成画面のpublic hotfix CSSだった。 | select表示を `client/src/profile-setup.css` へ移し、public側は削除済み。 | 中。プロフィール作成モーダル確認が必要。 |

## B. 要確認 / 削除禁止寄り

| path | 理由 | 残す理由候補 | 確認方法 |
|---|---|---|---|
| `server/index.js` | 現在のフロントは Firestore 直利用だが、`package.json` の `dev`, `local`, `start`, `release:check` で使われている。 | ローカル開発・Render/Express API運用・セキュリティ済みAPIの保険 | Renderを完全に使わない方針が確定してから削除判断 |
| `server/start-production.js` | `npm start` の入口。 | Express本番起動用 | Render運用廃止が確定するまで残す |
| `server/lib/jsonStore.js` | Express API の JSON 永続化レイヤー。 | Render / JSON Store fallback | Express APIを消すまで残す |
| `server/lib/catalog.js` | Express API の料金・利用枠ロジック。 | API側の課金/LIKE制限用 | API廃止 or Cloud Functions移行後に整理 |
| `server/lib/matching.js` | Express API のマッチング中核。 | API側の安全な相互LIKE・DM制御 | Firestore/Functions側へ完全移行後に整理 |
| `server/lib/profile.js` | Express API のプロフィールenum/検証。 | API側バリデーション | Firestore直利用に一本化後に整理 |
| `server/lib/users.js` | Express API の公開ユーザー整形。 | API側公開情報フィルタ | publicProfiles移行後に整理 |
| `prisma/schema.prisma` | DB移行用。runtimeでは直接使っていない可能性が高いが、`package.json` の `db:*` と `release:check` で参照される。 | 将来PostgreSQL移行 | DB移行方針が不要なら別PRで削除 |
| `scripts/import-json-to-db.mjs` | JSON→DB移行用。`package.json` scripts と `release:check` で参照される。 | 移行作業用 | Prisma不要が確定するまで残す |
| `scripts/backup-data.mjs` | `backup-data` script で使われる。 | JSON Storeバックアップ | JSON Storeを使わないなら削除候補 |
| `server/reset-data.js` | `reset-data` script で使われる。 | ローカル/デモデータ初期化 | デモ運用不要なら削除候補 |

## C. 現在のCSS方針

| 種類 | 現在の管理場所 | 方針 |
|---|---|---|
| ランディング基本CSS | `client/src/styles.css` | public hotfixで上書きしない。必要ならこのファイルへ最小変更する。 |
| スマホアプリ画面 | `client/src/mobile-fixes.css` | `main.jsx` のimportで読み込む。public CSSは使わない。 |
| アプリ全体/PCマッチ画面 | `client/src/app-format-polish.css` | public PC上書きCSSは使わない。 |
| プロフィール作成 | `client/src/profile-setup.css` / `client/src/profile-visual.css` / `client/src/app-format-polish.css` | public hotfix CSSは使わない。 |

## D. 未使用依存候補

| package | 現在の使用状況 | 削除可否 | 注意点 |
|---|---|---|---|
| `@prisma/client` / `prisma` / `@prisma/adapter-pg` / `pg` | Prisma schema / migration / import script 用。runtime本体では未使用の可能性あり。 | まだ削除しない | DB移行計画を捨てるなら別PRで整理 |
| `firebase-admin` | Express API の Firebase ID token 検証で動的importされている。 | 削除しない | Express APIを残すなら必要 |
| `cors`, `compression`, `express` | Express API用。 | 削除しない | Render/Express運用を残す限り必要 |
| `concurrently` | `npm run dev/local` 用。 | 削除しない | ローカル開発で必要 |

## E. UI/CSS運用ルール

- 後入れ JavaScript でCSSを注入しない。
- public の上書き専用CSSファイルを追加しない。
- UI修正は元のCSSまたは既存の責務に合う `client/src` 側CSSを直接編集する。
- スマホだけの修正は `@media (max-width: 760px)` に限定する。
- `html` / `body` / `#root` の `overflow` / `height` を変更する時は、ランディングとログイン後アプリ画面の副作用を必ず確認する。

## 実行したコマンド

この作業はGitHubコネクタ経由で実施したため、ローカルでのコマンド実行は未実施。
PR作成後にCIまたはローカルで以下を実行すること。

```bash
npm test
npm run build
npm run release:check
```

追加で可能なら:

```bash
npx knip
npx depcheck
```

## 安全な次ステップ

1. スマホでトップからフッターまでスクロール確認
2. PC/スマホ両方でマッチング画面を確認
3. 料金表・安全規約・ログイン後アプリ画面を確認
4. プロフィール作成モーダルのselect、ランク、ロール、規約チェックを確認
5. Express API / Prisma を残すか、Firestore/Cloud Functionsへ一本化するかを決めてから大きい削除を行う
