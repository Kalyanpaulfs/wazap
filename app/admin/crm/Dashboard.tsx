import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {AlertTriangle,ArrowUpRight,CheckCircle2,CreditCard,Mail,MessageCircle,ServerCrash,ShieldAlert} from 'lucide-react';
import {prisma} from '@/lib/prisma';
import {CRM_TRASH_TAG} from '@/lib/crm-trash';
import {customerSegmentKey} from '@/lib/admin-customer';
import {flaggedConversationCount} from '@/lib/support-admin-service';
import {backupRestoreStatus} from '@/lib/system-operations';
import {buildNeedsAttention,formatIncomeByCurrency,type NeedsAttentionKey} from '@/lib/admin-dashboard';

const ICONS:Record<NeedsAttentionKey,typeof AlertTriangle>={support:MessageCircle,forms:Mail,billing:CreditCard,emails:ServerCrash,backup:ShieldAlert};

// Dashboard (/admin/crm/overview) - calm overview: only what needs the admin,
// then the numbers. Every count is counted server-side here, reusing the
// same sources as the pages it links to (Support badge, BillingAttentionList,
// SystemHealthWorkspace, Reports' income-per-month and the CRM overview
// stats), so the numbers never drift from what those pages show.
export default async function Dashboard(){
 const session=await getServerSession(authOptions);
 if(!(session?.user as {isAdmin?:boolean}|undefined)?.isAdmin)redirect('/login');

 const now=new Date();
 const weekAgo=new Date(now.getTime()-7*86400000);
 const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
 const since24h=new Date(now.getTime()-24*3600000);

 // Same trashed-contact exclusion as getRequests() in app/api/admin/support/route.ts,
 // so this count matches the "Email & support forms" tab exactly.
 const trashedLeads=await prisma.crmLead.findMany({where:{tags:{has:CRM_TRASH_TAG}},select:{email:true}});

 const [users,unresolvedBilling,backup,monthPayments,supportFlagged,unreadForms,failedEmails24h]=await Promise.all([
  // Same people and same rules as the Customers list (admins excluded).
  prisma.user.findMany({where:{isAdmin:false},select:{plan:true,planExpiresAt:true,trialEndsAt:true,createdAt:true}}),
  prisma.billingAttention.count({where:{resolvedAt:null}}),
  backupRestoreStatus(),
  prisma.payment.findMany({where:{status:'active',createdAt:{gte:monthStart}},select:{amount:true,currency:true}}),
  flaggedConversationCount(),
  prisma.contactMessage.count({where:{read:false,NOT:{OR:trashedLeads.map(l=>({email:{equals:l.email,mode:'insensitive' as const}}))}}}),
  prisma.outboundEmail.count({where:{status:{in:['failed','deferred','unknown']},createdAt:{gte:since24h},NOT:[{recipient:{endsWith:'.invalid'}},{recipient:{endsWith:'@example.com'}},{type:{startsWith:'delivery_test'}}]}}),
 ]);

 let payingCustomers=0,onTrial=0,expired=0,trialEnded=0,newSignups7d=0;
 for(const u of users){
  const segment=customerSegmentKey(u,now);
  if(segment==='paying')payingCustomers++;
  else if(segment==='trial')onTrial++;
  else if(segment==='expired')expired++;
  else trialEnded++;
  if(u.createdAt>=weekAgo)newSignups7d++;
 }

 const incomeByCurrency:Record<string,number>={};
 for(const p of monthPayments)incomeByCurrency[p.currency]=(incomeByCurrency[p.currency]||0)+p.amount;

 const needsAttention=buildNeedsAttention({support:supportFlagged,forms:unreadForms,billing:unresolvedBilling,emails:failedEmails24h,backup:backup.status==='healthy'?0:1});

 const mainStats=[
  {label:'Paying customers',value:String(payingCustomers)},
  {label:'On free trial',value:String(onTrial)},
  {label:'New sign-ups (7 days)',value:String(newSignups7d)},
  {label:'Income this month',value:formatIncomeByCurrency(incomeByCurrency)},
 ];
 const secondaryStats=[
  {label:'Total customers',value:users.length},
  {label:'Expired',value:expired},
  {label:'Trial ended',value:trialEnded},
 ];

 return <main className="wp-growth">
  <div className="wp-admin-heading"><div><p className="wp-eyebrow">WAZAP · ADMIN</p><h1>Dashboard</h1><p>What needs you right now, then the numbers.</p></div></div>

  <section className="wp-growth-panel mt-6">
   <h2>Needs attention</h2>
   {needsAttention.length
    ?<div className="wp-attention-list">{needsAttention.map(item=>{const Icon=ICONS[item.key];return <Link prefetch={false} key={item.key} href={item.href} className="wp-attention-row"><Icon size={18}/><span>{item.text}</span><ArrowUpRight size={14}/></Link>;})}</div>
    :<p className="wp-attention-clear"><CheckCircle2 size={18}/>All clear — nothing needs you right now</p>}
  </section>

  <div className="wp-growth-stats mt-6">{mainStats.map(s=><div className="wp-crm-stat" key={s.label}><span>{s.label}</span><strong>{s.value}</strong></div>)}</div>
  <div className="wp-growth-stats wp-growth-stats-secondary mt-4">{secondaryStats.map(s=><div className="wp-crm-stat" key={s.label}><span>{s.label}</span><strong>{s.value}</strong></div>)}</div>
 </main>;
}
