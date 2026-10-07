"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Cable, CheckCircle2, FileCheck2, Megaphone, RefreshCw, ShieldCheck, Upload, Webhook } from "lucide-react";

declare global {
  interface Window { FB?: { init: (options: Record<string, unknown>) => void; login: (callback: (response: { status?: string; authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void } }
}

const sections = [
  ["Official API", "Customer-owned WABA, direct Meta billing and verified Cloud API transport.", Cable],
  ["Templates", "Submit templates to Meta and use them only after Meta reports approval.", FileCheck2],
  ["Consent", "Evidence-backed opt-in, immediate opt-out and campaign eligibility controls.", ShieldCheck],
  ["Campaigns", "Approved-template broadcasts with exclusions, review and delivery state.", Megaphone],
  ["AI + inbox", "Human-reviewed AI drafts and one shared conversation workspace.", Bot],
  ["Integrations", "Scoped APIs and signed webhooks for Sheets, Zapier, Make and CRMs.", Webhook],
];
export default function WhatsAppPlatformClient() {
  const [data,setData]=useState<any>(null),[message,setMessage]=useState("");
  const [sdkStatus,setSdkStatus]=useState<"idle"|"loading"|"ready"|"error">("idle");
  const [consent,setConsent]=useState({contactAddress:"",source:"website_form",proof:""}),[campaign,setCampaign]=useState({name:"",connectionId:"",templateId:"",audience:""});
  const [migration,setMigration]=useState({sourceProvider:"other",contacts:""}),[migrationPreview,setMigrationPreview]=useState<any>(null);
  const [scheduleAt,setScheduleAt]=useState("");
  const signupAssets=useRef({wabaId:"",phoneNumberId:""});
  const sdkAttempt=useRef(0);
  const load=useCallback(()=>fetch("/api/whatsapp-platform",{cache:"no-store"}).then(async r=>{if(r.status===401){location.href="/login?redirect=/whatsapp";return}setData(await r.json())}),[]);
  useEffect(()=>{load()},[load]);
  useEffect(()=>{
    const params=new URLSearchParams(location.search),code=params.get("code"),state=params.get("state"),error=params.get("error_description")||params.get("error");
    if(error){setMessage(`Meta authorization was not completed: ${error}`);history.replaceState({},"","/whatsapp");return}
    if(!code||!state)return;
    setMessage("Verifying the WhatsApp Business Account returned by Meta…");
    post({action:"connect_redirect",code,state}).finally(()=>history.replaceState({},"","/whatsapp"));
  // Run once after Meta redirects back to this page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const loadMetaSdk=useCallback(()=>{
    if(!data?.provider?.configured||!data.provider.appId)return;
    if(window.FB){window.FB.init({appId:data.provider.appId,cookie:true,xfbml:false,version:data.provider.graphVersion});setSdkStatus("ready");return}
    setSdkStatus("loading");
    sdkAttempt.current+=1;
    const attempt=sdkAttempt.current;
    const existing=document.getElementById("facebook-jssdk");
    if(existing)existing.remove();
    const script=document.createElement("script");
    script.id="facebook-jssdk";
    script.src=`https://connect.facebook.net/en_US/sdk.js?v=${attempt}`;
    script.async=true;
    script.defer=true;
    script.onload=()=>{
      if(!window.FB){setSdkStatus("error");setMessage("Meta Login could not start. Disable tracking protection for wazap.lt, then retry.");return}
      window.FB.init({appId:data.provider.appId,cookie:true,xfbml:false,version:data.provider.graphVersion});
      setSdkStatus("ready");
      setMessage("");
    };
    script.onerror=()=>{setSdkStatus("error");setMessage("Meta Login was blocked by this browser. Allow connect.facebook.net for wazap.lt, then retry.")};
    document.body.appendChild(script);
    window.setTimeout(()=>{if(!window.FB&&sdkAttempt.current===attempt){setSdkStatus("error");setMessage("Meta Login timed out. Disable tracking protection for wazap.lt, then retry.")}},10000);
  },[data?.provider?.configured,data?.provider?.appId,data?.provider?.graphVersion]);
  useEffect(()=>{
    if(!data?.provider?.configured||!data.provider.appId)return;
    const receive=(event:MessageEvent)=>{
      if(!["https://www.facebook.com","https://web.facebook.com"].includes(event.origin))return;
      try{const payload=typeof event.data==="string"?JSON.parse(event.data):event.data;if(payload?.type==="WA_EMBEDDED_SIGNUP"&&payload?.event==="FINISH"){signupAssets.current={wabaId:String(payload.data?.waba_id||""),phoneNumberId:String(payload.data?.phone_number_id||"")}}}catch{}
    };
    window.addEventListener("message",receive);
    loadMetaSdk();
    return()=>window.removeEventListener("message",receive);
  },[data?.provider?.configured,data?.provider?.appId,loadMetaSdk]);
  async function post(body:any){setMessage("Working…");const r=await fetch("/api/whatsapp-platform",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const j=await r.json();setMessage(j.error||j.notice||"Saved.");if(r.ok&&body.action==="migration")setMigrationPreview(j.migration);if(r.ok)load();return r.ok}
  function migrationRows(){return migration.contacts.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{const parts=line.split(",").map(value=>value.trim());return parts.length===1?{phone:parts[0]}:{name:parts[0],phone:parts[1],email:parts[2]||""}})}
  function connectMeta(){
    if(!window.FB){setMessage("Meta Login is not ready in this browser. Retry the secure connection below.");loadMetaSdk();return}
    setMessage("Opening Meta authorization… Complete the secure popup to connect your WhatsApp Business Account.");
    signupAssets.current={wabaId:"",phoneNumberId:""};
    window.FB.login(async response=>{
      const code=response.authResponse?.code,{wabaId,phoneNumberId}=signupAssets.current;
      if(!code){setMessage(`Meta authorization was not completed${response.status?` (${response.status})`:""}. Reopen the connection and finish every Meta step.`);return}
      if(!wabaId||!phoneNumberId){setMessage("Meta authorized Wazap but did not return a WhatsApp Business Account and phone number. Select or create both assets inside the Meta popup, then finish the flow.");return}
      await post({action:"connect",code,wabaId,phoneNumberId});
    },{config_id:data.provider.configId,response_type:"code",override_default_response_type:true,extras:{setup:{},featureType:"",sessionInfoVersion:"3"}});
  }
  async function connectMetaSameTab(){
    setMessage("Preparing secure full-page Meta authorization…");
    const response=await fetch("/api/whatsapp-platform?meta_oauth=start",{cache:"no-store"}),result=await response.json();
    if(!response.ok||!result.authorizationUrl){setMessage(result.error||"Could not start Meta authorization.");return}
    location.assign(result.authorizationUrl);
  }
  if(!data)return <main className="hero-bg min-h-screen p-16 text-center text-slate-400">Loading WhatsApp operations…</main>;
  const configured=data.provider?.configured, active=data.connections?.filter((x:any)=>x.status==="active")||[], approved=data.templates?.filter((x:any)=>x.status==="approved")||[];
  return <main className="hero-bg min-h-screen px-4 py-12"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">WhatsApp revenue system</p><h1 className="mt-2 text-4xl font-bold text-white">Official API operations</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Connect a customer-owned WhatsApp Business Account, govern consent, submit templates, review campaigns, and operate conversations from one workspace.</p></div><Link href="/inbox" className="rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-black">Open shared inbox</Link></header>
    <section className={`mt-6 rounded-2xl border p-5 ${configured?"border-[#25D366]/30 bg-[#25D366]/5":"border-amber-400/30 bg-amber-400/5"}`}><div className="flex items-start gap-3">{configured?<CheckCircle2 className="mt-0.5 h-5 w-5 text-[#25D366]"/>:<RefreshCw className="mt-0.5 h-5 w-5 text-amber-300"/>}<div><h2 className="font-bold text-white">{configured?"Meta provider configured":"Meta provider setup required"}</h2><p className="mt-1 text-sm text-slate-400">{configured?"Embedded Signup can connect and verify customer-owned Meta assets.":"Outbound delivery and Embedded Signup remain safely locked. Missing server configuration: "+data.provider.missing.join(", ")} </p><p className="mt-1 text-xs text-slate-500">{data.provider.billing}</p></div></div></section>
    {message&&<p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}
    <section className="mt-6 grid gap-3 md:grid-cols-3">{sections.map(([title,body,Icon]:any)=><article key={title} className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><Icon className="h-5 w-5 text-[#25D366]"/><h2 className="mt-3 font-bold text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{body}</p></article>)}</section>
    <section className="mt-6 grid gap-5 lg:grid-cols-3">
      <article className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><h2 className="font-bold text-white">1. Meta connection</h2><p className="mt-2 text-sm text-slate-400">{active.length?`${active.length} verified connection${active.length===1?"":"s"}.`:"No verified WABA connected."}</p><div className="mt-4 rounded-xl bg-slate-950 p-3 text-xs text-slate-500">Use Meta Embedded Signup to grant Wazap access to a customer-owned business account. Credentials are exchanged and encrypted server-side; Wazap never asks users to paste permanent tokens.</div><p className={`mt-3 text-xs ${sdkStatus==="ready"?"text-[#25D366]":sdkStatus==="error"?"text-amber-300":"text-slate-500"}`}>{sdkStatus==="ready"?"Meta secure login ready":sdkStatus==="loading"?"Loading Meta secure login…":sdkStatus==="error"?"Meta secure login is blocked or unavailable":"Preparing Meta secure login…"}</p><button type="button" disabled={!configured||sdkStatus==="loading"} onClick={sdkStatus==="ready"?connectMeta:loadMetaSdk} className="mt-3 w-full rounded-xl bg-[#25D366] p-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">{sdkStatus==="error"?"Retry Meta connection":active.length?"Connect another number":"Connect with Meta"}</button><button type="button" disabled={!configured} onClick={connectMetaSameTab} className="mt-2 w-full rounded-xl border border-[#25D366]/40 p-3 text-sm font-bold text-[#25D366] disabled:opacity-40">Continue in this tab</button><p className="mt-2 text-[11px] text-slate-600">Use the full-page option when your browser blocks Meta popups.</p>{active.map((connection:any)=><button type="button" key={connection.id} onClick={()=>post({action:"sync_templates",connectionId:connection.id})} className="mt-2 w-full rounded-xl border border-slate-700 p-2 text-xs font-semibold text-white">Sync templates · {connection.displayName}</button>)}</article>
      <form onSubmit={async e=>{e.preventDefault();if(await post({action:"consent",...consent}))setConsent({contactAddress:"",source:"website_form",proof:""})}} className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><h2 className="font-bold text-white">2. Record consent</h2><input required value={consent.contactAddress} onChange={e=>setConsent({...consent,contactAddress:e.target.value})} placeholder="+971…" className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/><input required value={consent.source} onChange={e=>setConsent({...consent,source:e.target.value})} placeholder="Consent source" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/><input value={consent.proof} onChange={e=>setConsent({...consent,proof:e.target.value})} placeholder="Evidence or form reference" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/><button className="mt-3 w-full rounded-xl bg-[#25D366] p-3 font-bold text-black">Save opt-in</button><p className="mt-2 text-xs text-slate-600">{data.consents.length} consent records</p></form>
      <form onSubmit={async e=>{e.preventDefault();setMigrationPreview(null);await post({action:"migration",sourceProvider:migration.sourceProvider,rows:migrationRows()})}} className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><Upload className="h-5 w-5 text-[#25D366]"/><h2 className="mt-3 font-bold text-white">3. Contact migration</h2><p className="mt-1 text-xs text-slate-500">Preview and import up to 500 CRM contacts per batch. Use one phone per line, or <span className="text-slate-400">name, phone, email</span>.</p><input value={migration.sourceProvider} onChange={e=>{setMigration({...migration,sourceProvider:e.target.value});setMigrationPreview(null)}} placeholder="Source provider" className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/><textarea required value={migration.contacts} onChange={e=>{setMigration({...migration,contacts:e.target.value});setMigrationPreview(null)}} placeholder={"Jane Doe, +971500000000, jane@example.com\n+971511111111"} className="mt-2 h-28 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/><div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">This imports CRM contacts only. It does not import WhatsApp consent, message history or templates. Collect and record consent separately before marketing.</div>{migrationPreview&&<div className="mt-3 rounded-xl bg-slate-950 p-3 text-xs text-slate-400"><strong className="text-white">{migrationPreview.summary.importable} ready to import</strong><p className="mt-1">{migrationPreview.summary.existingLeads} existing · {migrationPreview.summary.duplicateRows} duplicate rows · {migrationPreview.summary.rejected} rejected</p></div>}<div className="mt-3 grid grid-cols-2 gap-2"><button className="rounded-xl border border-slate-700 p-3 font-semibold text-white">Preview import</button><button type="button" disabled={!migrationPreview||migrationPreview.status!=="validated"} onClick={async()=>{if(await post({action:"commit_migration",migrationId:migrationPreview.id,rows:migrationRows()}))setMigrationPreview(null)}} className="rounded-xl bg-[#25D366] p-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">Import contacts</button></div></form>
    </section>
    <form onSubmit={async e=>{e.preventDefault();await post({action:"campaign",...campaign,audience:campaign.audience.split(/[\s,;]+/).filter(Boolean)})}} className="mt-6 rounded-2xl border border-slate-800 bg-[#111811] p-6"><div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-[#25D366]"/><h2 className="text-xl font-bold text-white">Campaign review draft</h2></div><p className="mt-2 text-sm text-slate-400">Drafts require an active Meta connection, a Meta-approved template and active consent for every eligible recipient. Creation does not send messages.</p><div className="mt-4 grid gap-3 md:grid-cols-3"><input required value={campaign.name} onChange={e=>setCampaign({...campaign,name:e.target.value})} placeholder="Campaign name" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/><select required value={campaign.connectionId} onChange={e=>setCampaign({...campaign,connectionId:e.target.value})} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"><option value="">Verified connection</option>{active.map((x:any)=><option key={x.id} value={x.id}>{x.displayName}</option>)}</select><select required value={campaign.templateId} onChange={e=>setCampaign({...campaign,templateId:e.target.value})} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"><option value="">Approved template</option>{approved.map((x:any)=><option key={x.id} value={x.id}>{x.name} ({x.language})</option>)}</select></div><textarea required value={campaign.audience} onChange={e=>setCampaign({...campaign,audience:e.target.value})} placeholder="Consented international numbers, separated by lines or commas" className="mt-3 h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/><button disabled={!active.length||!approved.length} className="mt-3 rounded-xl bg-[#25D366] px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">Create governed draft</button></form>
    <section className="mt-6 grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><h2 className="font-bold text-white">Campaigns</h2><label className="mt-3 block text-xs text-slate-500">Optional scheduled time</label><input type="datetime-local" value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><p className="mt-1 text-[11px] text-slate-600">Leave blank to schedule immediately. Consent is checked again at send time.</p><div className="mt-3 space-y-2">{data.campaigns.map((x:any)=><div key={x.id} className="rounded-xl bg-slate-950 p-3 text-sm"><div className="flex justify-between"><strong className="text-white">{x.name}</strong><span className="text-amber-300">{x.status}</span></div><p className="mt-1 text-xs text-slate-500">{x.eligibleCount}/{x.audienceCount} consent-eligible · {x.sentCount} accepted · {x.deliveredCount} delivered · {x.readCount} read · {x.failedCount} failed</p>{x.scheduledFor&&<p className="mt-1 text-[11px] text-slate-600">Scheduled: {new Date(x.scheduledFor).toLocaleString()}</p>}{x.lastError&&<p className="mt-1 text-xs text-red-300">{x.lastError}</p>}<div className="mt-2 flex gap-2">{x.status==="draft"&&<button type="button" onClick={()=>post({action:"schedule_campaign",campaignId:x.id,scheduledFor:scheduleAt?new Date(scheduleAt).toISOString():undefined})} className="rounded-lg bg-[#25D366] px-3 py-2 text-xs font-bold text-black">Review & schedule</button>}{["scheduled","paused"].includes(x.status)&&<button type="button" onClick={()=>post({action:"cancel_campaign",campaignId:x.id})} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300">Cancel unsent</button>}</div></div>)}{!data.campaigns.length&&<p className="text-sm text-slate-600">No governed campaign drafts.</p>}</div></article><article className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><h2 className="font-bold text-white">Integration and support layer</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{[["Zapier / Make","Signed webhooks + scoped API"],["Google Sheets","Batch contact migration + webhook workflows"],["CRM systems","Leads API + event webhooks"],["Migration support","Fingerprint-locked preview and import"]].map(([a,b])=><div key={a} className="rounded-xl bg-slate-950 p-3"><strong className="text-sm text-white">{a}</strong><p className="mt-1 text-xs text-slate-600">{b}</p></div>)}</div><div className="mt-4 flex gap-3"><Link href="/integrations" className="text-sm font-semibold text-[#25D366]">Integrations →</Link><Link href="/support" className="text-sm font-semibold text-[#25D366]">Onboarding support →</Link></div></article></section>
  </div></main>
}
