# Pairly 要件定義・仕様書

> VALORANT 向け 相方／パーティー募集マッチング Web アプリ
> 本書は現行実装（React + Vite / Express + JSON ストレージ / Firebase 認証）を土台に、
> 「プロの Web エンジニア・UI/UX デザイナーが当然組み込む仕様」を網羅した要件定義書である。

## 文書情報

| 項目 | 内容 |
|---|---|
| プロダクト名 | Pairly（palry.onrender.com） |
| 文書バージョン | 1.0 |
| 最終更新 | 2026-06-07 |
| 対象読者 | エンジニア / デザイナー / PM / レビュアー |
| 凡例 | ✅ 実装済み ／ 🟡 部分的 ／ 🔲 未対応（推奨） |

凡例の各項目は「現行コードでどこまでできているか」を示す。本書は単なる理想論ではなく、
**現状とのギャップを可視化し、実装可能な優先度に落とす**ことを目的とする。

---

## 1. プロダクト概要

### 1.1 目的
VALORANT プレイヤーが、ランク・ロール・地域・プレイ目的で条件の合う相方を見つけ、
相互の合意（マッチ）後に 1 対 1 メッセージで連絡できるようにする。

### 1.2 想定ユーザー
- ランク／カジュアルのデュオ・フルパ相手を探すプレイヤー
- 固定メンバー・ゲーム恋人を探すプレイヤー
- 13〜80 歳（年齢制限あり。未成年保護の観点で下限 13）

### 1.3 スコープ
- 認証、プロフィール、候補表示、いいね、マッチ、DM、通報・ブロック、管理、デモ課金
- 本番決済・ネイティブアプリ・リアルタイム push 通知は本フェーズ対象外

---

## 2. システム構成・技術スタック

| レイヤ | 採用技術 | 備考 |
|---|---|---|
| フロント | React 19 + Vite 8（Rolldown） | SPA、CSS は手書き（デザイントークン未formalize） |
| 認証 | Firebase Authentication | Email/Password + Google、メール認証必須 |
| API | Express 5 | REST、`/api/*` |
| 永続化 | JSON ファイル（原子的 write + ファイル別キュー） | 単一インスタンス前提 |
| 配信 | Render（Docker / Node 22+） | 永続ディスク `/data` |

### 2.1 構成上の制約（明文化）
- **単一インスタンス前提**：JSON ストレージ・インメモリレート制限のため水平スケール不可。
  スケールが必要になった時点で Firestore/Postgres + Redis へ移行する（→ §4.3）。
- フロントは **URL ルーティングを持たない**（`view`/`activeTab` の state 駆動）。
  SEO・404・共有リンクの観点で制約となる（→ §6.1, §7）。

---

## 3. 機能要件

各機能の詳細レビューは `docs` 配下の別途レビュー結果と重複するため、ここでは
**要件・受け入れ基準・状態**に絞って定義する。

### 3.1 認証・アカウント
| ID | 要件 | 状態 |
|---|---|---|
| AUTH-1 | メール+パスワードで新規登録でき、登録時に確認メールを送る | ✅ |
| AUTH-2 | メール認証完了まではプロフィール作成・ログインを許可しない | ✅ |
| AUTH-3 | Google ログインに対応する | ✅ |
| AUTH-4 | パスワード再設定メールを送れる。**アカウント存在を漏らさない**中立文言 | ✅ |
| AUTH-5 | ログアウトでクライアント状態を完全に破棄する | ✅ |
| AUTH-6 | 401（トークン失効）時に再ログインを促す | 🟡 各APIで握り、UI上の一律ハンドリングは未整備 |
| AUTH-7 | セッション（IDトークン）はサーバーで都度検証＋短期キャッシュ | ✅ |

**受け入れ基準**：未認証で `/api/*`（保護対象）を叩くと 401／403 が返り、UI はログインへ誘導する。

### 3.2 プロフィール
| ID | 要件 | 状態 |
|---|---|---|
| PROF-1 | 表示名・Riot ID・年齢・地域・性別・ランク・ロール・タグ・エージェント・自己紹介・写真・音声を登録 | ✅ |
| PROF-2 | 年齢は **サーバー側で 13〜80 に強制**（異常値拒否） | ✅ |
| PROF-3 | 写真・音声は **data URL のみ許可**（スキーム混入防止） | ✅ |
| PROF-4 | Riot ID はアカウント間で一意 | ✅ |
| PROF-5 | 編集はステップ式で、未入力項目を明示する | ✅ |

