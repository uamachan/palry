import React, { useState, useEffect } from 'react';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

// プロジェクト内の自作ランクSVGのみを使う（外部素材・外部importは使わない）
const RANK_TIER_SLUGS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'ascendant', 'immortal', 'radiant'];
function rankIconSrc(rank) {
  const tier = String(rank || '').trim().split(/\s+/)[0].toLowerCase();
  return RANK_TIER_SLUGS.includes(tier) ? `/assets/ranks/${tier}.svg` : '/assets/ranks/unranked.svg';
}

function collectPhotos(user) {
  const sources = [user || {}, (user && user.profile) || {}];
  const candidates = [];
  for (const source of sources) {
    candidates.push(
      ...(Array.isArray(source.profilePhotos) ? source.profilePhotos : []),
      ...(Array.isArray(source.photos) ? source.photos : []),
      ...(Array.isArray(source.photoUrls) ? source.photoUrls : []),
      source.profilePhoto,
      source.photo,
      source.avatar,
    );
  }
  const seen = new Set();
  const result = [];
  for (const item of candidates) {
    const url = typeof item === 'string' ? item : (item?.url || item?.src || '');
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result.slice(0, 3);
}

export default function ProfilePanel({ user }) {
  const safeUser = user || {};
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const rankLabel = safeUser.rank || safeUser.currentRank || safeUser.valorantRank || 'Unranked';
  const photos = collectPhotos(safeUser);

  useEffect(() => {
    if (activePhotoIndex >= photos.length && photos.length > 0) {
      setActivePhotoIndex(0);
    }
  }, [photos.length, activePhotoIndex]);

  const displayPhoto = photos[activePhotoIndex] || null;

  return (
    <div className="list-panel">
      <h3>プロフィール</h3>
      <div className="profile-preview expanded">

        <div className="pv-photo-area">
          <div className="avatar">
            {displayPhoto
              ? <img src={displayPhoto} alt="" />
              : <span>{safeUser.name?.slice(0, 1) || 'P'}</span>}
          </div>
          {photos.length >= 1 && (
            <div className="pv-photo-tabs">
              {[0, 1, 2].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`pv-photo-tab${activePhotoIndex === idx ? ' active' : ''}`}
                  disabled={idx >= photos.length}
                  onClick={() => setActivePhotoIndex(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        <b>{safeUser.name}</b>
        <span>{safeUser.gender} / {safeUser.age || '年齢未設定'} / {safeUser.region || '地域未設定'}</span>

        <span className="rank-inline profile-rank-line" data-copyable>
          <span className="rank-inline-icon" aria-hidden="true">
            <img src={rankIconSrc(rankLabel)} alt="" loading="lazy" />
          </span>
          <span>{safeUser.riotId} / {rankLabel} / {safeUser.role}</span>
        </span>

        {Boolean(safeUser.tags?.length) && (
          <div className="tag-row">
            {safeUser.tags.map((tag) => (
              <span className="intent-tag" key={tag}>{tag}</span>
            ))}
          </div>
        )}

        <p>{safeUser.bio || '自己紹介は未入力です。'}</p>
        <VoiceIntroPlayer src={safeUser.voiceIntro} />
      </div>
    </div>
  );
}
