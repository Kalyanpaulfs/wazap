import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const alt = "Wazap — One WhatsApp link for your sales team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social-card colours mirror app/theme/tokens.css (ImageResponse cannot read CSS variables).
const INK = "#0e1726";
const MUTED = "#5b6676";
const ACCENT = "#087f50";
const PAGE = "#f7f8f5";

const pill = (label: string) => (
  <div style={{
    background: "#e3f7ec", border: "1px solid rgba(8,127,80,0.25)", borderRadius: "999px",
    padding: "8px 20px", fontSize: "20px", color: "#06703f", fontWeight: 600, display: "flex",
  }}>{label}</div>
);

export default async function OGImage() {
  const art = await readFile(path.join(process.cwd(), "public/art/home/hero-og.jpg"));
  const artSrc = `data:image/jpeg;base64,${art.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{
        width: "1200px", height: "630px", background: PAGE, display: "flex", alignItems: "center",
        fontFamily: "sans-serif", position: "relative", overflow: "hidden", padding: "0 72px",
      }}>
        <div style={{
          position: "absolute", bottom: "-260px", left: "-160px", width: "720px", height: "720px", borderRadius: "50%", display: "flex",
          background: "radial-gradient(circle, rgba(15,169,104,0.16) 0%, transparent 70%)",
        }} />
        <div style={{ display: "flex", flexDirection: "column", width: "560px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "36px" }}>
            <svg width="52" height="52" viewBox="0 0 512 512" fill="none">
              <path fill="#16f06e" d="M256 43C138 43 43 138 43 256c0 47 15 90 42 125L68 460c-2 16 9 22 22 14l88-60c25 12 51 18 78 18 118 0 213-95 213-213S374 43 256 43Z" />
              <g stroke="#ffffff" strokeWidth="50" strokeLinecap="round" strokeLinejoin="round">
                <path d="M205 164h22c34 0 41 27 57 51s25 41 59 41" />
                <path d="M205 348h22c34 0 41-27 57-51s25-41 59-41" />
              </g>
              <circle cx="165" cy="164" r="47" fill="#ffffff" />
              <circle cx="165" cy="348" r="47" fill="#ffffff" />
              <circle cx="370" cy="256" r="53" fill="#ffffff" />
            </svg>
            <span style={{ fontSize: "40px", fontWeight: 800, color: INK, letterSpacing: "-1px" }}>Wazap</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: "56px", fontWeight: 800, color: INK, lineHeight: 1.05, letterSpacing: "-2px" }}>
            <span>One WhatsApp link.</span>
            <span style={{ color: ACCENT }}>Your whole team.</span>
          </div>
          <div style={{ display: "flex", fontSize: "24px", color: MUTED, lineHeight: 1.4, margin: "24px 0 34px", maxWidth: "540px" }}>
            Rotate handoffs across your team. Start with a 3-day free trial, 100 routed handoffs.
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {pill("Lead Routing")}
            {pill("Campaign Links")}
            
          </div>
        </div>
        <div style={{ display: "flex", position: "absolute", right: "24px", top: "55px", width: "520px", height: "520px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artSrc} width={520} height={520} alt="" />
        </div>
        <div style={{ position: "absolute", bottom: "26px", left: "72px", fontSize: "20px", color: MUTED, display: "flex" }}>wazap.lt</div>
      </div>
    ),
    { ...size }
  );
}
