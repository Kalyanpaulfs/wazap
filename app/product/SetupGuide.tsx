"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

type Goal = "routing" | "tools";
type Progress = {rotators:number;routedLinks:number;toolSuccess:boolean};
export default function SetupGuide({userId,progress}:{userId:string;progress:Progress}) {
 const [goal,setGoal] = useState<Goal>("routing");
 const [hidden,setHidden] = useState(false);
 const key = `wazap:setup:${userId}`;
 useEffect(()=>{try {const saved=JSON.parse(localStorage.getItem(key)||"null"); if(saved&&["routing","tools"].includes(saved.goal))setGoal(saved.goal);setHidden(Boolean(saved?.hidden));} catch {/* Preferences are optional. */}},[key]);
 function save(nextGoal:Goal,nextHidden:boolean){setGoal(nextGoal);setHidden(nextHidden);try{localStorage.setItem(key,JSON.stringify({goal:nextGoal,hidden:nextHidden}));}catch{/* Continue without local preferences. */}}
 const flows = {
  routing:[{label:"Create your team link",text:"Add the WhatsApp numbers that will receive your enquiries.",href:"/tools/rotator",done:progress.rotators>0},{label:"Verify your first routed click",text:"Open your link and confirm it reaches the right number. A click does not confirm a sent message.",href:"/tools/rotator",done:progress.routedLinks>0}],
  tools:[{label:"Complete your first tool action",text:"Start with a link and prefilled message, or choose a tool that fits your task.",href:"/tools/link",done:progress.toolSuccess}],
 };
 const steps=flows[goal]; const done=steps.filter(step=>step.done).length; const next=steps.find(step=>!step.done);
 if(hidden)return <div className="wp-admin-context"><span>Your workspace is ready when you are.</span><button onClick={()=>save(goal,false)}>Show getting started guide</button></div>;
 return <section className="wp-setup" aria-labelledby="setup-heading"><div className="wp-setup-header"><div><div className="wp-eyebrow">YOUR NEXT RESULT</div><h2 id="setup-heading">{done===steps.length?"Your first workflow is ready.":"Make your first conversation count."}</h2><p>Choose what you want to do. Start with a real result; add more channels when you need them.</p></div><button className="text-xs text-slate-400 hover:text-white shrink-0" onClick={()=>save(goal,true)}>Do this later</button></div>
 <div className="wp-goals" aria-label="Choose a starting goal">{([['routing','Route enquiries'],['tools','Create a link']] as const).map(([value,label])=><button key={value} aria-pressed={goal===value} onClick={()=>save(value,false)}>{label}</button>)}</div>
 {next?<Link className="wp-primary" href={next.href}>{next.label}<ArrowRight size={16}/></Link>:<Link className="wp-primary" href={goal==='routing'?'/tools/rotator':'/tools'}>Open your workflow<ArrowRight size={16}/></Link>}
 <div className="wp-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}><i style={{width:`${done/steps.length*100}%`}}/></div><p className="mt-2">{done} of {steps.length} steps complete{goal==='tools'?' · explore at your own pace':''}</p>
 <div className="wp-setup-steps" style={{gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,230px),1fr))'}}>{steps.map(step=><Link className="wp-setup-step" key={step.label} href={step.href}><span>{step.done?<CheckCircle2 size={17} color="#25d366"/>:<Circle size={17} color="#718879"/>}{step.label}</span><p>{step.text}</p></Link>)}</div>
 </section>;
}
