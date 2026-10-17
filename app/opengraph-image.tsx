import { ImageResponse } from "next/og";

export const alt = "Wazap — One WhatsApp link for your sales team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const pill = (label: string) => (
  <div style={{
    background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)",
    borderRadius: "999px", padding: "8px 20px",
    fontSize: "18px", color: "#25D366", fontWeight: "600", display: "flex",
  }}>{label}</div>
);

export default function OGImage() {
  return new ImageResponse(
    (
      <div style={{
        width: "1200px", height: "630px",
        background: "linear-gradient(135deg, #0a0f0a 0%, #0d1f0d 50%, #0a0f0a 100%)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", fontFamily: "sans-serif", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "-100px", left: "-100px",
          width: "500px", height: "500px", borderRadius: "50%", display: "flex",
          background: "radial-gradient(circle, rgba(37,211,102,0.15) 0%, transparent 70%)",
        }} />
        <div style={{
          position: "absolute", bottom: "-100px", right: "-100px",
          width: "400px", height: "400px", borderRadius: "50%", display: "flex",
          background: "radial-gradient(circle, rgba(18,140,126,0.1) 0%, transparent 70%)",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          <div style={{
            width: "56px", height: "56px", borderRadius: "14px", background: "#25D366",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ fontSize: "32px", color: "white", display: "flex" }}>⚡</div>
          </div>
          <span style={{ fontSize: "40px", fontWeight: "800", color: "#25D366", letterSpacing: "-1px" }}>Wazap</span>
        </div>

        <div style={{
          fontSize: "64px", fontWeight: "800", color: "white", display: "flex",
          textAlign: "center", lineHeight: "1.1", marginBottom: "20px", maxWidth: "900px",
        }}>
          One WhatsApp Link.<span style={{ color: "#25D366" }}> Your Whole Team.</span>
        </div>

        <div style={{
          fontSize: "26px", color: "#94a3b8", textAlign: "center", display: "flex",
          maxWidth: "700px", marginBottom: "48px",
        }}>
          Rotate handoffs across your team. Start with a 3-day free trial — unlimited routed handoffs.
        </div>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
          {pill("Lead Routing")}
          {pill("QR Generator")}
          {pill("Campaign Links")}
          {pill("From $9/month")}
          
        </div>

        <div style={{ position: "absolute", bottom: "28px", right: "40px", fontSize: "20px", color: "#334155", display: "flex" }}>
          wazap.lt
        </div>
      </div>
    ),
    { ...size }
  );
}
