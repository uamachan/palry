// データ（JSON ストア）のスナップショットを取得する簡易バックアップ。
// 使い方: node scripts/backup-data.mjs [出力先]
//   DATA_DIR が指すディレクトリ（本番は /data、ローカルは server/data）の *.json を
//   タイムスタンプ付きフォルダにコピーする。cron や手動運用で定期取得する想定。

import { mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const isProduction = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : isProduction
    ? '/var/data/pairly'
    : resolve(projectRoot, 'server', 'data');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outRoot = resolve(process.argv[2] || join(projectRoot, 'backups'));
const outDir = join(outRoot, stamp);

async function main() {
  let entries;
  try {
    entries = await readdir(dataDir);
  } catch {
    console.error(`[backup] data dir not found: ${dataDir}`);
    process.exit(1);
  }
  const jsonFiles = entries.filter((f) => f.endsWith('.json'));
  if (!jsonFiles.length) {
    console.warn(`[backup] no .json files in ${dataDir}`);
    return;
  }
  await mkdir(outDir, { recursive: true });
  for (const file of jsonFiles) {
    const src = join(dataDir, file);
    if (!(await stat(src)).isFile()) continue;
    await copyFile(src, join(outDir, file));
  }
  console.log(`[backup] copied ${jsonFiles.length} file(s) from ${dataDir} -> ${outDir}`);
}

main().catch((error) => {
  console.error('[backup] failed', error);
  process.exit(1);
});
