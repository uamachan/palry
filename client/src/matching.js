// 恋愛アルゴリズム: 候補プロフィールとの相性スコア(60〜99%)と「相性が高い理由」を算出する。
// サーバー（getCandidateProfiles）はスコアを返さないためクライアントで決定的に計算する。
// 再レンダーで値が揺れないよう乱数は使わない。ログインユーザー情報が無い場合は中立値を返す。
//
// 重み付けは恋愛・オンラインデーティング研究の主要な知見に基づく:
// - 類似性が魅力を生む（Byrne 1971 / Montoya & Horton 2013 メタ分析）
//   → 求める関係・価値観の一致（目的タグ）を最重視。
// - 互恵性: 「自分を好きな相手」への好意は強力な予測因子（Eastwick & Finkel 2008）
//   → 既にいいねをくれている候補を大きくブースト。
// - 同類マッチング: マッチは「望ましさの近いティア」内で成立しやすい（Bruch & Newman 2018）
//   → palryではランク帯がその代理変数。デュオ制限とも一致するため距離減衰で評価。
// - 近接性(propinquity)が関係形成を促す（Festinger et al. 1950）
//   → オンラインでは「同じ時間にいること」が近接。プレイ時間帯タグを独立に加点し、地域も評価。
// - 年齢の同類性: オンラインデーティングは年齢で強く選別される（Hitsch, Hortaçsu & Ariely 2010）
//   → 同年代バンド > 隣接バンドで減衰。
// - 共有活動が親密さを深める自己拡張理論（Aron & Aron 1986）
//   → 一緒に遊べる素材（同エージェント・同MAP）は小さく加点。
// - 音声・自己開示は文字より親密さ形成に有利（McKenna et al. 2002）→ 声の自己紹介ありを微加点。
// - ただし特性ベースの相性予測には限界がある（Finkel et al. 2012 / Joel et al. 2017）ため、
//   スコアは「会話のきっかけ」として理由と併記し、断定的な予測としては扱わない。

import { rankTierLabels } from './constants.jsx';

const RANK_TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'];
const AGE_BANDS = ['10代', '20代', '30代', '40代', '50代以上'];
// プレイ時間帯タグは「同じ時間にいられるか」という成立条件そのものなので、一般タグと分けて重く扱う。
const TIME_TAGS = ['夜メイン', '休日メイン'];

function rankTierOf(rank) {
  return String(rank || '').split(' ')[0];
}

function ageBandOf(profile) {
  const value = String(profile?.ageRange || profile?.age || '');
  return AGE_BANDS.findIndex((band) => value.startsWith(band.slice(0, 2)));
}

function overlap(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return [];
  const setB = new Set(b);
  return a.filter((item) => setB.has(item));
}

// context.likedMeIds: 自分に pending のいいねを送っている相手の uid Set（互恵性ブースト用）
export function computeMatch(user, candidate, context = {}) {
  if (!user || !candidate) return { score: 75, reasons: [] };
  let score = 60;
  const reasons = [];

  // 互恵性: 相手が既に自分へいいねを送っている。
  if (context.likedMeIds instanceof Set && context.likedMeIds.has(candidate.id)) {
    score += 10;
    reasons.push('相手からいいねが届いている');
  }

  // 目的タグ: 求めている関係の一致が最重要。「恋人探し」同士は単独で強い一致。
  const sharedTags = overlap(user.tags, candidate.tags);
  if (sharedTags.includes('恋人探し')) {
    score += 8;
    reasons.push('ふたりとも「恋人探し」で目的が一致');
  }

  // プレイ時間帯: 一緒に遊べる時間が重ならなければ関係が始まらない。
  const sharedTime = sharedTags.filter((t) => TIME_TAGS.includes(t));
  if (sharedTime.length) {
    score += 5 + (sharedTime.length - 1) * 2;
    reasons.push(`プレイ時間帯が合う（${sharedTime.join('・')}）`);
  }

  const otherTags = sharedTags.filter((t) => t !== '恋人探し' && !TIME_TAGS.includes(t));
  if (otherTags.length) {
    score += Math.min(otherTags.length, 3) * 4;
    reasons.push(`目的タグが一致（${otherTags.slice(0, 3).join('・')}）`);
  }

  // ランク近接: 同ティア > 隣接 > 2ティア差。それ以上はデュオも組みにくいので加点なし。
  const myTier = RANK_TIERS.indexOf(rankTierOf(user.rank));
  const theirTier = RANK_TIERS.indexOf(rankTierOf(candidate.rank));
  if (myTier >= 0 && theirTier >= 0) {
    const gap = Math.abs(myTier - theirTier);
    if (gap === 0) {
      score += 8;
      reasons.push(`同じ${rankTierLabels[RANK_TIERS[myTier]]}帯でランクが近い`);
    } else if (gap === 1) {
      score += 5;
      reasons.push('ランク帯が近くデュオを組みやすい');
    } else if (gap === 2) {
      score += 2;
    }
  }

  // 年齢: 同年代バンド > 隣接バンド。
  const myAge = ageBandOf(user);
  const theirAge = ageBandOf(candidate);
  if (myAge >= 0 && theirAge >= 0) {
    const gap = Math.abs(myAge - theirAge);
    if (gap === 0) {
      score += 4;
      reasons.push(`同じ${AGE_BANDS[myAge]}同士`);
    } else if (gap === 1) {
      score += 2;
    }
  }

  // ロール: 同ロールは話が合い、別ロールはチーム構成の補完になる。
  if (user.role && candidate.role) {
    if (user.role === candidate.role) {
      score += 5;
      reasons.push(`同じ${user.role}同士で話が合う`);
    } else {
      score += 3;
      reasons.push(`${candidate.role}とロールを補い合える`);
    }
  }

  // 地域: 生活時間帯やオフの会いやすさに直結する。
  if (user.region && candidate.region && user.region === candidate.region) {
    score += 5;
    reasons.push(`同じ${user.region}エリア`);
  }

  // VC: 同じツールならマッチ後すぐ通話に移れる。
  if (user.vc && candidate.vc && user.vc !== 'なし' && user.vc === candidate.vc) {
    score += 4;
    reasons.push(`VCが${user.vc}で一致`);
  }

  // 共有活動の素材: エージェント/MAPの被りは会話のきっかけとして小さく加点。
  const sharedAgents = overlap(user.agents, candidate.agents);
  if (sharedAgents.length) {
    score += Math.min(sharedAgents.length, 3) * 2;
    reasons.push(`よく使うエージェントが被る（${sharedAgents.slice(0, 3).join('、')}）`);
  }
  const sharedMaps = overlap(user.maps, candidate.maps);
  if (sharedMaps.length) score += Math.min(sharedMaps.length, 2);

  // 声の自己紹介あり（音声は文字より親密さ形成に有利）。
  if (candidate.voiceIntroUrl || candidate.voiceIntro) score += 2;

  return { score: Math.max(60, Math.min(99, score)), reasons: reasons.slice(0, 4) };
}