### 3.3 マッチング
| ID | 要件 | 状態 |
|---|---|---|
| MATCH-1 | 実ユーザーのみ候補表示（自分・ブロック・自動非表示を除外） | ✅ |
| MATCH-2 | いいね/SUPER/両いいね/見送り。日次枠をプラン別に**原子的**に管理 | ✅ |
| MATCH-3 | 相互いいねでマッチ成立し DM を解放 | ✅ |
| MATCH-4 | もらったいいね一覧から「いいね返し」でマッチ | ✅ |
| MATCH-5 | 性別フィルターはプラン/購入特典保持者のみ（サーバー判定） | ✅ |

### 3.4 DM
| ID | 要件 | 状態 |
|---|---|---|
| DM-1 | マッチ後のみ送受信可能 | ✅ |
| DM-2 | ブロック済み相手には送信不可（双方向） | ✅ |
| DM-3 | 2.5 秒以内の同一文面は**保存せず 409**（幻メッセージ防止） | ✅ |
| DM-4 | 送信は二重送信を防止（送信中 disable + 送信ガード） | ✅ |
| DM-5 | 自分の送信済みメッセージを「送信済み」、既読後を「既読」と JSX 上で正しく出力する（CSS 置換・文字隠し不可） | ✅ |
| DM-6 | 定型文スタート・相手プロフィール確認 | ✅ |
| DM-7 | DM 送信レート制限（30/分/IP） | ✅ |

### 3.5 安全対策（通報・ブロック）
| ID | 要件 | 状態 |
|---|---|---|
| SAFE-1 | 通報：自己通報禁止・存在チェック・24h 重複防止・1日上限20件/アカウント・10/分/IP | ✅ |
| SAFE-2 | ブロック：自己ブロック禁止・存在チェック・pending いいね無効化・双方向 DM 解放解除 | ✅ |
| SAFE-3 | 異なる通報者が閾値（既定3）に達したら**自動で候補非表示** | ✅ |
| SAFE-4 | 管理者は自動非表示を**解除**でき、関連通報を dismissed 化 | ✅ |
| SAFE-5 | 主要操作を**監査ログ**に追記（report/block/auto_hide/admin_*） | ✅ |

### 3.6 管理
| ID | 要件 | 状態 |
|---|---|---|
| ADMIN-1 | 管理 API は `ADMIN_EMAILS` で保護（フェイルクローズ） | ✅ |
| ADMIN-2 | フロントも `user.isAdmin` でタブ/画面をガード | ✅ |
| ADMIN-3 | 通報一覧・自動非表示ユーザー一覧・解除操作 | ✅ |
| ADMIN-4 | 監査ログ閲覧 UI（通報・ブロック・自動非表示・管理操作ログ） | ✅ |

### 3.7 課金（デモ）
| ID | 要件 | 状態 |
|---|---|---|
| PAY-1 | FREE/PLUS/VIP プラン、単発アイテム | ✅ |
| PAY-2 | 本番は明示フラグなしで決済を通さない（フェイルクローズ） | ✅ |
| PAY-3 | 実決済プロバイダ連携（Stripe 等） | 🔲 未統合（デモ） |

---

## 4. 非機能要件

### 4.1 パフォーマンス・UX（最重要）

#### 4.1.1 目標値（Core Web Vitals）
| 指標 | 目標（モバイル 75 パーセンタイル） |
|---|---|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| 初期 JS（gzip） | エントリ < 30kB（実測値は build 結果参照） |

#### 4.1.2 読み込み最適化
| 項目 | 状態 |
|---|---|
| ルート/機能単位のコード分割（Firebase / AppDashboard / AuthForms） | ✅ |
| 画像 `loading="lazy"` `decoding="async"` | ✅ |
| LCP 候補（ロゴ）の `preload` + `fetchpriority=high` | ✅ |
| フォント CSS の非同期読み込み（レンダリングブロック回避） | ✅ |
| エントリ CSS のインライン化（追加リクエスト削減） | ✅ |
| 起動スケルトン（ホワイトフラッシュ防止） | ✅ |
| **画面内スケルトン**（候補カード・DM一覧・通知のローディング） | 🔲 推奨 |

