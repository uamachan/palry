'use strict';

// Security bootstrap for Firebase Functions.
// It compiles the existing index.js with narrowly scoped hardening patches so the
// large feature file can stay readable while every deployed callable receives the
// same safeguards.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const Module = require('node:module');

const originalPath = join(__dirname, 'index.js');
let source = readFileSync(originalPath, 'utf8');

function replaceOnce(haystack, needle, replacement, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`[security-bootstrap] patch target not found: ${label}`);
  }
  return haystack.replace(needle, replacement);
}

// Require Firebase App Check for every callable function. This blocks direct SDK
// abuse from unsigned clients once App Check enforcement is configured.
source = source.replace(
  /onCall\(\{ region: 'asia-northeast1'(?![^}]*enforceAppCheck)/g,
  "onCall({ region: 'asia-northeast1', enforceAppCheck: true"
);

source = replaceOnce(
  source,
  `  return { matchRef, match, participants, otherUid };
}

exports.getCandidateProfiles`,
  `  return { matchRef, match, participants, otherUid };
}

const DM_RATE_LIMIT_PER_MINUTE = 10;
async function enforceDmRateLimit(uid) {
  const minuteKey = new Date().toISOString().slice(0, 16);
  const quotaRef = db.collection('dmQuota').doc(uid + '_' + minuteKey);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(quotaRef);
    const current = snap.exists ? Number(snap.data()?.count || 0) : 0;
    if (current >= DM_RATE_LIMIT_PER_MINUTE) {
      throw new HttpsError('resource-exhausted', 'DMの送信回数が多すぎます。少し待ってから送信してください');
    }
    tx.set(quotaRef, {
      uid,
      minute: minuteKey,
      count: FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  });
}

exports.getCandidateProfiles`,
  'insert DM rate limiter'
);

source = replaceOnce(
  source,
  `  if (body.length > 500) throw new HttpsError('invalid-argument', 'DMは500文字以内です');

  const { matchRef } = await assertDmAllowed(matchId, uid);`,
  `  if (body.length > 500) throw new HttpsError('invalid-argument', 'DMは500文字以内です');
  await enforceDmRateLimit(uid);

  const { matchRef } = await assertDmAllowed(matchId, uid);`,
  'apply DM rate limiter'
);

source = replaceOnce(
  source,
  `  if (!profileId || typeof profileId !== 'string' || profileId === uid) return {};
  if (!allowedActions.includes(action)) return {};

  const actorSnap = await db.collection('users').doc(uid).get();`,
  `  if (!profileId || typeof profileId !== 'string' || profileId === uid) return {};
  if (!allowedActions.includes(action)) return {};

  const [targetProfileSnap, blockByMe, blockByThem] = await Promise.all([
    db.collection('publicProfiles').doc(profileId).get(),
    db.collection('blocks').doc(uid + '_block_' + profileId).get(),
    db.collection('blocks').doc(profileId + '_block_' + uid).get(),
  ]);
  if (!targetProfileSnap.exists || blockByMe.exists || blockByThem.exists) return {};

  const actorSnap = await db.collection('users').doc(uid).get();`,
  'harden footprint creation'
);

const patched = new Module(originalPath, module.parent);
patched.filename = originalPath;
patched.paths = Module._nodeModulePaths(__dirname);
patched._compile(source, originalPath);

module.exports = patched.exports;
