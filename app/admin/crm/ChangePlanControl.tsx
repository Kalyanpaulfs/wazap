"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {PLAN_NAMES, PURCHASABLE_PLANS} from "@/lib/billing";

const AVAILABLE_CHOICES: [string, string][] = [
  ["free", "No plan (remove access)"],
  ...PURCHASABLE_PLANS.map(p => [p, PLAN_NAMES[p]] as [string, string]),
];

export default function ChangePlanControl({userId,currentPlan}:{userId:string;currentPlan:string}){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [selected,setSelected]=useState(currentPlan);
 const [confirming,setConfirming]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [warning,setWarning]=useState("");

 const planOptions: [string, string][] =
  currentPlan === "business"
   ? [...AVAILABLE_CHOICES, ["business", PLAN_NAMES.business]]
   : AVAILABLE_CHOICES;

 function startOpen(){setOpen(true);setSelected(currentPlan);setConfirming(false);setError("");setSuccess("");setWarning("");}
 function cancel(){setOpen(false);setConfirming(false);setError("");}

 async function apply(){
  if (selected === "business") {
   setError("The Business plan is retired and cannot be assigned.");
   return;
  }
  setBusy(true);setError("");setSuccess("");setWarning("");
  try{
   const res=selected==="free"
    ?await fetch("/api/admin/activate",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId})})
    :await fetch("/api/admin/activate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,plan:selected})});
   const j=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(j.error||"Plan update failed");
   setSuccess("Plan updated.");
   if(j.warning)setWarning(j.warning);
   setConfirming(false);setOpen(false);
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Plan update failed");}
  finally{setBusy(false);}
 }

 if(!open)return <div><button onClick={startOpen} className="wp-crm-secondary">Change plan</button>{success&&<p className="text-xs text-emerald-400 mt-1">{success}</p>}{warning&&<p className="text-xs text-amber-300 mt-1">{warning}</p>}</div>;

 const targetLabel = planOptions.find(([v])=>v===selected)?.[1] || selected;

 return <div className="flex flex-col gap-2">
  <select value={selected} onChange={e=>{setSelected(e.target.value);setConfirming(false);}} disabled={busy}
   className="w-36 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-[#25D366] focus:outline-none">
   {planOptions.map(([value,label])=><option key={value} value={value} disabled={value === "business" && selected !== "business"}>{label}</option>)}
  </select>
  <div className="flex gap-2">
   {!confirming
    ?<button onClick={()=>setConfirming(true)} disabled={busy||selected===currentPlan||selected==="business"} className="wp-crm-secondary disabled:opacity-50">Set to {targetLabel}</button>
    :<button onClick={apply} disabled={busy||selected==="business"} className="wp-primary disabled:opacity-50">{busy?"Saving…":"Confirm"}</button>}
   <button onClick={cancel} disabled={busy} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
  </div>
  {confirming&&<p className="text-xs text-amber-300">This changes the customer’s live plan access immediately. Click Confirm to proceed.</p>}
  {error&&<p role="alert" className="text-xs text-red-400">{error}</p>}
 </div>;
}