**SKELETON 要件（🔲）**：データ取得中は、レイアウトを確定させた **スケルトン UI** を表示し
CLS を抑える。最低限、(a) 候補カード (b) DM スレッド一覧 (c) 通知一覧 の 3 箇所に導入する。
スピナーではなく**実レイアウトと同形のプレースホルダ**を使う。

#### 4.1.3 体感速度（楽観的 UI）
- いいね・DM 送信・ブロックは送信前に UI を先行更新し、失敗時にロールバック＋トースト。
  - DM 送信：✅（送信後にスレッド反映、409 はトースト）
  - ブロック：✅（先に `nextCard()`／スレッド除去）
- ページ遷移は state 切替のため即時（✅）。将来ルーティング導入時は遷移中スケルトンを維持する。

#### 4.1.4 フォーム UX（バリデーション）
| 要件 | 状態 |
|---|---|
| 必須・形式エラーを**インライン**かつ**その場**で提示 | 🟡 プロフィールはステップ検証あり／認証フォームはトースト中心 |
| バリデーションのタイミング：入力中は寛容、`onBlur`/`submit` で厳格 | 🟡 統一ルール未定義 |
| エラー要素に `aria-invalid` / `aria-describedby` を付与 | 🔲 推奨 |
| 送信ボタンは処理中 `disabled` + ラベル変更（「送信中」） | ✅（DM/各フォーム） |
| 二重送信防止（state + ガード） | ✅（DM）／🟡 他フォームは disable 依存 |

**FORM 標準ルール（採用）**
1. 入力中（`onChange`）はエラーを**消す方向**のみ（赤を出し続けない）。
2. `onBlur` と `submit` で確定検証。最初のエラー項目へフォーカス移動。
3. エラーメッセージはフィールド直下に固定領域で表示（レイアウトシフトを起こさない）。
4. すべての送信は idempotent もしくは二重送信ガードを持つ。

### 4.2 セキュリティ
| 項目 | 状態 |
|---|---|
| Firebase IDトークン検証 + メール認証必須 | ✅ |
| 認可：本人/管理者チェック、フェイルクローズ | ✅ |
| 入力サニタイズ（`cleanText`/`cleanAge`/`sanitizeMedia`） | ✅ |
| XSS：`dangerouslySetInnerHTML` 不使用、React 自動エスケープ | ✅ |
| CSP（本番）・X-Frame-Options DENY・nosniff・Referrer-Policy・**HSTS** | ✅ |
| `X-Powered-By` 無効化 | ✅ |
| レート制限（api/auth/report/dm、IP単位） | ✅ |
| CORS allowlist | ✅ |
| パストラバーサル防止（`safeFilePath`） | ✅ |
| アカウント列挙防止（パスワード再設定） | ✅ |
| 監査ログ | ✅ |
| 秘密情報を含む環境変数の管理（`sync:false`） | ✅ |
| 依存脆弱性の定期監査（`npm audit` を CI 化） | 🔲 推奨 |

### 4.3 可用性・信頼性
| 項目 | 状態 |
|---|---|
| グレースフルシャットダウン（SIGTERM/SIGINT） | ✅ |
| 未処理例外/rejection のロギング | ✅ |
| ヘルスチェック `/api/health` | ✅ |
| 原子的書き込み（temp→rename）＋ファイル別直列キュー | ✅ |
| 永続ディスク（Render `/data`） | ✅ |
| **バックアップ／リストア手順** | 🔲 推奨（JSON の定期スナップショット） |
| 監視・アラート（エラー率/レイテンシ） | 🔲 推奨（Sentry/Logflare 等） |

### 4.4 保守性・拡張性
| 項目 | 状態 |
|---|---|
| ランタイムパッチを排し本体に集約（`index-runtime.js` は passthrough） | ✅ |
| 環境変数で閾値調整（レート/通報/自動非表示） | ✅ |
| デザインシステムの形式化（トークン/コンポーネント） | 🔲（→ §5） |
| 自動テスト（単体/結合/E2E） | 🔲 推奨 |
| ストレージ抽象化（JSON→DB 差し替え可能なリポジトリ層） | 🔲 推奨 |

---

