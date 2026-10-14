"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PlanPausedBadge from "@/app/components/PlanPausedBadge";
type PublisherListing={id:string;name:string;description:string;packageType:string;status:string;manifest?:{roleType?:string;instructions?:string;launchUrl?:string}};
type Publisher = { id: string; displayName: string; status: string; listings?:PublisherListing[] };
type Listing = { id: string; name: string; pricingModel: string; requestedScopes: string[]; publisher: { displayName: string } };
type Install = { id: string; status:string; statusReason?:string|null; planPausedAt?:string|null; setupStatus: string; listing: { id:string; name: string; status:string; packageType?: string; requestedScopes: string[]; manifest?: { launchUrl?: string } }; version: { version: string } };
type Data = { publisher?: Publisher | null };
export default function MarketplaceManager({
  installId,
}: {
  installId: string;
}) {
  const [data, setData] = useState<Data>({});
  const [installs, setInstalls] = useState<Install[]>([]);
  const [candidate, setCandidate] = useState<Listing | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(() =>
    Promise.all([
      fetch("/api/marketplace/publisher").then((r) => r.json()),
      fetch("/api/marketplace/installations").then((r) => r.json()),
      fetch("/api/marketplace").then((r) => r.json()),
    ]).then(([p, i, m]) => {
      setData(p);
      setInstalls(i.installs || []);
      setCandidate(
        (m.listings || []).find((x: Listing) => x.id === installId) || null,
      );
    }), [installId]);
  useEffect(() => {
    load();
  }, [load]);
  async function install() {
    const r = await fetch("/api/marketplace/installations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId: installId }),
    });
    const j = await r.json();
    setMessage(j.error || (j.alreadyInstalled ? "This package is already active in the workspace." : "Package installed as a paused draft with human-review safeguards."));
    await load();
    if (j.install?.id && !j.error) window.location.assign(`/marketplace/launch/${j.install.id}`);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/marketplace/publisher", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        action,
        requestedScopes: body.requestedScopes
          ? String(body.requestedScopes).split(",")
          : [],
      }),
    });
    const j = await r.json();
    setMessage(j.error || "Saved. Marketplace review is now pending.");
    load();
  }
  async function uninstall(id: string) {
    const r = await fetch("/api/marketplace/installations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    setMessage(j.error || "Package uninstalled and its marketplace-created draft removed.");
    load();
  }
  async function report(listingId:string){const category=window.prompt("Issue category: security, privacy, spam, deceptive, unsafe_output, policy, or other","security")||"";if(!category)return;const details=window.prompt("Describe the issue. Do not include secrets or full customer conversations.")||"";if(!details)return;const r=await fetch("/api/marketplace/abuse-reports",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({listingId,category,details})});const j=await r.json();setMessage(j.error||j.notice||"Report recorded.")}
  return (
    <main className="min-h-screen hero-bg px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Marketplace workspace
            </h1>
            <p className="mt-2 text-slate-400">
              Manage installed packages, publish connected tools and prepare
              paid listings.
            </p>
          </div>
          <Link href="/marketplace" className="text-[#25D366]">
            Browse marketplace
          </Link>
        </div>
        {message && (
          <p className="mt-5 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-3 text-sm text-[#25D366]">
            {message}
          </p>
        )}
        <section className="mt-6 rounded-2xl border border-[#25D366]/20 bg-[#25D366]/5 p-5">
          <h2 className="font-bold text-white">Reviewed free packages</h2>
          <p className="mt-2 text-sm text-slate-400">
            The live marketplace accepts AI agents and connected HTTPS tools.
            Every submission is reviewed before publication. Paid marketplace
            checkout, seller payouts, and automatic message sending are not enabled.
          </p>
        </section>
        {candidate && (
          <section className="mt-6 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/5 p-5">
            <h2 className="text-xl font-bold text-white">
              Install {candidate.name}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Publisher: {candidate.publisher.displayName}. Requested access:{" "}
              {candidate.requestedScopes.join(", ") || "none"}. AI packages are
              installed paused in draft-only mode; no messages are sent
              automatically.
            </p>
            <button
              onClick={install}
              disabled={candidate.pricingModel !== "free"}
              className="mt-4 rounded-xl bg-[#25D366] px-5 py-2 font-bold text-black"
            >
              {candidate.pricingModel === "free"
                ? "Approve access and install"
                : "Paid checkout opening after seller verification"}
            </button>
          </section>
        )}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#111811] p-5">
          <h2 className="text-xl font-bold text-white">Installed packages</h2>
          <div className="mt-4 space-y-3">
            {installs.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between rounded-xl bg-slate-950 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">{i.listing.name}</p>
                    {i.planPausedAt && <PlanPausedBadge />}
                  </div>
                  <p className="text-xs text-slate-500">
                    v{i.version.version} · {i.status} ·{" "}
                    {i.listing.requestedScopes.join(", ") || "No data scopes"}
                  </p>
                  {i.listing.packageType === "agent" && (
                    <Link href={`/marketplace/launch/${i.id}`} className="mt-2 inline-block text-xs font-semibold text-[#25D366]">
                      {i.setupStatus === "active" ? "View outcomes and settings →" : "Continue guided setup →"}
                    </Link>
                  )}
                  {i.listing.manifest?.launchUrl && (
                    <a
                      href={i.listing.manifest.launchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-[#25D366]"
                    >
                      Open connected tool →
                    </a>
                  )}
                  {i.statusReason&&<p className="mt-2 text-xs text-amber-300">{i.statusReason}</p>}
                </div>
                <div className="flex flex-col items-end gap-2"><button onClick={()=>report(i.listing.id)} className="text-xs text-amber-300">Report issue</button><button onClick={() => uninstall(i.id)} className="text-sm text-red-300">Uninstall</button></div>
              </div>
            ))}
            {!installs.length && (
              <p className="text-sm text-slate-500">No active packages.</p>
            )}
          </div>
        </section>
        {!data.publisher ? (
          <form
            onSubmit={(e) => submit(e, "create_publisher")}
            className="mt-6 space-y-3 rounded-2xl border border-slate-800 bg-[#111811] p-5"
          >
            <h2 className="text-xl font-bold text-white">
              Create publisher profile
            </h2>
            <input
              name="displayName"
              required
              placeholder="Publisher name"
              className="w-full rounded-xl bg-slate-950 p-3 text-white"
            />
            <input
              name="slug"
              placeholder="publisher-slug"
              className="w-full rounded-xl bg-slate-950 p-3 text-white"
            />
            <textarea
              name="description"
              placeholder="What you build"
              className="w-full rounded-xl bg-slate-950 p-3 text-white"
            />
            <input
              name="website"
              type="url"
              placeholder="Publisher HTTPS website (optional)"
              className="w-full rounded-xl bg-slate-950 p-3 text-white"
            />
            <button className="rounded-xl bg-[#25D366] px-5 py-2 font-bold text-black">
              Create profile
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => submit(e, "submit_listing")}
            className="mt-6 grid gap-3 rounded-2xl border border-slate-800 bg-[#111811] p-5 md:grid-cols-2"
          >
            <h2 className="text-xl font-bold text-white md:col-span-2">
              Submit a package for review
            </h2>
            {[
              ["name", "Package name"],
              ["slug", "Unique slug"],
              ["summary", "Short summary"],
              ["category", "Category"],
              ["version", "Version (1.0.0)"],
              ["requestedScopes", "Scopes, comma separated"],
              ["roleType", "Agent role"],
            ].map(([n, p]) => (
              <input
                key={n}
                name={n}
                placeholder={p}
                className="rounded-xl bg-slate-950 p-3 text-white"
              />
            ))}
            <select
              name="packageType"
              className="rounded-xl bg-slate-950 p-3 text-white"
            >
              <option value="agent">AI agent</option>
              <option value="external_tool">Connected external tool</option>
            </select>
            <input
              name="launchUrl"
              type="url"
              placeholder="HTTPS launch URL (connected tools)"
              className="rounded-xl bg-slate-950 p-3 text-white md:col-span-2"
            />
            <textarea
              name="description"
              required
              placeholder="Detailed package behavior and intended use"
              className="min-h-32 rounded-xl bg-slate-950 p-3 text-white md:col-span-2"
            />
            <textarea
              name="instructions"
              placeholder="Agent instructions (agent packages only)"
              className="min-h-32 rounded-xl bg-slate-950 p-3 text-white md:col-span-2"
            />
            <button className="rounded-xl bg-[#25D366] px-5 py-2 font-bold text-black md:col-span-2">
              Submit for review
            </button>
          </form>
        )}
        {data.publisher?.listings?.map((listing)=><form key={listing.id} onSubmit={(e)=>submit(e,"submit_version")} className="mt-6 grid gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 md:grid-cols-2"><h2 className="font-bold text-white md:col-span-2">Submit a new version of {listing.name}</h2><p className="text-xs text-slate-500 md:col-span-2">The currently published version stays available while this release receives a separate security review.</p><input type="hidden" name="listingId" value={listing.id}/><input type="hidden" name="name" value={listing.name}/><input type="hidden" name="packageType" value={listing.packageType}/><input type="hidden" name="roleType" value={listing.manifest?.roleType||"sales_rep"}/><input type="hidden" name="launchUrl" value={listing.manifest?.launchUrl||""}/><input name="version" required placeholder="Version (for example 1.1.0)" className="rounded-xl bg-slate-950 p-3 text-white"/><input name="changelog" required placeholder="What changed" className="rounded-xl bg-slate-950 p-3 text-white"/><textarea name="description" required defaultValue={listing.description} className="min-h-28 rounded-xl bg-slate-950 p-3 text-white md:col-span-2"/><textarea name="instructions" defaultValue={listing.manifest?.instructions||""} placeholder="Updated agent instructions" className="min-h-28 rounded-xl bg-slate-950 p-3 text-white md:col-span-2"/><button className="rounded-xl bg-amber-300 px-5 py-2 font-bold text-black md:col-span-2">Submit version for security review</button></form>)}
      </div>
    </main>
  );
}
