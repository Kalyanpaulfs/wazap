"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowUpRight, BarChart3, Blocks, ChevronRight, Headphones, Inbox, LayoutDashboard, Link2, MessageCircle, Settings, ShieldCheck, Users, Workflow, Wrench } from "lucide-react";
import Navbar from "../Navbar";
import CrmNavigation from "../admin/crm/CrmNavigation";
import SignOutButton from "../dashboard/SignOutButton";

const destinations = [
  {label:"Overview",href:"/dashboard",icon:LayoutDashboard},
  {label:"Lead routing",href:"/tools/rotator",icon:Link2},
  {label:"My CRM",href:"/tools/follow-up",icon:Users},
  {label:"Team inbox",href:"/inbox",icon:Inbox},
  {label:"Channels",href:"/channels",icon:Blocks},
  {label:"Automations",href:"/automations",icon:Workflow},
  {label:"Reports",href:"/reports",icon:BarChart3},
  {label:"All tools",href:"/tools",icon:Wrench},
];
const privateRoutes = /^\/(dashboard|account|admin|workspace|inbox|channels|automations|reports|analytics|operations|partners)(\/|$)/;

export default function AppFrame({children,footer}:{children:React.ReactNode;footer:React.ReactNode}) {
  const path = usePathname();
  const {data:session} = useSession();
  const appRoute = privateRoutes.test(path) || Boolean(session?.user && /^\/tools(\/|$)/.test(path));
  if (/^\/(login|signup|register)(\/|$)/.test(path)) return <>{children}</>;
  if (!appRoute) return <><Navbar />{children}{footer}</>;
  const isAdmin = Boolean((session?.user as {isAdmin?:boolean}|undefined)?.isAdmin);
  const staffRoute=isAdmin && path.startsWith("/admin");
  const active = (href:string) => path===href || (href!=="/tools" && href!=="/dashboard" && path.startsWith(href+"/"));
  const crmTitles:Record<string,string>={overview:"CRM overview",support:"Support",pipeline:"Sales pipeline","follow-ups":"Follow-ups",audiences:"Audiences",campaigns:"Campaigns",reports:"Reports",billing:"Billing & plans",settings:"CRM settings"};
  const title = path.startsWith("/admin/crm") ? (crmTitles[path.split("/")[3]]||"Contacts") : path.startsWith("/admin") ? "Platform admin" : destinations.find(item=>active(item.href))?.label || ({"/account":"Account & data","/workspace":"Workspace","/operations":"Operations","/analytics":"Analytics","/partners":"Partners"}[path]) || "Workspace";
  const customerLinks = <><p className="wp-nav-label">WORKSPACE</p>{destinations.map(item=><Link key={item.href} href={item.href} aria-current={active(item.href)?"page":undefined} className={`wp-nav-link ${active(item.href)?"is-active":""}`} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")}><item.icon size={18}/>{item.label}{active(item.href)&&<ChevronRight size={14}/>}</Link>)}<p className="wp-nav-label wp-nav-manage">MANAGE</p><Link className={`wp-nav-link ${active("/workspace")?"is-active":""}`} href="/workspace" aria-current={active("/workspace")?"page":undefined}><Users size={18}/>Team & workspace</Link><Link className={`wp-nav-link ${active("/account")?"is-active":""}`} href="/account" aria-current={active("/account")?"page":undefined}><Settings size={18}/>Account & data</Link><Link className="wp-nav-link" href="/dashboard#billing"><Settings size={18}/>Billing & plan</Link>{isAdmin&&<Link prefetch={false} className={`wp-nav-link ${path.startsWith("/admin/crm")?"is-active":""}`} href="/admin/crm/overview" aria-current={path.startsWith("/admin/crm")?"page":undefined}><Users size={18}/>Wazap CRM</Link>}{isAdmin&&<Link prefetch={false} className={`wp-nav-link ${path.startsWith("/admin")&&!path.startsWith("/admin/crm")?"is-active":""}`} href="/admin" aria-current={path.startsWith("/admin")?"page":undefined}><ShieldCheck size={18}/>Platform admin</Link>}<Link className="wp-nav-link" href="/support"><Headphones size={18}/>Help & support</Link></>;
  const staffLinks=<><p className="wp-nav-label">WAZAP CRM</p><CrmNavigation/><p className="wp-nav-label wp-nav-manage">PLATFORM</p><Link prefetch={false} className={`wp-nav-link ${path==='/admin'?'is-active':''}`} href="/admin" aria-current={path==='/admin'?'page':undefined}><ShieldCheck size={18}/>Platform admin</Link><p className="wp-nav-label wp-nav-manage">WORKSPACE PREVIEW</p><Link className="wp-nav-link" href="/dashboard?workspace=1"><LayoutDashboard size={18}/>Preview my workspace</Link><Link className="wp-nav-link" href="/account"><Settings size={18}/>My account</Link></>;
  const links=staffRoute?staffLinks:customerLinks;
  return <div className="wp-shell">
    <aside className="wp-sidebar"><Link href={isAdmin?"/admin/crm/overview":"/dashboard"} className="wp-brand"><MessageCircle size={27}/><span>Wazap<span className="wp-brand-caption">{staffRoute?"WAZAP OPERATIONS":"BUSINESS WORKSPACE"}</span></span></Link><nav aria-label="Workspace navigation">{links}</nav><div className="wp-sidebar-bottom"><Link href="/" className="wp-site-link">Visit website <ArrowUpRight size={15}/></Link><SignOutButton/></div></aside>
    <div className="wp-main"><header className="wp-topbar"><div className="wp-breadcrumb"><span>{staffRoute?"Wazap operations":"Workspace"}</span><ChevronRight size={14}/><strong>{title}</strong></div><Link className="wp-profile" href="/account" aria-label="Open account settings"><span className="wp-avatar">{(session?.user?.name||session?.user?.email||"W").slice(0,1).toUpperCase()}</span><span>{session?.user?.name||"My account"}</span></Link></header>
      <details className="wp-mobile-nav"><summary>{staffRoute?"Operations menu":"Workspace menu"} <ChevronRight size={16}/></summary><nav aria-label="Mobile workspace navigation" onClick={event=>{if((event.target as HTMLElement).closest("a"))event.currentTarget.closest("details")?.removeAttribute("open");}}>{links}<SignOutButton/></nav></details>
      <div className="wp-content">{children}</div>
      <div className="wp-app-footer"><span>Wazap · Business conversations, organised.</span><Link href="/support">Get support</Link></div>
    </div>
  </div>;
}
