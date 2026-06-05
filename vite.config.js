import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // .env ファイルを読み込む（ローカル開発用）
  const fileEnv = loadEnv(mode, projectRoot, '');

  // VITE_ プレフィックスの変数を import.meta.env に明示的にマップする。
  // process.env（Render/Docker の環境変数）を優先し、.env ファイルをフォールバックに使う。
  // これにより .env ファイルが存在しない本番 Docker 環境でも正しく動作する。
  const viteDefines = {};
  const merged = { ...fileEnv, ...process.env };
  for (const [key, value] of Object.entries(merged)) {
    if (key.startsWith('VITE_')) {
      viteDefines[`import.meta.env.${key}`] = JSON.stringify(value);
    }
  }

  return {
    root: 'client',
    envDir: projectRoot,
    plugins: [react()],
    define: viteDefines,
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3001'
      }
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true
    }
  };
});
