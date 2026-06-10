# Pairly 本番リリース チェックリスト

Renderは使わず、Cloudflare + Firebaseで公開する前提のチェックリストです。

---

## 0. 全体像

現在の構成:

```txt
Cloudflare Pages / Workers Static Assets
  └─ React + Vite

Firebase Authentication
  └─ ログイン・メール認証・Google認証

Firebase Firestore
  └─ users / likes / receivedLikes / matches / messages / blocks / footprints / reports
```

Cloudflareの静的配信では Express の `/api` は起動しません。
`/api/login 404` が出る場合は、古いビルドか古いAPIクライアントが残っています。

---

## 1. Firebase

- [ ] Firebase Authenticationで「メール/パスワード」を有効化する
- [ ] Googleログインを使う場合は Google Provider を有効化する
- [ ] Authentication > Settings > Authorized domains に本番ドメインを追加する
- [ ] Firestore Database を作成する
- [ ] `firestore.rules` をデプロイする

Rules デプロイ例:

```bash
npm install -g firebase-tools
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

---

## 2. Cloudflare環境変数

Cloudflare Pages/Workers側に以下を設定します。

| 変数 | 説明 |
|------|------|
| `VITE_FIREBASE_API_KEY` | Firebase Web設定 |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authドメイン |
| `VITE_FIREBASE_PROJECT_ID` | FirebaseプロジェクトID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web設定 |
| `VITE_FIREBASE_APP_ID` | Firebase App ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | 任意 |
| `SITE_URL` | 公開URL。任意だが設定推奨 |

`VITE_API_BASE_URL` は現在の構成では不要です。

---

## 3. ビルド確認

```bash
npm install
npm run build
```

Cloudflareの設定:

```txt
Build command: npm run build
Build output directory: dist
```

---

## 4. デプロイ後のスモークテスト

- [ ] トップページが表示される
- [ ] アカウント作成画面が開く
- [ ] Firebaseの確認メールが届く
- [ ] メール確認後、プロフィール登録へ進む
- [ ] Googleログインが動く
- [ ] マッチング画面が表示される
- [ ] プロフィール編集が保存される
- [ ] LIKEを送れる
- [ ] 相互LIKEでマッチ成立する
- [ ] DM送信できる
- [ ] ページ更新後もDM履歴が残る
- [ ] ログアウト後、再ログインしてプロフィールが復元される

---

## 5. セキュリティ確認

- [ ] 未ログイン状態でマッチング画面に入れない
- [ ] Firestore Rulesが本番に反映されている
- [ ] 他人の `users/{uid}` を更新できない
- [ ] 自分のプロフィール更新で `plan` を勝手に変えられない
- [ ] DMはマッチ参加者だけが読める
- [ ] 未定義コレクションは読み書き拒否される

---

## 6. 重要な注意

現在の課金はUIデモです。
本物のPLUS/VIP反映を安全に行うには、Cloudflare Workers / Firebase Functions / Stripe Webhook など、サーバー側で決済完了を検証してから `plan` を変更する仕組みが必要です。

クライアントだけで `plan` をVIPに変更できる状態は危険なので、Firestore Rules側では通常プロフィール更新による `plan` 変更を拒否しています。

---

## 7. 次の改善候補

1. 課金確定用の Cloudflare Worker または Firebase Function を作る
2. 画像・音声をFirestoreではなくFirebase Storageへ移す
3. 通報の自動非表示処理をCloudflare Worker/Firebase Functionへ移す
4. 管理者画面をサーバー側認可付きにする
5. Firestore indexesを必要に応じて追加する
