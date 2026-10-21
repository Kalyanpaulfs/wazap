'use client';
import {useState} from 'react';
const TONES:Record<string,string>={green:'border-[#25D366]/30 bg-[#25D366]/5 text-[#25D366]',amber:'border-amber-500/30 bg-amber-500/5 text-amber-300',red:'border-red-500/30 bg-red-500/5 text-red-300',grey:'border-slate-700 bg-slate-900/40 text-slate-400'};
// A System health card for a non-technical admin: a clear headline + one
// plain sentence up front, with the technical specifics (dates, durations,
// raw counts, error reasons) tucked behind "Show details".
export default function HealthCard({tone,title,headline,sentence,details}:{tone:'green'|'amber'|'red'|'grey';title:string;headline:string;sentence:string;details?:React.ReactNode}){
 const [show,setShow]=useState(false);
 return <section className={`rounded-2xl border p-5 ${TONES[tone]}`}>
  <h2 className="font-semibold text-white">{title}</h2>
  <p className="mt-2 text-sm font-semibold">{headline}</p>
  <p className="mt-1 text-sm text-slate-200">{sentence}</p>
  {details&&<>
   <button type="button" className="mt-3 text-xs underline" onClick={()=>setShow(s=>!s)}>{show?'Hide details':'Show details'}</button>
   {show&&<div className="mt-2 space-y-1">{details}</div>}
  </>}
 </section>;
}
