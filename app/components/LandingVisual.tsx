'use client';
import { useState } from 'react';
import styles from './LandingVisual.module.css';
type Scene = 'crm' | 'inbox' | 'ai' | 'platform';
export default function LandingVisual({scene}:{scene:Scene}) {
 const [paused,setPaused]=useState(false);
 return <div className={styles.stage} data-paused={paused} data-scene={scene}>
 <svg viewBox="0 0 800 360" aria-hidden="true" className={styles.art}>
 <defs><linearGradient id={`surface-${scene}`} x2="1" y2="1"><stop stopColor="#214c34"/><stop offset="1" stopColor="#0b1911"/></linearGradient></defs>
 {scene==='crm' && <>
 {[170,350,530].map((x,i)=><g key={x}><rect x={x} y="60" width="150" height="230" rx="20"/><path d={`M${x+22} 90h70`}/><rect className={`${styles.lead} ${styles[`delay${i}`]}`} x={x+18} y={125+i*25} width="114" height="65" rx="12"/><circle cx={x+39} cy={146+i*25} r="7"/><path d={`M${x+56} ${145+i*25}h54m-54 17h33`}/></g>)}
 <path className={styles.pipeline} d="M255 225H420Q470 225 470 195H595"/><circle className={styles.destination} cx="630" cy="270" r="12"/>
 </>}
 {scene==='inbox' && <>
 <rect x="310" y="70" width="220" height="215" rx="28"/><path d="M338 105h160m-160 42h125m-125 42h150m-150 42h90"/>
 <g className={styles.arrival}><rect x="95" y="38" width="140" height="67" rx="18"/><path d="M115 63h91m-91 19h56"/></g><g className={`${styles.arrival} ${styles.delay1}`}><rect x="80" y="155" width="165" height="67" rx="18"/><path d="M105 180h107m-107 19h76"/></g>
 <path className={styles.transfer} d="M240 75Q280 75 300 140M245 190H305M535 190Q570 190 620 115M535 225Q570 225 620 265"/>
 <circle className={styles.assignee} cx="655" cy="100" r="34"/><circle className={`${styles.assignee} ${styles.delay1}`} cx="655" cy="265" r="34"/><path d="M640 102l10 10 23-27M640 267l10 10 23-27"/>
 </>}
 {scene==='ai' && <>
 <g className={styles.knowledge}><rect x="95" y="65" width="145" height="180" rx="17"/><path d="M120 100h95m-95 26h75m-75 26h92m-92 26h57"/></g>
 <path className={styles.thinking} d="M245 150H330M465 150H550"/>
 <path className={styles.orb} d="M400 78l68 39v78l-68 39-68-39v-78z"/><circle cx="400" cy="156" r="25"/>
 <g className={styles.draft}><rect x="555" y="95" width="155" height="115" rx="20"/><path d="M580 125h95m-95 25h70m-70 25h85"/></g>
 <path d="M400 237v35h190"/><circle className={styles.review} cx="622" cy="272" r="28"/><path d="M610 271l9 10 19-22"/>
 </>}
 {scene==='platform' && <>
 <path className={styles.connections} d="M400 180L190 75M400 180L160 250M400 180L625 70M400 180L650 255M400 180V315"/>
 <rect className={styles.hub} x="330" y="115" width="140" height="130" rx="30"/><path d="M365 155h70m-70 25h70m-70 25h45"/>
 <g className={styles.node}><rect x="135" y="35" width="110" height="80" rx="18"/><path d="M160 61h60m-60 24h40"/></g>
 <g className={`${styles.node} ${styles.delay1}`}><rect x="105" y="210" width="110" height="80" rx="18"/><path d="M132 235v30m24-45v45m24-20v20"/></g>
 <g className={`${styles.node} ${styles.delay2}`}><rect x="570" y="30" width="110" height="80" rx="18"/><path d="M598 65l17 15 36-33"/></g>
 <g className={`${styles.node} ${styles.delay3}`}><rect x="595" y="215" width="110" height="80" rx="18"/><path d="M619 245l-10 10 10 10m61-20 10 10-10 10m-27-26-11 34"/></g><circle cx="400" cy="315" r="18"/>
 </>}
 </svg><button className={styles.control} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'Resume motion':'Pause motion'}</button>
 </div>;
}
