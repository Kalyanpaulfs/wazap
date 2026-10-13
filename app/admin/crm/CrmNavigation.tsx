'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,Users,Mail,BarChart3,MessageCircle,CreditCard,HeartPulse} from 'lucide-react';
const links=[['Overview','overview',LayoutDashboard],['Contacts','',Users],['Support','support',MessageCircle],['Billing & plans','billing',CreditCard],['Broadcast','broadcast',Mail],['Reports','reports',BarChart3],['System health','health',HeartPulse]] as const;
export default function CrmNavigation(){const path=usePathname();return <>{links.map(([label,slug,Icon])=>{const href='/admin/crm'+(slug?'/'+slug:'');return <Link prefetch={false} key={label} href={href} className={`wp-nav-link ${path===href?'is-active':''}`} aria-current={path===href?'page':undefined}><Icon size={18}/>{label}</Link>;})}</>;}
