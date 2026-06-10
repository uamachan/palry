# Production Code Review — Pairly

このドキュメントは、Renderを使わない現在の構成に合わせた本番レビューです。

## 現在の結論

現在は **Cloudflare Pages / Workers Static Assets + Firebase Auth + Firestore** 構成を前提にします。

```txt
Cloudflare
  └─ React + Vite の静的配信
Firebase Authentication
  └─ ログイン・メール認証・Google認証
Firestore
  └─ プロフィール、LIKE、マッチ、DM、通報、ブロック保存
Firestore Rules
  └─ APIサーバーの代わりにデータアクセスを制限
```

Cloudflareの静的配信では Express の `/api` は起動しません。
そのため、フロントは `/api/login` ではなく Firestore を直接利用します。

---

## 必須設定

### Cloudflare

```txt
Build command: npm run build
Build output directory: dist
```

`wrangler.jsonc` は静的アセット配信用です。

### Firebase Authentication

- メール/パスワードログインを有効化
- Googleログインを使うなら Google Provider を有効化
- Authorized domains に本番ドメインを追加

例:

```txt
palry.pages.dev
example.com
www.example.com
```

### Firestore

Firestore Database を作成し、`firestore.rules` を必ずデプロイしてください。

```bash
firebase deploy --only firestore:rules
```

---

## 必須の環境変数

Cloudflare側に以下を設定します。

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

`VITE_API_BASE_URL` は現在のCloudflare + Firestore直利用構成では不要です。
古い設定で残っていても、現在の `client/src/api.js` では使いません。

---

## データ保存レビュー

現在の保存先は Firestore です。

主なコレクション:

```txt
users
likes
receivedLikes
matches
messages
blocks
footprints
reports
```

### 良い点

- Cloudflare静的配信でもデータが保存できる
- 再デプロイしてもプロフィールやDMが消えない
- Firestore Rulesにより、最低限の本人確認と書き換え制限を入れられる

### 注意点

- クライアント直アクセスなので、サーバー側だけで行う厳密なレート制限はできない
- 本物の課金確定はクライアントだけでは安全にできない
- 通報の自動非表示や管理者処理は、将来的にCloudflare Workers/Firebase Functions等へ移すのが望ましい
- プロフィール一覧はログイン済みユーザーが読める設計なので、非公開項目は `users` に入れない方がよい

---

## セキュリティレビュー

### 実装済み

- Firebase Auth必須
- `firestore.rules` を追加
- 他人の `users/{uid}` 更新を拒否
- 通常プロフィール更新で `plan` の勝手な変更を拒否
- DMはマッチ参加者だけが読み書き可能
- LIKE / receivedLikes / blocks / reports は本人に紐づく形に制限
- 未定義コレクションは拒否

### まだ弱いところ

- 課金ボタンはデモ扱い。Firestore Rulesにより通常更新でVIP化は拒否されるため、今のままでは本物のプラン変更は通りません。
- 管理画面はフロント側スタブ寄り。管理者操作を本格化するなら Cloudflare Workers / Firebase Functions が必要です。
- 画像や音声をBase64でFirestoreに入れると容量・料金面で不利です。Firebase Storageへ移すのが望ましいです。

---

## `/api/login 404` について

Cloudflare静的配信では `/api/login` は存在しません。
このエラーが出る場合は、以下のどちらかです。

1. 古いビルドがCloudflareに残っている
2. `client/src/api.js` がExpress API版のままデプロイされている

現在の修正後は、`client/src/api.js` がFirestore直利用なので `/api/login` を叩きません。

---

## 公開前チェックリスト

### Firebase

- [ ] Firestore Databaseを作成した
- [ ] `firestore.rules` をデプロイした
- [ ] Authenticationのメール/パスワードを有効化した
- [ ] Googleログインを使う場合はProviderを有効化した
- [ ] Authorized domainsに本番ドメインを追加した

### Cloudflare

- [ ] Build command が `npm run build`
- [ ] Output directory が `dist`
- [ ] Firebaseの `VITE_FIREBASE_*` 環境変数を設定した
- [ ] 最新コミットで再デプロイした

### 動作確認

- [ ] 新規登録できる
- [ ] メール認証後、プロフィール作成できる
- [ ] ログアウト後、再ログインしてプロフィールが復元される
- [ ] マッチング画面へ入れる
- [ ] LIKE送信できる
- [ ] 相互LIKEでマッチ成立する
- [ ] DM送信できる
- [ ] ページ更新後もDM履歴が残る

---

## 次にやるべきこと

1. Cloudflareで最新コミットを再デプロイ
2. Firebase ConsoleでFirestore Rulesを反映
3. 本番ドメインをFirebase AuthenticationのAuthorized domainsへ追加
4. 実機で登録→プロフィール作成→LIKE→マッチ→DMまで確認
5. 本物の課金を入れるなら、Cloudflare WorkersかFirebase Functionsで課金確定APIを作る
