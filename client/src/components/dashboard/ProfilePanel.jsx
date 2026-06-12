import React, { useState, useEffect } from 'react';
import { rankIconFor } from '../../constants.jsx';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

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
  const ageLabel = safeUser.age || safeUser.ageRange || '年齢未設定';
  const photos = collectPhotos(safeUser);

  useEffect(() => {
    if (activePhotoIndex >= photos.length && photos.length > 0) {
      setActivePhotoIndex(0);
    }
  }, [photos.length, activePhotoIndex]);

  const displayPhoto = photos[activePhotoIndex] || null;

  return (
    <div className="list-panel profile-panel">
      <div className="profile-panel-head">
        <div>
          <h3>プロフィール</h3>
        </div>
      </div>
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

        <div className="profile-preview-head">
          <div>
            <b>{safeUser.name || '名前未設定'}</b>
            <span>{safeUser.gender || '性別未設定'} / {ageLabel} / {safeUser.region || '地域未設定'}</span>
          </div>
        </div>

        <span className="rank-inline profile-rank-line" data-copyable>
          <span className="rank-inline-icon" aria-hidden="true">
            <img src={rankIconFor(rankLabel)} alt="" loading="lazy" />
          </span>
          <span>{safeUser.riotId || 'Riot ID 未設定'} / {rankLabel} / {safeUser.role || 'ロール未設定'}</span>
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
