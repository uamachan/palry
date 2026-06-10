import React,{useMemo,useState}from'react';
import{rankIconFor}from'../../constants.jsx';
import VoiceIntroPlayer from'./VoiceIntroPlayer.jsx';

const photoUrl=(p)=>!p?'':typeof p==='string'?p:p.url||p.src||p.photo||p.image||'';
const pickPhotos=(u)=>[...(Array.isArray(u?.profilePhotos)?u.profilePhotos:[]),...(Array.isArray(u?.photos)?u.photos:[]),...(Array.isArray(u?.photoUrls)?u.photoUrls:[]),u?.profilePhoto].map(photoUrl).filter(Boolean).filter((p