# セキュリティ修正メモ（Firestore直利用構成）

Pairly はフロントから Firebase Auth + Firestore を直接利用する構成のため、
サーバ側で強制できない制約は Firestore セキュリティルール（`firestore.rules`）で守る必要がある。

本ドキュメントは、`main` の既存セキュリティ修正（commit `063e129`:
match偽造防止 + email PII露出対策）の**上に追加**したハードニングをまとめる。

## 既に main で対応済み（本変更では踏襲）
- **任意マッチ作成 / 同意なしDM**: `matches` create で `mutualLikeExists`
  （双方向 like 文書の `exists()`）を必須化済み。
- **email PII 露出**: 公開 `users` 文書から `email` をスキーマごと削除済み
  （クライアントも保存しない）。本変更でも email は保存しない方針を踏襲。

## 本変更で追加した修正

### 1. メール未認証ユーザーのプロフィール作成防止
- `validProfileCreate` に `request.auth.token.email_verified == true` を必須化。
- 未認証アカウントによるプロフィール作成を拒否。`verified` は引き続き `true` のみ許可。

### 2. receivedLikes のなりすまし防止
- **問題**: `receivedLikes` に `fromProfileName` / `fromProfilePhoto` などを
  クライアントが自由に書け、別人の名前・写真で LIKE 通知を偽装できた。
- **対策**:
  - ルールで保存可能キーを `forUid` / `fromUid` / `type` / `status` / `createdAt` のみに限定。
  - `type` は `['like','super','dual']` のみ許可。
  - `client/src/api.js` の `like()` はプロフィール値を保存しない。
  - 表示は `receivedLikes()` が `fromUid` から本人プロフィールを取得して名前/写真を出す。
  - 互換性: 旧データが `fromProfile*` を持っていればフォールバック表示する。

### 3. 本番環境での開発者ログイン完全無効化
- **問題**: `ALLOW_DEV_LOGIN=true` だと本番でも `dev-skip-login` が使えた。
- **対策**: `server/index.js` を
  `const allowDevLogin = !isProduction && process.env.ALLOW_DEV_LOGIN === 'true';`
  に変更。本番(`NODE_ENV=production`)では環境変数に関わらず無効。
  `/api/config` の `devLogin` も本番では `false` を返す。

### 4. 入力サイズ・型チェック強化
- `firestore.rules` の `profileFieldsValid()` で、プロフィール書き込み時に型と最大長を検証:
  - `name` ≤ 80、`bio` ≤ 500、`riotId` ≤ 80、`xHandle` ≤ 80（文字数上限として解釈）
  - `region`/`rank`/`role`/`vc`/`favoriteWeapon` ≤ 80、`gender`/`ageRange` ≤ 40
  - `profilePhoto` / `voiceIntro` は string かつ ≤ 1,500,000 文字（巨大データURL拒否）
  - `tags` / `agents` / `maps` は list かつ ≤ 30 件
- `plan` / `verified` / `autoHidden` / `isAdmin` 等はユーザーが自由に変更できない
  （`hasOnlyKeys` の許可一覧に無い、または値を固定）。

## 変更ファイル一覧
- `firestore.rules` — email_verified 必須化、入力検証（profileFieldsValid）追加、
  receivedLikes の保存キー限定
- `server/index.js` — 本番 dev login 完全無効化
- `client/src/api.js` — receivedLikes になりすまし用プロフィール値を保存しない／表示時に本人取得
- `SECURITY.md` — 本ドキュメント（新規）

## 動作確認結果
- `node --test` … 33 tests pass / 0 fail
- `npm run build`（vite build）… 成功
- `node --check server/index.js` … OK
- Firebase Rules の構文コンパイル … 当環境に firebase-cli が無いため未実行（手動レビュー済み）。
  デプロイ前に `firebase deploy --only firestore:rules` または
  Firebase Console の Rules Playground で検証すること。

### 想定シナリオ（要 Rules エミュレータ/本番デプロイで最終確認）
- メール未認証ユーザーはプロフィール作成不可
- 相互 LIKE なしで `matches` 作成不可 → match なし DM 不可（main で対応済み）
- プロフィール更新で `plan` / `verified` / `autoHidden` を改ざん不可
- `receivedLikes` で別人の名前/写真を偽装不可
- 本番環境では dev login が使用不可

## 残課題 / 今後の TODO
- **users read 範囲**: email は削除済みだが `plan` 等は依然ログイン済みユーザーから読める。
  公開フィールドのみの `publicProfiles/{uid}` 新設による分離は別PRで検討。
- **課金/日次制限の enforcement**: FREE ユーザーの LIKE 日次上限や super/dual 枚数は
  Firestore Rules だけでは集計できない。Cloud Functions もしくは Express API 経由でのサーバ集計に寄せる。
