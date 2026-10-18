'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,Users,UserCheck,Mail,BarChart3,MessageCircle,CreditCard,HeartPulse} from 'lucide-react';
const links=[['Overview','overview',LayoutDashboard],['Contacts','',Users],['Customers','customers',UserCheck],['Support','support',MessageCircle],['Billing & plans','billing',CreditCard],['Broadcast','broadcast',Mail],['Reports','reports',BarChart3],['System health','health',HeartPulse]] as const;
// Server-side count of flagged ("needs you") chats, polled for the red badge
// next to Support. Kept to its own tiny endpoint (see app/api/admin/support/
// flagged-count/route.ts) so this nav doesn't pull the whole inbox payload.
export default function CrmNavigation(){
 const path=usePathname();
 const [flagged,setFlagged]=useState(0);
 useEffect(()=>{let stopped=false;async function poll(){try{const res=await fetch('/api/admin/support/flagged-count',{cache:'no-store'});if(res.ok&&!stopped){const json=await res.json();setFlagged(json.count||0);}}catch{/* keep the last known count */}}poll();const id=setInterval(poll,20000);return()=>{stopped=true;clearInterval(id);};},[]);
 return <>{links.map(([label,slug,Icon])=>{const href='/admin/crm'+(slug?'/'+slug:'');const isCurrent=path===href||(slug?path.startsWith(href+'/'):path==='/admin/crm');return <Link prefetch={false} key={label} href={href} className={`wp-nav-link ${isCurrent?'is-active':''}`} aria-current={isCurrent?'page':undefined}><Icon size={18}/>{label}{slug==='support'&&flagged>0&&<span className="wp-nav-badge" aria-label={`${flagged} chats need you`}>{flagged}</span>}</Link>;})}</>;
}

