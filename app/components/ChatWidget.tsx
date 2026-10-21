"use client";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageCircle, X, Send, Headphones, ArrowRight, ChevronLeft, Plus, Smartphone, Paperclip, CreditCard, Link2, UserRound, HelpCircle } from "lucide-react";
import Link from "next/link";
import { shrinkImage, MAX_ATTACHMENT_BYTES } from "@/lib/client-image-shrink";

interface Attachment { id: string; mimeType: string }
interface TicketMessage { id: string; sender: string; body: string; createdAt: string; attachments: Attachment[] }
interface TicketSummary { id: string; number: string; topic: string; status: string; urgent: boolean; createdAt: string; updatedAt: string; solvedAt: string | null; canReopen: boolean; unread: number }
interface TicketDetail extends TicketSummary { messages: TicketMessage[] }
interface QuickAnswerAction { label: string; href: string }
interface QuickAnswer { id: string; title: string; body: string; action: QuickAnswerAction | null; urgent: boolean }
interface PersonalFacts { sentences: string[]; suggestUrgentTicket: boolean }
interface WhatsappInfo { available: boolean; url?: string; reason?: "plan" | "unavailable" }
type TicketTopic = "payment" | "link" | "account" | "other";
type Screen = "home" | "topic" | "answers" | "answer" | "form" | "ticket";
type Pending = { blob: Blob; name: string; previewUrl: string };

const TOPICS: { id: TicketTopic; label: string; icon: typeof CreditCard }[] = [
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "link", label: "Link not working", icon: Link2 },
  { id: "account", label: "Account/login", icon: UserRound },
  { id: "other", label: "Other", icon: HelpCircle },
];
const TOPIC_LABELS: Record<string, string> = { payment: "Payment", link: "Link not working", account: "Account/login", other: "Other" };
const TOPIC_HINTS: Record<TicketTopic, string> = {
  payment: "Tip: tell us which email you paid with and the amount.",
  link: "Tip: paste the link or its code so we can check it.",
  account: "Tip: tell us which email or login method you use.",
  other: "",
};
const STATUS_LABELS: Record<string, string> = { open: "Open", investigating: "In progress", waiting: "Waiting for you", solved: "Solved", closed: "Closed" };

// Open/Investigating = amber, Waiting for you = blue, Solved = green, Closed = slate.
function statusChipClass(status?: string) {
  if (status === "solved") return "bg-[#25D366]/15 text-[#25D366]";
  if (status === "closed") return "bg-slate-700/40 text-slate-400";
  if (status === "waiting") return "bg-sky-500/15 text-sky-300";
  return "bg-amber-500/15 text-amber-300";
}

function renderText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && /^(\/[^/]|https:\/\/wazap\.lt\/)/.test(link[2])) return <a key={i} href={link[2]} className="text-[#25D366] underline">{link[1]}</a>;
    return <span key={i}>{part}</span>;
  });
}

