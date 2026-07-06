import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(projectRoot, 'client');

function inlineEntryCss() {
  return {
    name: 'pairly-inline-entry-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlAsset = bundle['index.html'];
      if (!htmlAsset || htmlAsset.type !== 'asset') return;

      const inlinedCssFiles = [];
      let html = String(htmlAsset.source);
      html = html.replace(
        /\s*<link rel="stylesheet"(?: crossorigin)? href="\/([^"]+\.css)">/g,
        (tag, cssFileName) => {
          const cssAsset = bundle[cssFileName];
          if (!cssAsset || cssAsset.type !== 'asset') return tag;
          inlinedCssFiles.push(cssFileName);
          return `\n    <style data-inline="entry-css">\n${cssAsset.source}\n    </style>`;
        }
      );

      htmlAsset.source = html;
      for (const fileName of inlinedCssFiles) {
        delete bundle[fileName];
      }
    }
  };
}

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
    root: clientRoot,
    envDir: projectRoot,
    plugins: [react(), inlineEntryCss()],
    define: viteDefines,
    server: {
      port: 5173
    },
    build: {
      outDir: resolve(projectRoot, 'dist'),
      emptyOutDir: true,
      // チャンクサイズ警告の閾値（kB）
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Firebase と React を独立チャンクに分割して初期バンドルを軽量化。
          // Vite 8 / Rolldown では manualChunks は「関数」でなければならない
          // （オブジェクト形式は Rollup 専用で、Rolldown ではビルドが失敗する）。
          manualChunks(id) {
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
            // Firebase SDK を独立チャンクに分割。動的インポートにより初期ロードから除外される。
            if (/[\\/]node_modules[\\/](firebase|@firebase)[\\/]/.test(id)) return 'vendor-firebase';
            // アプリ画面チャンク（ログイン後のみ読み込まれる）
            if (/[\\/]src[\\/]AppDashboard\.jsx/.test(id)) return 'app-dashboard';
            // 認証フォームチャンク（ログインボタン押下後のみ読み込まれる）
            if (/[\\/]src[\\/]AuthForms\.jsx/.test(id)) return 'auth-forms';
            return undefined;
          }
        }
      }
    }
  };
});
