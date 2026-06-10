import React, { useMemo, useState } from 'react';
import { rankIconFor } from '../../constants.jsx';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

function photoSrcOf(photo) {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  return photo.url || photo.src || photo.photo || photo.image || '';
}

function uniqPhotos(photos) {
  return photos.map(photoSrcOf).filter(Boolean).filter((photo, index, list) => list.indexOf(photo) === index).slice(0, 3);
}

export default function ProfilePanel({ user }) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const rankLabel = user.rank || 'Unranked';
  const profilePhotos = useMemo(() => uniqPhotos([
    ...(Array