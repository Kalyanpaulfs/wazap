import { redirect } from "next/navigation";

// UX-1 step 5: Plans was merged into /billing ("Plan & billing"). Keep this
// route working for old links/bookmarks, preserving query params (?plan=,
// ?workspace=) so a deep link to a specific plan still lands there.
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; plan?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.workspace) qs.set("workspace", sp.workspace);
  if (sp.plan) qs.set("plan", sp.plan);
  const suffix = qs.toString();
  redirect(`/billing${suffix ? `?${suffix}` : ""}#plans`);
}
