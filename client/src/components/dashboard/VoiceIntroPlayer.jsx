import React, { useRef, useState } from 'react';
import { cx } from '../../constants.jsx';

export default function VoiceIntroPlayer({ src, compact = false }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  if (compact) {
    const toggleAudio = (event) => {
      event.stopPropagation();
      if (!src) return;
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) audio.play().then(() => setPlaying(true)).catch(() => null);
      else { audio.pause(); setPlaying(false); }
    };
    return (
      <div className="voice-intro-player compact">
        <button
          type="button"
          className={cx('voice-chip', playing && 'playing', !src && 'empty')}
          onClick={toggleAudio}
          aria-label={src ? '声の自己紹介を再生' : '声の自己紹介はありません'}
          disabled={!src}
        >
          <span className="voice-chip-icon">{!src ? '-' : playing ? 'Ⅱ' : '▶'}</span>
          <span className="voice-chip-text">{!src ? '声がない' : playing ? '再生中' : '声を聞く'}</span>
          <i></i><i></i><i></i>
        </button>
        {src && <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />}
      </div>
    );
  }
  if (!src) return null;
  return (
    <div className="voice-intro-player">
      <span>声の自己紹介</span>
      <audio src={src} controls />
    </div>
  );
}
