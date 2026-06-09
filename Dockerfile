# Pairly 本番用 Dockerfile
#
# VITE_ 変数はビルド時（vite build）に必要だが、
# Render の Docker モードでは env vars は実行時にしか渡せない。
# そのため npm run build をコンテナ起動時に実行し、
# env vars が揃った状態でビルドしてからサーバーを起動する。

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# 依存をインストール。
# package-lock.json がある場合は再現性の高い npm ci、無い場合は npm install にフォールバックする。
# これにより lockfile 未コミット状態でも Docker / Render のビルドが止まらない。
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ソースをコピー
COPY . .

# データは永続ボリュームにマウントすることを推奨（DATA_DIR で指定）
ENV DATA_DIR=/data
VOLUME ["/data"]

# 非rootユーザーで実行
RUN useradd --system --uid 1001 pairly \
  && mkdir -p /data \
  && chown -R pairly:pairly /app /data
USER pairly

EXPOSE 3001

# ヘルスチェック（ビルド時間を考慮して start-period を長めに設定）
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# 起動時に vite build（VITE_ env vars が使える）してからサーバー起動
CMD ["sh", "-c", "npm run build && node server/start-production.js"]
