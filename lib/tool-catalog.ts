// Shared catalog of customer-facing tools, rendered by both app/links/new
// (the "Create a link" chooser) and app/tools (the "All tools" page for
// logged-in customers). Keeping the list here means a pricing/copy change,
// or a brand-new tool, only needs editing in ONE place.
//
// HOW TO ADD A NEW TOOL:
// - Paid (counts against the shared link pool): add one object to the
//   `rawPaid` array below with a unique id, name, question, desc, href and
//   iconKey. If it needs its own lock rule beyond "pool full" / "plan
//   lapsed" (like Ad link's "only on Growth+"), set `individuallyLocked`
//   and a matching `href`/`desc` for the locked state.
// - Free (always unlocked, never counted against the pool): add one object
//   to the `free` array with a unique id, name, question, description,
//   href and iconKey, plus the "Free · unlimited" badge.
// Both app/links/new/page.tsx and app/tools/AllTools.tsx pick up the new
// entry automatically - map the new iconKey to a lucide icon in
// app/components/tool-icons.tsx too.

import { adLinksAvailable, numbersPerRotatorLimit, normalizePlanKey } from "./plan-limits";
import { poolFullMessage } from "./my-links";

export type ToolIconKey = "users" | "message-circle" | "fingerprint" | "megaphone" | "qr-code" | "globe";

export type ToolCard = {
  id: string;
  name: string;
  question: string;
  description: string;
  href: string;
  iconKey: ToolIconKey;
  locked: boolean;
  lockReason?: string;
  badge?: string;
  note?: string;
};

export type ToolCatalogInput = {
  /** Resolved link plan (lib/router-entitlements.ts linkPlan), e.g. "free" | "basic" | "pro" | "ultimate". */
  plan: string;
  /** Shared link-pool usage (lib/my-links.ts getMyLinks). */
  used: number;
  limit: number;
};

export type ToolCatalog = {
  paid: ToolCard[];
  free: ToolCard[];
};

/**
 * Builds the "Paid tools" and "Free tools" card lists for the given user's
 * resolved plan + current pool usage. Mirrors exactly what app/links/new
 * used to compute inline (same copy, hrefs and lock rules), so both pages
 * stay visually identical.
 */
export function getToolCatalog({ plan, used, limit }: ToolCatalogInput): ToolCatalog {
  const poolFull = used >= limit;
  const adsAvailable = adLinksAvailable(plan);
  const numbersLimit = numbersPerRotatorLimit(plan);
  const planLapsed = normalizePlanKey(plan) === "free";
  const poolMessage = poolFullMessage(plan, used, limit);

  // The four link types that count against the shared pool (UX-1 step 3/4):
  // kept on the in-app /links/new/<type> forms instead of app/tools/*.
  // "WhatsApp link" is the Brand link form with the custom-address field
  // hidden by default - it still creates a tracked link, not a free tool.
  const rawPaid: Array<{
    id: string;
    name: string;
    question: string;
    desc: string;
    href: string;
    iconKey: ToolIconKey;
    individuallyLocked: boolean;
  }> = [
    {
      id: "rotator",
      name: "Lead rotator",
      question: "Share chats across my team",
      desc: `Each new chat goes to the next salesperson. Up to ${numbersLimit} salespeople on your plan.`,
      href: "/links/new/rotator",
      iconKey: "users",
      individuallyLocked: false,
    },
    {
      id: "whatsapp-link",
      name: "WhatsApp link",
      question: "A WhatsApp link for one number",
      desc: "A short tracked link that opens your WhatsApp with a ready message. Gets a QR code too.",
      href: "/links/new/brand?simple=1",
      iconKey: "message-circle",
      individuallyLocked: false,
    },
    {
      id: "brand-link",
      name: "Brand link",
      question: "One link with my brand name",
      desc: "wazap.lt/w/yourcompany opens your WhatsApp.",
      href: "/links/new/brand",
      iconKey: "fingerprint",
      individuallyLocked: false,
    },
    {
      id: "ad-link",
      name: "Ad link",
      question: "Track which ad brings chats",
      desc: adsAvailable ? "See exactly how many clicks each campaign brings." : "Available on Growth",
      href: adsAvailable ? "/links/new/ad" : "/billing#plans",
      iconKey: "megaphone",
      individuallyLocked: !adsAvailable,
    },
  ];

  const paid: ToolCard[] = rawPaid.map((card) => {
    const locked = card.individuallyLocked || poolFull;
    // Pool-full swaps the description for the same "X of Y links used"
    // message app/links/new shows - but only on cards that aren't ALREADY
    // individually locked (those keep their own reason, e.g. "Available on
    // Growth"), exactly like the original inline logic.
    const description = poolFull && !card.individuallyLocked ? poolMessage : card.desc;
    const href = locked ? "/billing#plans" : card.href;
    const lockReason = locked ? (planLapsed ? "Choose a plan" : description) : undefined;
    return {
      id: card.id,
      name: card.name,
      question: card.question,
      description,
      href,
      iconKey: card.iconKey,
      locked,
      lockReason,
    };
  });

  // Free tools: never counted against the link pool, always usable even
  // when the pool above is full or the plan has lapsed.
  const free: ToolCard[] = [
    {
      id: "qr-code",
      name: "WhatsApp QR code",
      question: "Need a QR code for any number?",
      description: "A QR code for any WhatsApp number with a ready message. Print it on flyers, cards or your desk.",
      note: "Your links also get their own QR code automatically.",
      href: "/qr",
      iconKey: "qr-code",
      locked: false,
      badge: "Free · unlimited",
    },
    {
      id: "website-button",
      name: "Website button",
      question: "Add WhatsApp to my website",
      description: "Add a WhatsApp button to any website. As many as you like, free for every plan.",
      href: "/tools/widget",
      iconKey: "globe",
      locked: false,
      badge: "Free · unlimited",
    },
  ];

  return { paid, free };
}
