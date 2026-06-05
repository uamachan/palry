# Pairly 本番リリース チェックリスト

Pairly を本番公開するための手順です。初めての方でも順番に進めれば公開できるように書いています。

---

## 0. まず全体像（重要）

このアプリは現在 **`server/data/*.json` ファイルにデータを保存** します。
これは「小〜中規模の立ち上げ」までは問題なく使えますが、**多人数が同時に使う大規模サービスでは限界があります**。

- 1台のサーバー内のファイルなので、**サーバーを2台以上に増やすとデータを共有できません**。
- 永続ディスクを設定しないと、**再デプロイでデータが消えます**（後述の `DATA_DIR` で対策）。
- 画像・音声を base64 で JSON に保存しているため、ユーザーが増えると容量が膨らみます。

➡ **まずは1台構成（単一インスタンス＋永続ディスク）で公開し、利用が伸びてきたら
セクション9の「Firestore 移行」に進む**、という段階的な進め方を推奨します。

このリポジトリでは、1台構成で安全に動くように以下を実装済みです。

- ファイル書き込みのアトミック化＋直列化（破損・同時書き込み欠損の防止）
- Firebase トークン検証の短期キャッシュ（毎リクエストで Google API を叩かない）
- レート制限・セキュリティヘッダー・CORS オリジン制限
- グレースフルシャットダウン（停止時に進行中リクエストを捌く）
- 全 API 認証必須化（`/api/admin/reports` 含む）

---

## 1. Firebase

- Firebase Authentication で「メール/パスワード」ログインを有効化する。
- Firebase Authentication で「Google」ログインを有効化する。
- Authentication の「承認済みドメイン」に**本番ドメインを追加**する（`localhost` も残してOK）。
- メール認証テンプレートの送信者名・URL を本番向けに確認する。

---

## 2. 環境変数

`.env.production.example` を参考に、本番サーバーへ環境変数を設定します。

必須:

| 変数 | 説明 |
|------|------|
| `NODE_ENV=production` | 本番モード。静的配信が有効になる |
| `PORT` | 待ち受けポート |
| `DATA_DIR` | **永続ディスクのパス**（例 `/data`）。未設定だと再デプロイで消える |
| `CLIENT_ORIGIN` | 公開URL。CORS 許可オリジン |
| `VITE_FIREBASE_API_KEY` | Firebase Web 設定 |
| `VITE_FIREBASE_AUTH_DOMAIN` | 同上 |
| `VITE_FIREBASE_PROJECT_ID` | 同上 |
| `VITE_FIREBASE_APP_ID` | 同上 |
| `FIREBASE_WEB_API_KEY` | サーバー側のトークン検証用（通常 `VITE_FIREBASE_API_KEY` と同じ値） |

任意（未設定なら既定値）:

- `RATE_LIMIT_API_PER_MIN`（既定 120）
- `RATE_LIMIT_AUTH_PER_MIN`（既定 20）
- `TOKEN_CACHE_TTL_MS`（既定 300000＝5分）
- `JSON_BODY_LIMIT`（既定 `8mb`）

`CLIENT_ORIGIN` は実際の公開URLにします。複数許可する場合のみカンマ区切り:

```bash
CLIENT_ORIGIN=https://pairly.example,https://www.pairly.example
```

---

## 3. ビルド確認

公開前に必ずローカルで実行します。

```bash
npm install
npm run release:check
```

成功すると以下が確認できます。

- React/Vite の本番ビルド（`dist/` 生成）
- `server/index.js` の構文チェック

---

## 4. デプロイ方法（いずれか1つ）

### A. Render / Railway などの PaaS（おすすめ・初心者向け）

1. このリポジトリを GitHub に push。
2. Render なら「New > Blueprint」で `render.yaml` を読み込む（または手動で Web Service 作成）。
   - Build: `npm ci && npm run build`
   - Start: `node server/start-production.js`
   - Health check path: `/api/health`
