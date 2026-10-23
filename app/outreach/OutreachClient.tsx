"use client";
// FEAT-QUEUE: owner-facing /outreach page - simple useState tab switcher
// (Link | Team | Customer lists | Report | Settings), no query params.
import BackLink from "@/app/links/BackLink";
import { useState } from "react";
import type { OutreachTeamData, OutreachMemberData, OutreachListData } from "./types";
import LinkTab from "./LinkTab";
import TeamTab from "./TeamTab";
import ListsTab from "./ListsTab";
import ReportTab from "./ReportTab";
import SettingsTab from "./SettingsTab";

type Tab = "link" | "team" | "lists" | "report" | "settings";
const TABS: { key: Tab; label: string }[] = [
  { key: "link", label: "Link" },
  { key: "team", label: "Team" },
  { key: "lists", label: "Customer lists" },
  { key: "report", label: "Report" },
  { key: "settings", label: "Settings" },
];

export default function OutreachClient({
  team: initialTeam,
  teamLink: initialTeamLink,
  members: initialMembers,
  lists: initialLists,
  memberCount: initialMemberCount,
  contactTotal: initialContactTotal,
  contactLimit,
  memberLimit,
  planLabel,
}: {
  team: OutreachTeamData;
  teamLink: string;
  members: OutreachMemberData[];
  lists: OutreachListData[];
  memberCount: number;
  contactTotal: number;
  contactLimit: number;
  memberLimit: number;
  planLabel: string;
}) {
  const [tab, setTab] = useState<Tab>("link");
  const [team, setTeam] = useState(initialTeam);
  const [teamLink, setTeamLink] = useState(initialTeamLink);
  const [members, setMembers] = useState(initialMembers);
  const [lists, setLists] = useState(initialLists);
  const [memberCount, setMemberCount] = useState(initialMemberCount);
  const [contactTotal, setContactTotal] = useState(initialContactTotal);

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-5xl space-y-6">
        <BackLink href="/tools" label="All tools" />
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Team outreach</h1>
            <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-300">{planLabel}</span>
          </div>
          <p className="mt-1 text-slate-400">One shared link hands each salesperson their next free customer on WhatsApp.</p>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Team outreach tabs">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === key ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "link" && (
          <LinkTab
            teamLink={teamLink}
            onNewLink={(code, link) => {
              setTeam((t) => ({ ...t, code }));
              setTeamLink(link);
            }}
          />
        )}

        {tab === "team" && (
          <TeamTab
            members={members}
            memberCount={memberCount}
            memberLimit={memberLimit}
            defaultCountry={team.defaultCountry}
            onMembersChange={setMembers}
            onMemberCountChange={setMemberCount}
          />
        )}

        {tab === "lists" && (
          <ListsTab
            lists={lists}
            contactTotal={contactTotal}
            contactLimit={contactLimit}
            defaultCountry={team.defaultCountry}
            onListsChange={setLists}
            onContactTotalChange={setContactTotal}
            onDefaultCountryChange={(country) => setTeam((t) => ({ ...t, defaultCountry: country }))}
          />
        )}

        {tab === "report" && <ReportTab lists={lists} members={members} />}

        {tab === "settings" && <SettingsTab team={team} onTeamChange={setTeam} />}
      </div>
    </main>
  );
}
