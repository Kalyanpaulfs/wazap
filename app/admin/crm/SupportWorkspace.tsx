'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Paperclip,X} from 'lucide-react';
import {shrinkImage,MAX_ATTACHMENT_BYTES} from '@/lib/client-image-shrink';
import './support-readability.css';

type ResponseState={awaitingReply:boolean;waitingSince:string|null;dueAt:string|null;overdue:boolean;state:'ok'|'soon'|'late';targetMinutes:number};
// A contact-form / email request (unrelated to the SupportTicket entity below - kept the historical name "Request" to avoid clashing with it).
type Request=ResponseState&{isQa?:boolean;parentRequest?:{id:string;subject:string;message:string;adminReply:string|null}|null;id:string;name:string;email:string;subject:string;message:string;read:boolean;adminReply:string|null;adminReplySeenAt:string|null;crmLeadId:string|null};
type TicketMessage={id:string;sender:string;body:string;readByAdmin:boolean;readByVisitor:boolean;createdAt:string;attachments?:{id:string;mimeType:string}[]};
// `messages` is NOT in the list payload any more (only a short
// lastMessagePreview) - the full history for the selected ticket is fetched
// separately via GET /api/admin/support?ticketId=, so a ~15s poll doesn't
// have to carry every ticket's entire message history every time.
type SupportTicket={id:string;number:string;reference:string;topic:string;status:string;urgent:boolean;priority:boolean;waitingSince:string|null;overdue:boolean;createdAt:string;updatedAt:string;solvedAt:string|null;closedAt:string|null;assignedToId:string|null;assignedToName:string|null;conversationId:string;visitorId:string;name:string|null;email:string|null;phone:string|null;crmLeadId:string|null;planLabel:string|null;quickAnswerTitle:string|null;unread:number;lastMessagePreview:string|null};
type Admin={id:string;name:string|null;email:string};
type Health={checkedAt:string;mailboxes:{mailbox:string;ok:boolean}[];deliveryFailures:number;queuedService:number};

const TOPIC_LABELS:Record<string,string>={payment:'Payment',link:'Link not working',account:'Account/login',other:'Other'};
const STATUS_LABELS:Record<string,string>={open:'Open',investigating:'Investigating',waiting:'Waiting for customer',solved:'Solved',closed:'Closed'};
const TICKET_STATUSES=['waiting','investigating','solved'] as const;

