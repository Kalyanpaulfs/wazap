"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { BarChart3, ChevronRight, ChevronsLeft, CreditCard, Headphones, LayoutDashboard, LayoutGrid, Link2, Settings, Users } from "lucide-react";
import Navbar from "../Navbar";
import BrandLogo from "../components/BrandLogo";
import Footer from "../Footer";
import CrmNavigation from "../admin/crm/CrmNavigation";
import SignOutButton from "../dashboard/SignOutButton";
import ThemeToggle from "../theme/ThemeToggle";
import { LanguageSelector } from "../localization/SiteLocale";

// "All tools" is highlighted for /tools, every /tools/* subpage AND /qr
// (its own top-level route) - but /tools/widget and /qr still get their
// own specific top-bar titles from the dictionary below, since the title
// lookup uses `titleTest` (exact /tools only), not this broader `activeTest`.
const allToolsActive = (path: string) => path === "/tools" || path.startsWith("/tools/") || path === "/qr" || path.startsWith("/qr/");

const destinations = [
  {label:"Home",href:"/dashboard",icon:LayoutDashboard},
  {label:"My links",href:"/links",icon:Link2},
  {label:"All tools",href:"/tools",icon:LayoutGrid,activeTest:allToolsActive,titleTest:(path:string)=>path==="/tools"},
  {label:"Results",href:"/results",icon:BarChart3},
];
const privateRoutes = /^\/(dashboard|account|admin|workspace|reports|analytics|operations|partners|performance|plans|billing|links|results)(\/|$)/;

// Private routes and Help & support pages pick their frame on the server
// (app/product/WorkspaceFrame.tsx, app/support/SupportFrame.tsx), so a
// refresh never flashes the public navbar or "My account" before the
// client session loads.
const serverFramedRoutes = /^\/(support|contact|tools|qr|refund|privacy|terms|about|acceptable-use)(\/|$)/;

// Section layouts each mount their own AppShell, so the sidebar remounts when
// you cross sections. Remember the last indicator spot and collapsed state at
// module level (it survives client navigation) so the new shell starts where
// the old one ended and glides, instead of re-animating from scratch.
let lastIndicator = { top: 0, height: 0, shown: false };
let lastCollapsed: boolean | null = null;

const crumbLabels:Record<string,string>={
  "/dashboard":"Home","/links":"My links","/links/new":"Create a link","/links/new/rotator":"Rotator","/links/new/ad":"Ad link","/links/new/brand":"Brand link","/links/created":"Link created",
  "/tools":"All tools","/tools/link":"Click-to-chat link","/tools/shortlink":"Short link","/tools/rotator":"Rotator","/tools/formatter":"Text formatter","/tools/ad-builder":"Ad builder","/tools/widget":"Website button","/qr":"WhatsApp QR code",
  "/results":"Results","/billing":"Plan & billing","/plans":"Plan & billing","/account":"Account & data","/account/security":"Security","/support":"Help & support","/support/tickets":"My tickets","/contact":"Contact us",
  "/refund":"Refund policy","/privacy":"Privacy policy","/terms":"Terms","/about":"About Wazap","/acceptable-use":"Acceptable use","/operations":"Operations","/analytics":"Analytics","/partners":"Partners",
  "/admin/crm/overview":"Dashboard","/admin/crm/customers":"Customers","/admin/crm/support":"Support","/admin/crm/broadcast":"Email","/admin/crm/reports":"Reports","/admin/crm/billing":"Payments","/admin/crm/health":"System health",
};
// Trail for the top bar: every known ancestor route becomes a link, the page itself is the last (plain) crumb.
function buildCrumbs(path:string,title:string){
  const parts=path.split("/").filter(Boolean);
  const crumbs:{label:string;href?:string}[]=[];
  let acc="";
  parts.forEach((part,i)=>{acc+="/"+part;const last=i===parts.length-1;const label=crumbLabels[acc];if(last)crumbs.push({label:label||title});else if(label)crumbs.push({label,href:acc});});
  if(!crumbs.length)crumbs.push({label:title});
  return crumbs;
}

