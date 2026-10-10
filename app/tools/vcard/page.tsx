"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Download, Upload, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import CountryPicker from "@/app/CountryPicker";
import { IconUser, IconVCard } from "@/app/tools/ToolIcons";

const COLORS = [
  { hex: "#25D366", label: "WhatsApp Green" },
  { hex: "#128C7E", label: "Dark Teal" },
  { hex: "#0070ba", label: "Classic Blue" },
  { hex: "#1a1a2e", label: "Midnight" },
  { hex: "#000000", label: "Black" },
  { hex: "#7c3aed", label: "Purple" },
  { hex: "#dc2626", label: "Red" },
  { hex: "#ea580c", label: "Orange" },
  { hex: "#d97706", label: "Gold" },
  { hex: "#0891b2", label: "Cyan" },
  { hex: "#be185d", label: "Pink" },
  { hex: "#374151", label: "Slate" },
];

export default function VCardPage() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [dial, setDial] = useState("+971");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [color, setColor] = useState("#25D366");
  const [photo, setPhoto] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [plan, setPlan] = useState("free");
  const [limitError, setLimitError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/tools/use?tool=vcard")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setRemaining(d.remaining === -1 ? null : d.remaining); setPlan(d.plan); } })
      .catch(() => {});
  }, []);

  const cleanDial = dial.replace("+", "");
  const fullNumber = `+${cleanDial}${phone.replace(/\D/g, "")}`;
  const waUrl = `https://wa.me/${cleanDial}${phone.replace(/\D/g, "")}`;

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  const photoBase64 = photo ? photo.split(",")[1] : null;
  const photoType = photo ? (photo.startsWith("data:image/png") ? "PNG" : "JPEG") : null;

  const vcfContent = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${name}`,
    `N:${name};;;;`,
    company && `ORG:${company}`,
    title && `TITLE:${title}`,
    `TEL;TYPE=CELL:${fullNumber}`,
    email && `EMAIL:${email}`,
    website && `URL:${website}`,
    `X-SOCIALPROFILE;type=whatsapp:${waUrl}`,
    photoBase64 && `PHOTO;ENCODING=BASE64;TYPE=${photoType}:${photoBase64}`,
    "END:VCARD",
  ].filter(Boolean).join("\n");

  async function downloadVCF() {
    setLimitError(null);
    try {
    const res = await fetch("/api/tools/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "vcard", count: 1 }),
    });
    const data = await res.json();
    if (res.status === 429) {
      setLimitError(`Daily download limit reached. Resets at midnight.`);
      return;
    }
    if (!res.ok) throw new Error(data.error || "Contact download could not be completed. Please try again.");
    setRemaining(data.remaining === -1 ? null : data.remaining);
    const blob = new Blob([vcfContent], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s/g, "-") || "contact"}.vcf`;
    a.click();
    URL.revokeObjectURL(url);    } catch (error) {
      setLimitError(error instanceof Error ? error.message : "Contact download could not be completed. Please try again.");
    }
  }

  function downloadQR() {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      const a = document.createElement("a");
      a.download = `${name.replace(/\s/g, "-") || "contact"}-qr.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  }

  const isReady = name && phone;
  const atLimit = remaining !== null && remaining <= 0;

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 min-h-10 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">vCard + QR Generator</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-white mb-2">Digital Business Card + QR</h1>
            <p className="text-slate-400">Fill in your details, upload a photo, and download your card instantly.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form */}
            <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
              <h2 className="font-semibold text-white">Your Details</h2>

              {/* Photo upload */}
              <div>
                <label className="text-xs text-slate-400 block mb-2">Profile Photo</label>
                <div className="flex items-center gap-3">
                  {photo ? (
                    <div className="relative">
                      <img src={photo} alt="Profile" className="w-16 h-16 rounded-full object-cover border-2 border-[#25D366]/40" />
                      <button onClick={() => setPhoto(null)}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center">
                      <IconUser size={28} color="#334155" />
                    </div>
                  )}
                  <button onClick={() => photoRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl border border-slate-700 hover:border-[#25D366] px-4 py-2.5 text-sm text-slate-300 hover:text-white transition-colors">
                    <Upload className="h-4 w-4" />
                    {photo ? "Change Photo" : "Upload Photo"}
                  </button>
                  <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </div>
              </div>

              {[
                { label: "Full Name *", value: name, set: setName, placeholder: "John Smith" },
                { label: "Company", value: company, set: setCompany, placeholder: "Acme Corp" },
                { label: "Job Title", value: title, set: setTitle, placeholder: "Sales Manager" },
                { label: "Email", value: email, set: setEmail, placeholder: "john@acme.com" },
                { label: "Website", value: website, set: setWebsite, placeholder: "https://acme.com" },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                  <input type="text" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                </div>
              ))}

              <div>
                <label className="text-xs text-slate-400 block mb-1">WhatsApp Number *</label>
                <div className="flex gap-2">
                  <CountryPicker value={dial} onChange={setDial} />
                  <input aria-label="Phone number" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number"
                    className="min-w-0 flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="text-xs text-slate-400 block mb-2">Card & QR Colour</label>
                <div className="grid grid-cols-6 gap-2">
                  {COLORS.map(c => (
                    <button key={c.hex} onClick={() => setColor(c.hex)} title={c.label}
                      className={`w-9 h-9 rounded-xl border-2 transition-all hover:scale-110 ${color === c.hex ? "border-white scale-110 shadow-lg" : "border-transparent"}`}
                      style={{ backgroundColor: c.hex }} />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-xs text-slate-500">Custom:</label>
                  <input aria-label="Custom QR colour" type="color" value={color} onChange={e => setColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border border-slate-700" />
                  <span className="text-xs text-slate-500 font-mono">{color}</span>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-5">
              {isReady ? (
                <>
                  {/* Card preview */}
                  <div className="rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
                    style={{ background: `linear-gradient(135deg, ${color}22 0%, #0d150d 60%)`, borderColor: color + "40" }}>
                    <div className="h-1 w-full" style={{ backgroundColor: color }} />
                    <div className="p-6 text-center">
                      {photo ? (
                        <img src={photo} alt={name} className="w-20 h-20 rounded-full object-cover mx-auto mb-3 border-3 shadow-lg"
                          style={{ border: `3px solid ${color}` }} />
                      ) : (
                        <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-3 shadow-lg"
                          style={{ backgroundColor: color }}>
                          {name[0]?.toUpperCase()}
                        </div>
                      )}
                      <h3 className="text-xl font-bold text-white">{name}</h3>
                      {title && <p className="text-sm text-slate-400 mt-0.5">{title}</p>}
                      {company && <p className="text-sm font-semibold mt-1" style={{ color }}>{company}</p>}
                      <div className="mt-3 space-y-1">
                        <p className="text-sm text-slate-300">{fullNumber}</p>
                        {email && <p className="text-xs text-slate-500">{email}</p>}
                        {website && <p className="text-xs text-slate-500">{website}</p>}
                      </div>
                    </div>
                  </div>

                  {/* QR */}
                  <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5 flex flex-col items-center gap-3">
                    <div ref={qrRef} className="bg-white p-3 rounded-xl shadow-lg">
                      <QRCodeSVG value={waUrl} size={160} fgColor={color} bgColor="#ffffff" level="H" />
                    </div>
                    <p className="text-xs text-slate-500">QR opens WhatsApp chat with you</p>
                  </div>

                  {/* Download buttons */}
                  {limitError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
                      {limitError} {plan === "free" && <Link href="/pricing" className="underline ml-1">Upgrade</Link>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={downloadVCF} disabled={atLimit}
                      className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-black transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: color }}>
                      <Download className="h-4 w-4" /> {atLimit ? "Limit reached" : "Download .vcf"}
                    </button>
                    <button onClick={downloadQR}
                      className="flex items-center justify-center gap-2 rounded-full border py-3 text-sm font-semibold text-white transition-all hover:scale-105"
                      style={{ borderColor: color + "60" }}>
                      <Download className="h-4 w-4" /> Download QR
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 text-center">Photo is embedded in the .vcf file so contacts see it when they save you</p>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
                    <IconVCard size={32} color="#334155" />
                  </div>
                  <p className="text-slate-500">Fill in your name and phone number to preview your card</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
