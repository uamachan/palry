import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 本番のプロフィール/DM/マッチングデータは、リポジトリ内ではなく永続ディスクへ保存する。
// Render では Persistent Disk の mount path を /var/data にする運用を想定し、
// DATA_DIR 未設定でも /var/data/pairly を既定値にする。
// ローカル開発のみ server/data を使う。
const isProduction = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : isProduction
    ? '/var/data/pairly'
    : path.resolve(__dirname, '../data');

if (isProduction && !process.env.DATA_DIR) {
  console.warn('[jsonStore] DATA_DIR is not set. Using /var/data/pairly. Mount a persistent disk at /var/data in production.');
}

export function getDataDir() {
  return dataDir;
}

// dataDir 外へのパストラバーサルを防ぐ。
// base をモジュール定数にして毎回の再計算を避ける。
const dataDirBase = dataDir.endsWith(path.sep) ? dataDir : dataDir + path.sep;
function safeFilePath(file) {
  const resolved = path.resolve(dataDir, file);
  if (!resolved.startsWith(dataDirBase)) {
    const err = new Error('Invalid data file path');
    err.status = 400;
    throw err;
  }
  return resolved;
}

let dataDirReady = null;
function ensureDataDir() {
  if (!dataDirReady) dataDirReady = fs.mkdir(dataDir, { recursive: true });
  return dataDirReady;
}

export async function readJson(file, fallback) {
  // safeFilePath は try の外で呼ぶ。中で呼ぶと throw が catch に飲まれガードが無効になる。
  const filePath = safeFilePath(file);
  try {
    const text = await fs.readFile(filePath, 'utf8');
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
  const target = safeFilePath(file);
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
