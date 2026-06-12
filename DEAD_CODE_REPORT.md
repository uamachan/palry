# Dead Code / Unused File Audit

調査日: 2026-06-12
対象ブランチ: `chore/dead-code-cleanup`

## 結論

- 削除済み: `server/lib/payments.js`
- 削除せず要確認: Express API / Prisma / JSON migration / public hotfix CSS・JS
- 今回は大量削除を避け、自己参照しか見つからない未使用ファイルだけ削除した。

## A. 削除済み

| path | 理由 | 参照検索結果 | 削除リスク |
|---|---|---|---|
| `server/lib/payments.js` | 決済プロバイダ統合の将来用 shim だが、現行コードから import されていない。`isPaymentsConfigured`, `paymentsProvider`, `createCheckoutSession` の検索結果がこのファイル自身のみだった。 | 自己参照のみ | 低。ただし将来 Stripe 統合をする場合は再作成が必要。 |

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

## C. 重複・統合候補

| path | 重複内容 | 統合案 | 注意点 |
|---|---|---|---|
| `client/public/mobile-fixes.css` | `client/index.html` から直接読み込み。さらに `client/src/main.jsx` でも `./mobile-fixes.css` を import している。 | public直読み込みとsrc importの役割を分ける。最終的にはsrc CSSへ統合。 | 画面崩れ対策のhotfixの可能性が高いので即削除禁止 |
| `client/public/hero-section-align.css` | ランディングheroの上書きCSS。 | `client/src/styles.css` または専用landing CSSへ統合。 | 強い上書きがあり、順序依存の可能性あり |
| `client/public/profile-setup-hotfix.css` | hotfix名のCSS。 | 原因CSSへ吸収。 | プロフィール作成画面の崩れ修正の可能性あり |
| `client/public/match-fullscreen.css` | match画面の上書きCSS。 | app/match系CSSへ統合。 | モバイル全画面表示に影響する可能性あり |
| `client/public/landing-mobile-final.js` | CSSをJSで注入する最終hotfix。 | CSSファイルへ移動し、JS注入をなくす。 | かなり強い上書きなので、消す前にiPhone/Androidで確認必須 |

## D. 未使用依存候補

| package | 現在の使用状況 | 削除可否 | 注意点 |
|---|---|---|---|
| `@prisma/client` / `prisma` / `@prisma/adapter-pg` / `pg` | Prisma schema / migration / import script 用。runtime本体では未使用の可能性あり。 | まだ削除しない | DB移行計画を捨てるなら別PRで整理 |
| `firebase-admin` | Express API の Firebase ID token 検証で動的importされている。 | 削除しない | Express APIを残すなら必要 |
| `cors`, `compression`, `express` | Express API用。 | 削除しない | Render/Express運用を残す限り必要 |
| `concurrently` | `npm run dev/local` 用。 | 削除しない | ローカル開発で必要 |

## E. 今回触った変更

- `server/lib/payments.js` を削除
- `DEAD_CODE_REPORT.md` を追加

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

1. このPRで `server/lib/payments.js` 削除によるbuild影響を確認
2. 問題なければマージ
3. 次PRで public CSS / JS hotfix の統合を1ファイルずつ実施
4. Express API / Prisma を残すか、Firestore/Cloud Functionsへ一本化するかを決めてから大きい削除を行う
