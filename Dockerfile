# Pairly 本番用 Dockerfile（マルチステージ）
# 1) builder: 依存インストール + クライアントビルド
# 2) runner: 本番依存のみで起動

# ---- builder ----
FROM node:20-slim AS builder
WORKDIR /app

# 依存を先にコピーしてキャッシュを効かせる
COPY package.json package-lock.json ./
RUN npm ci

# ソースをコピーしてクライアントをビルド（dist を生成）
COPY . .
RUN npm run build

# ---- runner ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# 本番依存のみインストール
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# サーバーコードとビルド済み dist をコピー
COPY --from=builder /app/dist ./dist
COPY server ./server

# データは永続ボリュームにマウントすることを推奨（DATA_DIR で指定）
ENV DATA_DIR=/data
VOLUME ["/data"]

# 非rootユーザーで実行
RUN useradd --system --uid 1001 pairly \
  && mkdir -p /data \
  && chown -R pairly:pairly /app /data
USER pairly

EXPOSE 3001

# ヘルスチェック（/api/health）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/start-production.js"]
