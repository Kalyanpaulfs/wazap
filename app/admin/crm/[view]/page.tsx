import {notFound,redirect} from 'next/navigation';
import SupportWorkspace from '../SupportWorkspace';
import BillingWorkspace from "../BillingWorkspace";
import GrowthWorkspace from '../GrowthWorkspace';
import SystemHealthWorkspace from '../SystemHealthWorkspace';
export const metadata={title:'CRM & growth — Wazap',robots:{index:false,follow:false}};
// Pipeline, Follow-ups and Settings were retired when the CRM moved to 6 tabs.
// Audiences and Campaigns merged into Broadcast; old links still resolve there.
export default async function GrowthPage({params,searchParams}:{params:Promise<{view:string}>;searchParams:Promise<{q?:string}>}){const {view}=await params;if(view==='billing')return <BillingWorkspace query={(await searchParams).q}/>;if(view==='support')return <SupportWorkspace/>;if(view==='health')return <SystemHealthWorkspace/>;if(['audiences','campaigns'].includes(view))redirect('/admin/crm/broadcast');if(!['overview','broadcast','reports'].includes(view))notFound();return <GrowthWorkspace view={view}/>;}