export type ShellUser = { name?: string | null; email?: string | null; isAdmin?: boolean };

export default function AppFrame({children}:{children:React.ReactNode}) {
  const path = usePathname();
  if (/^\/(login|signup|register)(\/|$)/.test(path) || serverFramedRoutes.test(path) || privateRoutes.test(path)) return <>{children}</>;
  return <div className="ds-light flex flex-1 flex-col bg-bg text-text"><Navbar />{children}<Footer /></div>;
}

export function AppShell({children,user}:{children:React.ReactNode;user?:ShellUser}) {
  const path = usePathname();
  const {data:session} = useSession();
  const shellUser:ShellUser = session?.user ? {name:session.user.name,email:session.user.email,isAdmin:(session.user as {isAdmin?:boolean}).isAdmin} : user || {};
  const isAdmin = Boolean(shellUser.isAdmin);
  const [collapsed,setCollapsed]=useState(lastCollapsed ?? false);
  useEffect(()=>{if(lastCollapsed!==null)return;try{const saved=localStorage.getItem("wp-sidebar")==="collapsed";lastCollapsed=saved;setCollapsed(saved);}catch{lastCollapsed=false;}},[]);
  function toggleSidebar(){setCollapsed(c=>{const next=!c;lastCollapsed=next;try{localStorage.setItem("wp-sidebar",next?"collapsed":"expanded");}catch{}return next;});}

  const staffRoute=isAdmin && path.startsWith("/admin");
  const navRef=useRef<HTMLElement>(null);
  const indicatorRef=useRef<HTMLSpanElement>(null);
  useLayoutEffect(()=>{
    const nav=navRef.current,bar=indicatorRef.current;
    if(!nav||!bar)return;
    const target=nav.querySelector<HTMLElement>(".wp-nav-link.is-active");
    if(!target){bar.style.opacity="0";lastIndicator={...lastIndicator,shown:false};return;}
    const next={top:target.offsetTop,height:target.offsetHeight,shown:true};
    const place=()=>{bar.style.transform=`translateY(${next.top}px)`;bar.style.height=`${next.height}px`;bar.style.opacity="1";};
    if(!lastIndicator.shown){bar.style.transition="none";place();void bar.offsetHeight;bar.style.transition="";}
    else{bar.style.transition="none";bar.style.transform=`translateY(${lastIndicator.top}px)`;bar.style.height=`${lastIndicator.height}px`;bar.style.opacity="1";void bar.offsetHeight;bar.style.transition="";requestAnimationFrame(place);}
    lastIndicator=next;
  },[path,collapsed,staffRoute,isAdmin]);
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
  const title = path.startsWith("/admin/crm") ? crmTitle : destinations.find(navTitleMatch)?.label || ({"/account":"Account & data","/operations":"Operations","/analytics":"Analytics","/partners":"Partners","/plans":"Plan & billing","/billing":"Plan & billing","/qr":"WhatsApp QR code","/tools/widget":"Website button","/contact":"Contact us","/support":"Help & support","/support/tickets":"My tickets","/refund":"Refund policy","/privacy":"Privacy policy","/terms":"Terms","/about":"About Wazap","/acceptable-use":"Acceptable use"}[path]) || "Workspace";
  const customerLinks = <><p className="wp-nav-label">WORKSPACE</p>{destinations.map(item=><Link key={item.href} href={isAdmin&&item.href==="/dashboard"?"/dashboard?workspace=1":item.href} aria-current={navActive(item)?"page":undefined} className={`wp-nav-link ${navActive(item)?"is-active":""}`} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")}><item.icon size={18}/><span className="wp-nav-text">{item.label}</span></Link>)}<p className="wp-nav-label wp-nav-manage">MANAGE</p><Link className={`wp-nav-link ${active("/billing")||active("/plans")?"is-active":""}`} href="/billing" aria-current={active("/billing")||active("/plans")?"page":undefined}><CreditCard size={18}/><span className="wp-nav-text">Plan & billing</span></Link><Link className={`wp-nav-link ${active("/account")?"is-active":""}`} href="/account" aria-current={active("/account")?"page":undefined}><Settings size={18}/><span className="wp-nav-text">Account & data</span></Link>{isAdmin&&<Link prefetch={false} className={`wp-nav-link ${path.startsWith("/admin/crm")?"is-active":""}`} href="/admin/crm/overview" aria-current={path.startsWith("/admin/crm")?"page":undefined}><Users size={18}/><span className="wp-nav-text">Wazap CRM</span></Link>}<Link className={`wp-nav-link ${active("/support")||active("/contact")?"is-active":""}`} href="/support" aria-current={active("/support")||active("/contact")?"page":undefined}><Headphones size={18}/><span className="wp-nav-text">Help & support</span></Link></>;
  const staffLinks=<><p className="wp-nav-label">ADMIN</p><CrmNavigation/><div className="wp-nav-quiet"><Link className="wp-nav-link wp-nav-link-quiet" href="/dashboard?workspace=1"><LayoutDashboard size={16}/><span className="wp-nav-text">Preview my workspace</span></Link><Link className="wp-nav-link wp-nav-link-quiet" href="/account"><Settings size={16}/><span className="wp-nav-text">My account</span></Link></div></>;
  const links=staffRoute?staffLinks:customerLinks;
  return <div className={`wp-shell ${collapsed?"is-collapsed":""}`}>
    <div className="wp-side-wrap"><aside className="wp-sidebar"><div className="wp-sidebar-head"><Link href={isAdmin?"/admin/crm/overview":"/dashboard"} className="wp-brand" aria-label="Wazap home"><span className="wp-brand-full"><BrandLogo tone="onLight" width={124}/></span><img className="wp-brand-icon" src="/brand/wazap-mark-transparent.png" alt="" width={40} height={40}/><span className="wp-brand-caption">{staffRoute?"WAZAP OPERATIONS":"BUSINESS WORKSPACE"}</span></Link></div><nav ref={navRef} className="wp-side-nav" aria-label="Workspace navigation"><span ref={indicatorRef} className="wp-nav-indicator" aria-hidden/>{links}</nav><div className="wp-sidebar-bottom"><div className="wp-side-tools"><ThemeToggle className="wp-theme-toggle"/><LanguageSelector/></div></div></aside><button type="button" className="wp-collapse" onClick={toggleSidebar} aria-expanded={!collapsed} aria-label={collapsed?"Expand sidebar":"Collapse sidebar"} title={collapsed?"Expand sidebar":"Collapse sidebar"}><ChevronsLeft size={16}/></button></div>
    <div className="wp-main"><header className="wp-topbar"><nav className="wp-breadcrumb" aria-label="Breadcrumb">{buildCrumbs(path,title).map((c,i,all)=>i===all.length-1?<strong key={i} aria-current="page">{c.label}</strong>:<span key={i} className="wp-crumb">{c.href?<Link href={c.href}>{c.label}</Link>:c.label}<ChevronRight size={13} aria-hidden/></span>)}</nav><Link className="wp-profile" href="/account" aria-label="Open account settings"><span className="wp-avatar">{(shellUser.name||shellUser.email||"W").slice(0,1).toUpperCase()}</span><span>{shellUser.name||"My account"}</span></Link></header>
      <details className="wp-mobile-nav"><summary>{staffRoute?"Operations menu":"Workspace menu"} <ChevronRight size={16}/></summary><nav aria-label="Mobile workspace navigation" onClick={event=>{if((event.target as HTMLElement).closest("a"))event.currentTarget.closest("details")?.removeAttribute("open");}}>{links}<ThemeToggle className="wp-theme-toggle"/><SignOutButton/></nav></details>
      <div className="wp-content">{children}</div>
      <Footer variant="app"/>
    </div>
  </div>;
}
