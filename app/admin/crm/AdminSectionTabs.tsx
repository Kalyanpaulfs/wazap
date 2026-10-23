'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

type Tab={label:string;href:string;match:(p:string)=>boolean};
type Group={match:(p:string)=>boolean;tabs:Tab[]};

// Within-group tabs for the 5-item admin menu (kalyan.md step 22). No tabs
// on Dashboard or Support - each of those is a single page.
const groups:Group[]=[
 {match:p=>p.startsWith('/admin/crm/customers')||p.startsWith('/admin/crm/billing'),tabs:[
  {label:'Customers',href:'/admin/crm/customers',match:p=>p.startsWith('/admin/crm/customers')},
  {label:'Payments',href:'/admin/crm/billing',match:p=>p.startsWith('/admin/crm/billing')},
 ]},
 {match:p=>p==='/admin/crm'||p.startsWith('/admin/crm/broadcast'),tabs:[
  {label:'Broadcasts',href:'/admin/crm/broadcast',match:p=>p.startsWith('/admin/crm/broadcast')},
  {label:'Contacts',href:'/admin/crm',match:p=>p==='/admin/crm'},
 ]},
 {match:p=>p.startsWith('/admin/crm/reports')||p.startsWith('/admin/crm/health')||p.startsWith('/admin/crm/short-links'),tabs:[
  {label:'Reports',href:'/admin/crm/reports',match:p=>p.startsWith('/admin/crm/reports')},
  {label:'System health',href:'/admin/crm/health',match:p=>p.startsWith('/admin/crm/health')},
  {label:'Short links',href:'/admin/crm/short-links',match:p=>p.startsWith('/admin/crm/short-links')},
 ]},
];

// /admin/crm/customers/<id> is the customer detail page - no section tabs there.
function isCustomerDetail(path:string){
 const parts=path.split('/').filter(Boolean);
 return parts[0]==='admin'&&parts[1]==='crm'&&parts[2]==='customers'&&parts.length>3;
}

export default function AdminSectionTabs(){
 const path=usePathname();
 if(isCustomerDetail(path))return null;
 const group=groups.find(g=>g.match(path));
 if(!group)return null;
 return <div className="wp-section-tabs-wrap"><nav className="wp-section-tabs" aria-label="Section">{group.tabs.map(tab=>{const current=tab.match(path);return <Link key={tab.href} prefetch={false} href={tab.href} aria-current={current?'page':undefined} className={`wp-section-tab ${current?'is-active':''}`}>{tab.label}</Link>;})}</nav></div>;
}
