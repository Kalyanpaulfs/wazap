import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {redirect} from 'next/navigation';
import {prisma} from '@/lib/prisma';
import {backupRestoreStatus} from '@/lib/system-operations';
const fmt=(d:Date|string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(d))+' UTC';
export default async function SystemHealthWorkspace(){
 const session=await getServerSession(authOptions);if(!(session?.user as {isAdmin?:boolean}|undefined)?.isAdmin)redirect('/login');
 const now=new Date();const since24h=new Date(now.getTime()-24*3600000);
 const [backup,sent24h,waitingNow,oldestWaiting,failed24h]=await Promise.all([
  backupRestoreStatus(),
  prisma.outboundEmail.count({where:{status:{in:['accepted','sent']},sentAt:{gte:since24h}}}),
  prisma.outboundEmail.count({where:{status:'queued'}}),
  prisma.outboundEmail.findFirst({where:{status:'queued'},orderBy:{createdAt:'asc'},select:{createdAt:true}}),
  prisma.outboundEmail.count({where:{status:{in:['failed','deferred','unknown']},createdAt:{gte:since24h},NOT:[{recipient:{endsWith:'.invalid'}},{recipient:{endsWith:'@example.com'}},{type:{startsWith:'delivery_test'}}]}}),
 ]);
 const oldestWaitingMinutes=oldestWaiting?Math.round((now.getTime()-oldestWaiting.createdAt.getTime())/60000):null;
 const stuck=oldestWaitingMinutes!==null&&oldestWaitingMinutes>15;
 const emailTone=failed24h>0?'red':stuck?'amber':'green';
 const emailHeadline=failed24h>0?`${failed24h} email${failed24h===1?'':'s'} failed to send in the last 24 hours.`:stuck?`${waitingNow} email${waitingNow===1?'':'s'} waiting to send — the oldest has been queued ${oldestWaitingMinutes} minutes.`:`${sent24h} email${sent24h===1?'':'s'} sent in the last 24 hours. Nothing is stuck.`;
 const emailHint=(failed24h>0||stuck)?'Emails are stuck — login codes may not reach customers.':null;
 const backupTone=backup.status==='healthy'?'green':backup.status==='failed'?'red':backup.status==='missing'?'grey':'amber';
 const backupHeadline=backup.status==='healthy'?`Your data is safely backed up — last tested ${fmt(backup.verifiedAt!)}.`:backup.status==='failed'?`Backup check failed — ${backup.reason||'the last restore test did not succeed.'}`:backup.status==='missing'?'No backup check found yet.':`Backup check is stale — last tested ${backup.verifiedAt?fmt(backup.verifiedAt):'never'}.`;
 const tones:Record<string,string>={green:'border-accent/30 bg-accent-soft text-accent',amber:'border-warning/30 bg-highlight-soft text-warning',red:'border-danger/30 bg-danger/10 text-danger',grey:'border-border-strong bg-surface/40 text-muted'};
 return <main className="wp-growth">
 <div className="wp-admin-heading"><div><p className="wp-eyebrow">WAZAP · SYSTEM HEALTH</p><h1>System health</h1><p>Two plain checks: can we recover your data, and are emails actually going out.</p></div></div>
 <div className="grid gap-4 mt-6 lg:grid-cols-2">
  <section className={`rounded-2xl border p-5 ${tones[backupTone]}`}>
   <h2 className="font-semibold text-text">Backups</h2>
   <p className="mt-2 text-sm text-text">{backupHeadline}</p>
   {backup.durationSeconds!=null&&backup.status==='healthy'&&<p className="mt-2 text-xs text-muted">Restore verified in {backup.durationSeconds}s{backup.backup?` · ${backup.backup}`:''}.</p>}
  </section>
  <section className={`rounded-2xl border p-5 ${tones[emailTone]}`}>
   <h2 className="font-semibold text-text">Emails</h2>
   <p className="mt-2 text-sm text-text">{emailHeadline}</p>
   {emailHint&&<p className="mt-1 text-xs font-semibold">{emailHint}</p>}
   <div className="wp-growth-stats mt-4">
    <div className="wp-crm-stat"><span>Sent · 24h</span><strong>{sent24h}</strong></div>
    <div className="wp-crm-stat"><span>Waiting now</span><strong>{waitingNow}</strong></div>
    <div className="wp-crm-stat"><span>Failed · 24h</span><strong>{failed24h}</strong></div>
   </div>
  </section>
 </div>
 </main>;
}
