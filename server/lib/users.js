// ユーザーレコードの整形・可視性・候補生成。
// 永続化（readJson）以外は純粋関数で、単体テスト可能。
import { readJson } from './jsonStore.js';
import { normalizeGender, normalizeRegion, normalizeRank, normalizeRole } from './profile.js';

// クライアントへ返してよい公開ユーザー。内部識別子・認証関連の秘密は落とす。
// firebaseUid はサーバー内部の紐付け専用でフロントは使用しない。
export function publicUser(user) {
  const { authCode, authCodeHash, authCodeSalt, otpSecret, firebaseUid, ...safeUser } = user;
  return safeUser;
}

// ログイン可能な実アカウントで、かつ自動非表示でないユーザーだけを「表示可能」とする。
export function isVisibleUser(user) {
  return Boolean(user?.firebaseUid) && !user.autoHidden;
}

// 2人の間にブロック関係（どちら向きでも）があるか。
export function pairBlocked(blocks, aId, bId) {
  return blocks.some((block) =>
    (block.userId === aId && block.profileId === bId) ||
    (block.userId === bId && block.profileId === aId)
  );
}

// ユーザーレコードを候補/マッチ表示用のプロフィール形へ整形する。
export function userToProfile(user) {
  const hasVoiceIntro = Boolean(user.voiceIntro);
  return {
    id: user.id,
    name: user.name,
    gender: normalizeGender(user.gender),
    ageRange: user.age ? (/^\d+$/.test(user.age) ? `${user.age}歳` : user.age) : '年齢未設定',
    region: normalizeRegion(user.region),
    rank: normalizeRank(user.rank),
    peakRank: normalizeRank(user.peakRank || user.rank),
    role: normalizeRole(user.role),
    riotId: user.riotId || '',
    tags: Array.isArray(user.tags) ? user.tags : [],
    modes: Array.isArray(user.modes) ? user.modes : [],
    agents: Array.isArray(user.agents) ? user.agents : [],
    xHandle: user.xHandle || '',
    vc: user.vc || '',
    maps: Array.isArray(user.maps) ? user.maps : [],
    favoriteWeapon: user.favoriteWeapon || '',
    profilePhoto: user.profilePhoto || '',
    bio: user.bio || '',
    voiceIntro: user.voiceIntro || '',
    voice: user.voice || (hasVoiceIntro ? '声の自己紹介あり' : '未設定'),
    activeTime: user.activeTime || '',
    trust: user.verified ? 90 : 72,
    verified: Boolean(user.verified),
    reasons: Array.isArray(user.reasons) ? user.reasons : [],
    matchScore: 82,
    matchChance: 0.3,
    guarded: false,
    opener: `${user.name}さんとマッチしました！`
  };
}

// 候補はログイン可能な実アカウントのみ（firebaseUid あり、自分を除く）。
// ダミー profiles.json や firebaseUid を持たない旧テストユーザーは、
// いいねを受け取って返せないため候補から除外する。
// autoHidden（複数通報で自動非表示）も新規候補から除外する。既存マッチ/DMには影響しない。
export async function readCandidateProfiles(excludeUserId = '') {
  const users = await readJson('users.json', []);
  return users
    .filter((user) => isVisibleUser(user) && user.id !== excludeUserId)
    .map((user) => ({ ...userToProfile(user), isRealUser: true }));
}
