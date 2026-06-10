# Pairly / Palry

VALORANT向けのマッチングWebアプリです。

## 現在の構成

Renderは使わない前提に変更しました。

現在の本番想定は以下です。

```txt
Cloudflare Pages / Workers Static Assets
  └─ React + Vite フロントエンド

Firebase Authentication
  └─ メール/パスワード・Googleログイン

Firebase Firestore
  └─ users / likes / matches / receivedLikes / messages / blocks / footprints / reports
```

Express の `server/` は残っていますが、Cloudflareの静的配信では `/api` サーバーは起動しません。
そのため、フロントエンドは Firebase Auth + Firestore を直接使う形に戻しています。

## 主な機能

- 公開サイトとマッチング画面を分離
- アカウント作成しないとマッチング / DM / 足あと / 管理は利用不可
- アカウント作成時の性別選択
- 月額プラン / 単発課金 / 比較表の料金UI
- LIKE / 両LIKE / マッチ / DM
- 通報 / ブロック
- 利用規約・免責・禁止事項・非公式表記

## ローカル起動

```bash
npm install
npm run dev
```

フロント:

```txt
http://localhost:5173
```

## Firebase設定

Firebase Consoleで以下を有効化してください。

- Authentication
  - メール/パスワード
  - Googleログインを使う場合は Google Provider
- Firestore Database
- Authentication > Settings > Authorized domains に公開ドメインを追加

`.env` に以下を設定します。
`.env` は公開・コミットしないでください。

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Firestore Rules

Firestore直アクセス構成なので、セキュリティルールがかなり重要です。
このリポジトリには以下を追加しています。

```txt
firestore.rules
firebase.json
```

Firebase CLIを使う場合:

```bash
npm install -g firebase-tools
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

## Cloudflareデプロイ

Viteのビルド出力は `dist/` です。
Cloudflare Pagesなら基本は以下です。

```txt
Build command: npm run build
Build output directory: dist
```

`wrangler.jsonc` は静的アセット配信用に設定済みです。

## 注意

- Cloudflare静的配信では `/api/login` は存在しません。
- `/api/login 404` が出る場合、古いビルドか古い `client/src/api.js` が残っています。
- 現在はFirestore直アクセスなので、管理者だけが課金プランを確定する仕組みは未実装です。
- クライアントだけで `plan: VIP` に変更できないよう、Firestore Rules側で通常プロフィール更新時の `plan` 変更を拒否しています。

## 公開前チェック

```bash
npm run build
```

その後、以下を確認してください。

- 新規登録できる
- メール認証後にプロフィール作成できる
- ログアウト後、再ログインしてプロフィールが復元される
- マッチング画面へ入れる
- LIKEを送れる
- 相互LIKEでマッチできる
- DMを送れる
- ページ更新後もDM履歴が残る
