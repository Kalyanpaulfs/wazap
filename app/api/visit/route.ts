import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocalization, normalizeLanguage } from "@/lib/localization";
import { rateLimit } from "@/lib/rate-limit";

const TIMEZONE_COUNTRY: Record<string, string> = {
  "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Kolkata": "IN", "Asia/Kuala_Lumpur": "MY",
  "Europe/Riga": "LV", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Amsterdam": "NL",
  "Europe/London": "GB", "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Bucharest": "RO",
  "Asia/Tbilisi": "GE", "Asia/Tokyo": "JP", "Asia/Shanghai": "CN", "Asia/Seoul": "KR",
  "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Karachi": "PK", "Asia/Dhaka": "BD",
  "America/New_York": "US", "America/Los_Angeles": "US", "America/Toronto": "CA", "America/Sao_Paulo": "BR",
};

function sourceFromReferrer(raw: string) {
  if (!raw || raw === "direct") return "direct";
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return host === "wazap.lt" ? "internal" : host.slice(0, 100);
  } catch {
    return "direct";
  }
}

function cleanSource(raw: unknown) {
  const value = String(raw ?? "").trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 100);
  if (!value) return "";
  // UTM values from uptime checks previously polluted acquisition reports with
  // the server IP. IP addresses are infrastructure, not marketing sources.
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value === "wazap.lt") return "";
  return value;
}

function cleanPath(raw: unknown) {
  const value = String(raw ?? "/").trim();
  if (!value.startsWith("/") || value.length > 160) return "/";
  // Only accept browser pathnames. This keeps scanner payloads and accidental
  // object serialization out of product analytics without affecting routing.
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(value)) return "/";
  return value;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  // Analytics should fail quietly: keep the write limit without surfacing a browser error.
  if (!rateLimit(`visit:${ip}`, 30, 60_000)) return NextResponse.json({ ok: false, limited: true }, { status: 202 });
  const body = (await req.json().catch(() => ({}))) as { path?: string; language?: string; timeZone?: string; referrer?: string; source?: string };
  const language = normalizeLanguage(body.language);
  const localization = await getLocalization(language, TIMEZONE_COUNTRY[body.timeZone || ""] || null);
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; isAdmin?: boolean } | undefined;
  const userAgent = req.headers.get("user-agent") || "";
  const automated = /bot|crawler|spider|headless|lighthouse|pagespeed|preview/i.test(userAgent);
  // Keep staff audits and automated checks out of acquisition reporting.
  if (sessionUser?.isAdmin || automated) {
    return NextResponse.json({ ok: true, recorded: false }, { status: 202 });
  }
  await prisma.siteVisit.create({
    data: {
      userId: sessionUser?.id || null,
      country: localization.country,
      language,
      path: cleanPath(body.path),
      source: cleanSource(body.source) || sourceFromReferrer(String(body.referrer || "direct")),
    },
  });
  return NextResponse.json({ ok: true });
}
