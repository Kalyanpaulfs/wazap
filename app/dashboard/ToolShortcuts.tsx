'use client';
import {useState,type ComponentType} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Search,Wrench,CheckCircle2,LockKeyhole} from 'lucide-react';
import {IconWidget,IconAdBuilder,IconRotator} from '@/app/tools/ToolIcons';
type Tool={href:string;name:string;used:number;limit?:number;value:string;limitText?:string};
const info:Record<string,{group:string;description:string;Icon:ComponentType<{size?:number;color?:string}>}>={
 'follow-up':{group:'Conversations',description:'Keep leads organised and plan the next follow-up.',Icon:CheckCircle2},
 widget:{group:'Lead capture',description:'Add a WhatsApp chat entry point to your website.',Icon:IconWidget},
 'ad-builder':{group:'Lead capture',description:'Build campaign links with a ready-to-send message.',Icon:IconAdBuilder},
 rotator:{group:'Lead capture',description:'Distribute enquiries across your team numbers.',Icon:IconRotator},
};
export default function ToolShortcuts({tools}:{tools:Tool[]}){const [query,setQuery]=useState(''),[group,setGroup]=useState('All tools');const groups=['Conversations','Lead capture'];const filtered=tools.filter(t=>{const meta=info[t.href.split('/').pop()!];return (group==='All tools'||meta?.group===group)&&`${t.name} ${meta?.description}`.toLowerCase().includes(query.toLowerCase());});
 return <section className="wp-tool-library" aria-labelledby="tool-shortcuts-heading"><header><div><p className="wp-eyebrow">YOUR TOOLKIT</p><h2 id="tool-shortcuts-heading">Tool shortcuts</h2><p>Choose the right tool for your next task.</p></div><Link prefetch={false} href="/tools">Browse all tools <ArrowUpRight size={15}/></Link></header><div className="wp-tool-controls"><label><Search size={16}/><input aria-label="Search tool shortcuts" placeholder="Search your tools…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div aria-label="Tool categories">{['All tools',...groups].map(g=><button key={g} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</div></div>
 {!filtered.length?<div className="wp-tool-empty"><Wrench size={22}/><h3>No matching tools</h3><p>Try another search or clear the filters.</p><button onClick={()=>{setQuery('');setGroup('All tools');}}>Clear filters</button></div>:groups.map(g=>{const rows=filtered.filter(t=>info[t.href.split('/').pop()!]?.group===g);if(!rows.length)return null;return <div className="wp-tool-group" key={g}><h3>{g}<span>{rows.length} tools</span></h3><div className="wp-tool-rows">{rows.map(t=>{const {Icon,description}=info[t.href.split('/').pop()!];const locked=!t.limit,unlimited=t.limit===-1;const status=locked?'Upgrade to unlock':unlimited?'Unlimited':t.limitText&&t.limitText!=='∞'?t.limitText:`${t.limit}/day`;return <Link prefetch={false} key={t.href} href={t.href} className="wp-tool-row"><span className="wp-tool-icon"><Icon size={21}/></span><span className="wp-tool-copy"><strong>{t.name}</strong><small>{description}</small><span className="wp-tool-usage">{t.value}</span></span><span className={`wp-tool-access ${locked?'is-locked':''}`}>{locked&&<LockKeyhole size={12}/>} {status}</span><ArrowUpRight size={16} className="wp-tool-arrow"/></Link>;})}</div></div>;})}</section>;
}
