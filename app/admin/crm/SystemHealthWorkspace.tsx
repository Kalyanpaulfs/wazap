import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {redirect} from 'next/navigation';
import {prisma} from '@/lib/prisma';
import {backupRestoreStatus} from '@/lib/system-operations';
import HealthCard from './HealthCard';
const fmt=(d:Date|string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(d))+' UTC';
export default async function SystemHealthWorkspace(){
 const session=await getServerSession(authOptions);if(!(session?.user as {isAdmin?:boolean}|undefined)?.isAdmin)redirect('/login');
 const now=new Date();const since24h=new Date(now.getTime()-24*3600000);
 const [backup,sent24h,waitingNow,oldestWaiting,failed24h]=await Promise.all([
  backupRestoreStatus(),
  prisma.outboundEmail.count({where:{status:{in:['accepted','sent','delivered']},sentAt:{gte:since24h}}}),
  prisma.outboundEmail.count({where:{status:'queued'}}),
  prisma.outboundEmail.findFirst({where:{status:'queued'},orderBy:{createdAt:'asc'},select:{createdAt:true}}),
  prisma.outboundEmail.count({where:{status:{in:['failed','deferred','unknown']},createdAt:{gte:since24h},NOT:[{recipient:{endsWith:'.invalid'}},{recipient:{endsWith:'@example.com'}},{type:{startsWith:'delivery_test'}}]}}),
 ]);

 // Backups: the restore-test record only ever exists on the live server (it
 // lives at a fixed Linux path - see lib/system-operations.ts), so "missing"
 // during local development just means "not applicable here", not a real
 // problem - shown as a neutral note rather than something to worry about.
 const isLocalDev=process.env.NODE_ENV!=='production';
 const backupDetails=<>
  <p className="text-xs text-slate-400">Last tested: {backup.verifiedAt?fmt(backup.verifiedAt):'never'}</p>
  {backup.durationSeconds!=null&&<p className="text-xs text-slate-400">Restore verified in {backup.durationSeconds}s{backup.backup?` · ${backup.backup}`:''}.</p>}
  {backup.reason&&<p className="text-xs text-slate-400">{backup.reason}</p>}
 </>;
 let backupTone:'green'|'amber'|'red'|'grey',backupHeadline:string,backupSentence:string;
 if(isLocalDev&&backup.status==='missing'){backupTone='grey';backupHeadline='Backups run on the live server';backupSentence='This check only works on the live site, not during local development.';}
 else if(backup.status==='healthy'){backupTone='green';backupHeadline='Backups are working';backupSentence='Your data is backed up and a test restore succeeded recently.';}
 else if(backup.status==='stale'){backupTone='amber';backupHeadline='Backups need checking';backupSentence='The last successful backup test was a while ago. Tell your developer.';}
 else if(backup.status==='failed'){backupTone='red';backupHeadline='Backups need checking';backupSentence='The last backup test did not succeed. Tell your developer.';}
 else{backupTone='amber';backupHeadline='Backups need checking';backupSentence='No backup test has been recorded yet. Tell your developer.';}

 const oldestWaitingMinutes=oldestWaiting?Math.round((now.getTime()-oldestWaiting.createdAt.getTime())/60000):null;
 const stuck=oldestWaitingMinutes!==null&&oldestWaitingMinutes>15;
 const emailDetails=<>
  <p className="text-xs text-slate-400">Sent in the last 24 hours: {sent24h}</p>
  <p className="text-xs text-slate-400">Waiting to send right now: {waitingNow}</p>
  <p className="text-xs text-slate-400">Failed in the last 24 hours: {failed24h}</p>
  {oldestWaitingMinutes!==null&&<p className="text-xs text-slate-400">Oldest waiting email: queued {oldestWaitingMinutes} minutes ago.</p>}
 </>;
 let emailTone:'green'|'amber'|'red'|'grey',emailHeadline:string,emailSentence:string;
 // Locally, Brevo refuses this machine's IP, so emails always wait or fail here.
 if(isLocalDev&&(failed24h>0||stuck)){emailTone='grey';emailHeadline='Emails send from the live server';emailSentence='Emails only go out from the live site, not during local development.';}
 else if(failed24h>0){emailTone='red';emailHeadline='Emails need checking';emailSentence=`${failed24h} email${failed24h===1?'':'s'} failed to send in the last 24 hours. Tell your developer.`;}
 else if(stuck){emailTone='amber';emailHeadline='Emails are stuck';emailSentence='Some emails have been waiting to send for a while. Tell your developer - login codes may not reach customers.';}
 else{emailTone='green';emailHeadline='Emails are working';emailSentence=`${sent24h} email${sent24h===1?'':'s'} sent in the last 24 hours. Nothing is stuck.`;}

 return <main className="wp-growth">
 <div className="wp-admin-heading"><div><p className="wp-eyebrow">WAZAP · SYSTEM HEALTH</p><h1>System health</h1><p>Two plain checks: can we recover your data, and are emails actually going out.</p></div></div>
 <div className="grid gap-4 mt-6 lg:grid-cols-2">
  <HealthCard tone={backupTone} title="Backups" headline={backupHeadline} sentence={backupSentence} details={backupDetails}/>
  <HealthCard tone={emailTone} title="Emails" headline={emailHeadline} sentence={emailSentence} details={emailDetails}/>
 </div>
 </main>;
}
