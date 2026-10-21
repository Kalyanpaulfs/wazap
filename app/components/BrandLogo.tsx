const style = { display: "block", width: undefined as number | undefined, height: "auto", flexShrink: 0 } as const;

/** `onLight` follows the site theme (ink mark in light, white mark in dark); `onDark` always uses the white mark. */
export default function BrandLogo({ tone = "onDark", width = 132 }: { tone?: "onDark" | "onLight"; width?: number }) {
  const common = { alt: "Wazap", width: 1405, height: 380, style: { ...style, width } };
  if (tone === "onDark") return <img src="/brand/wazap-logo-transparent.png" {...common} />;
  return (
    <>
      <img src="/brand/wazap-logo-ink.png" className="logo-for-light" {...common} />
      <img src="/brand/wazap-logo-transparent.png" className="logo-for-dark" {...common} alt="" aria-hidden />
    </>
  );
}
