import type { Metadata } from "next";
import SeoSolutionPage from "@/app/components/SeoSolutionPage";

const canonical = "https://wazap.lt/whatsapp-ai-agent";
export const metadata: Metadata = {
  title: "WhatsApp AI Agent — Governed Sales and Support Drafts",
  description: "Use a governed WhatsApp AI agent to draft replies, qualify inquiries, apply approved knowledge and hand sensitive conversations to a human reviewer.",
  alternates: { canonical },
  openGraph: { title: "Governed WhatsApp AI Agent for Business", description: "Draft customer replies with approved knowledge, policy controls and human handoffs in Wazap.", url: canonical },
};

export default function Page() {
  return <SeoSolutionPage eyebrow="Governed WhatsApp AI agent" title="An AI teammate that drafts useful replies and knows when a human must take over." intro="Configure a Wazap AI agent with an approved role, knowledge and escalation policy. It can draft sales or support responses, help qualify inquiries and create a visible human handoff without silently transmitting customer messages." outcome="AI runs are governed and auditable. Drafts stay separate from transmission, sensitive cases can require approval, and handoffs preserve the conversation context a human needs to respond responsibly." schemaName="Wazap WhatsApp AI Agent" canonical={canonical} features={[
    { title: "Approved knowledge", body: "Ground drafts in reviewed product, service and policy information instead of giving the model unrestricted authority." },
    { title: "Human review", body: "Keep generated replies as drafts so a responsible teammate can edit, approve or reject them before use." },
    { title: "Visible handoffs", body: "Route sensitive, uncertain or high-value conversations to a person with severity and context attached." },
  ]} steps={["Define the agent's business role, boundaries and approved knowledge.", "Test representative customer questions before activating the workflow.", "Review generated drafts and confirm escalation rules for sensitive cases.", "Measure completed runs, failures and human handoffs without hiding AI limitations."]} questions={[
    { question: "Does the Wazap AI agent automatically message customers?", answer: "No. The current governed workflow creates drafts and handoffs; customer-message transmission remains under human control." },
    { question: "Can I give the agent my own business information?", answer: "Yes. You can configure approved knowledge and instructions that define what the agent may use when preparing a response." },
    { question: "What happens when the AI is uncertain?", answer: "The workflow can record a failed or blocked run and create a human handoff instead of pretending the answer is reliable." },
    { question: "Can I use it for sales and support?", answer: "Yes. You can configure distinct roles such as sales qualification or customer support, each with its own knowledge, instructions and review policy." },
  ]} />;
}
