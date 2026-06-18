import React, { useState } from 'react';
import { cx, rankIconFor } from '../../constants.jsx';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

export default function TinderProfileCard({ profile, onReport, onBlock, swipeDir, onOpenProfile }) {
  const [photoError, setPhotoError] = useState(false);
  const tags = (Array.isArray(profile.tags) ? profile.tags : []).filter((t) => typeof t === 'string');
  const roleTone = profile.role === 'デュエリスト' ? 'duelist'
    : profile.role === 'イニシエーター' ? 'initiator'
    : profile.role === 'コントローラー' ? 'controller'
    : profile.role === 'センチネル' ? 'sentinel'
    : 'default';

  return (
    <article className={cx('mp-card', swipeDir && `mp-swipe-${swipeDir}`)}>
      {profile.profilePhoto && !photoError
        ? <img className="mp-photo" src={profile.profilePhoto} alt={profile.name} loading="lazy" decoding="async" onError={() => setPhotoError(true)} />
        : (
          <div className={cx('mp-photo-placeholder', `role-${roleTone}`)}>
            <div className="mp-placeholder-frame">
              <span>{profile.name.slice(0, 1).toUpperCase()}</span>
              <b>{profile.role || 'ROLE'}</b>
            </div>
          </div>
        )}
      <div className="mp-gradient" />
      {swipeDir === 'right' && <div className="mp-stamp mp-stamp-like">LIKE</div>}
      {swipeDir === 'left'  && <div className="mp-stamp mp-stamp-nope">NOPE</div>}
      <div className="mp-badges-top">
        <span className="mp-badge mp-badge-score">相性 {profile.matchScore}%</span>
      </div>
      <div className="mp-card-info">
        <div className="mp-active-row"><span className="mp-active-dot" /><span>最近アクティブ</span></div>
        <div className="mp-name-row">
          <button type="button" className="mp-name-button" onClick={(e) => { e.stopPropagation(); onOpenProfile?.(profile); }}>
            {profile.name}
          </button>
          <span className="mp-age">{profile.ageRange}</span>
        </div>
        <p className="mp-meta mp-rank-meta">
          <span className="rank-inline-icon rank-inline-icon--overlay" aria-hidden="true"><img src={rankIconFor(profile.rank)} alt="" loading="lazy" /></span>
          <span>{profile.rank} · {profile.role}</span>
        </p>
        <p className="mp-meta">{profile.gender}{profile.region ? ` · ${profile.region}` : ''}</p>
        {tags.length > 0 && <div className="mp-tags">{tags.slice(0, 4).map((t) => <span className="mp-tag" key={t}>{t}</span>)}</div>}
        {profile.bio && <p className="mp-bio">{profile.bio}</p>}
        <VoiceIntroPlayer src={profile.voiceIntro} compact />
      </div>
      <div className="mp-card-tools">
        <button className="mp-tool-btn" onClick={onReport}>通報</button>
        <button className="mp-tool-btn" onClick={onBlock}>ブロック</button>
      </div>
    </article>
  );
}
