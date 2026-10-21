'use client';
import {useState} from 'react';
const TONES:Record<string,string>={green:'border-accent/30 bg-accent-soft text-accent',amber:'border-warning/30 bg-highlight-soft text-warning',red:'border-danger/30 bg-danger/10 text-danger',grey:'border-border-strong bg-surface/40 text-muted'};
// A System health card for a non-technical admin: a clear headline + one
// plain sentence up front, with the technical specifics (dates, durations,
// raw counts, error reasons) tucked behind "Show details".
export default function HealthCard({tone,title,headline,sentence,details}:{tone:'green'|'amber'|'red'|'grey';title:string;headline:string;sentence:string;details?:React.ReactNode}){
 const [show,setShow]=useState(false);
 return <section className={`rounded-2xl border p-5 ${TONES[tone]}`}>
  <h2 className="font-semibold text-text">{title}</h2>
  <p className="mt-2 text-sm font-semibold">{headline}</p>
  <p className="mt-1 text-sm text-text">{sentence}</p>
  {details&&<>
   <button type="button" className="mt-3 text-xs underline" onClick={()=>setShow(s=>!s)}>{show?'Hide details':'Show details'}</button>
   {show&&<div className="mt-2 space-y-1">{details}</div>}
  </>}
 </section>;
}
