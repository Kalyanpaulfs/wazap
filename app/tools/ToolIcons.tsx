export function IconWidget({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="2" y="2" width="24" height="24" rx="6" stroke={color} strokeWidth="1.8" />
      <circle cx="20" cy="20" r="6" fill={color} />
      <path d="M20 17.5v5M17.5 20h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 9h8M7 13h6M7 17h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconBulk({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path d="M4 8h20M4 14h14M4 20h8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="22" cy="20" r="5" fill={color} />
      <path d="M20 20l1.5 1.5L24 18" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChecker({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="11" stroke={color} strokeWidth="1.8" />
      <path d="M9 14l3.5 3.5L19 10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAdBuilder({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path d="M4 22L10 14l5 4 4-7 5 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="6" r="3" fill={color} />
      <path d="M4 6h10" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconVCard({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="2" y="6" width="24" height="16" rx="3" stroke={color} strokeWidth="1.8" />
      <circle cx="9" cy="13" r="3" stroke={color} strokeWidth="1.8" />
      <path d="M14 11h8M14 15h6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconLinktree({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path d="M14 4v16M14 20l-4 4M14 20l4 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="4" width="8" height="5" rx="2" stroke={color} strokeWidth="1.8" />
      <rect x="16" y="4" width="8" height="5" rx="2" stroke={color} strokeWidth="1.8" />
      <rect x="9" y="12" width="10" height="5" rx="2" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

export function IconRotator({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path d="M5 14A9 9 0 0114 5a9 9 0 018.5 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M23 14A9 9 0 0114 23a9 9 0 01-8.5-6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M21 8l2 3-3 1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 20l-2-3 3-1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTranscript({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="4" y="3" width="20" height="22" rx="3" stroke={color} strokeWidth="1.8" />
      <path d="M8 9h12M8 13h12M8 17h8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 20l2 2 4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconUser({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="9" r="5" stroke={color} strokeWidth="1.8" />
      <path d="M4 24c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconSend({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path d="M3 14L25 4L15 25L13 16L3 14Z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 16L19 10" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconQR({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="3" y="3" width="9" height="9" rx="2" stroke={color} strokeWidth="1.8" />
      <rect x="16" y="3" width="9" height="9" rx="2" stroke={color} strokeWidth="1.8" />
      <rect x="3" y="16" width="9" height="9" rx="2" stroke={color} strokeWidth="1.8" />
      <rect x="6" y="6" width="3" height="3" fill={color} rx="0.5" />
      <rect x="19" y="6" width="3" height="3" fill={color} rx="0.5" />
      <rect x="6" y="19" width="3" height="3" fill={color} rx="0.5" />
      <path d="M16 16h3v3h-3zM22 16h3M19 19h6M19 22h6v3h-6z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPricing({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="11" stroke={color} strokeWidth="1.8" />
      <path d="M14 7v14M10 10.5C10 9.12 11.34 8 13 8h2c1.66 0 3 1.12 3 2.5S16.66 13 15 13h-2c-1.66 0-3 1.12-3 2.5S11.34 20 13 20h2c1.66 0 3-1.12 3-2.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconUpload({ size = 28, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path d="M14 18V8M10 12l4-4 4 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
