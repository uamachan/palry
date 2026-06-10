import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 本番のプロフィール/DM/マッチングデータは、リポジトリ内ではなく永続ディスクへ保存する。
// Render / Docker では Persistent Disk / volume の mount path を /data にする運用を想定し、
// DATA_DIR 未設定でも /data を既定値にする。
// ローカル開発のみ server/data を使う。
const isProduction = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : isProduction
    ? '/data'
    : path.resolve(__dirname, '../data');

function envInt(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    console.warn(`[jsonStore] Invalid ${name}; using ${fallback}.`);
    return fallback;
  }
  return value;
}

const JSON_LOCK_TIMEOUT_MS = envInt('JSON_LOCK_TIMEOUT_MS', 10000, { min: 100, max: 120000 });
const JSON_LOCK_STALE_MS = envInt('JSON_LOCK_STALE_MS', 30000, { min: 1000, max: 300000 });
const JSON_LOCK_RETRY_MS = envInt('JSON_LOCK_RETRY_MS', 25, { min: 5, max: 1000 });

if (isProduction && !process.env.DATA_DIR) {
  console.warn('[jsonStore] DATA_DIR is not set. Using /data. Mount a persistent disk at /data in production.');
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
  if (!dataDirReady) {
    const p = fs.mkdir(dataDir, { recursive: true });
    dataDirReady = p;
    // 失敗した Promise をキャッシュしたままにすると次回呼び出しで永遠に rejection を返す。
    // 失敗時はリセットして次回再試行できるようにする。
    p.catch(() => { if (dataDirReady === p) dataDirReady = null; });
  }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function releaseFileLock(lockPath, token) {
  try {
    const text = await fs.readFile(lockPath, 'utf8');
    let lockData;
    try { lockData = JSON.parse(text); } catch { /* 壊れたロックファイルは stale 回収（JSON_LOCK_STALE_MS）に任せる */ }
    // JSON がパースできない場合は他プロセスのロックを誤削除しないよう何もしない。
    // トークンが一致した場合のみ削除する。
    if (lockData && lockData.token === token) {
      await fs.rm(lockPath, { force: true });
    }
  } catch {
    // ロック解除失敗は後続の stale lock 回収に任せる。
  }
}

async function withFileLock(file, task) {
  await ensureDataDir();
  const target = safeFilePath(file);
  const lockPath = `${target}.lock`;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const deadline = Date.now() + JSON_LOCK_TIMEOUT_MS;
  let handle = null;

  while (true) {
    try {
      handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }), 'utf8');
      await handle.close();
      handle = null;
      break;
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
        handle = null;
      }
      if (error.code !== 'EEXIST') throw error;

      const stat = await fs.stat(lockPath).catch((statError) => {
        if (statError.code === 'ENOENT') return null;
        throw statError;
      });
      if (stat && Date.now() - stat.mtimeMs > JSON_LOCK_STALE_MS) {
        await fs.rm(lockPath, { force: true }).catch(() => {});
        continue;
      }
      if (Date.now() >= deadline) {
        const lockError = new Error(`Timed out waiting for data file lock: ${file}`);
        lockError.status = 503;
        throw lockError;
      }
      await sleep(Math.min(JSON_LOCK_RETRY_MS, Math.max(1, deadline - Date.now())));
    }
  }

  try {
    return await task();
  } finally {
    await releaseFileLock(lockPath, token);
  }
}

async function atomicWriteUnlocked(file, data) {
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

function atomicWrite(file, data) {
  return withFileLock(file, () => atomicWriteUnlocked(file, data));
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
    .then(() => withFileLock(file, async () => {
      const current = await readJson(file, fallback);
      const mutation = await mutator(current);
      if (!mutation || typeof mutation !== 'object') return mutation;
      const { value, result } = mutation;
      if (value !== undefined) await atomicWriteUnlocked(file, value);
      return result;
    }));
  writeQueues.set(file, next);
  next.finally(() => {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  });
  return next;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