## 5. UI/UX 仕様（デザインシステム）

### 5.1 デザイントークン（🔲 形式化を推奨）
現状は CSS に色・余白が直書き。以下を CSS 変数（`:root`）に集約し**唯一の真実**とする。

```
--color-bg:        #fffdf9;   /* 既存テーマカラー */
--color-surface:   #ffffff;
--color-border:    #e8e0d6;
--color-accent:    #c4b09a;
--color-text:      #2b2b2b;
--color-danger:    #d8584f;
--radius-sm/md/lg: 8 / 14 / 22px;
--space-1..6:      4 / 8 / 12 / 16 / 24 / 32px;
--font-sans:       system-ui, "Hiragino Sans", sans-serif;
--shadow-card:     0 6px 24px rgba(0,0,0,.06);
--z-modal:         1000; --z-toast: 1100;
```

### 5.2 UI コンポーネント（再利用単位）
プロの標準として以下を**部品として切り出す**（現状は JSX 内に散在 🟡）。

| コンポーネント | 責務 | バリアント | 状態 |
|---|---|---|---|
| `Button` | 操作の起点 | primary / secondary / danger / plain・size | 🟡 CSS クラスのみ |
| `Card` | 情報のまとまり | profile / notification / list-row | 🟡 |
| `Modal` | 集中タスク | narrow / profile、フォーカストラップ・ESC・スクリム | ✅ `AuthModal` に実装済（横展開推奨） |
| `Input/Field` | 入力 + ラベル + エラー | text / number / select / textarea | 🔲 |
| `Toast` | 一時通知 | info / error、aria-live | ✅（横展開で統一） |
| `Tabs` | 画面切替 | アイコン + バッジ | ✅ |
| `Avatar` | 人物表示 | 写真 / イニシャル、size | 🟡 |
| `Skeleton` | ローディング代替 | text / card / list | 🔲 |
| `EmptyState` | 空表示 | 文言 + アクション | 🟡（文言のみ） |

**指針**：見た目（CSS）と意味（コンポーネント）を分離し、`Button` 等は **props でバリアント制御**。
新規 UI は必ず既存部品を再利用し、重複 JSX を増やさない。

### 5.3 画面状態の標準（4 ステート）
すべての非同期領域は次の 4 状態を**必ず**設計する。
1. **Loading**：スケルトン（スピナー単独は不可）
2. **Empty**：説明文 + 次アクション（例：「まだマッチがありません → 探す」）
3. **Error**：原因 + 再試行ボタン
4. **Success**：通常表示

現状は Loading/Error の体系が薄い（🟡）。最低限 候補・DM・通知・管理に 4 状態を適用する。

### 5.4 アクセシビリティ（WCAG 2.1 AA 目安）
| 項目 | 状態 |
|---|---|
| モーダルのフォーカストラップ・ESC・`aria-modal` | ✅ |
| トーストの `aria-live=polite` | ✅ |
| タブ/メニューの `role`/`aria-selected`/`aria-expanded` | ✅ |
| 画像 `alt`、装飾は `aria-hidden` | ✅ |
| フォームの `aria-invalid`/`aria-describedby` | 🔲 推奨 |
| コントラスト比 4.5:1 の担保（アクセント色の確認） | 🔲 要検証 |
| キーボードのみで全操作可能 | 🟡 要通し確認 |

---

## 6. エラーハンドリング

### 6.1 クライアント
| 要件 | 状態 |
|---|---|
| ネットワーク/サーバーエラーをユーザー文言（日本語）で提示 | ✅（トースト + `firebaseErrorMessage`） |
| **404 ページ**（不正な URL） | 🔲 ルーティング未導入のため不在（SPA fallback が index を返す） |
| **React Error Boundary**（描画クラッシュ時の代替 UI） | 🔲 推奨 |
| オフライン検知（`navigator.onLine`）と再接続案内 | 🔲 推奨 |
| 401 を検知して再ログイン導線へ一元化 | 🟡 |

**推奨対応**：軽量ルーター（`react-router` もしくは history ラッパ）を導入し、
`/`, `/app`, `/pricing`, `/safety`, `/legal`, `*`(404) を URL 化する。これにより
(a) 404 ページ (b) 共有可能 URL (c) 計測の精度 (d) ブラウザ戻る/進む が一挙に整う。

