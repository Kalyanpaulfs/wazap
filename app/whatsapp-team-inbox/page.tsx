import type { Metadata } from "next";
import SeoSolutionPage from "@/app/components/SeoSolutionPage";

const canonical = "https://wazap.lt/whatsapp-team-inbox";
export const metadata: Metadata = {
  title: "WhatsApp Team Inbox — Assign and Manage Conversations",
  description: "Manage WhatsApp customer conversations in a shared team inbox with ownership, notes, tasks, priorities, follow-ups and accountable human handoffs.",
  alternates: { canonical },
  openGraph: { title: "WhatsApp Team Inbox for Sales and Support", description: "Give every customer conversation an owner, next action and shared context in Wazap.", url: canonical },
};

export default function Page() {
  return <SeoSolutionPage eyebrow="Shared WhatsApp team inbox" title="One inbox for every customer conversation and every responsible teammate." intro="Wazap gives sales and support teams a shared operational view of WhatsApp conversations, ownership, internal notes, priorities, tasks and follow-ups—without losing the human context behind each customer." outcome="Wazap records operational context and human handoffs while keeping customer messaging governed. Teams can see who owns a conversation, what happened and what must happen next." schemaName="Wazap WhatsApp Team Inbox" canonical={canonical} features={[
    { title: "Clear ownership", body: "Assign conversations, set priority and prevent two teammates from unknowingly handling the same customer." },
    { title: "Shared customer context", body: "Keep internal notes, tasks, lead details and conversation history available to the teammates who need them." },
    { title: "Measurable response work", body: "Track open conversations, first-response performance, handoffs and resolution progress from one workspace." },
  ]} steps={["Connect a supported customer-owned channel or begin with Wazap's click-to-chat tools.", "Invite teammates and define who owns sales, support and follow-up work.", "Assign each conversation, add internal context and create the next task.", "Review response and resolution metrics to improve the customer experience."]} questions={[
    { question: "What is a WhatsApp team inbox?", answer: "A WhatsApp team inbox gives multiple authorized teammates a shared view of customer conversations, ownership and internal workflow context instead of relying on one person's device." },
    { question: "Can teammates add private notes and tasks?", answer: "Yes. Wazap supports internal notes, tasks, priorities, assignment and lead context that are not sent as customer messages." },
    { question: "Does Wazap own my WhatsApp Business Account?", answer: "No. Supported official connections use a customer-owned WhatsApp Business Account and remain subject to Meta verification and provider policies." },
    { question: "Can I try the team workflow before paying?", answer: "Yes. New workspaces receive a 14-day Growth trial without requiring a payment card." },
  ]} />;
}
