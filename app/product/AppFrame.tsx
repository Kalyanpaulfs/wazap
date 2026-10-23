"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowUpRight, BarChart3, ChevronRight, CreditCard, Headphones, LayoutDashboard, LayoutGrid, Link2, MessageCircle, Settings, Users } from "lucide-react";
import Navbar from "../Navbar";
import CrmNavigation from "../admin/crm/CrmNavigation";
import SignOutButton from "../dashboard/SignOutButton";

// "All tools" is highlighted for /tools, every /tools/* subpage AND /qr
// (its own top-level route) - but /tools/widget and /qr still get their
// own specific top-bar titles from the dictionary below, since the title
// lookup uses `titleTest` (exact /tools only), not this broader `activeTest`.
const allToolsActive = (path: string) => path === "/tools" || path.startsWith("/tools/") || path === "/qr" || path.startsWith("/qr/") || path === "/outreach";

const destinations = [
  {label:"Home",href:"/dashboard",icon:LayoutDashboard},
  {label:"My links",href:"/links",icon:Link2},
  {label:"All tools",href:"/tools",icon:LayoutGrid,activeTest:allToolsActive,titleTest:(path:string)=>path==="/tools"},
  {label:"Results",href:"/results",icon:BarChart3},
];
const privateRoutes = /^\/(dashboard|account|admin|workspace|reports|analytics|operations|partners|performance|plans|billing|links|results|outreach)(\/|$)/;

// Private routes and Help & support pages pick their frame on the server
// (app/product/WorkspaceFrame.tsx, app/support/SupportFrame.tsx), so a
// refresh never flashes the public navbar or "My account" before the
// client session loads.
const serverFramedRoutes = /^\/(support|contact|tools|qr|refund|privacy|terms|about|acceptable-use)(\/|$)/;

export type ShellUser = { name?: string | null; email?: string | null; isAdmin?: boolean };

export default function AppFrame({children,footer}:{children:React.ReactNode;footer:React.ReactNode}) {
  const path = usePathname();
  if (/^\/(login|signup|register)(\/|$)/.test(path) || serverFramedRoutes.test(path) || privateRoutes.test(path)) return <>{children}</>;
  return <><Navbar />{children}{footer}</>;
}

