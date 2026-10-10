"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, MessageSquareText, Send } from "lucide-react";
import { recordToolUse } from "@/lib/tool-activity-client";
const openings = {
  professional: "Thank you for your message.",
  friendly: "Thanks for reaching out!",
  concise: "Thanks for your message.",
};
export default function Page() {
  const [message, setMessage] = useState("");
  const [goal, setGoal] = useState("answer their inquiry");
  const [tone, setTone] = useState<keyof typeof openings>("professional");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [generated, setGenerated] = useState("");
  const [error, setError] = useState("");
  const draft = useMemo(
    () =>
      `${name ? `Hi ${name}, ` : ""}${openings[tone]} ${message ? `Regarding “${message.slice(0, 120)}${message.length > 120 ? "…" : ""}”, ` : ""}I’d be happy to ${goal.trim() || "help"}. Please share any details I should check, and I’ll guide you through the next step.`,
    [message, goal, tone, name],
  );
  async function copy() {
    setError("");
    try { await navigator.clipboard.writeText(generated); setCopied(true); setTimeout(() => setCopied(false), 1400); }
    catch { setError("Copy was blocked. Select the reply and copy it manually."); }
  }
  return (
    <main className="hero-bg min-h-[80vh] px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/tools" className="text-sm text-slate-500">
          ← Tools
        </Link>
        <div className="mt-8 text-center">
          <MessageSquareText className="mx-auto h-11 w-11 text-[#25D366]" />
          <h1 className="mt-4 text-4xl font-bold text-white">
            Customer Reply Generator
          </h1>
          <p className="mt-3 text-slate-400">
            Turn a customer message into a clear, ready-to-send WhatsApp reply.
          </p>
        </div>
        <div className="mt-10 grid gap-5 rounded-3xl border border-slate-800 bg-[#111811] p-6 md:grid-cols-2">
          <div className="space-y-4">
            <textarea aria-label="Paste the customer message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Paste the customer message…"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-white outline-none focus:border-[#25D366]"
            />
            <input aria-label="Customer name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            />
            <input aria-label="What should the reply achieve?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the reply achieve?"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            />
            <select
              aria-label="Reply tone" value={tone}
              onChange={(e) => setTone(e.target.value as keyof typeof openings)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
            </select>
            <button disabled={!message.trim()} onClick={async () => {
              setError("");
              try { await recordToolUse("replyGenerator", "generate"); setGenerated(draft); }
              catch (e) { setError(e instanceof Error ? e.message : "Generation failed."); }
            }} className="w-full rounded-full bg-[#25D366] py-3 text-sm font-bold text-black disabled:opacity-40">Generate reply</button>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </div>
          <div className="flex flex-col rounded-2xl bg-[#0b141a] p-5">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Suggested reply
            </p>
            <p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-7 text-slate-200">
              {generated || "Add a customer message, choose the goal and generate your reply."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={copy}
                disabled={!generated}
                className="flex items-center justify-center gap-2 rounded-full border border-slate-700 py-2.5 text-sm text-white"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={generated ? `https://wa.me/?text=${encodeURIComponent(generated)}` : undefined}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center justify-center gap-2 rounded-full bg-[#25D366] py-2.5 text-sm font-bold text-black ${!generated ? "pointer-events-none opacity-40" : ""}`}
              >
                <Send className="h-4 w-4" />
                Open
              </a>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Wazap drafts text for your review. It does not send or automate
          replies.
        </p>
      </div>
    </main>
  );
}
