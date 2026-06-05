import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 本番では永続ディスクのパスを DATA_DIR で指定できるようにする。
// 未設定ならリポジトリ同梱の server/data を使う（ローカル開発向け）。
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../data');

export function getDataDir() {
  return dataDir;
}

let dataDirReady = null;
function ensureDataDir() {
  if (!dataDirReady) dataDirReady = fs.mkdir(dataDir, { recursive: true });
  return dataDirReady;
}

export async function readJson(file, fallback) {
  try {
    const text = await fs.readFile(path.join(dataDir, file), 'utf8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// ファイルごとに直列の書き込みキューを持ち、read-modify-write の競合と
// 書き込み途中のファイル破損を防ぐ。
const writeQueues = new Map();

async function atomicWrite(file, data) {
  await ensureDataDir();
  const target = path.join(dataDir, file);
  // 同一ディレクトリ内の一時ファイルへ書いてから rename（同一FS上では原子的）。
  const tmp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

export function writeJson(file, data) {
  const previous = writeQueues.get(file) || Promise.resolve();
  const next = previous
    .catch(() => {}) // 直前の書き込み失敗で後続を止めない
    .then(() => atomicWrite(file, data));
  // キューが無限に伸びないよう、完了したら掃除する。
  writeQueues.set(file, next);
  next.finally(() => {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  });
  return next;
}

// read → 変更 → write を 1ファイルにつき直列で実行するヘルパー。
// like の枠の二重消費などの競合を防ぐために使う。
export function updateJson(file, fallback, mutator) {
  const previous = writeQueues.get(file) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const current = await readJson(file, fallback);
      const { value, result } = await mutator(current);
      if (value !== undefined) await atomicWrite(file, value);
      return result;
    });
  writeQueues.set(file, next);
  next.finally(() => {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  });
  return next;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
