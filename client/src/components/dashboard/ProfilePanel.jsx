import React, { useMemo, useState } from 'react';
import { rankIconFor } from '../../constants.jsx';
import VoiceIntroPlayer from './VoiceIntroPlayer.jsx';

function photoSrcOf(photo) {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  return photo.url || photo.src || photo.photo || photo.image || '';
}

export default function ProfilePanel({ user }) {
  const [activePhotoIndex, setActivePhotoIndex]