export default function ChatWidget() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false); const [visitorId, setVisitorId] = useState("");
  // Whether localStorage already had a visitor id BEFORE this page load -
  // i.e. a returning support visitor. Only those get the profile check on
  // every page load (needed so the red-dot unread poll works while the
  // panel is closed); a brand-new visitor only gets it once they open the
  // panel, same as before this field existed.
  const [isReturningVisitor, setIsReturningVisitor] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [ready, setReady] = useState(false); const [checking, setChecking] = useState(false); const [loading, setLoading] = useState(false);
  const [input, setInput] = useState(""); const [notice, setNotice] = useState(""); const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [pending, setPending] = useState<Pending | null>(null); const [uploading, setUploading] = useState(false);

  const [screen, setScreen] = useState<Screen>("home");
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [whatsapp, setWhatsapp] = useState<WhatsappInfo | null>(null);
  const [topic, setTopic] = useState<TicketTopic>("other");
  const [formOrigin, setFormOrigin] = useState<"topic" | "answers">("topic");
  const [quickAnswers, setQuickAnswers] = useState<QuickAnswer[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [personal, setPersonal] = useState<PersonalFacts | null>(null);
  const [activeAnswer, setActiveAnswer] = useState<QuickAnswer | null>(null);
  const [formQuickAnswerId, setFormQuickAnswerId] = useState<string | null>(null);
  const [parentTicketId, setParentTicketId] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; number: string } | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [pendingOpenTicketId, setPendingOpenTicketId] = useState<string | null>(null);
  const [pendingNewTicket, setPendingNewTicket] = useState(false);

  const launcherRef = useRef<HTMLButtonElement>(null); const inputRef = useRef<HTMLInputElement>(null); const nameRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null); const fileInputRef = useRef<HTMLInputElement>(null);

  function closeChat() { setOpen(false); launcherRef.current?.focus(); }
  function attachmentUrl(attachmentId: string) { return `/api/support/attachment/${attachmentId}?visitorId=${encodeURIComponent(visitorId)}`; }
  function clearPending() { if (pending) URL.revokeObjectURL(pending.previewUrl); setPending(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) { setNotice("Screenshot is too big. Max 5 MB."); return; }
    setNotice("");
    const blob = await shrinkImage(file);
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending({ blob, name: file.name, previewUrl: URL.createObjectURL(blob) });
  }

  async function loadTickets() {
    if (!visitorId) return;
    setTicketsLoading(true);
    try {
      const response = await fetch(`/api/support/tickets?visitorId=${encodeURIComponent(visitorId)}`);
      const json = await response.json();
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
    } catch { /* keep the last known list */ } finally { setTicketsLoading(false); }
  }
  async function loadWhatsapp() {
    try { const response = await fetch("/api/support/whatsapp"); setWhatsapp(await response.json()); } catch { setWhatsapp({ available: false, reason: "unavailable" }); }
  }
  async function loadUnread(id: string) {
    if (!id) return;
    try {
      const response = await fetch(`/api/support/unread?visitorId=${encodeURIComponent(id)}`);
      if (!response.ok) return;
      const json = await response.json();
      setUnreadCount(typeof json.unread === "number" ? json.unread : 0);
    } catch { /* keep the last known count */ }
  }
  // Declared here (ahead of the effects below that call it) so opening a
  // ticket from a wazap:open-chat event never references it before it exists.
  async function openTicket(id: string) {
    setTicketId(id); setScreen("ticket"); setNotice(""); setExisting(null); clearPending(); setInput("");
    try {
      const response = await fetch(`/api/support/tickets/${id}?visitorId=${encodeURIComponent(visitorId)}`);
      const json = await response.json();
      if (response.ok) setTicket(json.ticket);
      else { setNotice(json.error || "Ticket not found."); setTicket(null); }
    } catch { setNotice("Could not load this ticket. Please retry."); }
    loadUnread(visitorId);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlVisitor = params.get("visitor");
    const chat = params.get("chat");
    let id: string;
    let returning = false;
    try {
      if (urlVisitor) { id = urlVisitor; localStorage.setItem("wazap_support_visitor_id", id); returning = true; }
      else {
        const existing = localStorage.getItem("wazap_support_visitor_id");
        returning = Boolean(existing);
        id = existing || crypto.randomUUID();
        localStorage.setItem("wazap_support_visitor_id", id);
      }
    } catch { id = urlVisitor || crypto.randomUUID(); }
    setVisitorId(id);
    setIsReturningVisitor(returning);
    if (urlVisitor) {
      params.delete("visitor");
      const next = params.toString();
      try { window.history.replaceState(null, "", window.location.pathname + (next ? `?${next}` : "") + window.location.hash); } catch { /* history API unavailable */ }
    }
    if (urlVisitor || chat === "open") setOpen(true);
    else if (chat === "expired") { setOpen(true); setNotice("This chat link has expired. Start a new chat and we'll pick it up."); }
  }, []);

  useEffect(() => {
    function onOpenChat(event: Event) {
      setOpen(true);
      const detail = (event as CustomEvent<{ ticketId?: string; newTicket?: boolean }>).detail;
      if (detail && typeof detail.ticketId === "string" && detail.ticketId) setPendingOpenTicketId(detail.ticketId);
      else if (detail && detail.newTicket) setPendingNewTicket(true);
    }
    window.addEventListener("wazap:open-chat", onOpenChat);
    return () => window.removeEventListener("wazap:open-chat", onOpenChat);
  }, []);

  useEffect(() => { if (session?.user) setContact(previous => ({ ...previous, name: previous.name || session.user?.name || "", email: previous.email || session.user?.email || "" })); }, [session]);

  // Determine readiness (and establish the support-session cookie). For a
  // RETURNING visitor (localStorage already had an id) this runs as soon as
  // we have a visitorId, not only once the panel is opened - the unread
  // bubble needs to know this while the panel is closed. A brand-new
  // visitor has no ticket history yet, so this waits until they actually
  // open the panel, instead of calling the profile endpoint for every single
  // first-time page view on the site.
  useEffect(() => {
    if (!visitorId) return;
    if (!isReturningVisitor && !open) return;
    const controller = new AbortController();
    setChecking(true);
    fetch(`/api/support/profile?visitorId=${encodeURIComponent(visitorId)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const json = await response.json();
        if (typeof json.visitorId === "string" && json.visitorId !== visitorId) {
          setVisitorId(json.visitorId);
          try { localStorage.setItem("wazap_support_visitor_id", json.visitorId); } catch { /* storage unavailable */ }
          setTicket(null); setTicketId(null); setScreen("home");
        }
        setReady(Boolean(json.ready));
        if (json.historyRecoveryRequired) setNotice("Your earlier chat is preserved with our team. Start a secure chat here, or contact support to recover its history.");
      })
      .catch(() => { if (!controller.signal.aborted) setNotice("We could not restore your chat. Please retry."); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [visitorId, isReturningVisitor, open]);

  useEffect(() => { if (open && !checking && !ready) nameRef.current?.focus(); }, [open, checking, ready]);

  // Bubble red dot: on load and every 30s while a profile is captured, skipped while the tab is hidden.
  useEffect(() => {
    if (!ready || !visitorId) return;
    let stopped = false;
    function poll() { if (!stopped && !document.hidden) loadUnread(visitorId); }
    poll();
    const interval = window.setInterval(poll, 30_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [ready, visitorId]);

  useEffect(() => { if (open && ready && screen === "home") loadTickets(); }, [open, ready, screen]);
  useEffect(() => { if (open && ready && !whatsapp) loadWhatsapp(); }, [open, ready, whatsapp]);

  // Open a ticket requested via a wazap:open-chat {ticketId} event once the profile is known.
  useEffect(() => {
    if (pendingOpenTicketId && ready && visitorId) { openTicket(pendingOpenTicketId); setPendingOpenTicketId(null); }
  }, [pendingOpenTicketId, ready, visitorId]);

  // Jump straight into the new-ticket (topic) screen once the profile is known, for a
  // wazap:open-chat {newTicket:true} event (e.g. "Start a ticket" on the Help page).
  useEffect(() => {
    if (pendingNewTicket && ready) { setScreen("topic"); setPendingNewTicket(false); }
  }, [pendingNewTicket, ready]);

  // Poll the open ticket every 5s while it is on screen and the tab is visible.
  useEffect(() => {
    if (!open || screen !== "ticket" || !ticketId || !visitorId) return;
    let stopped = false; const controller = new AbortController();
    async function poll() {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/support/tickets/${ticketId}?visitorId=${encodeURIComponent(visitorId)}`, { signal: controller.signal });
        if (response.ok && !stopped) { const json = await response.json(); setTicket(json.ticket); loadUnread(visitorId); }
      } catch { /* keep the current thread and draft */ }
    }
    poll();
    const interval = window.setInterval(poll, 5000);
    return () => { stopped = true; controller.abort(); window.clearInterval(interval); };
  }, [open, screen, ticketId, visitorId]);

  useEffect(() => { if (open && screen === "ticket") bottomRef.current?.scrollIntoView({ behavior: "auto" }); }, [ticket, open, screen]);

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading || !visitorId) return;
    setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/support/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId, ...contact, newsletter }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Your details could not be saved.");
      setReady(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Your request could not be saved. Please retry."); }
    finally { setLoading(false); }
  }

  function goHome() { setScreen("home"); setExisting(null); setActiveAnswer(null); setNotice(""); clearPending(); }
  function goBack() {
    setNotice(""); clearPending();
    if (screen === "topic") setScreen("home");
    else if (screen === "answers") setScreen("topic");
    else if (screen === "answer") setScreen("answers");
    else if (screen === "form") { if (parentTicketId) setScreen("ticket"); else if (activeAnswer) setScreen("answer"); else setScreen(formOrigin); }
    else if (screen === "ticket") goHome();
  }

  async function pickTopic(nextTopic: TicketTopic) {
    setTopic(nextTopic); setExisting(null); setNotice(""); setInput(""); clearPending();
    if (nextTopic === "other") { setFormQuickAnswerId(null); setParentTicketId(null); setFormOrigin("topic"); setScreen("form"); return; }
    setScreen("answers"); setAnswersLoading(true);
    try {
      const response = await fetch(`/api/support/quick-answers?topic=${nextTopic}`);
      const json = await response.json();
      setQuickAnswers(Array.isArray(json.answers) ? json.answers : []);
      setPersonal(json.personal || null);
    } catch { setQuickAnswers([]); setPersonal(null); }
    finally { setAnswersLoading(false); }
  }

  async function pickAnswer(answer: QuickAnswer) {
    setActiveAnswer(answer); setScreen("answer");
    if (topic === "payment" || topic === "link") {
      try {
        const response = await fetch(`/api/support/quick-answers?topic=${topic}&quickAnswerId=${encodeURIComponent(answer.id)}`);
        const json = await response.json();
        setPersonal(json.personal || null);
      } catch { /* keep the topic-level facts already shown */ }
    }
  }

  function sendFeedback(answerId: string, solved: boolean) {
    fetch("/api/support/quick-answers/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answerId, solved }) }).catch(() => {});
  }
  function markSolved() {
    if (!activeAnswer) return;
    sendFeedback(activeAnswer.id, true);
    setNotice("Glad it's sorted!"); setActiveAnswer(null); setScreen("home"); loadTickets();
  }
  function stillNeedHelp() {
    if (!activeAnswer) return;
    sendFeedback(activeAnswer.id, false);
    setFormQuickAnswerId(activeAnswer.id); setParentTicketId(null); setInput(""); setNotice(""); setScreen("form");
  }

  async function createTicketRequest(forceNew: boolean) {
    const message = input.trim();
    if (loading || uploading) return;
    if (!message && !pending) { setNotice("A message is required."); return; }
    setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, topic, message, quickAnswerId: formQuickAnswerId, parentTicketId, differentProblem: forceNew }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Your ticket could not be sent.");
      if (json.existing) { setExisting(json.existing); return; }
      const newId: string = json.ticket.id;
      if (pending) {
        setUploading(true);
        try {
          const form = new FormData();
          form.append("visitorId", visitorId); form.append("ticketId", newId); form.append("file", pending.blob, pending.name || "screenshot");
          const uploadResponse = await fetch("/api/support/attachment", { method: "POST", body: form });
          if (!uploadResponse.ok) { const uploadJson = await uploadResponse.json().catch(() => ({})); setNotice(uploadJson.error || "Ticket created, but the screenshot could not be attached."); }
        } catch { setNotice("Ticket created, but the screenshot could not be attached."); }
        finally { setUploading(false); clearPending(); }
      }
      setInput(""); setFormQuickAnswerId(null); setParentTicketId(null); setExisting(null);
      loadTickets();
      await openTicket(newId);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Your ticket could not be sent. Please retry."); }
    finally { setLoading(false); }
  }

  async function addToExistingTicket() {
    if (!existing) return;
    const message = input.trim();
    setLoading(true); setNotice("");
    try {
      if (pending) {
        setUploading(true);
        const form = new FormData();
        form.append("visitorId", visitorId); form.append("ticketId", existing.id); form.append("file", pending.blob, pending.name || "screenshot");
        if (message) form.append("caption", message);
        const response = await fetch("/api/support/attachment", { method: "POST", body: form });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Your message could not be sent.");
        clearPending();
      } else if (message) {
        const response = await fetch(`/api/support/tickets/${existing.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId, message }) });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Your message could not be sent.");
      }
      setInput(""); const id = existing.id; setExisting(null); setFormQuickAnswerId(null);
      loadTickets();
      await openTicket(id);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Your message could not be sent. Please retry."); }
    finally { setLoading(false); setUploading(false); }
  }

  async function sendTicketMessage(event: React.FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (loading || uploading || !ticketId) return;
    if (!message && !pending) return;
    setLoading(true); setNotice("");
    try {
      if (pending) {
        setUploading(true);
        const form = new FormData();
        form.append("visitorId", visitorId); form.append("ticketId", ticketId); form.append("file", pending.blob, pending.name || "screenshot");
        if (message) form.append("caption", message);
        const response = await fetch("/api/support/attachment", { method: "POST", body: form });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Your message could not be sent.");
        clearPending();
      } else {
        const response = await fetch(`/api/support/tickets/${ticketId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId, message }) });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Your message could not be sent.");
      }
      setInput("");
      await openTicket(ticketId);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Your message could not be sent. Please retry."); }
    finally { setLoading(false); setUploading(false); }
  }

  async function reopenTicket() {
    if (!ticketId) return;
    setLoading(true); setNotice("");
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/reopen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "This ticket could not be reopened.");
      await openTicket(ticketId); loadTickets();
    } catch (error) { setNotice(error instanceof Error ? error.message : "This ticket could not be reopened. Please retry."); }
    finally { setLoading(false); }
  }

  function startNewFromClosed() {
    if (!ticket) return;
    setTopic((["payment", "link", "account", "other"].includes(ticket.topic) ? ticket.topic : "other") as TicketTopic);
    setParentTicketId(ticket.id); setFormQuickAnswerId(null); setExisting(null); setInput(""); setNotice(""); setScreen("form");
  }

  const homeTickets = tickets.filter(t => ["open", "investigating", "waiting"].includes(t.status) || (t.status === "solved" && t.canReopen));

  // Admins answer support themselves - they don't need the customer chat
  // bubble on their own admin pages. All hooks above still run on every
  // render (rules of hooks), only the final markup is skipped.
  if (pathname?.startsWith("/admin")) return null;

  return <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
    {open && <div id="wazap-support-panel" role="region" aria-label="Wazap support chat" onKeyDown={event => { if (event.key === "Escape") closeChat(); }} className="w-[calc(100vw-2rem)] max-w-sm max-h-[calc(100dvh-110px)] rounded-2xl border border-[#25D366]/25 bg-[#0d1a0d] shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#25D366]/15 bg-[#111811]">
        {ready && screen !== "home" ? <button type="button" aria-label="Back" onClick={goBack} className="w-9 h-9 rounded-full border border-[#25D366]/20 flex items-center justify-center text-slate-300 hover:text-white hover:border-[#25D366]/40 shrink-0 transition-colors"><ChevronLeft size={18} /></button>
          : <div className="w-9 h-9 rounded-full bg-[#25D366]/15 flex items-center justify-center shrink-0"><Headphones size={18} className="text-[#25D366]" /></div>}
        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white truncate">Wazap Support</p><p className="text-[11px] text-slate-400">Real people · replies within 12 hours</p></div>
        <button aria-label="Close support chat" onClick={closeChat} className="text-slate-400 hover:text-white shrink-0 ml-1"><X size={17} /></button>
      </div>

      {checking ? <p role="status" className="p-6 text-sm text-slate-400">Restoring your chat…</p> : !ready ? <form onSubmit={start} className="p-5 space-y-4 overflow-y-auto">
        <div><h2 className="text-lg font-semibold text-white">How can we reach you?</h2><p className="text-xs leading-5 text-slate-400 mt-2">Leave your details and we&apos;ll get you connected to support. We reply within 12 hours. Your enquiry stays linked to you.</p></div>
        <div><label htmlFor="chat-name" className="block text-xs text-slate-300 mb-1.5">Full name</label><input ref={nameRef} id="chat-name" name="name" autoComplete="name" required minLength={2} maxLength={120} value={contact.name} onChange={event => setContact({ ...contact, name: event.target.value })} className="wp-chat-field" placeholder="Your full name" /></div>
        <div><label htmlFor="chat-email" className="block text-xs text-slate-300 mb-1.5">Email address</label><input id="chat-email" type="email" name="email" autoComplete="email" required maxLength={255} value={contact.email} onChange={event => setContact({ ...contact, email: event.target.value })} className="wp-chat-field" placeholder="you@company.com" /></div>
        <div><label htmlFor="chat-phone" className="block text-xs text-slate-300 mb-1.5">Phone / WhatsApp number</label><input id="chat-phone" type="tel" name="tel" autoComplete="tel" required maxLength={40} value={contact.phone} onChange={event => setContact({ ...contact, phone: event.target.value })} className="wp-chat-field" placeholder="+971 50 123 4567" /><p className="mt-1 text-[11px] text-slate-500">Include your country code, starting with +.</p></div>
        <label className="flex items-start gap-2 text-[11px] leading-5 text-slate-300"><input type="checkbox" checked={newsletter} onChange={event => setNewsletter(event.target.checked)} className="mt-1" />Send me Wazap newsletters and product updates (optional). Email confirmation is required.</label>
        <p className="text-[11px] leading-5 text-slate-400">We use these details to respond to your enquiry and keep its history. This does not subscribe you to marketing. <Link href="/privacy" className="text-[#25D366] underline">Privacy policy</Link></p>
        {notice && <p role="alert" className="text-xs text-amber-200">{notice}</p>}
        <button type="submit" disabled={loading} className="wp-primary w-full justify-center disabled:opacity-50">{loading ? "Saving your details…" : "Continue"}<ArrowRight size={16} /></button>
      </form> : <>

        {screen === "home" && <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {notice && <p role="status" className="text-xs text-amber-200">{notice}</p>}
          <button type="button" onClick={() => setScreen("topic")} className="wp-primary w-full justify-center"><Plus size={16} />New ticket</button>
          {session?.user && <Link href="/support/tickets" className="block text-center text-xs text-[#25D366] underline">My tickets</Link>}
          {whatsapp?.available && <a href={whatsapp.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366]/15 border border-[#25D366]/30 px-3 py-2.5 text-sm font-medium text-[#25D366]"><Smartphone size={15} />Chat on WhatsApp</a>}
          {whatsapp && !whatsapp.available && whatsapp.reason === "plan" && <Link href="/billing#plans" className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-500"><Smartphone size={15} />WhatsApp support · Growth & Agency</Link>}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Your tickets</h3>
            {ticketsLoading ? <p className="text-xs text-slate-500">Loading…</p> : homeTickets.length === 0 ? <p className="text-xs text-slate-500">No open tickets yet.</p> : <ul className="space-y-2">
              {homeTickets.map(t => <li key={t.id}><button type="button" onClick={() => openTicket(t.id)} className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#111811] px-3 py-2.5 text-left hover:border-[#25D366]/40 transition-colors">
                <span className="min-w-0"><span className="block text-sm text-white">#{t.number} · {TOPIC_LABELS[t.topic] || t.topic}</span><span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusChipClass(t.status)}`}>{STATUS_LABELS[t.status] || t.status}</span></span>
                {t.unread > 0 && <span className="shrink-0 w-2 h-2 rounded-full bg-[#25D366]" aria-hidden="true" />}
              </button></li>)}
            </ul>}
          </div>
        </div>}

        {screen === "topic" && <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm text-slate-300 mb-3">What&apos;s this about?</p>
          <div className="grid grid-cols-2 gap-2.5">
            {TOPICS.map(item => <button key={item.id} type="button" onClick={() => pickTopic(item.id)} className="flex flex-col items-center gap-2 rounded-xl border border-slate-800 bg-[#111811] px-3 py-4 text-center text-sm text-white hover:border-[#25D366]/40 transition-colors">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#25D366]/10 text-[#25D366]"><item.icon size={17} /></span>
              {item.label}
            </button>)}
          </div>
        </div>}

        {screen === "answers" && <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {personal && personal.sentences.length > 0 && <div className="rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 px-3 py-2.5 text-xs text-slate-300 space-y-1">{personal.sentences.map((s, i) => <p key={i}>{s}</p>)}</div>}
          {answersLoading ? <p className="text-xs text-slate-500">Loading…</p> : <div className="space-y-2">
            {quickAnswers.map(a => <button key={a.id} type="button" onClick={() => pickAnswer(a)} className="w-full text-left rounded-xl border border-slate-800 bg-[#111811] px-3 py-2.5 text-sm text-white hover:border-[#25D366]/40">{a.title}</button>)}
          </div>}
          <button type="button" onClick={() => { setFormQuickAnswerId(null); setParentTicketId(null); setFormOrigin("answers"); setScreen("form"); }} className="w-full text-center text-xs text-slate-500 underline pt-1">None of these — raise a ticket</button>
        </div>}

        {screen === "answer" && activeAnswer && <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">{activeAnswer.title}</h3>
          <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">{renderText(activeAnswer.body)}</p>
          {personal && personal.sentences.length > 0 && <div className="rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 px-3 py-2.5 text-xs text-slate-300 space-y-1">{personal.sentences.map((s, i) => <p key={i}>{s}</p>)}</div>}
          {activeAnswer.action && <Link href={activeAnswer.action.href} className="wp-primary w-full justify-center">{activeAnswer.action.label}</Link>}
          <button type="button" onClick={markSolved} className="w-full rounded-xl border border-[#25D366]/40 px-3 py-2.5 text-sm text-[#25D366]">✓ This solved my problem</button>
          <button type="button" onClick={stillNeedHelp} className="w-full flex items-center justify-center gap-1.5 text-sm text-slate-300 underline">Still need help · Raise ticket<ArrowRight size={14} /></button>
        </div>}

        {screen === "form" && <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {existing ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-100 space-y-3">
            <p>You already have ticket #{existing.number} open about this.</p>
            <div className="flex gap-2">
              <button type="button" disabled={loading || uploading} onClick={addToExistingTicket} className="flex-1 rounded-lg bg-[#25D366] text-black text-xs font-semibold py-2 disabled:opacity-50">Add to #{existing.number}</button>
              <button type="button" disabled={loading || uploading} onClick={() => createTicketRequest(true)} className="flex-1 rounded-lg border border-slate-700 text-slate-300 text-xs py-2 disabled:opacity-50">It&apos;s a different problem</button>
            </div>
          </div> : <form onSubmit={event => { event.preventDefault(); createTicketRequest(false); }} className="flex flex-col gap-3">
            <div>
              <label htmlFor="ticket-message" className="block text-xs text-slate-300 mb-1.5">Tell us what&apos;s happening</label>
              <textarea id="ticket-message" value={input} onChange={event => setInput(event.target.value)} rows={4} maxLength={4000} className="wp-chat-field resize-none w-full" placeholder="Describe the problem…" />
              {TOPIC_HINTS[topic] && <p className="mt-1 text-[11px] text-slate-500">{TOPIC_HINTS[topic]}</p>}
            </div>
            {pending && <div className="flex items-center gap-2"><img src={pending.previewUrl} alt="Screenshot preview" className="w-10 h-10 rounded-lg object-cover border border-slate-700" /><span className="flex-1 min-w-0 truncate text-xs text-slate-400">{pending.name}</span><button type="button" aria-label="Remove screenshot" onClick={clearPending} className="text-slate-400 hover:text-white"><X size={14} /></button></div>}
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} className="hidden" />
              <button type="button" aria-label="Attach a screenshot" onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-[#25D366]/40 flex items-center justify-center shrink-0"><Paperclip size={16} /></button>
              <span className="text-[11px] text-slate-500">Optional screenshot</span>
            </div>
            <button type="submit" disabled={loading || uploading || (!input.trim() && !pending)} className="wp-primary w-full justify-center disabled:opacity-50">{loading || uploading ? "Sending…" : "Raise ticket"}</button>
          </form>}
          {notice && <p role="alert" className="text-xs text-amber-200">{notice}</p>}
        </div>}

        {screen === "ticket" && <>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#25D366]/10 bg-[#111811]">
            <span className="text-xs font-semibold text-white">#{ticket?.number || "…"}</span>
            <span className="text-[11px] text-slate-500">· {TOPIC_LABELS[ticket?.topic || "other"]}</span>
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${statusChipClass(ticket?.status)}`}>{STATUS_LABELS[ticket?.status || "open"]}</span>
          </div>
          {ticket?.status === "solved" && <div className="flex items-center justify-between gap-2 px-4 py-2 bg-[#25D366]/10 border-b border-[#25D366]/20 text-xs text-[#25D366]">
            <span>Solved ✓ — not fixed?</span>{ticket.canReopen ? <button type="button" onClick={reopenTicket} disabled={loading} className="underline font-semibold disabled:opacity-50">Reopen</button> : <span className="text-slate-500">Start a new ticket</span>}
          </div>}
          {ticket?.status === "closed" && <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-700 text-xs text-slate-400">This ticket is closed.</div>}
          <div aria-live="polite" aria-relevant="additions text" className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 max-h-[340px]">
            {ticket?.messages.map(message => <div key={message.id} className={`flex ${message.sender === "visitor" ? "justify-end" : "justify-start"}`}>
              {message.sender === "bot" ? <div className="w-full max-w-[90%] rounded-2xl border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">{message.body}</div>
                : <div dir="auto" className={`rounded-2xl px-3 py-2.5 text-sm max-w-[85%] leading-relaxed whitespace-pre-line break-words ${message.sender === "visitor" ? "bg-[#25D366] text-black" : "bg-[#183322] border border-[#365b40] text-slate-100"}`}>
                  {message.sender === "visitor" ? message.body : renderText(message.body)}
                  {message.attachments.map(a => <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noopener noreferrer" className="block mt-1.5"><img src={attachmentUrl(a.id)} alt="Screenshot" className="max-w-[200px] rounded-lg border border-black/10" /></a>)}
                </div>}
            </div>)}
            <div ref={bottomRef} />
          </div>
          {pending && <div className="flex items-center gap-2 px-4 pb-2"><img src={pending.previewUrl} alt="Screenshot preview" className="w-10 h-10 rounded-lg object-cover border border-slate-700" /><span className="flex-1 min-w-0 truncate text-xs text-slate-400">{pending.name}</span><button type="button" aria-label="Remove screenshot" onClick={clearPending} disabled={uploading} className="text-slate-400 hover:text-white disabled:opacity-40"><X size={14} /></button></div>}
          {notice && <p role="status" className="px-4 pb-2 text-xs text-amber-200">{notice}</p>}
          {ticket?.status !== "closed" ? <form onSubmit={sendTicketMessage} className="flex items-center gap-2 px-3 py-3 border-t border-[#25D366]/20 bg-[#111811]">
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} className="hidden" />
            <button type="button" aria-label="Attach a screenshot" onClick={() => fileInputRef.current?.click()} disabled={loading || uploading} className="w-9 h-9 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-[#25D366]/40 disabled:opacity-40 flex items-center justify-center shrink-0"><Paperclip size={16} /></button>
            <input dir="auto" ref={inputRef} value={input} onChange={event => setInput(event.target.value)} aria-label="Message Wazap support" maxLength={4000} placeholder="Write your message…" className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white" />
            <button aria-label="Send support message" type="submit" disabled={(!input.trim() && !pending) || loading || uploading} className="w-9 h-9 rounded-xl bg-[#25D366] disabled:opacity-40 flex items-center justify-center shrink-0"><Send size={17} className="text-black" /></button>
          </form> : <div className="px-3 py-3 border-t border-[#25D366]/20 bg-[#111811]"><button type="button" onClick={startNewFromClosed} className="wp-primary w-full justify-center">Start new ticket</button></div>}
        </>}

        <p className="px-4 pb-3 pt-1 text-[10px] leading-4 text-slate-500 bg-[#111811]">Never share passwords, login codes or card details.</p>
      </>}
    </div>}
    <button ref={launcherRef} onClick={() => (open ? closeChat() : setOpen(true))} className="relative w-12 h-12 rounded-full bg-[#25D366] hover:bg-[#1fba58] shadow-lg flex items-center justify-center sm:w-14 sm:h-14" aria-label={open ? "Close support chat" : unreadCount > 0 ? `Open support chat, ${unreadCount} new repl${unreadCount === 1 ? "y" : "ies"}` : "Open support chat"} aria-expanded={open} aria-controls="wazap-support-panel">
      {open ? <X size={22} className="text-black" /> : <MessageCircle size={24} className="text-black" />}
      {!open && unreadCount > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-[#0d1a0d]">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
  </div>;
}