3. **永続ディスクを追加し、マウントパスを `/data` にして `DATA_DIR=/data` を設定**。
4. セクション2の環境変数を管理画面で入力（機密値はコミットしない）。
5. インスタンス数は **1** のままにする（JSON 保存のため）。

### B. Docker / VPS

```bash
docker build -t pairly .
docker run -d -p 3001:3001 \
  -e NODE_ENV=production \
  -e CLIENT_ORIGIN=https://your-domain.example \
  -e VITE_FIREBASE_API_KEY=... \
  -e VITE_FIREBASE_AUTH_DOMAIN=... \
  -e VITE_FIREBASE_PROJECT_ID=... \
  -e VITE_FIREBASE_APP_ID=... \
  -e FIREBASE_WEB_API_KEY=... \
  -v pairly-data:/data \
  --name pairly pairly
```

`-v pairly-data:/data` がデータ永続化です（`DATA_DIR=/data` は Dockerfile で設定済み）。

---

## 5. 起動（手動の場合）

```bash
npm run build
npm start
```

本番では Express が `dist` を静的配信し、API も同じサーバーで提供します。

---

## 6. スモークテスト

公開URLで確認します。

- トップページが表示される。
- アカウント作成が開く。
- Firebase の確認メールが届く。
- メール確認後、プロフィール登録へ進む。
- Google ログインが動く。
- マッチング画面が表示される。
- プロフィール編集で画像とボイスが保存される。
- いいね、マッチ、DM、既読が動く。
- 料金ページと安全・規約ページへ移動できる。
- ログアウト後、ログイン維持が解除される。
- 再ログイン後、セッションが維持される。
- `https://公開URL/api/health` が `{"ok":true,...}` を返す。

---

## 7. セキュリティ確認

- すべての保護APIが `Authorization: Bearer <Firebase IDトークン>` を要求する（フロントは自動付与）。
- 未認証で `/api/admin/reports` や `/api/matches/...` を叩くと 401 になる。
- 他人の `userId` を送っても、自分のデータしか操作できない（サーバーがトークンから本人を特定）。

---

## 8. GitHub へのコミット

```bash
git status
git diff --stat
npm run release:check
```

問題なければコミットします（`.env` はコミットしないこと。`.gitignore` 済み）。

```bash
git add .
git commit -m "Prepare production release"
git push origin main
```

---

## 9. 大規模化のロードマップ（利用が伸びたら）

JSON ファイル保存のままでは、サーバーを増やす・大量同時アクセスに耐える、ができません。
本格的にスケールさせる場合は、以下の順で移行します。

### 9-1. サーバー側トークン検証を Firebase Admin SDK に切替

現状はトークン検証のたびに Google の REST API を呼んでいます（キャッシュで緩和済み）。
`firebase-admin` を入れると **オフラインで JWT 署名検証** でき、外部呼び出しが不要になります。

```bash
npm install firebase-admin
```

`server/index.js` の `verifyFirebaseIdentity` を `admin.auth().verifyIdToken(token)` ベースに置き換えます。
サービスアカウントの鍵（JSON）を環境変数で渡します。

### 9-2. データ保存を Firestore に移行

`server/lib/jsonStore.js` の `readJson` / `writeJson` / `updateJson` を、
Firestore 版に差し替えます。**API ハンドラ側はこの3関数しか使っていないため、
ここを置き換えるだけで全エンドポイントが Firestore 化できます**（設計上そうしてあります）。

- 各 `*.json` ファイル → Firestore の各コレクションに対応。
- `updateJson`（read→変更→write の直列処理）→ Firestore の**トランザクション**に対応。
- 画像・音声 → Firestore に直接入れず **Firebase Storage** に保存し、URL だけ保存。

移行後は `numInstances` を増やしても安全に水平スケールできます。

### 9-3. その他

- レート制限を Redis ベースの共有ストアへ（複数インスタンスで一貫させる）。
- 画像/音声を CDN 配信（Firebase Storage + CDN）。
- ログ/監視（リクエストログ、エラー通知、アップタイム監視）。
