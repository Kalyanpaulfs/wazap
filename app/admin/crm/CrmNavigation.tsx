'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,Users,Columns3,CheckCheck,Filter,Mail,BarChart3,Settings,MessageCircle,CreditCard} from 'lucide-react';
const links=[['Overview','overview',LayoutDashboard],['Contacts','',Users],['Support','support',MessageCircle],['Pipeline','pipeline',Columns3],['Follow-ups','follow-ups',CheckCheck],['Audiences','audiences',Filter],['Campaigns','campaigns',Mail],['Reports','reports',BarChart3],['Billing & plans','billing',CreditCard],['Settings','settings',Settings]] as const;
export default function CrmNavigation(){const path=usePathname();return <>{links.map(([label,slug,Icon])=>{const href='/admin/crm'+(slug?'/'+slug:'');return <Link prefetch={false} key={label} href={href} className={`wp-nav-link ${path===href?'is-active':''}`} aria-current={path===href?'page':undefined}><Icon size={18}/>{label}</Link>;})}</>;}
