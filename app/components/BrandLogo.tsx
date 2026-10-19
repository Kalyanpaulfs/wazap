export default function BrandLogo({ tone = "onDark", width = 132 }: { tone?: "onDark" | "onLight"; width?: number }) {
  return (
    <img
      src={tone === "onLight" ? "/brand/wazap-logo-ink.png" : "/brand/wazap-logo-transparent.png"}
      alt="Wazap"
      width={1405}
      height={380}
      style={{ display: "block", width, height: "auto", flexShrink: 0 }}
    />
  );
}
