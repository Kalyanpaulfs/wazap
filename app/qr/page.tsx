import QRGenerator from "./QRGenerator";
import { Download, Link2, MessageSquareText, QrCode, ScanLine } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "HowTo",
      name: "How to create a WhatsApp QR code",
      description: "Create and download a WhatsApp QR code for your phone number with Wazap.",
      totalTime: "PT1M",
      step: [
        { "@type": "HowToStep", position: 1, name: "Enter your number", text: "Choose your country code and enter the WhatsApp number customers should contact." },
        { "@type": "HowToStep", position: 2, name: "Add a message", text: "Optionally add the message that should be ready when the customer opens WhatsApp." },
        { "@type": "HowToStep", position: 3, name: "Customize the QR code", text: "Choose a colour and preview the QR code before using it." },
        { "@type": "HowToStep", position: 4, name: "Download the PNG", text: "Download the QR code as a high-quality PNG and test it before printing or publishing." },
      ],
    },
  ],
};

export const metadata: Metadata = {
  title: "WhatsApp QR Code Generator — Free PNG Download",
  description: "Create a free WhatsApp QR code for any number with an optional pre-filled message. Customize the color, preview it instantly and download a PNG.",
  keywords: ["whatsapp qr code generator", "whatsapp qr code", "wa.me qr code", "whatsapp scan qr", "whatsapp business qr code", "free qr code generator"],
  alternates: { canonical: "https://wazap.lt/qr" },
  openGraph: {
    title: "Free WhatsApp QR Code Generator — Wazap",
    description: "Create a custom WhatsApp QR code. Choose colour, add message, download PNG. Perfect for business cards and websites.",
    url: "https://wazap.lt/qr",
  },
};

export default async function QRPage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  return (
    <>
      <script id="qr-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {isLoggedIn && (
        <div className="border-b border-border bg-bg/90 px-4 min-h-10 py-2 flex items-center text-sm">
          <Link href="/links/new" className="text-muted hover:text-text">← Create a link</Link>
        </div>
      )}
      <section className="px-4 pt-16 pb-10 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-soft border border-accent/20 mb-5">
            <QrCode className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-text mb-4">
            WhatsApp <span className="text-gradient-brand">QR Code</span> Generator
          </h1>
          <p className="text-muted text-lg">
            Create a QR code for your WhatsApp number. Put it on your website, business card, or shop — anyone scans it and opens a chat with you instantly.
          </p>
          <p className="text-sm text-accent mt-3">Free for everyone — no account or daily limit.</p>
        </div>
      </section>

      <section className="px-4 pb-20">
        <QRGenerator isLoggedIn={isLoggedIn} />
      </section>

      <section className="border-t border-border px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-text mb-3">Create and download your WhatsApp QR code</h2>
            <p className="text-muted leading-relaxed">Turn your number into a scan-to-chat QR code in about a minute. The optional message helps customers start with the right question, order, or enquiry.</p>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: <MessageSquareText className="h-6 w-6" />, title: "1. Enter your number", text: "Select the country code and enter the WhatsApp or WhatsApp Business number customers should reach." },
              { icon: <Link2 className="h-6 w-6" />, title: "2. Add a message", text: "Pre-fill a greeting, product enquiry, booking request, or any useful opening message." },
              { icon: <QrCode className="h-6 w-6" />, title: "3. Customize it", text: "Choose a colour and preview the code so it fits your brand and remains easy to scan." },
              { icon: <Download className="h-6 w-6" />, title: "4. Download PNG", text: "Save the finished QR code as a PNG, test it with a phone, and add it to digital or printed materials." },
            ].map((step) => (
              <li key={step.title} className="rounded-2xl border border-border bg-surface p-5">
                <div className="text-accent mb-4">{step.icon}</div>
                <h3 className="font-semibold text-text mb-2">{step.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border px-4 py-16 bg-surface">
        <div className="mx-auto max-w-4xl grid lg:grid-cols-[1.1fr_.9fr] gap-8 items-center">
          <div>
            <h2 className="text-2xl font-bold text-text mb-4">What happens when someone scans it?</h2>
            <p className="text-muted leading-relaxed mb-4">The QR code contains a WhatsApp click-to-chat link for your number. Scanning it opens the conversation in WhatsApp with your optional message ready to send. The customer does not need to save your number first.</p>
            <p className="text-muted leading-relaxed">Because the number and message are encoded in the QR code, the code continues to work unless you change or disconnect that WhatsApp number. Always scan-test the downloaded image before printing a large batch.</p>
          </div>
          <div className="rounded-2xl border border-accent/20 bg-accent-soft p-6">
            <ScanLine className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-lg font-semibold text-text mb-3">Make every scan useful</h3>
            <ul className="space-y-3 text-sm text-muted">
              <li>Use a short pre-filled message that identifies the campaign or location.</li>
              <li>Leave clear white space around the QR code when placing it in a design.</li>
              <li>Print it large enough to scan comfortably from the expected distance.</li>
              <li>Keep strong contrast between the QR code and its background.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-16 bg-bg">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-xl font-bold text-text text-center mb-8">Where to use your QR code</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              {
                label: "Shop signage",
                icon: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="4" width="24" height="18" rx="3" stroke="#087f50" strokeWidth="1.8"/><path d="M10 22v6M22 22v6M7 28h18" stroke="#087f50" strokeWidth="1.8" strokeLinecap="round"/><path d="M10 13h12M10 17h8" stroke="#087f50" strokeWidth="1.8" strokeLinecap="round"/></svg>
              },
              {
                label: "Business card",
                icon: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="2" y="8" width="28" height="16" rx="3" stroke="#087f50" strokeWidth="1.8"/><circle cx="10" cy="16" r="3.5" stroke="#087f50" strokeWidth="1.8"/><path d="M16 13h10M16 17h8" stroke="#087f50" strokeWidth="1.8" strokeLinecap="round"/></svg>
              },
              {
                label: "Website",
                icon: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" stroke="#087f50" strokeWidth="1.8"/><ellipse cx="16" cy="16" rx="5" ry="12" stroke="#087f50" strokeWidth="1.8"/><path d="M4 16h24M5 10h22M5 22h22" stroke="#087f50" strokeWidth="1.8" strokeLinecap="round"/></svg>
              },
              {
                label: "Packaging",
                icon: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M4 10l12-6 12 6v12l-12 6-12-6V10z" stroke="#087f50" strokeWidth="1.8" strokeLinejoin="round"/><path d="M16 4v24M4 10l12 6 12-6" stroke="#087f50" strokeWidth="1.8" strokeLinecap="round"/></svg>
              },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex justify-center mb-3">{item.icon}</div>
                <p className="text-sm text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-14">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-text text-center mb-8">More free WhatsApp business tools</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { href: "/tools/link", title: "Click-to-chat link", text: "Create and share the WhatsApp link behind your QR code." },
              { href: "/tools/widget", title: "Website chat widget", text: "Add a WhatsApp contact button to your website." },
              { href: "/tools/rotator", title: "Link rotator", text: "Rotate click-to-chat handoffs across your team's numbers." },
            ].map((tool) => (
              <Link key={tool.href} href={tool.href} className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent/40">
                <h3 className="font-semibold text-text mb-2">{tool.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{tool.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
