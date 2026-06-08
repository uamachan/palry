// 実プレイヤー同士のマッチング・利用枠・エンタイトルメントの中核ロジック。
// 純粋関数と、永続化（jsonStore）を直列化して扱う関数で構成。
import { readJson, updateJson, uid } from './jsonStore.js';
import { toNonNegativeInt } from './validation.js';
import { LIKE_STATUS } from './statuses.js';
import { userToProfile } from './users.js';

// 同じ日付（YYYY-MM-DD）か。利用枠の「本日分」判定に使う。
export function sameDay(isoA, isoB = new Date().toISOString()) {
  return isoA?.slice(0, 10) === isoB.slice(0, 10);
}

// 指定ユーザーの本日の type 別いいね消費数。
export function countTodayUsage(likes, userId, type) {
  return likes.filter((like) => like.userId === userId && like.type === type && sameDay(like.createdAt)).length;
}

// 候補の表示順をスコアで重み付けして並べ替える。
// プラン優遇・ブースト購入は上位に、女性候補は下位に寄せる（マッチ機会の抑制）。
export function weightedShuffle(profiles, planName, boostedIds = new Set()) {
  const planBonus = planName === 'VIP' ? 0.08 : planName === 'PLUS' ? 0.04 : 0;
  return [...profiles]
    .map((profile) => {
      // 閲覧者の性別に関わらず、女性候補は候補順位を下げてマッチ機会を抑制する。
      // 値を大きくするほど女性が下位（=後ろのカード）に回り、マッチしにくくなる。
      const femaleGuard = profile.gender === '女性' ? 0.5 : 0;
      // ブースト/目立たせ購入者は候補上位に出やすくする。
      const boostBonus = boostedIds.has(profile.id) ? 0.5 : 0;
      const score = Math.random() + Number(profile.matchScore || 70) / 100 + planBonus - femaleGuard + boostBonus;
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.profile);
}

// あるユーザーの有効な特典を集計する。timed は期限内、consumable は残数を合算。
export function activeEntitlements(singlePurchases, userId, now = Date.now()) {
  const result = { genderFilter: false, boost: false, spotlight: false, superCredits: 0 };
  for (const p of singlePurchases) {
    if (p.userId !== userId) continue;
    if (p.kind === 'timed') {
      if (p.expiresAt && new Date(p.expiresAt).getTime() > now && (p.perk in result)) {
        result[p.perk] = true;
      }
    } else if (p.kind === 'consumable' && p.perk === 'superCredits') {
      result.superCredits += toNonNegativeInt(p.remaining, 0);
    }
  }
  return result;
}

// boost / spotlight が有効なユーザーID集合（候補ランキングの優先表示用）。
export function boostedUserIds(singlePurchases, now = Date.now()) {
  const ids = new Set();
  for (const p of singlePurchases) {
    if (p.kind === 'timed' && (p.perk === 'boost' || p.perk === 'spotlight')
      && p.expiresAt && new Date(p.expiresAt).getTime() > now) {
      ids.add(p.userId);
    }
  }
  return ids;
}

export function isRealUserId(id, users) {
  return users.some((user) => user.id === id);
}

// received_likes の1件を組み立てる。
// fromProfile = いいねを「送った側」のプロフィール、forUserId = 受け取る側のユーザーID。
export function buildReceivedLikeEntry(fromProfile, forUserId, likeType) {
  return {
    id: uid('rl'),
    forUserId,
    fromProfileId: fromProfile.id,
    fromProfileName: fromProfile.name,
    fromPhoto: fromProfile.profilePhoto || '',
    fromRank: fromProfile.rank || '',
    fromRole: fromProfile.role || '',
    fromGender: fromProfile.gender || '',
    fromAgeRange: fromProfile.ageRange || '',
    likeType,
    status: LIKE_STATUS.PENDING,
    createdAt: new Date().toISOString()
  };
}

export function pairAlreadyMatched(matches, aId, bId) {
  return matches.some((m) =>
    (m.userId === aId && m.profileId === bId) ||
    (m.userId === bId && m.profileId === aId));
}

export function userHasLiked(likes, userId, profileId) {
  return likes.some((like) => like.userId === userId && like.profileId === profileId);
}

export function makeMatchRow(ownerUserId, otherProfile, conversationId, isRealUser) {
  return {
    id: uid('match'),
    userId: ownerUserId,
    profileId: otherProfile.id,
    profileName: otherProfile.name,
    profilePhoto: otherProfile.profilePhoto || '',
    profileRank: otherProfile.rank || '',
    profileRole: otherProfile.role || '',
    profileGender: otherProfile.gender || '',
    profileAgeRange: otherProfile.ageRange || '',
    profileRegion: otherProfile.region || '',
    profileBio: otherProfile.bio || '',
    profileRiotId: otherProfile.riotId || '',
    profileXHandle: otherProfile.xHandle || '',
    profileTags: Array.isArray(otherProfile.tags) ? otherProfile.tags : [],
    profileAgents: Array.isArray(otherProfile.agents) ? otherProfile.agents : [],
    profileVc: otherProfile.vc || '',
    profileMaps: Array.isArray(otherProfile.maps) ? otherProfile.maps : [],
    profileFavoriteWeapon: otherProfile.favoriteWeapon || '',
    opener: `${otherProfile.name}さんとマッチしました！`,
    dmUnlocked: true,
    conversationId,
    isRealUser: Boolean(isRealUser),
    createdAt: new Date().toISOString()
  };
}

// 相互いいねが成立している場合だけ、2人の実ユーザー間に双方向のマッチ行を作る。
// 相互判定（likes.json 読み取り）とマッチ作成を matches.json の updateJson 内で
// 行うことで直列化し、A→B と B→A の同時いいねで二重 pending になる競合を防ぐ。
// 既にマッチ済み or 新規作成後、対象ペア両側のマッチ行を返す（未成立なら空配列）。
export async function tryCreateMutualMatch(userA, userB) {
  if (userA?.autoHidden || userB?.autoHidden) return [];
  const isPair = (m) =>
    (m.userId === userA.id && m.profileId === userB.id) ||
    (m.userId === userB.id && m.profileId === userA.id);
  // 対象ペアの両側のマッチ行を updateJson の結果として直接返す（matches.json の再読込を回避）。
  return updateJson('matches.json', [], async (matches) => {
    if (pairAlreadyMatched(matches, userA.id, userB.id)) {
      return { value: undefined, result: matches.filter(isPair) }; // 既存行をそのまま返す（書き込みなし）
    }
    const likes = await readJson('likes.json', []);
    const reciprocal =
      likes.some((l) => l.userId === userA.id && l.profileId === userB.id) &&
      likes.some((l) => l.userId === userB.id && l.profileId === userA.id);
    if (!reciprocal) return { value: undefined, result: [] };
    const conversationId = uid('conv');
    const rowForA = makeMatchRow(userA.id, userToProfile(userB), conversationId, true);
    const rowForB = makeMatchRow(userB.id, userToProfile(userA), conversationId, true);
    return { value: [rowForB, rowForA, ...matches], result: [rowForA, rowForB] };
  });
}

// 対象ペア間で pending のままの received_likes を accepted に変える。
export async function resolvePendingBetween(userAId, userBId) {
  await updateJson('received_likes.json', [], (received) => {
    let changed = false;
    const next = received.map((r) => {
      const betweenPair =
        (r.forUserId === userAId && r.fromProfileId === userBId) ||
        (r.forUserId === userBId && r.fromProfileId === userAId);
      if (betweenPair && r.status === LIKE_STATUS.PENDING) {
        changed = true;
        return { ...r, status: LIKE_STATUS.ACCEPTED, acceptedAt: new Date().toISOString() };
      }
      return r;
    });
    return { value: changed ? next : undefined, result: changed };
  });
}

// 通報による自動非表示の発生/解除に合わせて、その人から届いた pending を auto_hidden に
// （またはその逆に）切り替える。
export async function setReceivedLikesFromUserStatus(fromUserId, hidden) {
  const now = new Date().toISOString();
  return updateJson('received_likes.json', [], (received) => {
    let changed = false;
    const next = received.map((item) => {
      if (item.fromProfileId !== fromUserId) return item;
      if (hidden && item.status === LIKE_STATUS.PENDING) {
        changed = true;
        return { ...item, status: LIKE_STATUS.AUTO_HIDDEN, autoHiddenAt: now };
      }
      if (!hidden && item.status === LIKE_STATUS.AUTO_HIDDEN) {
        changed = true;
        return { ...item, status: LIKE_STATUS.PENDING, unhiddenAt: now };
      }
      return item;
    });
    return { value: changed ? next : undefined, result: changed };
  });
}

// あるメッセージが、ある人の視点で「自分が送った」ものかを判定。
export function senderFor(message, viewerUserId) {
  if (message.senderUserId) return message.senderUserId === viewerUserId ? 'user' : 'match';
  return message.sender || 'match'; // 旧データ互換
}

// 会話の識別子。新データは conversationId、旧データはマッチID(match.id)で会話を表す。
// この解決ロジックを1か所に集約し、各所での書き分けによる取りこぼしを防ぐ。
export function conversationIdOf(match) {
  return match.conversationId || match.id;
}

// あるメッセージが指定の会話に属するか。新データは conversationId、旧データは matchId で判定。
export function messageInConversation(message, conversationId, matchId) {
  return message.conversationId ? message.conversationId === conversationId : message.matchId === matchId;
}
