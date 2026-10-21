'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,Users,MessageCircle,Mail,BarChart3} from 'lucide-react';
// 5 menu items (step 22 of kalyan.md): every old page still works, just
// grouped under one of these - see AdminSectionTabs for the within-group tabs.
const items=[
 ['Dashboard','/admin/crm/overview',LayoutDashboard,(p:string)=>p==='/admin/crm/overview'],
 ['Customers','/admin/crm/customers',Users,(p:string)=>p.startsWith('/admin/crm/customers')||p.startsWith('/admin/crm/billing')],
 ['Support','/admin/crm/support',MessageCircle,(p:string)=>p.startsWith('/admin/crm/support')],
 ['Email','/admin/crm/broadcast',Mail,(p:string)=>p.startsWith('/admin/crm/broadcast')||p==='/admin/crm'],
 ['Reports','/admin/crm/reports',BarChart3,(p:string)=>p.startsWith('/admin/crm/reports')||p.startsWith('/admin/crm/health')],
] as const;
// Server-side count of open/investigating support tickets, polled for the
// red badge next to Support. Kept to its own tiny endpoint (see
// app/api/admin/support/flagged-count/route.ts) so this nav doesn't pull the
// whole inbox payload.
export default function CrmNavigation(){
 const path=usePathname();
 const [flagged,setFlagged]=useState(0);
 useEffect(()=>{let stopped=false;async function poll(){try{const res=await fetch('/api/admin/support/flagged-count',{cache:'no-store'});if(res.ok&&!stopped){const json=await res.json();setFlagged(json.count||0);}}catch{/* keep the last known count */}}poll();const id=setInterval(poll,20000);return()=>{stopped=true;clearInterval(id);};},[]);
 return <>{items.map(([label,href,Icon,isActive])=>{const current=isActive(path);return <Link prefetch={false} key={label} href={href} className={`wp-nav-link ${current?'is-active':''}`} aria-current={current?'page':undefined}><Icon size={18}/>{label}{label==='Support'&&flagged>0&&<span className="wp-nav-badge" aria-label={`${flagged} tickets need you`}>{flagged}</span>}</Link>;})}</>;
}
