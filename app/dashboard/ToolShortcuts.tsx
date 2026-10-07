'use client';
import {useState,type ComponentType} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Search,Wrench,CheckCircle2,BarChart3,MessageSquareText,Clock3,LockKeyhole} from 'lucide-react';
import {IconWidget,IconBulk,IconChecker,IconAdBuilder,IconVCard,IconLinktree,IconRotator,IconTranscript} from '@/app/tools/ToolIcons';
type Tool={href:string;name:string;used:number;limit?:number;value:string;limitText?:string};
const info:Record<string,{group:string;description:string;Icon:ComponentType<{size?:number;color?:string}>}>={
 bulk:{group:'Conversations',description:'Prepare and open a queue of WhatsApp messages.',Icon:IconBulk},
 'follow-up':{group:'Conversations',description:'Keep leads organised and plan the next follow-up.',Icon:CheckCircle2},
 'reply-generator':{group:'Conversations',description:'Draft a reply to your next customer message.',Icon:MessageSquareText},
 'message-scheduler':{group:'Conversations',description:'Plan reminders and scheduled message workflows.',Icon:Clock3},
 widget:{group:'Lead capture',description:'Add a WhatsApp chat entry point to your website.',Icon:IconWidget},
 'ad-builder':{group:'Lead capture',description:'Build campaign links with a ready-to-send message.',Icon:IconAdBuilder},
 linktree:{group:'Lead capture',description:'Bring your business links together on one page.',Icon:IconLinktree},
 rotator:{group:'Lead capture',description:'Distribute enquiries across your team numbers.',Icon:IconRotator},
 checker:{group:'Utilities',description:'Format and clean your contact number lists.',Icon:IconChecker},
 vcard:{group:'Utilities',description:'Create a digital business card and QR code.',Icon:IconVCard},
 transcript:{group:'Utilities',description:'Prepare a readable export of your chat history.',Icon:IconTranscript},
 'chat-insights':{group:'Utilities',description:'Review a conversation and identify useful next steps.',Icon:BarChart3},
};
export default function ToolShortcuts({tools}:{tools:Tool[]}){const [query,setQuery]=useState(''),[group,setGroup]=useState('All tools');const groups=['Conversations','Lead capture','Utilities'];const filtered=tools.filter(t=>{const meta=info[t.href.split('/').pop()!];return (group==='All tools'||meta?.group===group)&&`${t.name} ${meta?.description}`.toLowerCase().includes(query.toLowerCase());});
 return <section className="wp-tool-library" aria-labelledby="tool-shortcuts-heading"><header><div><p className="wp-eyebrow">YOUR TOOLKIT</p><h2 id="tool-shortcuts-heading">Tool shortcuts</h2><p>Choose the right tool for your next task.</p></div><Link prefetch={false} href="/tools">Browse all tools <ArrowUpRight size={15}/></Link></header><div className="wp-tool-controls"><label><Search size={16}/><input aria-label="Search tool shortcuts" placeholder="Search your tools…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div aria-label="Tool categories">{['All tools',...groups].map(g=><button key={g} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</div></div>
 {!filtered.length?<div className="wp-tool-empty"><Wrench size={22}/><h3>No matching tools</h3><p>Try another search or clear the filters.</p><button onClick={()=>{setQuery('');setGroup('All tools');}}>Clear filters</button></div>:groups.map(g=>{const rows=filtered.filter(t=>info[t.href.split('/').pop()!]?.group===g);if(!rows.length)return null;return <div className="wp-tool-group" key={g}><h3>{g}<span>{rows.length} tools</span></h3><div className="wp-tool-rows">{rows.map(t=>{const {Icon,description}=info[t.href.split('/').pop()!];const locked=!t.limit,unlimited=t.limit===-1;const status=locked?'Upgrade to unlock':unlimited?'Unlimited':t.limitText&&t.limitText!=='∞'?t.limitText:`${t.limit}/day`;return <Link prefetch={false} key={t.href} href={t.href} className="wp-tool-row"><span className="wp-tool-icon"><Icon size={21}/></span><span className="wp-tool-copy"><strong>{t.name}</strong><small>{description}</small><span className="wp-tool-usage">{t.value}</span></span><span className={`wp-tool-access ${locked?'is-locked':''}`}>{locked&&<LockKeyhole size={12}/>} {status}</span><ArrowUpRight size={16} className="wp-tool-arrow"/></Link>;})}</div></div>;})}</section>;
}
