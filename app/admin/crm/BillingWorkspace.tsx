import Link from 'next/link';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {redirect} from 'next/navigation';
import {effectivePlan,isProductTrialActive} from '@/lib/entitlements';
import {isPlanExpired,planDisplayName} from '@/lib/billing';
import {customerPlanLabel} from '@/lib/admin-customer';
import BillingAttentionList from './BillingAttentionList';
import ChangePlanControl from './ChangePlanControl';
import CustomerPaymentsPanel from './CustomerPaymentsPanel';

export default async function BillingWorkspace({query='',autopay='',plan=''}:{query?:string;autopay?:string;plan?:string}){
 const session=await getServerSession(authOptions);if(!(session?.user as {isAdmin?:boolean}|undefined)?.isAdmin)redirect('/login');
 const q=query.trim().slice(0,100);
 const autopayFilter=autopay==='on'||autopay==='off'?autopay:null;
 const planFilter=['trial','basic','pro','ultimate','expired'].includes(plan.toLowerCase())?plan.toLowerCase():null;

 const buildQs=(overrides:{q?:string;autopay?:string|null;plan?:string|null})=>{
  const params=new URLSearchParams();
  const nextQ=overrides.q!==undefined?overrides.q:q;
  const nextAutopay=overrides.autopay!==undefined?overrides.autopay:autopayFilter;
  const nextPlan=overrides.plan!==undefined?overrides.plan:planFilter;
  if(nextQ)params.set('q',nextQ);
  if(nextAutopay)params.set('autopay',nextAutopay);
  if(nextPlan)params.set('plan',nextPlan);
  const s=params.toString();
  return s?`?${s}`:'';
 };

 const digitsOnly=q.replace(/\D/g,'');
 const matchingLeadEmails=q
  ?(await prisma.crmLead.findMany({
    where:{OR:[{phone:{contains:q,mode:'insensitive' as const}},...(digitsOnly.length>=3?[{phone:{contains:digitsOnly}}]:[])]},
    select:{email:true},
    take:200,
   })).map(l=>l.email.toLowerCase())
  :[];

 const where={
  isAdmin:false,
  ...(q
   ?{
     OR:[
      {email:{contains:q,mode:'insensitive' as const}},
      {name:{contains:q,mode:'insensitive' as const}},
      {shortLinks:{some:{phone:{contains:q,mode:'insensitive' as const}}}},
      {adLinks:{some:{number:{contains:q,mode:'insensitive' as const}}}},
      ...(digitsOnly.length>=3?[{rotatorLinks:{some:{numbers:{has:digitsOnly}}}}]:[]),
      ...(matchingLeadEmails.length>0?[{email:{in:matchingLeadEmails}}]:[]),
     ],
    }
   :{}),
 };

 const [users,total]=await Promise.all([
  prisma.user.findMany({
   where,
   orderBy:{createdAt:'desc'},
   take:100,
   select:{
    id:true,name:true,email:true,plan:true,planExpiresAt:true,trialPlan:true,trialEndsAt:true,createdAt:true,
    payments:{orderBy:{createdAt:'desc'},take:5,select:{id:true,plan:true,amount:true,currency:true,method:true,status:true,txId:true,activatedAt:true,createdAt:true}},
   },
  }),
  prisma.user.count({where}),
 ]);

 const attention=await prisma.billingAttention.findMany({where:{resolvedAt:null},orderBy:{createdAt:'desc'},take:50});
 const attentionUsers=await prisma.user.findMany({where:{id:{in:attention.map(a=>a.userId).filter((id):id is string=>Boolean(id))}},select:{id:true,email:true}});
 const contacts=await prisma.crmLead.findMany({where:{email:{in:users.map(u=>u.email.toLowerCase())}},select:{id:true,email:true,phone:true}});

 const pointers=await prisma.securityUserBilling.findMany({where:{userId:{in:users.map(u=>u.id)}}});
 const activeSubPayments=pointers.length?await prisma.payment.findMany({where:{userId:{in:pointers.map(p=>p.userId)},status:'subscription_active',method:{in:['paypal','dodo']}},select:{userId:true,method:true,txId:true}}):[];
 function autopayStateFor(userId:string):boolean|null{
  const pointer=pointers.find(p=>p.userId===userId);
  if(!pointer)return null;
  const live=activeSubPayments.some(p=>p.userId===userId&&p.method===pointer.provider&&p.txId===pointer.subscriptionId);
  return live?pointer.autoRenew:null;
 }

 function matchesPlan(u:(typeof users)[number],filter:string|null):boolean{
  if(!filter)return true;
  const trial=isProductTrialActive(u);
  const expired=isPlanExpired(u.plan,u.planExpiresAt)||(u.plan==='free'&&!trial);
  if(filter==='trial')return trial;
  if(filter==='expired')return expired;
  if(trial||expired)return false;
  if(filter==='basic')return u.plan==='basic';
  if(filter==='pro')return u.plan==='pro';
  if(filter==='ultimate')return u.plan==='ultimate'||u.plan==='business';
  return true;
 }

 const visibleUsers=users.filter(u=>{
  if(autopayFilter&&(autopayFilter==='on'?autopayStateFor(u.id)!==true:autopayStateFor(u.id)!==false))return false;
  if(planFilter&&!matchesPlan(u,planFilter))return false;
  return true;
 });

 return (
  <main className="wp-growth">
   <div className="wp-admin-heading">
    <div>
     <p className="wp-eyebrow">CUSTOMER SUBSCRIPTIONS</p>
     <h1>Billing & plans</h1>
     <p>Customer access, trials and recorded payment status in one place.</p>
    </div>
   </div>
   <div className="wp-growth-callout mt-6">
    <strong>Wazap customer billing</strong>
    <p className="text-xs leading-6 mt-2">These are your customers’ Wazap accounts. Plan access and recorded payments are separate: a trial or manual grant does not confirm payment. Use “Change plan” on a row to grant, change or revoke access manually. Customers manage their own billing through their workspace.</p>
   </div>
   <BillingAttentionList items={attention.map(a=>({id:a.id,provider:a.provider,eventType:a.eventType,reason:a.reason,chargeId:a.chargeId,email:a.email,customer:attentionUsers.find(u=>u.id===a.userId)?.email||null,amount:a.amount,currency:a.currency,createdAt:a.createdAt.toISOString()}))}/>
   <form action="/admin/crm/billing" method="GET" className="flex flex-wrap items-end gap-3 mt-6">
    <label className="wp-crm-label flex-1">Find a customer
     <input name="q" defaultValue={q} placeholder="Search customer name, email or phone" maxLength={100}/>
    </label>
    {planFilter&&<input type="hidden" name="plan" value={planFilter}/>}
    {autopayFilter&&<input type="hidden" name="autopay" value={autopayFilter}/>}
    <button className="wp-primary">Search accounts</button>
    {(q||planFilter||autopayFilter)&&<Link prefetch={false} href="/admin/crm/billing" className="wp-crm-secondary">Clear filters</Link>}
   </form>
   <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Plan filter">
    {[
     ['','All'],
     ['trial','Free trial'],
     ['basic','Solo'],
     ['pro','Growth'],
     ['ultimate','Agency'],
     ['expired','Expired'],
    ].map(([key,lbl])=>(
     <Link
      key={key}
      prefetch={false}
      href={`/admin/crm/billing${buildQs({plan:key||null})}`}
      aria-pressed={(!planFilter&&!key)||planFilter===key}
      className={`wp-crm-secondary ${((!planFilter&&!key)||planFilter===key)?'is-current':''}`}
     >
      {lbl}
     </Link>
    ))}
   </div>
   <div className="flex gap-2 mt-3" role="group" aria-label="Auto-pay filter">
    <Link prefetch={false} href={`/admin/crm/billing${buildQs({autopay:null})}`} aria-pressed={!autopayFilter} className={`wp-crm-secondary ${!autopayFilter?'is-current':''}`}>All auto-pay</Link>
    <Link prefetch={false} href={`/admin/crm/billing${buildQs({autopay:'on'})}`} aria-pressed={autopayFilter==='on'} className={`wp-crm-secondary ${autopayFilter==='on'?'is-current':''}`}>Auto-pay on</Link>
    <Link prefetch={false} href={`/admin/crm/billing${buildQs({autopay:'off'})}`} aria-pressed={autopayFilter==='off'} className={`wp-crm-secondary ${autopayFilter==='off'?'is-current':''}`}>Auto-pay off</Link>
   </div>
   <p className="text-xs text-muted my-5">{total} matching accounts · Showing {visibleUsers.length} of the latest {users.length}</p>
   <div className="wp-growth-table-wrap">
    <table className="wp-growth-table">
     <thead>
      <tr>
       <th>Customer</th>
       <th>Current access</th>
       <th>Access until</th>
       <th>Auto-pay</th>
       <th>Payment record</th>
       <th>Actions</th>
      </tr>
     </thead>
     <tbody>
      {visibleUsers.map(u=>{
       const trial=isProductTrialActive(u);
       const expired=isPlanExpired(u.plan,u.planExpiresAt);
       const plan=expired?'free':effectivePlan(u);
       const displayPlan=customerPlanLabel(u);
       const payment=u.payments.find(p=>p.status==='active'&&p.txId&&['paypal','dodo'].includes(p.method));
       const contact=contacts.find(c=>c.email===u.email.toLowerCase());
       const autopayState=autopayStateFor(u.id);
       return (
        <tr key={u.id}>
         <td>
          <strong>
           <Link prefetch={false} href={`/admin/crm/customers/${u.id}`} className="hover:text-accent transition-colors">
            {u.name||u.email}
           </Link>
          </strong>
          <p className="text-xs mt-1 text-muted">{u.email}</p>
          {contact?.phone&&<p className="text-xs mt-0.5 text-muted">{contact.phone}</p>}
         </td>
         <td>
          <strong>{displayPlan}</strong>
          <p className="text-xs mt-1 text-muted">{trial?'Trial':expired?'Previous access expired':plan==='free'?'Trial ended':payment?'Subscription recorded':'Access grant · payment unconfirmed'}</p>
         </td>
         <td>{(trial?u.trialEndsAt:u.planExpiresAt)?.toLocaleDateString('en-GB')||'No expiry recorded'}</td>
         <td>{autopayState===null?'—':autopayState?'On':'Off'}</td>
         <td>
          {payment?(
           <>
            <strong>{payment.method==='dodo'?'Dodo':'PayPal'} · {planDisplayName(payment.plan)}</strong>
            <p className="text-xs text-muted mt-1">{payment.currency} {payment.amount.toFixed(2)} · {payment.status} · {(payment.activatedAt||payment.createdAt).toLocaleDateString('en-GB')}</p>
            <details className="text-xs mt-2">
             <summary>Payment reference</summary>
             <p className="break-all mt-2">{payment.txId}</p>
            </details>
           </>
          ):(
           <span className="text-muted text-xs">{u.payments[0]?`Latest record: ${u.payments[0].status} · ${u.payments[0].method}`:'No subscription payment recorded'}</span>
          )}
         </td>
         <td>
          <div className="flex flex-col gap-2.5">
           <Link prefetch={false} href={`/admin/crm/customers/${u.id}`} className="font-semibold text-xs text-accent hover:underline">Customer profile →</Link>
           <ChangePlanControl userId={u.id} currentPlan={plan}/>
           <CustomerPaymentsPanel userId={u.id}/>
           {contact&&<Link prefetch={false} href={`/admin/crm?lead=${contact.id}`}>CRM contact →</Link>}
           <Link prefetch={false} href={`/admin/crm/support?email=${encodeURIComponent(u.email)}`}>Support inbox →</Link>
          </div>
         </td>
        </tr>
       );
      })}
     </tbody>
    </table>
    {!visibleUsers.length&&(
     <div className="wp-growth-empty">
      <h3>No customer accounts found</h3>
      <p>A CRM prospect can exist before they create a Wazap account. Search their account email or clear the search.</p>
     </div>
    )}
   </div>
  </main>
 );
}
