'use client';
import {useCallback,useEffect,useState} from 'react';

type Row={id:string;code:string;publicUrl:string;targetUrl:string;ownerEmail:string;clicks:number;reportCount:number;createdAt:string;disabled:boolean;disabledReason:string|null};

async function call(path:string,options?:RequestInit){const r=await fetch(path,options);const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not complete the request.');return result;}
const fmt=(d:string)=>new Date(d).toLocaleDateString('en-GB',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});

// Admin tab for the free Link shortener tool (TOOL-FREE-2, audit item 4f) -
// reported links sort first (see app/api/admin/short-urls/route.ts GET),
// so the handful that need a look are never buried under a long list.
export default function ShortLinksWorkspace(){
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState('');

 const load=useCallback(async()=>{setRows((await call('/api/admin/short-urls')).links);},[]);
 useEffect(()=>{(async()=>{try{await load();}catch(e){setNotice(e instanceof Error?e.message:'Could not load short links.');}finally{setLoading(false);}})();},[load]);

 async function toggle(id:string,disabled:boolean){
  setBusy(id);setNotice('');
  try{
   await call('/api/admin/short-urls',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,disabled})});
   await load();
  }catch(e){setNotice(e instanceof Error?e.message:'Could not update this link.');}
  finally{setBusy('');}
 }

 const reported=rows.filter(r=>r.reportCount>0);

 return <main className="wp-growth">
  <div className="wp-admin-heading"><div><p className="wp-eyebrow">WAZAP · ADMIN</p><h1>Short links</h1><p>The free link-shortener tool (TOOL-FREE-2). Reported links are listed first.</p></div></div>
  {notice&&<p role="status" className="wp-admin-context my-5">{notice}</p>}
  {loading?<p role="status" className="wp-growth-panel mt-6 text-sm text-slate-400">Loading…</p>:<>
   {reported.length>0&&<div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
    <strong className="text-amber-200">Reported ({reported.length})</strong>
    <p className="text-xs text-slate-400 mt-1">3 or more reports auto-disables a link. Re-enable it below once you&apos;ve checked it.</p>
   </div>}
   <section className="wp-growth-panel mt-5">
    <div className="wp-growth-table-wrap"><table className="wp-growth-table"><thead><tr><th>Code</th><th>Target</th><th>Owner</th><th>Clicks</th><th>Reports</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>
     {rows.map(row=><tr key={row.id}>
      <td className="font-mono text-xs"><a href={row.publicUrl} target="_blank" rel="noopener noreferrer">{row.code}</a></td>
      <td className="text-xs max-w-xs truncate" title={row.targetUrl}>{row.targetUrl}</td>
      <td className="text-xs">{row.ownerEmail}</td>
      <td className="text-xs">{row.clicks.toLocaleString()}</td>
      <td className="text-xs">{row.reportCount}</td>
      <td className="text-xs">{fmt(row.createdAt)}</td>
      <td className="text-xs">{row.disabled?`Disabled${row.disabledReason==='reported'?' (reported)':''}`:'Live'}</td>
      <td><button className="wp-crm-secondary" disabled={busy===row.id} onClick={()=>toggle(row.id,!row.disabled)}>{busy===row.id?'Saving…':row.disabled?'Enable':'Disable'}</button></td>
     </tr>)}
     {!rows.length&&<tr><td colSpan={8} className="text-xs text-slate-500">No short links yet.</td></tr>}
    </tbody></table></div>
   </section>
  </>}
 </main>;
}