### 6.2 サーバー
| 要件 | 状態 |
|---|---|
| 一貫した JSON エラー（`{ message }`） | ✅ |
| 未知 `/api` ルートは JSON 404 | ✅ |
| 集約エラーハンドラ（本番はスタック秘匿） | ✅ |
| 適切な HTTP ステータス（400/401/402/403/404/409/429/503） | ✅ |
| 不正 JSON ボディ時に JSON で 400 を返す | 🟡 既定は 400 だが文言は汎用 |

---

## 7. SEO・計測・運用

### 7.1 メタ / OGP 管理
| 項目 | 状態 |
|---|---|
| title / description / keywords / canonical / theme-color | ✅ |
| OGP（og:*）・Twitter Card | ✅ |
| 構造化データ JSON-LD（WebSite/Organization/WebApplication） | ✅ |
| favicon / apple-touch-icon / webmanifest | ✅ |
| **画面別メタの動的更新**（ルーティング導入後、`/pricing` 等で出し分け） | 🔲 推奨 |

### 7.2 sitemap.xml / robots.txt
| 項目 | 状態 |
|---|---|
| robots.txt（Sitemap 参照付き） | ✅ |
| sitemap.xml | 🟡 **静的・単一 URL・lastmod 手動** |
| **sitemap 自動生成**（ビルド時に公開ルートから生成、lastmod を自動付与） | 🔲 推奨 |

**SITEMAP 自動生成要件**：公開ルート一覧（`/`, `/pricing`, `/safety`, `/legal` 等）を
単一の定義から生成する Vite ビルドプラグイン/スクリプトを用意し、`lastmod` をビルド日時で自動付与する。
ルート追加時に sitemap 更新漏れが起きない仕組みにする。

### 7.3 アナリティクス（計測タグの埋め込みやすさ）
| 要件 | 状態 |
|---|---|
| GA4 等の計測タグ | 🔲 未導入 |
| **env-gated 設計**（`VITE_GA_ID` がある時だけ読み込む） | 🔲 推奨 |
| CSP との整合（`script-src`/`connect-src` に計測ドメインを env で追加） | 🔲 設計要 |
| 同意管理（Cookie 同意バナー、GDPR/個人情報配慮） | 🔲 推奨 |
| イベント計測（登録完了・いいね・マッチ・DM送信・課金）の計測点定義 | 🔲 推奨 |

**ANALYTICS 設計指針**
- 測定 ID を環境変数化し、未設定なら**一切読み込まない**（開発・プレビューを汚さない）。
- 主要コンバージョン（`sign_up` / `match` / `purchase`）をカスタムイベントとして関数 1 箇所
  （`track(event, params)`）に集約し、後から GA4 以外へも差し替え可能にする。
- CSP は計測ドメインを**環境変数で注入**し、ハードコードしない。

### 7.4 デプロイ運用
| 項目 | 状態 |
|---|---|
| `release:check`（build + 構文チェック） | ✅ |
| Procfile / render.yaml / Dockerfile が単一起動経路で整合 | ✅ |
| 環境変数の検証（本番必須キーの欠落を警告） | ✅ |
| CI（PR ごとに lint/test/build/audit） | 🔲 推奨 |

---

## 8. データモデル（JSON ストア）

| ファイル | 主キー | 主フィールド |
|---|---|---|
| users.json | id | firebaseUid, email, name, riotId, age(13-80), gender, region, rank, role, tags[], agents[], profilePhoto(dataURL), voiceIntro(dataURL), plan, autoHidden? |
| likes.json | id | userId, profileId, type(like/super/dual), createdAt |
| matches.json | id | userId, profileId, conversationId, dmUnlocked, opener, createdAt |
| messages.json | id | conversationId, matchId, senderUserId, body(≤500), readAt |
| received_likes.json | id | forUserId, fromProfileId, status(pending/accepted/blocked) |
| blocks.json | id | userId, profileId |
| reports.json | id | userId, profileId, reason, status(open/dismissed) |
| audit.json | id | action, actorId, targetId, meta, createdAt（上限5000） |
| purchases / single_purchases.json | id | userId, plan/item, perk, expiresAt/remaining |

> **将来移行**：上記をリポジトリ層（`repo.users.find()` 等）の背後に隠蔽し、
> JSON → Firestore/Postgres を差し替え可能にする（§4.4）。