export function AppShell({children,user}:{children:React.ReactNode;user?:ShellUser}) {
  const path = usePathname();
  const {data:session} = useSession();
  const shellUser:ShellUser = session?.user ? {name:session.user.name,email:session.user.email,isAdmin:(session.user as {isAdmin?:boolean}).isAdmin} : user || {};
  const isAdmin = Boolean(shellUser.isAdmin);
  const staffRoute=isAdmin && path.startsWith("/admin");
  const active = (href:string) => path===href || (href!=="/dashboard" && path.startsWith(href+"/"));
  // Sidebar highlighting can be broader than the top-bar title match (see
  // "All tools", which stays highlighted on /qr too but only takes the
  // title on an exact /tools match) - each destination can opt into its
  // own activeTest/titleTest, defaulting to the plain `active()` check.
  const navActive = (item:{href:string;activeTest?:(path:string)=>boolean}) => item.activeTest ? item.activeTest(path) : active(item.href);
  const navTitleMatch = (item:{href:string;titleTest?:(path:string)=>boolean}) => item.titleTest ? item.titleTest(path) : active(item.href);
  const crmTitles:Record<string,string>={overview:"Dashboard",support:"Support",broadcast:"Broadcast",reports:"Reports",billing:"Payments",health:"System health"};
  const crmSegments = path.split("/");
  // /admin/crm/customers is the list, /admin/crm/customers/<id> is one
  // customer's profile - same path segment (crmSegments[3]), so tell them
  // apart by whether there's a 4th segment before falling back to crmTitles.
  const crmTitle = crmSegments[3]==="customers" ? (crmSegments[4] ? "Customer" : "Customers") : (crmTitles[crmSegments[3]]||"Contacts");
  const title = path.startsWith("/admin/crm") ? crmTitle : destinations.find(navTitleMatch)?.label || ({"/account":"Account & data","/operations":"Operations","/analytics":"Analytics","/partners":"Partners","/plans":"Plan & billing","/billing":"Plan & billing","/qr":"WhatsApp QR code","/tools/widget":"Website button","/outreach":"Team outreach","/contact":"Contact us","/support":"Help & support","/support/tickets":"My tickets","/refund":"Refund policy","/privacy":"Privacy policy","/terms":"Terms","/about":"About Wazap","/acceptable-use":"Acceptable use"}[path]) || "Workspace";
  const customerLinks = <><p className="wp-nav-label">WORKSPACE</p>{destinations.map(item=><Link key={item.href} href={isAdmin&&item.href==="/dashboard"?"/dashboard?workspace=1":item.href} aria-current={navActive(item)?"page":undefined} className={`wp-nav-link ${navActive(item)?"is-active":""}`} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")}><item.icon size={18}/>{item.label}{navActive(item)&&<ChevronRight size={14}/>}</Link>)}<p className="wp-nav-label wp-nav-manage">MANAGE</p><Link className={`wp-nav-link ${active("/billing")||active("/plans")?"is-active":""}`} href="/billing" aria-current={active("/billing")||active("/plans")?"page":undefined}><CreditCard size={18}/>Plan & billing</Link><Link className={`wp-nav-link ${active("/account")?"is-active":""}`} href="/account" aria-current={active("/account")?"page":undefined}><Settings size={18}/>Account & data</Link>{isAdmin&&<Link prefetch={false} className={`wp-nav-link ${path.startsWith("/admin/crm")?"is-active":""}`} href="/admin/crm/overview" aria-current={path.startsWith("/admin/crm")?"page":undefined}><Users size={18}/>Wazap CRM</Link>}<Link className="wp-nav-link" href="/support"><Headphones size={18}/>Help & support</Link></>;
  const staffLinks=<><p className="wp-nav-label">ADMIN</p><CrmNavigation/><div className="wp-nav-quiet"><Link className="wp-nav-link wp-nav-link-quiet" href="/dashboard?workspace=1"><LayoutDashboard size={16}/>Preview my workspace</Link><Link className="wp-nav-link wp-nav-link-quiet" href="/account"><Settings size={16}/>My account</Link></div></>;
  const links=staffRoute?staffLinks:customerLinks;
  return <div className="wp-shell">
    <aside className="wp-sidebar"><Link href={isAdmin?"/admin/crm/overview":"/dashboard"} className="wp-brand"><MessageCircle size={27}/><span>Wazap<span className="wp-brand-caption">{staffRoute?"WAZAP OPERATIONS":"BUSINESS WORKSPACE"}</span></span></Link><nav aria-label="Workspace navigation">{links}</nav><div className="wp-sidebar-bottom"><Link href="/" className="wp-site-link">Visit website <ArrowUpRight size={15}/></Link><SignOutButton/></div></aside>
    <div className="wp-main"><header className="wp-topbar"><div className="wp-breadcrumb"><span>{staffRoute?"Wazap operations":"Workspace"}</span><ChevronRight size={14}/><strong>{title}</strong></div><Link className="wp-profile" href="/account" aria-label="Open account settings"><span className="wp-avatar">{(shellUser.name||shellUser.email||"W").slice(0,1).toUpperCase()}</span><span>{shellUser.name||"My account"}</span></Link></header>
      <details className="wp-mobile-nav"><summary>{staffRoute?"Operations menu":"Workspace menu"} <ChevronRight size={16}/></summary><nav aria-label="Mobile workspace navigation" onClick={event=>{if((event.target as HTMLElement).closest("a"))event.currentTarget.closest("details")?.removeAttribute("open");}}>{links}<SignOutButton/></nav></details>
      <div className="wp-content">{children}</div>
      <div className="wp-app-footer"><span>Wazap · Business conversations, organised.</span><Link href="/support">Get support</Link></div>
    </div>
  </div>;
}
