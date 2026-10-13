"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";

const PLAN_OPTIONS=[["free","Free"],["basic","Solo"],["pro","Growth"],["ultimate","Team"],["business","Business"]] as const;

export default function ChangePlanControl({userId,currentPlan}:{userId:string;currentPlan:string}){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [selected,setSelected]=useState(currentPlan);
 const [confirming,setConfirming]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");

 function startOpen(){setOpen(true);setSelected(currentPlan);setConfirming(false);setError("");setSuccess("");}
 function cancel(){setOpen(false);setConfirming(false);setError("");}

 async function apply(){
  setBusy(true);setError("");setSuccess("");
  try{
   const res=selected==="free"
    ?await fetch("/api/admin/activate",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId})})
    :await fetch("/api/admin/activate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,plan:selected})});
   if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.error||"Plan update failed");}
   setSuccess("Plan updated.");setConfirming(false);setOpen(false);
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Plan update failed");}
  finally{setBusy(false);}
 }

 if(!open)return <div><button onClick={startOpen} className="wp-crm-secondary">Change plan</button>{success&&<p className="text-xs text-emerald-400 mt-1">{success}</p>}</div>;

 return <div className="flex flex-col gap-2">
  <select value={selected} onChange={e=>{setSelected(e.target.value);setConfirming(false);}} disabled={busy}
   className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-[#25D366] focus:outline-none">
   {PLAN_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
  </select>
  <div className="flex gap-2">
   {!confirming
    ?<button onClick={()=>setConfirming(true)} disabled={busy||selected===currentPlan} className="wp-crm-secondary disabled:opacity-50">Set to {PLAN_OPTIONS.find(([v])=>v===selected)?.[1]}</button>
    :<button onClick={apply} disabled={busy} className="wp-primary disabled:opacity-50">{busy?"Saving…":"Confirm"}</button>}
   <button onClick={cancel} disabled={busy} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
  </div>
  {confirming&&<p className="text-xs text-amber-300">This changes the customer’s live plan access immediately. Click Confirm to proceed.</p>}
  {error&&<p role="alert" className="text-xs text-red-400">{error}</p>}
 </div>;
}
