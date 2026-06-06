# Production Code Review — Pairly

このドキュメントは、Pairly を本番環境へ出す前のコードレビュー結果と、公開前に必ず確認する項目をまとめたものです。

## 結論

Pairly は現在、**小規模な本番運用の最低ラインには近い状態**です。
ただし、データ保存は JSON ファイル方式のため、長期運用・大量ユーザー・複数インスタンス構成にはまだ弱いです。

まずは Render の単一 Web Service + Persistent Disk 構成で公開するのが現実的です。
本格運用に入る前には Supabase / PostgreSQL / Firebase Firestore などの DB 化を推奨します。

---

## 推奨する本番構成

### パターンA: Express 1台でフロントとAPIを配信する構成

一番おすすめです。
`npm run build` で作った `dist` を Express が配信し、同じドメインで `/api` も受けます。

Render の設定例:

```bash
Build Command: npm install && npm run build
Start Command: npm start
```

この構成では、フロントの API 呼び出しは同一オリジンの `/api/...` になるため、`VITE_API_BASE_URL` は空で問題ありません。

### パターンB: フロントとAPIを別サービスに分ける構成

静的サイトサービス + APIサーバーを分ける場合は、フロント側に API URL を指定します。

```bash
VITE_API_BASE_URL=https://your-api-service.onrender.com
```

API側では、CORS許可のためにフロントURLを指定します。

```bash
CLIENT_ORIGIN=https://your-frontend-service.onrender.com
```

`/api/login` が 404 になる場合は、ほぼこの設定ミスです。
フロントだけのドメインへ `/api/login` を投げていると 404 になります。

---

## 必須の環境変数

API / Express 側:

