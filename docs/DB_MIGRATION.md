# Pairly DB Migration

Pairly の Firebase Auth は継続し、プロフィール・いいね・DM・通報・監査ログなどのアプリデータを PostgreSQL へ移すための移行土台です。

現時点では API runtime はまだ JSON 保存を使います。ここで追加した Prisma schema / migration / import script は、DB-backed repositories へ切り替える前の受け皿とデータ移行確認用です。

## 構成

- ORM: Prisma 7
- DB: PostgreSQL
- Prisma schema: `prisma/schema.prisma`
- 初期 migration: `prisma/migrations/20260607000000_init/migration.sql`
- JSON import: `scripts/import-json-to-db.mjs`

## 環境変数

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATA_DIR=/data
```

`DATA_DIR` は既存 JSON の読み込み元です。未指定時の import script は `server/data` を読みます。

## 移行手順

1. JSON をバックアップします。

```bash
# Render なら /data 全体をバックアップ
# ローカルなら server/data/*.json を退避
```

2. Prisma schema を検証します。

```bash
npm run db:validate
```

3. DB に migration を適用します。

```bash
npm run db:migrate
```

4. JSON import の dry-run を実行します。

```bash
npm run db:import-json:dry-run
```

欠落参照がある場合は `legacy_missing` の placeholder user として取り込まれます。現在のデモデータでは `u1` が該当します。

5. DB へ import します。

```bash
npm run db:import-json
```

既存 DB を消して入れ直す検証環境では以下を使えます。

```bash
npm run db:import-json -- --reset
```

6. 件数確認をします。

最低限、以下の JSON 件数と DB 件数を照合してください。

- users + profiles + placeholder users
- likes
- received_likes
- matches
- messages
- blocks
- reports
- purchases
- single_purchases
- audit_logs

## 移行時の正規化

- `profiles.json` の旧デモプロフィールは `users.source = legacy_profile` として取り込みます。
- JSON にだけ残っている欠落参照は `users.source = legacy_missing` の placeholder として取り込みます。
- `otpSecret`, `authCodeSalt`, `authCodeHash` は DB に移行しません。
- autoHidden ユーザー発の pending `received_likes` は import 時に `auto_hidden` へ正規化します。
- `messages.conversation_id` は既存値を優先し、なければ `match_id` を fallback として入れます。

## Runtime 切替の次ステップ

DB への import が安定したら、次は API の保存先を repository layer 経由に切り替えます。優先順位は以下です。

1. read-only 系: profiles / received_likes / matches / dm threads / admin reports
2. transaction 必須系: like / accept-like / report / block / dm / purchase
3. JSON 書き込み停止
4. `DATABASE_URL` 未設定時の本番起動失敗化
5. DB backup / point-in-time recovery 有効化
