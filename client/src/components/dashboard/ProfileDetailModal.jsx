import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { rankIconFor } from '../../constants.jsx';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

export default function ProfileDetailModal({ profile, onClose }) {
  const panelRef = useRef(null);
  const tags = (Array.isArray(profile.tags) ? profile.tags : []).filter((t) => typeof t === 'string');
  const modes = (Array.isArray(profile.modes) ? profile.modes : []).filter((t) => typeof t === 'string');
  const agentsList = (Array.isArray(profile.agents) ? profile.agents : []).filter((t) => typeof t === 'string');
  const reasons = (Array.isArray(profile.reasons) ? profile.reasons : []).filter((t) => typeof t === 'string');
  const voiceLabel = profile.voice || (profile.voiceIntro ? '声の自己紹介あり' : '未設定');
  const currentRank = profile.rank || 'Unranked';
  const detailItems = [
    ['現在ランク', currentRank],
    ['最高ランク', profile.peakRank || '未設定'],
    ['ロール', profile.role || 'ロール未設定'],
    ['活動時間', profile.activeTime || '未設定'],
    ['VC', voiceLabel],
    ['信頼度', profile.trust ? `${profile.trust}%` : profile.verified ? '認証済み' : '未設定'],
  ];

  useEffect(() => {
    // body scroll lock
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // モーダル内の最初のフォーカス可能要素にフォーカス
    const focusable = panelRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable?.length) focusable[0].focus();

    // Escape で閉じる
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return; }

      // フォーカストラップ
      if (e.key === 'Tab' && focusable?.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="profile-detail-modal" role="dialog" aria-modal="true" aria-labelledby="profile-detail-title" aria-describedby="profile-detail-desc">
      <button className="profile-detail-scrim" type="button" aria-label="閉じる" onClick={onClose}></button>
      <section className="profile-detail-panel" ref={panelRef}>
        <button className="profile-detail-close" type="button" onClick={onClose} aria-label="モーダルを閉じる">×</button>
        <div className="profile-detail-hero">
          {profile.profilePhoto
            ? <img src={profile.profilePhoto} alt={profile.name} loading="lazy" decoding="async" />
            : <div className="profile-detail-fallback">{profile.name?.slice(0, 1) || 'P'}</div>}
        </div>
        <div className="profile-detail-body" id="profile-detail-desc">
          <div className="profile-detail-head">
            <div>
              <h2 id="profile-detail-title">{profile.name}</h2>
              <p>{profile.gender}{profile.ageRange ? ` / ${profile.ageRange}` : ''}{profile.region ? ` / ${profile.region}` : ''}</p>
            </div>
            <span>相性 {profile.matchScore}%</span>
          </div>
          <div className="profile-detail-kpis">
            {detailItems.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <b className={label === '現在ランク' ? 'rank-inline profile-detail-rank' : undefined}>
                  {label === '現在ランク' && <span className="rank-inline-icon" aria-hidden="true"><img src={rankIconFor(value)} alt="" loading="lazy" /></span>}
                  <span>{value}</span>
                </b>
              </div>
            ))}
          </div>
          {tags.length > 0 && <div className="profile-detail-block"><strong>目的タグ</strong><div className="profile-detail-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>}
          {modes.length > 0 && <div className="profile-detail-block"><strong>プレイスタイル</strong><div className="profile-detail-tags is-muted">{modes.map((mode) => <span key={mode}>{mode}</span>)}</div></div>}
          {agentsList.length > 0 && <div className="profile-detail-block"><strong>よく使うキャラ</strong><div className="profile-detail-tags is-plain">{agentsList.map((agent) => <span key={agent}>{agent}</span>)}</div></div>}
          <div className="profile-detail-block"><strong>自己紹介</strong><p>{profile.bio || '自己紹介は未入力です。'}</p></div>
          {profile.xHandle && (
            <div className="profile-detail-block">
              <strong>X</strong>
              <a className="profile-detail-link" href={`https://x.com/${profile.xHandle.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" aria-label={`${profile.name}のXプロフィールを開く`}>
                @{profile.xHandle.replace(/^@/, '')}
              </a>
            </div>
          )}
          {profile.opener && <div className="profile-detail-note"><strong>話しかけるきっかけ</strong><p>{profile.opener}</p></div>}
          {reasons.length > 0 && (
            <div className="profile-detail-block">
              <strong>相性が高い理由</strong>
              <ul className="profile-detail-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
          )}
          <VoiceIntroPlayer src={profile.voiceIntro} />
        </div>
      </section>
    </div>,
    document.body
  );
}
