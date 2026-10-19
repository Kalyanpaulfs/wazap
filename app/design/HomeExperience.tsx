"use client";

import { useRef, useState } from "react";
import { useMotion } from "./useMotion";
import { FeatureStory, MotionMarquee, OrbitFlow } from "./MotionScenes";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BarChart3, Check, Globe2, Link2, MessageCircle, MousePointer2, Plus, QrCode, ShieldCheck, Shuffle, Users, Zap } from "lucide-react";
import { landingFaqs } from "@/lib/landing-faq";

const agents = ["Alex", "Sam", "Jordan"];
const industries = [
  { name: "Real estate", title: "More enquiries. A fairer split.", text: "Use one WhatsApp link across property campaigns and give every agent a turn at the next enquiry.", channels: ["Property portals", "Meta ads", "Listing QR codes"] },
  { name: "Agencies", title: "One destination for every campaign.", text: "Send campaign traffic to your client’s team with one routing link, then see where each handoff went.", channels: ["Paid campaigns", "Client websites", "Social profiles"] },
  { name: "Appointments", title: "Connect enquiries to your team.", text: "Share one link for your clinic, showroom, or admissions team and distribute incoming clicks across your staff.", channels: ["Google Ads", "Website enquiries", "Reception QR codes"] },
];
function Cta({ children = "Start 3-day free trial" }: { children?: React.ReactNode }) {
  return <Link className="wz-button" href="/signup?redirect=/tools/rotator" >{children}<span><ArrowUpRight size={18} /></span></Link>;
}
function RoutingDemo() {
  const [clicks, setClicks] = useState(0);
  const active = clicks ? (clicks - 1) % agents.length : -1;
  return <div className="wz-router">
    <div className="wz-router-top"><span className="wz-window-dots"><i /><i /><i /></span><span>Wazap / Lead rotator</span><span className="wz-demo-tag">DEMO</span></div>
    <div className="wz-link-box"><div className="wz-icon-tile"><Link2 size={23} /></div><div><small>ONE LINK. YOUR WHOLE TEAM.</small><strong>wazap.lt/r/your-team</strong></div><QrCode size={25} /></div>
    <div className="wz-route-line"><span /><Shuffle size={21} /><span /></div>
    <div className="wz-agent-grid">{agents.map((name, i) => <div key={name} className={`wz-agent ${active === i ? "is-active" : ""}`}><div className="wz-avatar">{name[0]}<i /></div><strong>{name}</strong><small>{clicks ? Math.floor((clicks + 2 - i) / 3) : 0} routed</small></div>)}</div>
    <div className="wz-demo-result" aria-live="polite">{clicks ? <><Check size={15} /> Lead {clicks} routed to {agents[active]} <span>Next: {agents[clicks % 3]}</span></> : <><ShieldCheck size={15} /> Fair distribution. Every click gets a turn.</>}</div>
    <button className="wz-demo-button" onClick={() => setClicks(c => c + 1)}><MousePointer2 size={17} />{clicks ? "Simulate another lead" : "Simulate a lead"}<ArrowRight size={17} /></button>
    <p className="wz-demo-note">Interactive example · No messages sent</p>
  </div>;
}
export default function HomeExperience() {
  const [industry, setIndustry] = useState(0);
  const root = useRef<HTMLElement>(null);
  const {enabled} = useMotion(root, false);
  return <main ref={root} className="wz-home" data-motion={enabled ? "active" : "paused"}>
    <section className="wz-hero">
      <div className="wz-hero-grid wz-container">
        <div className="wz-hero-copy"><div className="wz-eyebrow"><i /> ONE WHATSAPP LINK. YOUR WHOLE TEAM.</div><h1><span className="wz-title-line">One link.</span><span className="wz-title-line wz-title-green">Every lead.</span><span className="wz-title-line">The right person.</span></h1><p>Turn campaign clicks into team conversations. Share one WhatsApp link, distribute leads fairly, and see where every handoff goes.</p><div className="wz-actions"><Cta /><a className="wz-secondary" href="#demo">Try the live demo <ArrowRight size={17} /></a></div><div className="wz-hero-assurances"><span><Check size={14} /> No API setup</span><span><Check size={14} /> No QR scan</span><span><Check size={14} /> 100 leads, 3-day trial</span></div></div>
        <div className="wz-hero-stage"><div className="wz-orbit wz-orbit-one" /><div className="wz-orbit wz-orbit-two" /><div className="wz-hero-satellite satellite-one"><QrCode size={24}/></div><div className="wz-hero-satellite satellite-two"><BarChart3 size={24}/></div><div className="wz-hero-satellite satellite-three"><Link2 size={23}/></div><div className="wz-floating wz-floating-source"><Globe2 size={16} /><span className="wz-hero-link-label">Your next campaign</span><ArrowUpRight size={16} /></div><div className="wz-art"><Image src="/wazap-routing-concept-v1.webp" alt="Conceptual illustration of one conversation routing to three team destinations" width={900} height={900} sizes="(max-width: 760px) 100vw, 50vw" loading="eager" fetchPriority="high" /><span className="wz-art-caption">CONCEPT VISUAL · ONE LINK, THREE DESTINATIONS</span></div><div className="wz-floating wz-floating-success"><span className="wz-check-orb"><Check size={19} /></span><div><strong>One link. Balanced leads.</strong><small>Built for your whole team.</small></div></div></div>
      </div>
      <div className="wz-capabilities wz-container">{[[Shuffle,"Round-robin routing"],[BarChart3,"Handoff tracking"],[Link2,"One shareable link"],[ShieldCheck,"Private by design"]].map(([Icon,label]) => { const Symbol = Icon as typeof Shuffle; return <span key={String(label)}><Symbol size={17} />{String(label)}</span>; })}</div>
    </section>
    <MotionMarquee /><OrbitFlow />
    <section id="demo" className="wz-section wz-demo-section"><div className="wz-container"><div className="wz-section-heading"><div className="wz-eyebrow">TRY IT BEFORE YOU SIGN UP</div><h2>A click comes in.<br /><span>Your team gets a turn.</span></h2><p>Click through the demo and watch the next lead move to the next person.</p></div><div className="wz-demo-layout"><div className="wz-demo-copy"><span className="wz-number">01 / LEAD ROUTING</span><h3>A fairer way to<br />share opportunity.</h3><p>One overloaded inbox shouldn’t be your growth plan. Give every team member their turn, without manually forwarding every enquiry.</p><ul><li><Check size={18} /> Keep using your existing WhatsApp numbers</li><li><Check size={18} /> Share the same link across your campaigns</li><li><Check size={18} /> Update your team behind the link</li></ul><Link className="wz-text-link" href="/tools/rotator" >Create your own lead router <ArrowUpRight size={18} /></Link></div><RoutingDemo /></div></div></section>
    <section id="how-it-works" className="wz-section wz-steps-section"><div className="wz-container"><div className="wz-section-heading"><div className="wz-eyebrow">LESS SETUP. MORE CONVERSATIONS.</div><h2>From campaign to conversation.<br /><span>In three simple steps.</span></h2></div><div className="wz-step-path" aria-hidden="true"><svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path className="wz-step-track" d="M0 50 C160 50 160 10 320 10 S500 90 660 90 S840 50 1000 50"/><path className="wz-step-draw" pathLength="1" d="M0 50 C160 50 160 10 320 10 S500 90 660 90 S840 50 1000 50"/></svg><span/></div><div className="wz-steps">{[{icon:Users,title:"Add your team",text:"Add the WhatsApp numbers that should receive your enquiries."},{icon:Link2,title:"Share one link",text:"Put your routing link in ads, social bios, landing pages, or QR codes."},{icon:Shuffle,title:"Let leads take turns",text:"Each click opens WhatsApp with the next team member in your rotation."}].map((s,i)=><div className="wz-step" key={s.title}><div className="wz-step-top"><s.icon size={27} /><span>0{i+1}</span></div><h3>{s.title}</h3><p>{s.text}</p></div>)}</div></div></section>
    <FeatureStory enabled={enabled} />
    <section className="wz-section wz-industry-section"><div className="wz-container wz-industry-layout"><div><div className="wz-eyebrow">BUILT FOR TEAMS THAT LIVE ON ENQUIRIES</div><h2>Your business.<br /><span>Your workflow.</span></h2><div className="wz-industry-tabs" role="tablist" aria-label="Business use cases">{industries.map((item,i)=><button key={item.name} id={`industry-tab-${i}`} role="tab" aria-selected={industry===i} aria-controls="industry-panel" className={industry===i?"is-active":""} tabIndex={industry===i ? 0 : -1} onKeyDown={e=>{let next=i;if(e.key==="ArrowRight"||e.key==="ArrowDown")next=(i+1)%industries.length;else if(e.key==="ArrowLeft"||e.key==="ArrowUp")next=(i+industries.length-1)%industries.length;else if(e.key==="Home")next=0;else if(e.key==="End")next=industries.length-1;else return;e.preventDefault();setIndustry(next);document.getElementById(`industry-tab-${next}`)?.focus();}} onClick={()=>setIndustry(i)}>{item.name}<ArrowUpRight size={16}/></button>)}</div></div><div key={industry} id="industry-panel" role="tabpanel" aria-labelledby={`industry-tab-${industry}`} className="wz-industry-panel"><div className="wz-industry-visual"><div className="wz-source-stack">{industries[industry].channels.map(c=><span key={c}><Globe2 size={15}/>{c}</span>)}</div><ArrowRight size={28}/><div className="wz-destination"><MessageCircle size={32}/><span>Your team</span></div></div><h3>{industries[industry].title}</h3><p>{industries[industry].text}</p><Cta>Build your team link</Cta></div></div></section>
    <section id="faq" className="wz-section wz-faq-section"><div className="wz-container wz-faq-layout"><div><div className="wz-eyebrow">THE DETAILS, SIMPLIFIED</div><h2>Good questions.<br /><span>Clear answers.</span></h2><p>Everything you need to know before your first routed lead.</p><Link className="wz-text-link" href="/contact" >Talk to Wazap <ArrowUpRight size={17}/></Link></div><div>{landingFaqs.map(({q,a})=><details key={q}><summary>{q}<Plus size={20}/></summary><p>{a}</p></details>)}</div></div></section>
    <section className="wz-container wz-final"><div className="wz-eyebrow"><Zap size={16}/> MAKE YOUR NEXT CAMPAIGN A TEAM EFFORT</div><h2>More opportunity.<br /><span>Shared fairly.</span></h2><p>Your first 3 days are a free trial with 100 routed leads. Create one link and put your whole team behind it.</p><Cta/><Link className="wz-final-pricing" href="/pricing" >Explore paid plans <ArrowRight size={15}/></Link></section>
    <div className="wz-tools-note">Need a quick utility? <Link href="/tools" >Explore our free WhatsApp tools <ArrowUpRight size={14}/></Link></div>
  </main>;
}
