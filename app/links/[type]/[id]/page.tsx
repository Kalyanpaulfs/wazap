import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { numbersPerRotatorLimit, nextPlanNumbersHint } from "@/lib/plan-limits";
import {
  addressDisplay,
  buildPublicUrl,
  originBase,
  combinedStatusText,
  derivePauseReason,
} from "@/lib/my-links";
import { kindFromCreatedType } from "@/lib/link-create-forms";
import { salespersonName } from "@/lib/salesperson-names";
import { defaultCountryForUser } from "@/lib/default-country";
import LinkDetailsClient from "./LinkDetailsClient";

export const metadata = { title: "Link details — Wazap", robots: { index: false, follow: false } };

const DAY = 86_400_000;

export default async function LinkDetailsPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  const kind = kindFromCreatedType(type);
  if (!kind || !id) notFound();

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/login?redirect=${encodeURIComponent(`/links/${type}/${id}`)}`);
  const userId = (session.user as { id: string }).id;

  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const planLabel = accountPlanLabel(entitlementUser);
  const origin = originBase();
  const defaultCountry = await defaultCountryForUser(userId, await headers());

  if (kind === "rotator") {
    const row = await prisma.rotatorLink.findFirst({ where: { id, userId } });
    if (!row) notFound();

    const since = new Date(new Date().getTime() - 30 * DAY);
    const starts = await prisma.conversationStart.findMany({
      where: { userId, assetType: "rotator", assetId: id, createdAt: { gte: since } },
      select: { destination: true },
    });
    const last30ByDestination = new Map<string, number>();
    for (const s of starts) {
      if (!s.destination) continue;
      last30ByDestination.set(s.destination, (last30ByDestination.get(s.destination) ?? 0) + 1);
    }
    const salespeople = row.numbers.map((number) => ({
      number,
      name: salespersonName(row.numberNames, number),
      last30Days: last30ByDestination.get(number) ?? 0,
    }));

    const planPaused = Boolean(row.planPausedAt);
    const manuallyPaused = Boolean(row.pausedAt);
    const paused = planPaused || manuallyPaused;
    const numbersLimit = numbersPerRotatorLimit(plan);
    const nextPlanHint = nextPlanNumbersHint(plan);

    return (
      <LinkDetailsClient
        kind="rotator"
        id={row.id}
        name={row.name}
        createdAt={row.createdAt.toISOString()}
        addressDisplay={addressDisplay(origin, "rotator", row.code)}
        publicUrl={buildPublicUrl(origin, "rotator", { code: row.code })}
        metric={row.totalClicks}
        paused={paused}
        manuallyPaused={manuallyPaused}
        statusText={combinedStatusText(row.planPausedAt, row.pausedAt, "rotator", plan)}
        pauseReason={planPaused ? derivePauseReason("rotator", plan) : null}
        planLabel={planLabel}
        defaultCountry={defaultCountry}
        rotator={{ numbers: row.numbers, numberNames: (row.numberNames as Record<string, string>) ?? {}, message: row.message, salespeople, numbersLimit, nextPlanHint }}
      />
    );
  }

  if (kind === "shortlink") {
    const row = await prisma.shortLink.findFirst({ where: { id, userId } });
    if (!row) notFound();
    const planPaused = Boolean(row.planPausedAt);
    const manuallyPaused = Boolean(row.pausedAt);
    const paused = planPaused || manuallyPaused;
    return (
      <LinkDetailsClient
        kind="shortlink"
        id={row.id}
        name={row.name}
        createdAt={row.createdAt.toISOString()}
        addressDisplay={addressDisplay(origin, "shortlink", row.code)}
        publicUrl={buildPublicUrl(origin, "shortlink", { code: row.code })}
        metric={row.clicks}
        paused={paused}
        manuallyPaused={manuallyPaused}
        statusText={combinedStatusText(row.planPausedAt, row.pausedAt, "shortlink", plan)}
        pauseReason={planPaused ? derivePauseReason("shortlink", plan) : null}
        planLabel={planLabel}
        defaultCountry={defaultCountry}
        shortlink={{ phone: row.phone, message: row.message }}
      />
    );
  }

  const row = await prisma.adLink.findFirst({ where: { id, userId } });
  if (!row) notFound();
  const planPaused = Boolean(row.planPausedAt);
  const manuallyPaused = Boolean(row.pausedAt);
  const paused = planPaused || manuallyPaused;
  return (
    <LinkDetailsClient
      kind="adlink"
      id={row.id}
      name={row.name}
      createdAt={row.createdAt.toISOString()}
      addressDisplay={addressDisplay(origin, "adlink", row.id)}
      publicUrl={buildPublicUrl(origin, "adlink", { id: row.id, number: row.number, message: row.message })}
      metric={row.clicks}
      paused={paused}
      manuallyPaused={manuallyPaused}
      statusText={combinedStatusText(row.planPausedAt, row.pausedAt, "adlink", plan)}
      pauseReason={planPaused ? derivePauseReason("adlink", plan) : null}
      planLabel={planLabel}
      defaultCountry={defaultCountry}
      adlink={{ number: row.number, message: row.message, utmSource: row.utmSource, utmMedium: row.utmMedium, utmCampaign: row.utmCampaign }}
    />
  );
}
