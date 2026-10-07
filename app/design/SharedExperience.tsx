"use client";
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
export default function SharedExperience(){
 const path=usePathname();const [paused,setPaused]=useState(false);
 useEffect(()=>{document.documentElement.dataset.siteMotion=paused?"paused":"active";return()=>{delete document.documentElement.dataset.siteMotion;};},[paused]);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  if(paused||media.matches||path==='/')return;
  // Task surfaces retain stable controls; marketing headings get one entrance.
  if(/^\/(tools|login|signup|register|account|admin|workspace|dashboard|inbox|reports|analytics|qr|terms|privacy|refund|cookie|api-policy|acceptable-use|partner-terms)(\/|$)/.test(path))return;
  const heading=document.querySelector('main h1');
  const a=heading?.animate([{opacity:0,translate:'0 18px'},{opacity:1,translate:'0 0'}],{duration:650,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
  return()=>a?.cancel();
 },[path,paused]);
 return path==='/'||/^\/(dashboard|admin|account|workspace|inbox|channels|automations|reports|analytics|operations|partners)(\/|$)/.test(path)?null:<button className="wz-motion-toggle" aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'Resume motion':'Pause motion'}</button>;
}
