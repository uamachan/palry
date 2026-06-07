import React from 'react';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

export default function ProfilePanel({ user }) {
  return (
    <div className="list-panel">
      <h3>プロフィール</h3>
      <div className="profile-preview expanded">
        <div className="avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : user.name?.slice(0, 1) || 'P'}</div>
        <b>{user.name}</b>
        <span>{user.gender} / {user.age || '年齢未設定'} / {user.region || '地域未設定'}</span>
        <span data-copyable>{user.riotId} / {user.rank} / {user.role}</span>
        {Boolean(user.tags?.length) && <div className="tag-row">{user.tags.map((tag) => <span className="intent-tag" key={tag}>{tag}</span>)}</div>}
        <p>{user.bio || '自己紹介は未入力です。'}</p>
        <VoiceIntroPlayer src={user.voiceIntro} />
      </div>
    </div>
  );
}
