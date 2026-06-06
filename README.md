# Pairly separate app flow

Pairly の作り込み版です。

## 変更点

- 公開サイトとマッチング画面を分離
- マッチング画面はLP内のセクションではなく、登録後に同じサイト内で開くアプリ画面
- アカウント作成しないとマッチング / DM / 足あと / 管理は利用不可
- アカウント作成時の性別選択は必須
- 料金は月額プラン / 単発課金 / 比較表でタブ分け
- PLUS / VIP の性別指定フィルター
- VIP 全制限解除
- 女性プロフィールは人気集中ガードで少しマッチしにくく調整
- 利用規約・免責・禁止事項・非公式表記入り

## プロフィールの永続保存

Pairly は Firebase Authentication のログインアカウントと、サーバー側のプロフィールデータを紐づけて保存します。

- Firebase UID: `firebaseUid`
- メールアドレス: `email`
- プロフィール保存先: `users.json`
- 登録API: `POST /api/register`
- ログイン復元API: `POST /api/login`
- プロフィール更新API: `PUT /api/profile`

アカウント作成後は、同じ Firebase アカウントでログインすると `firebaseUid` から保存済みプロフィールを復元します。
プロフィール編集画面で保存した内容も `users.json` に更新されるため、ブラウザを閉じてもログアウトしても残ります。

### 本番で消えない保存先にする

ローカル開発では `server/data/users.json` に保存します。これは開発用です。
Render / Railway / VPS などで本番運用する場合、再デプロイやコンテナ再起動でデータが消えないように、永続ディスクを用意して `DATA_DIR` を設定してください。

例:

```bash
DATA_DIR=/var/pairly-data
```

`DATA_DIR` の中に以下のようなデータが保存されます。

```txt
users.json
likes.json
matches.json
received_likes.json
messages.json
single_purchases.json
```

完全に長期運用する場合は、JSONファイル保存ではなく Supabase / PostgreSQL / Firebase Firestore などのDB化を推奨します。
ただし現在の構成でも、`DATA_DIR` を永続ディスクに向ければプロフィールデータはアカウントに紐づいたまま保存されます。

## 起動方法

```bash
npm install
npm run dev
```

フロント: http://localhost:5173
API: http://localhost:3001/api/health

## Firebaseログイン設定

Firebase ConsoleでWebアプリを作成し、Authenticationのメール/パスワードを有効化してください。
その後、`.env` に以下を設定します。
`.env` は公開・コミットしないでください。このリポジトリでは `.gitignore` で除外しています。

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

`auth/api-key-not-valid` が出る場合は、Firebase Consoleの「プロジェクトの設定 > 全般 > Web API Key」をコピーし直してください。
Google Cloud側でAPIキー制限を使っている場合は、Identity Toolkit APIを許可し、ローカル確認用に `http://localhost:5173` と `http://127.0.0.1:5173` を許可してください。
`.env` を変更したら、Viteが再読み込みするように `npm run local` を再起動してください。

Windowsでブラウザまで開く場合:

```bash
npm run local
```

または `start-local.bat` をダブルクリックしてください。

## 本番風起動

```bash
npm run build
npm start
```

## 本番リリース準備

本番公開前は以下を確認してください。

```bash
npm run release:check
```

本番環境変数は `.env.production.example` を参考に設定します。
Firebase Authenticationの承認済みドメインには、実際の公開ドメインを追加してください。

詳しい手順は `RELEASE_CHECKLIST.md` を確認してください。