---

## 9. API 一覧（要約）

| メソッド/パス | 認証 | 概要 |
|---|---|---|
| GET `/api/health` | - | ヘルスチェック |
| GET `/api/plans` | - | プラン/単発アイテム |
| POST `/api/register` | Firebase | プロフィール作成（メール認証必須） |
| POST `/api/login` | Firebase | ログイン（メール認証必須） |
| PUT `/api/profile` | requireAuth | プロフィール更新 |
| GET `/api/profiles` | requireAuth | 候補一覧（ブロック/自動非表示除外） |
| POST `/api/like` | requireAuth | いいね（枠/ブロック判定、相互でマッチ） |
| GET `/api/matches/:id` | requireAuth | マッチ一覧 |
| GET `/api/dm/:id` | requireAuth | スレッド一覧 |
| POST `/api/dm` | requireAuth + dmLimiter | 送信（マッチ後/非ブロック/重複409） |
| POST `/api/dm/read` | requireAuth | 既読化 |
| GET `/api/received-likes/me` | requireAuth | もらったいいね |
| POST `/api/accept-like` | requireAuth | いいね返し |
| POST `/api/report` | requireAuth + reportLimiter | 通報（24h重複/日次上限/自動非表示） |
| POST `/api/block` | requireAuth | ブロック |
| GET `/api/admin/reports` | admin | 通報+自動非表示一覧 |
| POST `/api/admin/unhide` | admin | 自動非表示解除 |
| GET `/api/admin/audit` | admin | 監査ログ閲覧（直近最大 500 件） |
| POST `/api/purchase` / `/api/purchase-item` | requireAuth | デモ課金 |
| GET `/api/entitlements/:id` | requireAuth | 有効特典 |

---

## 10. 受け入れ基準（Definition of Done）

機能を「完了」とみなす条件：
1. **機能要件**を満たし、正常系・異常系の両方が手動確認済み。
2. **4 ステート**（Loading/Empty/Error/Success）が用意されている。
3. **アクセシビリティ**：キーボード操作可、フォームに `aria-invalid`、画像 `alt`。
4. **セキュリティ**：サーバー側で認証・認可・入力検証を実施（クライアント検証に依存しない）。
5. **パフォーマンス**：追加で初期バンドルを大きく増やさない／非同期領域はスケルトン。
6. `npm run release:check` が通る（build + 構文チェック）。
7. 計測対象イベントがある場合、計測点が `track()` に登録されている。

---

## 11. ギャップ分析と優先度付きロードマップ

現行は機能・セキュリティが高水準。残るは主に **UX 体系化** と **運用計測**。

### 優先度 高（次フェーズ）
1. 🔲 **クライアントルーティング + 404 ページ + Error Boundary**
   （SEO・共有 URL・計測・エラー耐性をまとめて解決）
2. 🔲 **画面内スケルトン**（候補/DM/通知）と 4 ステートの徹底
3. 🔲 **フォーム標準化**（インラインエラー + `aria-invalid` + 二重送信ガードの全面適用）

### 優先度 中
4. 🔲 **アナリティクス（GA4・env-gated・同意バナー・イベント設計）**
5. 🔲 **デザインシステム形式化**（トークン + `Button/Input/Card/Modal/Skeleton` 部品化）
6. 🔲 **sitemap 自動生成**（ルート定義一元化）
7. 🔲 **管理：監査ログ閲覧 UI**

### 優先度 低（拡張）
8. 🔲 自動テスト（Vitest 単体 + Playwright E2E）と CI（lint/test/build/`npm audit`）
9. 🔲 ストレージ抽象化（リポジトリ層）→ DB 移行準備
10. 🔲 実決済（Stripe）統合
11. 🔲 監視・アラート（Sentry 等）とバックアップ手順
12. 🔲 足あとのサーバー永続化（「誰が見たか」）

---

### 付記
本書の ✅ は現行コードで確認した実装済み項目、🔲 は「プロなら入れる」未対応項目を示す。
新機能・改修時は §10（DoD）を満たすこと。閾値類は環境変数で運用調整できる
（`MAX_REPORTS_PER_DAY` / `REPORT_AUTO_HIDE_THRESHOLD` / `RATE_LIMIT_*` 等）。
