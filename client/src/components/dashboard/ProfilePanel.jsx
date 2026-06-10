import React,{useState}from'react';
import{rankIconFor}from'../../constants.jsx';
import VoiceIntroPlayer from'./VoiceIntroPlayer.jsx';

export default function ProfilePanel({user}){
 const[i,setI]=useState(0);
 const rank=user.rank||'Unranked';
 const raw=[...(Array.isArray(user.profilePhotos)?user.profilePhotos:[]),...(Array.isArray(user.photos)?user.photos:[]),...(Array.isArray(user.photoUrls)?user.photoUrls:[]),user.profilePhoto];
 const photos=[