async function api(path:string,body?:object,method='POST'){const res=await fetch(path,body?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await res.json();if(!res.ok)throw new Error(data.error||'The support request failed.');return data;}
function unread(row:Request){return !row.read;}
function timerLabel(row:ResponseState):{text:string;cls:string}{
 if(!row.awaitingReply||!row.dueAt)return{text:'No reply needed',cls:''};
 const hours=Math.abs(new Date(row.dueAt).getTime()-Date.now())/3600000;
 const rounded=Math.max(1,Math.round(hours));
 if(row.state==='late')return{text:`Late by ${rounded}h`,cls:'wp-support-flag-late'};
 if(row.state==='soon')return{text:`${rounded}h left`,cls:'wp-support-flag-soon'};
 return{text:`${rounded}h left`,cls:'wp-support-flag-ok'};
}
function ticketWaitLabel(t:SupportTicket):{text:string;cls:string}{
 if(t.status==='solved')return{text:'Solved',cls:'wp-support-flag-ok'};
 if(t.status==='closed')return{text:'Closed',cls:''};
 if(!t.waitingSince)return{text:'Replied - no reply needed',cls:''};
 const hours=Math.max(0,(Date.now()-new Date(t.waitingSince).getTime())/3600000);
 const rounded=Math.max(1,Math.round(hours));
 return{text:`Waiting ${rounded}h`,cls:t.overdue?'wp-support-flag-late':'wp-support-flag-ok'};
}

export default function SupportWorkspace(){
 const [health,setHealth]=useState<Health|null>(null);
 const [requests,setRequests]=useState<Request[]>([]),[supportTickets,setSupportTickets]=useState<SupportTicket[]>([]),[admins,setAdmins]=useState<Admin[]>([]);
 const [selected,setSelected]=useState(()=>typeof window!=='undefined'?new URLSearchParams(window.location.search).get('ticket')||'':'');
 const [tab,setTab]=useState<string>('ticket');
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState(()=>typeof window!=='undefined'?new URLSearchParams(window.location.search).get('email')||new URLSearchParams(window.location.search).get('q')||'':'');
 const [drafts,setDrafts]=useState<Record<string,string>>({}),[nextStatusDrafts,setNextStatusDrafts]=useState<Record<string,string>>({}),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [pending,setPending]=useState<{blob:Blob;name:string;previewUrl:string}|null>(null);const [uploading,setUploading]=useState(false);const fileInputRef=useRef<HTMLInputElement>(null);
 const [ticketMessages,setTicketMessages]=useState<Record<string,TicketMessage[]>>({});
 const load=useCallback(async()=>{const data=await api('/api/admin/support');setHealth(data.health||null);setRequests(data.requests||[]);setSupportTickets(data.tickets||[]);setAdmins(data.admins||[]);setLoading(false);return data;},[]);
 const loadTicketMessages=useCallback(async(ticketId:string)=>{
  try{const data=await api(`/api/admin/support?ticketId=${encodeURIComponent(ticketId)}`);setTicketMessages(m=>({...m,[ticketId]:data.messages||[]}));}catch{/* keep showing the last loaded messages */}
 },[]);
 // Full history for the selected ticket - fetched on selection, and
 // refreshed every 15s (same cadence as the list poll) while a ticket
 // stays selected and visible.
 useEffect(()=>{
  if(tab!=='ticket'||!selected)return;
  // Fetching the newly-selected ticket's history, same pattern as the
  // existing list poll below.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  loadTicketMessages(selected);
  const timer=setInterval(()=>{if(document.visibilityState==='visible')loadTicketMessages(selected);},15000);
  return()=>clearInterval(timer);
 },[tab,selected,loadTicketMessages]);
 useEffect(()=>{
  const sp=new URLSearchParams(window.location.search);
  const ticketParam=sp.get('ticket');
  // Old deep links from earlier alert emails and other admin pages use
  // ?chat=<conversationId> (from before tickets existed). Resolve those to
  // the newest ticket on that conversation once the tickets load.
  const chatParam=sp.get('chat');
  load().then(data=>{
   if(!ticketParam&&chatParam&&Array.isArray(data?.tickets)){
    const matches=(data.tickets as SupportTicket[]).filter(t=>t.conversationId===chatParam);
    const newest=matches.slice().sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0];
    if(newest)setSelected(newest.id);
   }
  }).catch(e=>{setNotice(e.message);setLoading(false);});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')load().catch(e=>setNotice(e.message));},15000);
  return()=>clearInterval(timer);
 },[load]);
 const request=requests.find(t=>t.id===selected),ticket=supportTickets.find(t=>t.id===selected);
 const draft=drafts[selected]||'';const nextStatus=nextStatusDrafts[selected]||'waiting';
 function clearPending(){if(pending)URL.revokeObjectURL(pending.previewUrl);setPending(null);if(fileInputRef.current)fileInputRef.current.value='';}
 async function onPickFile(event:React.ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  if(file.size>MAX_ATTACHMENT_BYTES){setNotice('Screenshot is too big. Max 5 MB.');return;}
  setNotice('');
  const blob=await shrinkImage(file);
  if(pending)URL.revokeObjectURL(pending.previewUrl);
  setPending({blob,name:file.name,previewUrl:URL.createObjectURL(blob)});
 }
 async function action(fn:()=>Promise<unknown>){setBusy(true);setNotice('');try{await fn();await load();if(tab==='ticket'&&selected)await loadTicketMessages(selected);}catch(e){setNotice(e instanceof Error?e.message:'Unable to save. Your draft is retained.');}finally{setBusy(false);}}
 async function setRead(row:Request,read:boolean){await api('/api/admin/contact-messages',{messageId:row.id,read},'PATCH');}
 function open(row:Request){setSelected(row.id);setNotice('');clearPending();if(unread(row))action(()=>setRead(row,true));}
 function openTicket(t:SupportTicket){setSelected(t.id);setNotice('');clearPending();if(t.unread>0)action(()=>api('/api/admin/support',{ticketId:t.id,markRead:true},'PATCH'));}
 function switchTab(next:string){setTab(next);setSelected('');setFilter('all');setNotice('');clearPending();}
 async function sendTicketReply(ticketId:string,message:string,status:string){
  if(!pending){await api('/api/admin/support',{ticketId,message,nextStatus:status});return;}
  setUploading(true);
  try{
   const form=new FormData();
   form.append('ticketId',ticketId);
   if(message)form.append('message',message);
   form.append('nextStatus',status);
   form.append('file',pending.blob,pending.name||'screenshot');
   const response=await fetch('/api/admin/support',{method:'POST',body:form});
   const json=await response.json();
   if(!response.ok)throw new Error(json.error||'Your screenshot could not be sent.');
   clearPending();
  }finally{setUploading(false);}
 }

 if(tab==='ticket'){
  const ticketFilters:[string,string][]=[['open','Open'],['waiting','Waiting for customer'],['solved','Solved'],['all','All']];
  const ticketMatches=(t:SupportTicket)=>{
   if(filter==='open')return t.status==='open'||t.status==='investigating';
   if(filter==='waiting')return t.status==='waiting';
   if(filter==='solved')return t.status==='solved'||t.status==='closed';
   return true;
  };
  const items=supportTickets.filter(t=>ticketMatches(t)&&`${t.name} ${t.email} ${t.number} ${t.topic}`.toLowerCase().includes(query.toLowerCase()));
  const openCount=supportTickets.filter(t=>t.status==='open'||t.status==='investigating').length;
  const unreadCount=supportTickets.filter(t=>t.unread>0).length;
  const overdueCount=supportTickets.filter(t=>t.overdue).length;
  return <main className="wp-crm wp-support-readable p-4 py-7 sm:p-7">
   <div className="wp-admin-heading"><div><p className="wp-eyebrow">CUSTOMER CARE</p><h1>Support</h1><p>Tickets sorted urgent first, then longest waiting. Anything overdue (waiting over 12h) needs a reply.</p></div><button className="wp-crm-secondary" disabled={busy} onClick={()=>action(load)}>Refresh inbox</button></div>
   <p className="text-xs text-muted my-3">{!health?'Inbox monitor awaiting its first check.':Date.now()-new Date(health.checkedAt).getTime()>10*60000?'Inbox monitor is overdue. Tell your developer.':health.mailboxes.some(m=>!m.ok)||health.deliveryFailures?`Attention: ${health.mailboxes.filter(m=>!m.ok).map(m=>m.mailbox).join(', ')||'email delivery'} · ${health.deliveryFailures} delivery issues`:`Mailboxes checked ${new Date(health.checkedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} · ${health.queuedService} service emails queued`}</p>
   <div className="wp-support-summary my-4" aria-live="polite"><span className={openCount?'is-overdue':''}><strong>{openCount}</strong> open</span><span><strong>{unreadCount}</strong> unread</span><span className={overdueCount?'is-overdue':''}><strong>{overdueCount}</strong> overdue</span></div>
   <div className="wp-admin-tabs mt-6">{[['ticket','Tickets'],['form','Email & support forms']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>switchTab(id)}>{label} · {id==='ticket'?supportTickets.length:requests.length} {id!=='ticket'&&<span className="wp-support-unread-count">{requests.filter(unread).length} unread</span>}</button>)}</div>
   <div className="wp-support-search flex flex-wrap gap-3 my-4"><input aria-label="Search tickets" placeholder="Search name, email, ticket number or topic" className="wp-crm-input" value={query} onChange={e=>setQuery(e.target.value)}/><select className="wp-crm-input" aria-label="Filter tickets" value={filter} onChange={e=>setFilter(e.target.value)}>{ticketFilters.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></div>
   {notice&&<p className="wp-admin-context" role="status">{notice}</p>}
   <div className={`wp-crm-grid ${selected?'has-detail':''}`}>
    <section className="wp-crm-list"><div className="wp-crm-list-heading"><h2>Tickets</h2><span>{items.length} shown</span></div>
     {loading?<p className="p-6">Loading support…</p>:!items.length?<p className="p-6 text-muted">No tickets match this view.</p>:items.map(t=>{const timer=ticketWaitLabel(t);return <button key={t.id} aria-label={`${t.unread?'Unread':'Read'}: ticket ${t.reference}, ${t.name||'Visitor'}; ${timer.text}`} className={`wp-crm-row wp-support-row ${selected===t.id?'is-selected':''} ${t.unread?'is-unread':''} ${t.overdue?'is-overdue':''} ${t.urgent?'wp-support-needs-you':''}`} onClick={()=>openTicket(t)}>
      <span className="wp-crm-person"><span className="wp-avatar">{t.name?.slice(0,1)||'?'}{t.unread>0&&<span className="wp-support-dot" aria-hidden="true"/>}</span><span><strong>{t.reference}{t.urgent&&' · URGENT'}{t.priority&&' · Agency'}</strong><small>{t.name||'Visitor'} · {t.email}</small><small>{TOPIC_LABELS[t.topic]||t.topic}{t.assignedToName?` · ${t.assignedToName}`:' · Unassigned'}</small><small className="wp-support-preview">{t.lastMessagePreview||'No messages yet'}</small></span></span>
      <span className="wp-support-row-state"><span className={`wp-crm-pill ${t.unread?'wp-support-unread':''}`}>{t.unread?`${t.unread} unread`:STATUS_LABELS[t.status]||t.status}</span><small className={timer.cls}>{timer.text}</small></span>
     </button>;})}
    </section>
    {selected&&ticket&&<section className="wp-crm-detail"><div className="wp-crm-detail-heading"><h2>{ticket.reference}<span className="wp-support-reference"> · {TOPIC_LABELS[ticket.topic]||ticket.topic}</span></h2><button aria-label="Close ticket panel" onClick={()=>setSelected('')}>Close</button></div>
     <div className="p-4 space-y-4">
      <p className="text-sm text-muted break-words">{ticket.name||'Visitor'} · {ticket.email}{ticket.phone?` · ${ticket.phone}`:''}{ticket.planLabel?` · ${ticket.planLabel} plan`:''}</p>
      <p className={ticketWaitLabel(ticket).cls||'text-sm text-muted'}>{ticketWaitLabel(ticket).text} · Status: {STATUS_LABELS[ticket.status]||ticket.status}</p>
      {ticket.quickAnswerTitle&&<p className="text-sm text-muted">Read before ticket: {ticket.quickAnswerTitle}</p>}
      {ticket.crmLeadId&&<Link prefetch={false} className="wp-crm-secondary" href={`/admin/crm?lead=${encodeURIComponent(ticket.crmLeadId)}`}>Customer details →</Link>}
      <div className="flex gap-2 flex-wrap">
       {ticket.status!=='solved'&&ticket.status!=='closed'&&<button className="wp-crm-secondary" disabled={busy} onClick={()=>action(()=>api('/api/admin/support',{ticketId:ticket.id,status:'solved'},'PATCH'))}>Mark solved</button>}
       {(ticket.status==='solved'||ticket.status==='closed')&&<button className="wp-crm-secondary" disabled={busy} onClick={()=>action(()=>api('/api/admin/support',{ticketId:ticket.id,reopen:true},'PATCH'))}>Reopen</button>}
       <button className="wp-crm-secondary" disabled={busy} onClick={()=>action(()=>api('/api/admin/support',{ticketId:ticket.id,urgent:!ticket.urgent},'PATCH'))}>{ticket.urgent?'Remove urgent':'Mark urgent'}</button>
       <select aria-label="Assign ticket" className="wp-crm-input" disabled={busy} value={ticket.assignedToId||''} onChange={e=>action(()=>api('/api/admin/support',{ticketId:ticket.id,assignedToId:e.target.value||null},'PATCH'))}>
        <option value="">Unassigned</option>
        {admins.map(a=><option key={a.id} value={a.id}>{a.name||a.email}</option>)}
       </select>
      </div>
      <div className="wp-support-history space-y-4" aria-label="Ticket history">{(ticketMessages[ticket.id]||[]).map(m=><article key={m.id} className={`wp-crm-chat wp-support-message is-${m.sender}`}><small className="wp-support-message-author">{m.sender==='visitor'?'Customer':m.sender==='bot'?'System notice':m.sender==='admin'?'Your team':m.sender} <span>· {new Date(m.createdAt).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})}</span></small><p className="whitespace-pre-wrap break-words text-sm mt-2">{m.body}</p>{m.attachments?.map(a=><a key={a.id} href={`/api/support/attachment/${a.id}`} target="_blank" rel="noopener noreferrer" className="block mt-1.5"><img src={`/api/support/attachment/${a.id}`} alt="Screenshot" className="max-w-[200px] rounded-lg border border-border-strong"/></a>)}{m.sender==='admin'&&<small className="text-accent">{m.readByVisitor?'Seen by visitor':'Saved to ticket · not yet seen'}</small>}</article>)}</div>
      {ticket.status!=='closed'?<form onSubmit={e=>{e.preventDefault();action(async()=>{await sendTicketReply(ticket.id,draft,nextStatus);setNotice(pending?'Screenshot sent on this ticket.':'Reply saved on this ticket.');setDrafts(d=>({...d,[selected]:''}));});}}>
       <label className="text-sm" htmlFor="ticket-reply">Your reply to the customer</label>
       <textarea placeholder="Write your reply here…" id="ticket-reply" className="wp-crm-input w-full mt-2" rows={4} maxLength={4000} value={draft} onChange={e=>setDrafts(d=>({...d,[selected]:e.target.value}))}/>
       <div className="flex items-center gap-2 mt-2 flex-wrap">
        <label className="text-sm" htmlFor="ticket-next-status">After reply:</label>
        <select id="ticket-next-status" className="wp-crm-input" value={nextStatus} onChange={e=>setNextStatusDrafts(d=>({...d,[selected]:e.target.value}))}>{TICKET_STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} className="hidden" id="ticket-reply-file"/>
        <button type="button" className="wp-crm-secondary" disabled={busy||uploading} onClick={()=>fileInputRef.current?.click()}><Paperclip size={14}/> Attach screenshot</button>
        {pending&&<span className="flex items-center gap-2 text-xs text-muted"><img src={pending.previewUrl} alt="Screenshot preview" className="w-8 h-8 rounded-lg object-cover border border-border-strong"/><span className="max-w-[160px] truncate">{pending.name}</span><button type="button" aria-label="Remove screenshot" onClick={clearPending} disabled={uploading} className="text-muted hover:text-text disabled:opacity-40"><X size={14}/></button></span>}
       </div>
       <p className="text-xs text-muted my-3">Replies appear in the customer&apos;s ticket. &quot;After reply&quot; sets the ticket&apos;s status once this reply is sent.</p>
       <button disabled={busy||uploading||(!draft.trim()&&!pending)} className="wp-primary">{uploading?'Sending…':busy?'Saving…':'Send reply'}</button>
      </form>:<p className="text-sm text-muted">This ticket is closed. The customer can start a new one.</p>}
     </div>
    </section>}
    {!selected&&<aside className="wp-support-empty"><h2>Read a ticket</h2><p>Select a ticket from the list to see the full messages and write a reply.</p></aside>}
   </div>
   <p className="text-xs text-muted mt-4">Showing every open, waiting and recently solved ticket. Inbox refreshes every 15 seconds while visible.</p>
  </main>;
 }

 // "Email & support forms" tab: contact-form submissions and incoming
 // email, unchanged from before SUPPORT-2 besides the shared tab switcher.
 const items=requests.filter(row=>(filter==='all'||(filter==='unread'?unread(row):filter==='waiting'?row.awaitingReply:filter==='overdue'?row.overdue:false))&&`${row.name} ${row.email} ${row.subject}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||Number(unread(b))-Number(unread(a))||Number(b.awaitingReply)-Number(a.awaitingReply));
 return <main className="wp-crm wp-support-readable p-4 py-7 sm:p-7">
 <div className="wp-admin-heading"><div><p className="wp-eyebrow">CUSTOMER CARE</p><h1>Support</h1><p>Requests from the contact form and incoming email.</p></div><button className="wp-crm-secondary" disabled={busy} onClick={()=>action(load)}>Refresh inbox</button></div>
 <p className="text-xs text-muted my-3">{!health?'Inbox monitor awaiting its first check.':Date.now()-new Date(health.checkedAt).getTime()>10*60000?'Inbox monitor is overdue. Tell your developer.':health.mailboxes.some(m=>!m.ok)||health.deliveryFailures?`Attention: ${health.mailboxes.filter(m=>!m.ok).map(m=>m.mailbox).join(', ')||'email delivery'} · ${health.deliveryFailures} delivery issues`:`Mailboxes checked ${new Date(health.checkedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} · ${health.queuedService} service emails queued`}</p>
 <div className="wp-support-summary my-4" aria-live="polite"><span><strong>{requests.filter(unread).length}</strong> unread</span><span><strong>{requests.filter(r=>r.awaitingReply).length}</strong> awaiting reply</span><span className={requests.some(r=>r.overdue)?'is-overdue':''}><strong>{requests.filter(r=>r.overdue).length}</strong> overdue</span></div>
 <div className="wp-admin-tabs mt-6">{[['ticket','Tickets'],['form','Email & support forms']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>switchTab(id)}>{label} · {id==='ticket'?supportTickets.length:requests.length} {id!=='ticket'&&<span className="wp-support-unread-count">{requests.filter(unread).length} unread</span>}</button>)}</div>
 <div className="wp-support-search flex flex-wrap gap-3 my-4"><input aria-label="Search support" placeholder="Search name, email or topic" className="wp-crm-input" value={query} onChange={e=>setQuery(e.target.value)}/><select className="wp-crm-input" aria-label="Filter support" value={filter} onChange={e=>setFilter(e.target.value)}>{['all','unread','waiting','overdue'].map(v=><option key={v} value={v}>{v==='waiting'?'Needs a reply':v==='all'?'All requests':v.charAt(0).toUpperCase()+v.slice(1)}</option>)}</select></div>
 {notice&&<p className="wp-admin-context" role="status">{notice}</p>}
 <div className={`wp-crm-grid ${selected?'has-detail':''}`}><section className="wp-crm-list"><div className="wp-crm-list-heading"><h2>Requests & incoming email</h2><span>{items.length} shown</span></div>{loading?<p className="p-6">Loading support…</p>:!items.length?<p className="p-6 text-muted">No requests match this view.</p>:items.map(row=>{const timer=timerLabel(row);return <button key={row.id} aria-label={`${unread(row)?'Unread':'Read'}: ${row.name||'Visitor'}; ${timer.text}`} className={`wp-crm-row wp-support-row ${selected===row.id?'is-selected':''} ${unread(row)?'is-unread':''} ${row.overdue?'is-overdue':''}`} onClick={()=>open(row)}><span className="wp-crm-person"><span className="wp-avatar">{row.name?.slice(0,1)||'?'}{unread(row)&&<span className="wp-support-dot" aria-hidden="true"/>}</span><span><strong>{row.name||'Visitor'}</strong><small>{row.email}</small><small>{row.subject}{row.isQa?' · Test':''}</small><small className="wp-support-preview">{row.message}</small></span></span><span className="wp-support-row-state"><span className={`wp-crm-pill ${unread(row)?'wp-support-unread':''}`}>{unread(row)?'Unread':'Read'}</span><small className={timer.cls}>{timer.text}</small></span></button>;})}</section>
 {selected&&request&&<section className="wp-crm-detail"><div className="wp-crm-detail-heading"><h2>{request.name||'Support request'}</h2><button aria-label="Close conversation panel" onClick={()=>setSelected('')}>Close</button></div><div className="p-4 space-y-4"><p className="text-sm text-muted break-words">{request.email}</p><p className={timerLabel(request).cls||'text-sm text-muted'}>{timerLabel(request).text}</p>{request.crmLeadId&&<Link prefetch={false} className="wp-crm-secondary" href={`/admin/crm?lead=${encodeURIComponent(request.crmLeadId)}`}>Customer details →</Link>}
 <div className="flex gap-2 flex-wrap"><button className="wp-crm-secondary" disabled={busy} onClick={()=>action(()=>setRead(request,!unread(request)))}>{unread(request)?'Mark read':'Mark unread'}</button></div>
 {request.parentRequest&&<article className="wp-crm-chat"><small>Reply to request {request.parentRequest.id}</small><strong>{request.parentRequest.subject}</strong><p className="whitespace-pre-wrap text-sm">{request.parentRequest.message}</p>{request.parentRequest.adminReply&&<p className="whitespace-pre-wrap text-sm mt-2">Previous team reply: {request.parentRequest.adminReply}</p>}</article>}<article className="wp-crm-chat"><strong>{request.subject}</strong><p className="whitespace-pre-wrap break-words text-sm mt-2">{request.message}</p></article>{request.adminReply&&<article className="wp-crm-chat"><small>Latest support reply · {request.adminReplySeenAt?'Seen in customer dashboard':'Not yet seen in customer dashboard'}</small><p className="whitespace-pre-wrap break-words mt-2">{request.adminReply}</p></article>}
 <button className="wp-crm-secondary my-2" disabled={busy} onClick={()=>action(()=>api('/api/admin/contact-messages',{messageId:request.id,testOnly:!request.isQa},'PATCH'))}>{request.isQa?'Resume normal reply-time tracking':'Mark as a test request'}</button>
 <form onSubmit={e=>{e.preventDefault();action(async()=>{const result=await api('/api/admin/contact-reply',{messageId:request.id,reply:draft});setNotice(result.message.emailSent?'Reply saved; email accepted by provider.':'Reply saved; email awaiting retry. Provider delivery is not confirmed.');setDrafts(d=>({...d,[selected]:''}));});}}><label className="text-sm" htmlFor="support-reply">Your reply to this request</label><textarea placeholder="Write your reply here…" id="support-reply" className="wp-crm-input w-full mt-2" rows={4} maxLength={4000} required value={draft} onChange={e=>setDrafts(d=>({...d,[selected]:e.target.value}))}/>
 <p className="text-xs text-muted my-3">Replies are saved and emailed to the original contact address. Provider acceptance does not confirm delivery.</p><button disabled={busy||!draft.trim()} className="wp-primary">{busy?'Saving…':'Send reply'}</button></form></div></section>}{!selected&&<aside className="wp-support-empty"><h2>Read a request</h2><p>Select a name from the list to see the full message and write a reply.</p></aside>}</div><p className="text-xs text-muted mt-4">Showing the latest 100 requests. Overdue monitoring checks all open requests. Inbox refreshes every 15 seconds while visible.</p></main>;
}
