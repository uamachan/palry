import React from 'react';
import { rankIconFor } from '../../constants.jsx';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

export default function ProfilePanel({ user }) {
  const rankLabel = user.rank || 'Unranked';

  return (
    <div className="list-panel">
      <h3>プロフィール</h3>
      <div className="profile-preview expanded">
        <div className="avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : user.name?.slice(0, 1) || 'P'}</div>
        <b>{user.name}</b>
        <span>{user.gender} / {user.age || '年齢未設定'} / {user.region || '地域未設定'}</span>
        <span className="rank-inline profile-rank-line" data-copyable>
          <span className="rank-inline-icon" aria-hidden="true"><img src={rankIconFor(rankLabel)} alt="" loading="lazy" /></span>
          <span>{user.riotId} / {rankLabel} / {user.role}</span>
        </span>
        {Boolean(user.tags?.length) && <div className="tag-row">{user.tags.map((tag) => <span className="intent-tag" key={tag}>{tag}</span>)}</div>}
        <p>{user.bio || '自己紹介は未入力です。'}</p>
        <VoiceIntroPlayer src={user.voiceIntro} />
      </div>
    </div>
  );
}
