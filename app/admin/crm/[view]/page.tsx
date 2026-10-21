import {notFound,redirect} from 'next/navigation';
import SupportWorkspace from '../SupportWorkspace';
import BillingWorkspace from "../BillingWorkspace";
import GrowthWorkspace from '../GrowthWorkspace';
import SystemHealthWorkspace from '../SystemHealthWorkspace';
import Dashboard from '../Dashboard';
import ReportsWorkspace from '../ReportsWorkspace';
export const metadata={title:'CRM & growth',robots:{index:false,follow:false}};
// Pipeline, Follow-ups and Settings were retired when the CRM moved to 6 tabs.
// Audiences and Campaigns merged into Broadcast; old links still resolve there.
// Overview became the Dashboard (admin menu step 22) - its own component now,
// not GrowthWorkspace. Reports became its own component (ReportsWorkspace)
// for the same reason.
export default async function GrowthPage({params,searchParams}:{params:Promise<{view:string}>;searchParams:Promise<{q?:string;autopay?:string;plan?:string;status?:string;page?:string}>}){const {view}=await params;if(view==='customers')redirect('/admin/crm/customers');if(view==='billing'){const sp=await searchParams;return <BillingWorkspace query={sp.q} autopay={sp.autopay} plan={sp.plan} status={sp.status} page={sp.page}/>;}if(view==='support')return <SupportWorkspace/>;if(view==='health')return <SystemHealthWorkspace/>;if(view==='overview')return <Dashboard/>;if(view==='reports')return <ReportsWorkspace/>;if(['audiences','campaigns'].includes(view))redirect('/admin/crm/broadcast');if(view!=='broadcast')notFound();return <GrowthWorkspace view={view}/>;}
