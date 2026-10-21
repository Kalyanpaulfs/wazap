import Link from 'next/link';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {redirect} from 'next/navigation';
import {planDisplayName} from '@/lib/billing';
import {formatAdminDate} from '@/lib/admin-format';
import {paymentStatusInfo, paymentMethodLabel, NON_CHARGE_PAYMENT_STATUSES, isRefundLikeStatus, PAYMENT_STATUS_FILTERS, type PaymentStatusFilter} from '@/lib/admin-payments';
import BillingAttentionList from './BillingAttentionList';
import type {Prisma} from '@prisma/client';

const STATUS_PILL_CLASSES: Record<string,string> = {
 green: '',
 amber: 'border-amber-500 text-amber-300',
 red: 'border-red-500 text-red-400',
 slate: 'border-slate-600 text-slate-400',
};

// Old /admin/crm/billing?plan=... had no exact equivalent once plan changes
// moved to the customer profile - mapped onto the closest Customers list
// segment rather than crashing or silently dropping the filter.
const LEGACY_PLAN_TO_SEGMENT: Record<string,string> = {trial:'trial',basic:'paying',pro:'paying',ultimate:'paying',expired:'expired'};

// Read-only payments ledger (/admin/crm/billing) - plan changes and refunds
// now live only on the customer profile (ChangePlanControl/CustomerPaymentsPanel
// there). This page is "every payment, newest first" plus unresolved billing
// alerts. Old bookmarked links with ?plan=/?autopay=/?status=/?page= from the
// retired combined Billing & plans list still resolve, via redirect to the
// Customers list with the closest equivalent filter.
export default async function BillingWorkspace({query='',autopay='',plan='',status='',page:pageParam=''}:{query?:string;autopay?:string;plan?:string;status?:string;page?:string}){
 const session=await getServerSession(authOptions);if(!(session?.user as {isAdmin?:boolean}|undefined)?.isAdmin)redirect('/login');

 if(plan){
  const params=new URLSearchParams();
  const segment=LEGACY_PLAN_TO_SEGMENT[plan.toLowerCase()];
  if(segment)params.set('segment',segment);
  if(autopay==='on'||autopay==='off')params.set('autopay',autopay);
  const s=params.toString();
  redirect(`/admin/crm/customers${s?`?${s}`:''}`);
 }
 if(autopay==='on'||autopay==='off'){
  redirect(`/admin/crm/customers?autopay=${autopay}`);
 }

 const q=query.trim().slice(0,100);
 const statusFilter:PaymentStatusFilter=PAYMENT_STATUS_FILTERS.some(f=>f.key===status)?(status as PaymentStatusFilter):'all';
 const page=Math.max(1,parseInt(pageParam||'1',10)||1);
 const pageSize=25;

 const buildQs=(overrides:{q?:string|null;status?:string|null;page?:string|null})=>{
  const params=new URLSearchParams();
  const nextQ=overrides.q!==undefined?overrides.q:q;
  const nextStatus=overrides.status!==undefined?overrides.status:(statusFilter==='all'?null:statusFilter);
  const nextPage=overrides.page!==undefined?overrides.page:String(page);
  if(nextQ)params.set('q',nextQ);
  if(nextStatus)params.set('status',nextStatus);
  if(nextPage&&nextPage!=='1')params.set('page',nextPage);
  const s=params.toString();
  return s?`?${s}`:'';
 };

 const where:Prisma.PaymentWhereInput={
  status:{notIn:NON_CHARGE_PAYMENT_STATUSES},
  ...(statusFilter==='active'?{status:'active'}:{}),
  ...(statusFilter==='refunded'?{status:{in:['refunded','partially_refunded','charged_back']}}:{}),
  ...(q?{OR:[{email:{contains:q,mode:'insensitive' as const}},{txId:{contains:q,mode:'insensitive' as const}}]}:{}),
 };

 const [payments,total,attention]=await Promise.all([
  prisma.payment.findMany({
   where,orderBy:{createdAt:'desc'},skip:(page-1)*pageSize,take:pageSize,
   select:{id:true,userId:true,email:true,plan:true,amount:true,currency:true,method:true,status:true,txId:true,createdAt:true},
  }),
  prisma.payment.count({where}),
  prisma.billingAttention.findMany({where:{resolvedAt:null},orderBy:{createdAt:'desc'},take:50}),
 ]);
 const totalPages=Math.max(1,Math.ceil(total/pageSize));

 const userIds=[...new Set(payments.map(p=>p.userId).filter((id):id is string=>Boolean(id)))];
 const users=userIds.length?await prisma.user.findMany({where:{id:{in:userIds}},select:{id:true,name:true,email:true}}):[];
 const userMap=new Map(users.map(u=>[u.id,u]));

 const attentionUserIds=attention.map(a=>a.userId).filter((id):id is string=>Boolean(id));
 const attentionUsers=attentionUserIds.length?await prisma.user.findMany({where:{id:{in:attentionUserIds}},select:{id:true,email:true}}):[];

 return (
  <main className="wp-growth">
   <div className="wp-admin-heading">
    <div>
     <p className="wp-eyebrow">WAZAP · ADMIN</p>
     <h1>Payments</h1>
     <p>Every payment, newest first.</p>
    </div>
   </div>

   {attention.length>0&&(
    <BillingAttentionList items={attention.map(a=>({id:a.id,provider:a.provider,eventType:a.eventType,reason:a.reason,chargeId:a.chargeId,email:a.email,customer:attentionUsers.find(u=>u.id===a.userId)?.email||null,amount:a.amount,currency:a.currency,createdAt:a.createdAt.toISOString()}))}/>
   )}

   <form action="/admin/crm/billing" method="GET" className="flex flex-wrap items-end gap-3 mt-6">
    <label className="wp-crm-label flex-1">
     Search
     <input name="q" defaultValue={q} placeholder="Customer email or payment reference" maxLength={100}/>
    </label>
    {statusFilter!=='all'&&<input type="hidden" name="status" value={statusFilter}/>}
    <button className="wp-primary">Search</button>
    {(q||statusFilter!=='all')&&<Link prefetch={false} href="/admin/crm/billing" className="wp-crm-secondary">Clear filters</Link>}
   </form>

   <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Payment status filter">
    {PAYMENT_STATUS_FILTERS.map(f=>(
     <Link key={f.key} prefetch={false} href={`/admin/crm/billing${buildQs({status:f.key==='all'?null:f.key,page:'1'})}`} aria-pressed={statusFilter===f.key} className={`wp-crm-secondary ${statusFilter===f.key?'is-current':''}`}>
      {f.label}
     </Link>
    ))}
   </div>

   <p className="text-xs text-slate-400 my-5">{total} matching payment{total===1?'':'s'}</p>

   <div className="wp-growth-table-wrap">
    <table className="wp-growth-table">
     <thead>
      <tr><th>Date</th><th>Customer</th><th>Plan</th><th>Amount</th><th>Method</th><th>Status</th></tr>
     </thead>
     <tbody>
      {payments.map(p=>{
       const user=p.userId?userMap.get(p.userId):undefined;
       const statusInfo=paymentStatusInfo(p.status);
       const money=new Intl.NumberFormat(undefined,{style:'currency',currency:p.currency||'USD'}).format(p.amount);
       return (
        <tr key={p.id}>
         <td>{formatAdminDate(p.createdAt)}</td>
         <td>
          {user?(
           <>
            <strong><Link prefetch={false} href={`/admin/crm/customers/${user.id}`} className="hover:text-[#25D366] transition-colors">{user.name||user.email}</Link></strong>
            <p className="text-xs text-slate-400 mt-1">{user.email}</p>
           </>
          ):(
           <>
            <strong className="text-slate-400">Deleted customer</strong>
            <p className="text-xs text-slate-500 mt-1">{p.email}</p>
           </>
          )}
         </td>
         <td>{planDisplayName(p.plan)}</td>
         <td>{money}</td>
         <td>{paymentMethodLabel(p.method)}</td>
         <td>
          <span className={`wp-crm-pill ${STATUS_PILL_CLASSES[statusInfo.tone]}`}>{statusInfo.label}</span>
          {p.txId&&<p className="text-xs text-slate-500 mt-1 break-all" title={p.txId}>{p.txId.length>22?`${p.txId.slice(0,22)}…`:p.txId}</p>}
          {isRefundLikeStatus(p.status)&&<span className="sr-only">Money returned to the customer</span>}
         </td>
        </tr>
       );
      })}
     </tbody>
    </table>
    {!payments.length&&(
     <div className="wp-growth-empty">
      <h3>No payments found</h3>
      <p>No payment records match the current search or filter.</p>
      {(q||statusFilter!=='all')&&<Link prefetch={false} href="/admin/crm/billing">Clear filters</Link>}
     </div>
    )}
   </div>

   {totalPages>1&&(
    <div className="wp-crm-pagination mt-4">
     <Link prefetch={false} href={`/admin/crm/billing${buildQs({page:String(page-1)})}`} aria-disabled={page<=1} className={page<=1?'opacity-50 pointer-events-none':''}>Previous</Link>
     <span>Page {page} / {totalPages}</span>
     <Link prefetch={false} href={`/admin/crm/billing${buildQs({page:String(page+1)})}`} aria-disabled={page>=totalPages} className={page>=totalPages?'opacity-50 pointer-events-none':''}>Next</Link>
    </div>
   )}
  </main>
 );
}
