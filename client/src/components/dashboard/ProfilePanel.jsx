import React, { useState, useEffect } from 'react';
import { rankIconFor } from '../../constants.jsx';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

function collectPhotos(user) {
  const candidates = [
    ...(Array.isArray(user.profilePhotos) ? user.profilePhotos : []),
    ...(Array.isArray(user.photos) ? user.photos : []),
    ...(Array.isArray(user.photoUrls) ? user.photoUrls : []),
    user.profilePhoto,
    user.photo,
    user.avatar,
  ];
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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const rankLabel = user.rank || user.currentRank || user.valorantRank || 'Unranked';
  const photos = collectPhotos(user);

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
              : <span>{user.name?.slice(0, 1) || 'P'}</span>}
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

        <b>{user.name}</b>
        <span>{user.gender} / {user.age || '年齢未設定'} / {user.region || '地域未設定'}</span>

        <span className="rank-inline profile-rank-line" data-copyable>
          <span className="rank-inline-icon" aria-hidden="true">
            <img src={rankIconFor(rankLabel)} alt="" loading="lazy" />
          </span>
          <span>{user.riotId} / {rankLabel} / {user.role}</span>
        </span>

        {Boolean(user.tags?.length) && (
          <div className="tag-row">
            {user.tags.map((tag) => (
              <span className="intent-tag" key={tag}>{tag}</span>
            ))}
          </div>
        )}

        <p>{user.bio || '自己紹介は未入力です。'}</p>
        <VoiceIntroPlayer src={user.voiceIntro} />
      </div>
    </div>
  );
}
