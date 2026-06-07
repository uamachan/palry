import React from 'react';

// ── ゲームデータ定数 ─────────────────────────────────────────────────
export const ranks = [
  'Unranked',
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant'
];

export const rankIconMap = {
  Unranked: '/assets/ranks/unranked.svg',
  Iron: '/assets/ranks/iron.svg',
  Bronze: '/assets/ranks/bronze.svg',
  Silver: '/assets/ranks/silver.svg',
  Gold: '/assets/ranks/gold.svg',
  Platinum: '/assets/ranks/platinum.svg',
  Diamond: '/assets/ranks/diamond.svg',
  Ascendant: '/assets/ranks/ascendant.svg',
  Immortal: '/assets/ranks/immortal.svg',
  Radiant: '/assets/ranks/radiant.svg'
};

export const roles = ['デュエリスト', 'イニシエーター', 'コントローラー', 'センチネル'];
export const defaultRole = roles[0];

export const roleIconMap = {
  'デュエリスト': '/assets/roles/duelist.svg',
  'イニシエーター': '/assets/roles/initiator.svg',
  'コントローラー': '/assets/roles/controller.svg',
  'センチネル': '/assets/roles/sentinel.svg'
};

export const agents = [
  'Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher',
  'Deadlock', 'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett',
  'KAY/O', 'Killjoy', 'Miks', 'Neon', 'Omen', 'Phoenix',
  'Raze', 'Reyna', 'Sage', 'Skye', 'Sova', 'Tejo',
  'Veto', 'Viper', 'Vyse', 'Waylay', 'Yoru'
];

export const regions = [
  '北海道',
  '東北',
  '関東',
  '甲信越',
  '北陸',
  '東海',
  '近畿',
  '中国',
  '四国',
  '九州',
  '沖縄',
  '海外'
];

export const intentTags = [
  '気軽に遊ぶ友達', 'ランクガチ', '恋人探し', 'まずはデュオ', '固定相方',
  'VCで話したい', '聞き専OK', '初心者歓迎', '夜メイン', '休日メイン'
];

export const appTabs = [
  { id: 'match', label: 'マッチング' },
  { id: 'notifications', label: '通知' },
  { id: 'dm', label: 'メッセージ' },
  { id: 'footprints', label: '足あと' },
];

// ── SVGアイコン（JSX）─────────────────────────────────────────────────
export const TAB_ICONS = {
  match: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  notifications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  dm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  footprints: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
};

// ── ユーティリティ関数 ────────────────────────────────────────────────
/** クラス名を条件付きで結合する */
export function cx(...v) { return v.filter(Boolean).join(' '); }

/** プラン名を日本語ラベルに変換する */
export function planLabel(name) {
  return name === 'FREE' ? '無料' : name === 'PLUS' ? 'プラス' : name === 'VIP' ? 'VIP' : name;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('画像ファイルを読み込めませんでした'));
    reader.readAsDataURL(file);
  });
}

/**
 * 画像ファイルを指定サイズにリサイズして JPEG の DataURL で返す。
 * 本番CSPで blob: が許可されていない環境でも動くよう、URL.createObjectURL は使わない。
 */
export async function resizePhoto(file, maxSize = 720, quality = 0.72) {
  if (!file?.type?.startsWith('image/')) throw new Error('画像ファイルを選択してください');
  if (file.size > 8 * 1024 * 1024) throw new Error('画像サイズは8MB以下にしてください');

  const sourceDataUrl = await readFileAsDataUrl(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('画像を処理できませんでした'));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('画像を読み込めませんでした'));
    image.src = sourceDataUrl;
  });
}

export const vcOptions = ['なし', 'Discord', 'Skype', 'その他'];

export const maps = [
  'アセント', 'スプリット', 'ヘイヴン', 'バインド',
  'アイスボックス', 'ブリーズ', 'フラクチャー', 'パール',
  'ロータス', 'サンセット', 'アビス', 'カロード'
];

export const favoriteWeapons = ['Vandal', 'Phantom', 'Operator', 'Sheriff', 'Ghost', 'Marshal', 'Judge', 'Odin'];
