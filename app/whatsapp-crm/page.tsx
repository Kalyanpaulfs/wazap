import type { Metadata } from "next";
import SeoSolutionPage from "@/app/components/SeoSolutionPage";

const canonical = "https://wazap.lt/whatsapp-crm";
export const metadata: Metadata = {
  title: "WhatsApp CRM — Leads, Pipeline and Follow-Up",
  description: "Organize WhatsApp leads in a focused CRM with source attribution, pipeline stages, deal values, owners, notes, tasks and scheduled follow-up dates.",
  alternates: { canonical },
  openGraph: { title: "WhatsApp CRM and Lead Follow-Up", description: "Move WhatsApp leads from first conversation to accountable follow-up and measurable outcomes.", url: canonical },
};

export default function Page() {
  return <SeoSolutionPage eyebrow="WhatsApp CRM and lead pipeline" title="Turn WhatsApp inquiries into organized leads your team can actually follow up." intro="Wazap connects the first customer conversation to a practical sales workflow: lead source, campaign, owner, pipeline stage, estimated value, notes, tasks and the next follow-up date." outcome="The CRM stays focused on customer conversations instead of becoming unrelated business software. It gives every WhatsApp lead an owner, a visible stage and a concrete next action." schemaName="Wazap WhatsApp CRM" canonical={canonical} features={[
    { title: "Lead attribution", body: "Capture source, campaign and landing-page context so the team knows which activity generated each inquiry." },
    { title: "Focused pipeline", body: "Move leads through clear stages, record estimated value and keep ownership visible across the workspace." },
    { title: "Follow-up queue", body: "See which leads need attention today and open a prepared WhatsApp conversation when a human is ready." },
  ]} steps={["Create a tracked link, QR code, campaign link or catalog inquiry surface.", "Capture the lead with source, campaign and customer context.", "Assign an owner, pipeline stage, estimated value and next follow-up date.", "Measure lead outcomes and improve the sources that produce real conversations."]} questions={[
    { question: "Is Wazap a full general-purpose CRM?", answer: "Wazap is deliberately centered on customer conversations, lead ownership, follow-up and outcomes rather than unrelated accounting or back-office functions." },
    { question: "Can I track where a WhatsApp lead came from?", answer: "Yes. Wazap supports tracked campaign links and stores source, campaign and landing-page context when it is available." },
    { question: "Does the CRM automatically send messages?", answer: "No. Wazap can prepare workflows and reminders, but customer messaging remains human-controlled and subject to consent and provider rules." },
    { question: "Can a team share the same lead pipeline?", answer: "Yes. Workspace members can share lead records, assignments, notes, tasks, stages and follow-up activity according to their roles." },
  ]} />;
}
