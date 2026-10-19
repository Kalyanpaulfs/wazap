import { redirect } from "next/navigation";

// UX-1 step 5: Reports was merged into /results ("By link" / "By salesperson"
// / "By source & campaign" tabs). Keep this route working for old
// links/bookmarks by redirecting to the By-link tab, preserving the date
// range query params (period / from / to) so a bookmarked custom range still
// opens to the same period.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ tab: "link" });
  if (sp.period) qs.set("period", sp.period);
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
  redirect(`/results?${qs.toString()}`);
}
