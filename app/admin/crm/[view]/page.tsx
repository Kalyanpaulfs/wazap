import {notFound} from 'next/navigation';
import SupportWorkspace from '../SupportWorkspace';
import BillingWorkspace from "../BillingWorkspace";
import GrowthWorkspace from '../GrowthWorkspace';
export const metadata={title:'CRM & growth — Wazap',robots:{index:false,follow:false}};
export default async function GrowthPage({params,searchParams}:{params:Promise<{view:string}>;searchParams:Promise<{q?:string}>}){const {view}=await params;if(view==='billing')return <BillingWorkspace query={(await searchParams).q}/>;if(view==='support')return <SupportWorkspace/>;if(!['overview','pipeline','follow-ups','audiences','campaigns','reports','settings'].includes(view))notFound();return <GrowthWorkspace view={view}/>;}