```bash
NODE_ENV=production
PORT=3001
CLIENT_ORIGIN=https://your-domain.example
DATA_DIR=/var/data/pairly
FIREBASE_WEB_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

フロントとAPIを分ける場合のみ、フロント側に追加:

```bash
VITE_API_BASE_URL=https://your-api-service.onrender.com
```

---

## データ保存レビュー

現在の保存方式:

```txt
users.json
likes.json
matches.json
received_likes.json
messages.json
single_purchases.json
```

保存先は `DATA_DIR` です。
本番では以下を推奨します。

```bash
DATA_DIR=/var/data/pairly
```

Render では Persistent Disk を追加し、Mount Path を以下にします。

```txt
/var/data
```

### 良い点

- `updateJson()` でファイル単位の書き込みキューがある
- 一時ファイルへ書いてから rename するため、書き込み途中の破損リスクが低い
- `DATA_DIR` により本番の永続ディスクへ逃がせる

### 注意点

- 複数インスタンスで動かすと JSON ファイル競合が起きる可能性がある
- バックアップ機能はまだない
- 検索や集計が増えると遅くなる
- 本格的に課金・大量ユーザーを扱うなら DB 化が必要

### 本番公開時の最低条件

- Render Persistent Disk を作成する
- Mount Path を `/var/data` にする
- `DATA_DIR=/var/data/pairly` を設定する
- 単一インスタンスで運用する

---

## 認証レビュー

現在は Firebase Authentication を使用しています。
サーバー側では Firebase ID token を `accounts:lookup` で検証し、ログイン済みユーザーだけがAPIを使える構成です。

### 良い点

- `/api/profile`, `/api/profiles`, `/api/like`, `/api/dm` などは認証必須
- メール認証済みユーザーのみプロフィール作成・ログイン可能
- Firebase UID と `users.json` の `firebaseUid` を紐づけて復元している
- メールアドレス一致で既存プロフィールをリンクする時、`emailVerified` を必須にしている

### 確認すること

Firebase Console の Authentication > Settings > Authorized domains に本番ドメインを追加してください。

例:

```txt
palry.onrender.com
```

---

## CORS / API 接続レビュー

API側は `CLIENT_ORIGIN` に一致するオリジンだけ許可します。

本番でよく出るエラー:

```txt
/api/login 404
```

これは API がないドメインへリクエストしている可能性が高いです。

対策:

- Express 1台構成なら、`VITE_API_BASE_URL` は空
- フロント/API分離なら、フロント側に `VITE_API_BASE_URL` を設定
- API側に `CLIENT_ORIGIN` を設定

---

## セキュリティレビュー

### 実装済み

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- 本番のみ Content-Security-Policy
- APIレート制限
- 入力値の `cleanText()` 処理
- 画像/音声URLの `sanitizeMedia()` 処理
- 管理APIは `ADMIN_EMAILS` による許可制

### 注意点

- `style-src 'unsafe-inline'` は現状のUI都合で残っている
- 画像/音声を Base64 で JSON に保存しているため、容量が増えやすい
- 管理画面を本番で使うなら `ADMIN_EMAILS` を必ず設定する
- 本格運用では画像/音声は Firebase Storage などへ逃がすのが望ましい

---

## パフォーマンスレビュー

### 良い点

- Firebase は動的 import で遅延ロードされている
- `AppDashboard` はログイン後画面として分離されている
- APIベースURLを環境変数化したため、構成変更に強くなった

### 改善余地

- `styles.css` が大きくなった場合は分割推奨
- Base64画像を大量に扱うと HTML/JSON/APIレスポンスが重くなる
- DOM量が増えたら、DMやプロフィール一覧の仮想化を検討

---

## 公開前チェックリスト

### Render

- [ ] Build Command が `npm install && npm run build`
- [ ] Start Command が `npm start`
- [ ] Node version が `>=22.12.0 <25`
- [ ] Persistent Disk を追加した
- [ ] Persistent Disk の Mount Path が `/var/data`
- [ ] `DATA_DIR=/var/data/pairly` を設定した

### 環境変数

- [ ] `NODE_ENV=production`
- [ ] `CLIENT_ORIGIN` が本番フロントURLと一致している
- [ ] `FIREBASE_WEB_API_KEY` が設定されている
- [ ] `VITE_FIREBASE_API_KEY` が設定されている
- [ ] `VITE_FIREBASE_AUTH_DOMAIN` が設定されている
- [ ] `VITE_FIREBASE_PROJECT_ID` が設定されている
- [ ] `VITE_FIREBASE_APP_ID` が設定されている
- [ ] フロント/API分離時は `VITE_API_BASE_URL` を設定した

### Firebase

- [ ] Authentication のメール/パスワードログインが有効
- [ ] Googleログインを使う場合は Google Provider が有効
- [ ] Authorized domains に本番ドメインを追加
- [ ] Web API Key が正しい

### 動作確認

- [ ] 新規登録できる
- [ ] メール認証後、プロフィール作成できる
- [ ] ログアウト後、再ログインしてプロフィールが復元される
- [ ] マッチング画面へ入れる
- [ ] いいね送信できる
- [ ] 相互いいねでマッチ成立する
- [ ] DM送信できる
- [ ] ページ更新後もDM履歴が残る
- [ ] 再デプロイ後もプロフィールが残る

---

## 現時点の判定

### 小規模公開

条件付きで可。

条件:

- Render単一インスタンス
- Persistent Diskあり
- Firebase設定完了
- `DATA_DIR` 正しく設定
- 管理者メール `ADMIN_EMAILS` を必要に応じて設定

### 本格運用

まだ早いです。

本格運用前にやるべきこと:

1. JSON保存から DB へ移行
2. 画像/音声を Storage へ移行
3. 課金処理をデモから本物の決済へ変更
4. 管理画面の権限・監査ログを強化
5. 通報・ブロック・削除依頼対応の運用ルールを作る
6. 利用規約・プライバシーポリシーを正式版にする

---

## 推奨する次の作業

最初の本番公開は以下の順番で進めてください。

1. Renderで Persistent Disk を追加
2. 環境変数を設定
3. `npm start` でExpress本番起動
4. `/api/health` を確認
5. 新規登録と再ログイン保存テスト
6. 1回再デプロイして、プロフィールが残るか確認

`/api/health` が見えない場合、その環境ではAPIが起動していません。
その状態では `/api/login` も必ず失敗します。
