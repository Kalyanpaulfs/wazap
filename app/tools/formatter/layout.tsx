import type { Metadata } from "next";
import Link from "next/link";
import ToolSeo from "@/app/ToolSeo";

const description = "Add bold, italic, strikethrough and monospace to WhatsApp messages. Preview the result and learn the formatting symbols. One free copy; paid plans unlock more.";
export const metadata: Metadata = {
  title: "WhatsApp Text Formatter — Bold, Italic, Strikethrough",
  description,
  alternates: { canonical: "https://wazap.lt/tools/formatter" },
  openGraph: { title: "WhatsApp Text Formatter | Wazap", description, url: "https://wazap.lt/tools/formatter" },
};

const formats = [
  { name: "Bold", syntax: "*Viewing confirmed*", example: <strong>Viewing confirmed</strong> },
  { name: "Italic", syntax: "_Please arrive five minutes early_", example: <em>Please arrive five minutes early</em> },
  { name: "Strikethrough", syntax: "~Previous time: 2 pm~", example: <s>Previous time: 2 pm</s> },
  { name: "Monospace", syntax: "```Reference: EXAMPLE-01```", example: <code>Reference: EXAMPLE-01</code> },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}
    <section className="mx-auto max-w-3xl px-4 py-10 text-sm leading-7 text-slate-300" aria-labelledby="formatting-guide">
      <h2 id="formatting-guide" className="text-2xl font-bold text-white">How to format text in WhatsApp</h2>
      <ol className="mt-4 list-decimal space-y-2 pl-5">
        <li>Write your message in the editor, then select the words you want to format.</li>
        <li>Choose Bold, Italic, Strikethrough or Monospace. Check the preview below the editor.</li>
        <li>Copy the text, paste it into a WhatsApp chat and check it before sending.</li>
      </ol>
      <p className="mt-4">You can also type the symbols directly in WhatsApp. Put them on both sides of the words, without a space next to the opening or closing symbol.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {formats.map(format => <article key={format.name} className="min-w-0 rounded-2xl border border-slate-800 bg-[#111811] p-5">
          <h3 className="font-semibold text-white">{format.name}</h3>
          <p className="mt-2 text-xs text-slate-400">Type this</p>
          <code dir="ltr" className="block break-words text-[#8be8ac]">{format.syntax}</code>
          <p className="mt-3 text-xs text-slate-400">Preview</p><p className="break-words">{format.example}</p>
        </article>)}
      </div>
      <h2 className="mt-8 text-xl font-bold text-white">Make the message easier to read</h2>
      <p className="mt-3">Use bold for the main detail, such as a confirmed appointment, and keep the next action on a separate line. Formatting adds emphasis; it does not change the font family of the entire chat. Wazap supports the four styles above, rather than decorative Unicode fonts.</p>
      <p className="mt-3">If a style does not appear, check that both symbols are present and try a simple example first. The preview is illustrative; review the pasted result in your version of WhatsApp.</p>
      <p className="mt-3">Editing and preview happen in your browser. Wazap does not send the message for you. One copy is available free in this browser; a paid plan unlocks further copies.</p>
      <p className="mt-4"><a href="https://faq.whatsapp.com/539178204879377/" className="text-[#8be8ac] underline" rel="noopener noreferrer" target="_blank">WhatsApp’s formatting instructions</a></p>
      <aside className="mt-8 rounded-2xl border border-[#25D366]/25 bg-[#111811] p-5" aria-labelledby="formatter-next">
        <h2 id="formatter-next" className="text-lg font-semibold text-white">Prepare the next step</h2>
        <p className="mt-2">Need wording first? Browse <Link href="/tools/templates" className="text-[#8be8ac] underline">WhatsApp message templates</Link>. To open a chat with a prepared message, use the <Link href="/tools/link" className="text-[#8be8ac] underline">click-to-chat link builder</Link>.</p>
        <p className="mt-3">For a sales team, the <Link href="/tools/rotator" className="text-[#8be8ac] underline">WhatsApp lead router</Link> shares one link across multiple numbers. It rotates handoffs; it does not send messages or confirm sales.</p>
      </aside>
    </section><ToolSeo k="formatter" />
  </>;
}
