"use client";
import { useCallback, useEffect, useState } from "react";

type Version={id:string;version:string;status:string;securityReviewStatus:string;riskLevel:string|null;manifest:unknown;createdAt:string};
type Listing={id:string;name:string;status:string;packageType:string;requestedScopes:string[];description:string;publisher:{displayName:string};versions:Version[];_count:{installs:number;abuseReports:number}};
type Report={id:string;category:string;details:string;createdAt:string;listing:{name:string;status:string}};

export default function AdminMarketplace(){
  const [items,setItems]=useState<Listing[]>([]);
  const [reports,setReports]=useState<Report[]>([]);
  const [message,setMessage]=useState("");
  const load=useCallback(()=>fetch("/api/admin/marketplace",{cache:"no-store"}).then(r=>r.json()).then(j=>{setItems(j.listings||[]);setReports(j.reports||[])}),[]);
  useEffect(()=>{load()},[load]);
  async function mutate(body:Record<string,unknown>){
    setMessage("");
    const response=await fetch("/api/admin/marketplace",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();
    setMessage(data.error||"Marketplace governance action recorded.");
    if(response.ok)await load();
  }
  function review(listing:Listing,version:Version,decision:"approve"|"reject"){
    const notes=prompt(decision==="approve"?"Security review notes (required)":"Rejection notes")||"";
    if(!notes)return;
    const riskLevel=decision==="approve"?(prompt("Risk level: low, medium, or high","medium")||"medium"):"medium";
    mutate({action:"review",id:listing.id,versionId:version.id,decision,notes,riskLevel,securityEvidence:decision==="approve"?{manifestReviewed:true,scopesLeastPrivilege:true,externalEndpointsReviewed:true,dataHandlingReviewed:true,humanApprovalReviewed:true}:{}});
  }
  function reasonAction(listing:Listing,action:"rollback"|"suspend"|"remove",versionId?:string){
    const notes=prompt(`Reason for ${action} (recorded permanently)`)||"";
    if(notes)mutate({action,id:listing.id,versionId,notes});
  }
  function resolve(report:Report,outcome:"resolved"|"dismissed"){
    const notes=prompt("Resolution notes")||"";
    if(notes)mutate({action:"resolve_report",reportId:report.id,outcome,notes});
  }
  return <main className="min-h-screen bg-[#0a0f0a] px-4 py-12"><div className="mx-auto max-w-6xl">
    <h1 className="text-3xl font-bold text-white">Marketplace governance</h1>
    <p className="mt-2 text-sm text-slate-400">Review version evidence, contain unsafe packages, roll back to approved releases, and resolve abuse reports.</p>
    {message&&<p className="mt-4 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-3 text-sm text-[#25D366]">{message}</p>}
    <section className="mt-7"><h2 className="text-xl font-bold text-white">Packages and versions</h2><div className="mt-4 space-y-4">
      {items.map(listing=><article key={listing.id} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold text-white">{listing.name}</h3><p className="mt-1 text-sm text-slate-400">{listing.publisher.displayName} · {listing.packageType} · {listing.status} · {listing._count.installs} installs · {listing._count.abuseReports} open reports</p><p className="mt-2 text-xs text-slate-500">Scopes: {listing.requestedScopes.join(", ")||"none"}</p></div><div className="flex gap-2">{listing.status==="published"&&<button onClick={()=>reasonAction(listing,"suspend")} className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-300">Suspend</button>}{listing.status!=="removed"&&<button onClick={()=>reasonAction(listing,"remove")} className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-300">Remove</button>}</div></div>
        <div className="mt-4 space-y-2">{listing.versions.map(version=><div key={version.id} className="rounded-xl bg-slate-950 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-white">v{version.version} · {version.status} · security: {version.securityReviewStatus}{version.riskLevel?` · ${version.riskLevel} risk`:""}</p><div className="flex gap-2">
          {(version.status==="pending_review"||version.securityReviewStatus==="legacy_review_required")&&<><button onClick={()=>review(listing,version,"approve")} className="rounded bg-[#25D366] px-3 py-1.5 text-xs font-bold text-black">Approve with checks</button><button onClick={()=>review(listing,version,"reject")} className="text-xs text-red-300">Reject</button></>}
          {version.securityReviewStatus==="approved"&&version.status!=="published"&&<button onClick={()=>reasonAction(listing,"rollback",version.id)} className="text-xs font-semibold text-amber-300">Emergency rollback</button>}
        </div></div><pre className="mt-2 max-h-36 overflow-auto text-[10px] text-slate-600">{JSON.stringify(version.manifest,null,2)}</pre></div>)}</div>
      </article>)}
      {!items.length&&<p className="text-slate-500">No marketplace packages.</p>}
    </div></section>
    <section className="mt-9"><h2 className="text-xl font-bold text-white">Open abuse reports</h2><div className="mt-4 space-y-3">
      {reports.map(report=><article key={report.id} className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4"><p className="font-semibold text-white">{report.listing.name} · {report.category}</p><p className="mt-2 text-sm text-slate-300">{report.details}</p><p className="mt-2 text-xs text-slate-600">{new Date(report.createdAt).toLocaleString()}</p><div className="mt-3 flex gap-3"><button onClick={()=>resolve(report,"resolved")} className="text-xs font-semibold text-[#25D366]">Resolve</button><button onClick={()=>resolve(report,"dismissed")} className="text-xs text-slate-400">Dismiss with reason</button></div></article>)}
      {!reports.length&&<p className="text-sm text-slate-500">No open abuse reports.</p>}
    </div></section>
  </div></main>;
}
