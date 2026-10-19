"use client";

import { useState } from "react";
import { Download, Plus } from "lucide-react";
import {
  Avatar, Badge, Button, ButtonLink, Card, Checkbox, Chip, CopyButton, Divider, IconButton, Input, Kbd,
  Modal, Progress, Select, Skeleton, Spinner, Switch, Tabs, Textarea, ToastProvider, Tooltip, useToast,
} from "../../ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <p className="eyebrow">{title}</p>
      {children}
    </section>
  );
}

function Demo() {
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [on, setOn] = useState(true);
  const [chip, setChip] = useState("all");
  const { toast } = useToast();

  return (
    <div className="mx-auto max-w-5xl space-y-14 px-4 py-14 sm:px-6">
      <header className="space-y-3">
        <p className="eyebrow">Wazap design kit</p>
        <h1 className="text-4xl font-bold text-text">Premium UI primitives</h1>
        <p className="max-w-xl text-muted">Every component reads colors from tokens. Light theme only for now.</p>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="lg"><Download className="size-5" aria-hidden />Large with icon</Button>
          <ButtonLink href="/pricing" variant="outline">Link button</ButtonLink>
          <IconButton label="Add" variant="outline"><Plus className="size-5" aria-hidden /></IconButton>
          <CopyButton value="https://wazap.lt/w/demo" label="Copy link" />
        </div>
      </Section>

      <Section title="Form">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Business name" placeholder="Acme Studio" hint="Shown on your link page." />
          <Input label="Email" defaultValue="not-an-email" error="Enter a valid email address." />
          <Select label="Plan"><option>Solo</option><option>Team</option><option>Business</option></Select>
          <Textarea label="Message" placeholder="Hi! I'd like to know more…" />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Checkbox label="Send me product updates" defaultChecked />
          <label className="flex items-center gap-2 text-[15px] text-text">
            Round-robin <Switch checked={on} onChange={setOn} label="Round-robin" />
          </label>
        </div>
      </Section>

      <Section title="Cards, badges & chips">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><h3 className="font-semibold text-text">Hairline card</h3><p className="mt-1 text-sm text-muted">Flat at rest, raised on hover.</p></Card>
          <Card variant="glass"><h3 className="font-semibold text-text">Glass card</h3><p className="mt-1 text-sm text-muted">Blur with a gradient ring.</p></Card>
          <Card variant="flat"><h3 className="font-semibold text-text">Flat card</h3><p className="mt-1 text-sm text-muted">Quiet grouping surface.</p></Card>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutral</Badge><Badge tone="accent">Active</Badge><Badge tone="highlight">Top result</Badge>
          <Badge tone="success">Paid</Badge><Badge tone="warning">Pending</Badge><Badge tone="danger">Failed</Badge>
          {["all", "today", "week"].map((c) => (
            <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>{c}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Feedback & overlays">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setOpen(true)}>Open modal</Button>
          <Button variant="outline" onClick={() => setDrawer(true)}>Open drawer</Button>
          <Button variant="secondary" onClick={() => toast("Link copied", "success")}>Success toast</Button>
          <Button variant="secondary" onClick={() => toast("Something went wrong", "danger")}>Error toast</Button>
          <Tooltip id="kit-tip" text="Opens in a new tab"><Button variant="ghost">Hover me</Button></Tooltip>
          <Spinner className="size-6 text-accent" label="Loading" />
          <span className="text-sm text-muted">Press <Kbd>Esc</Kbd> to close dialogs</span>
        </div>
        <Progress value={68} label="Lead quota used" />
        <div className="flex items-center gap-3"><Avatar name="Asha Kumar" /><Skeleton className="h-4 w-48" /></div>
      </Section>

      <Divider />

      <Section title="Tabs">
        <Tabs
          tabs={[
            { id: "a", label: "Overview", content: <p className="text-muted">Use arrow keys, Home and End to move between tabs.</p> },
            { id: "b", label: "Links", content: <p className="text-muted">Links panel.</p> },
            { id: "c", label: "Billing", content: <p className="text-muted">Billing panel.</p> },
          ]}
        />
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title="Delete this link?">
        <p className="text-muted">Visitors will see a paused page. You can restore it any time.</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => { setOpen(false); toast("Link deleted"); }}>Delete</Button>
        </div>
      </Modal>
      <Modal open={drawer} onClose={() => setDrawer(false)} title="Filters" placement="side">
        <p className="text-muted">Side drawer using the same dialog primitive.</p>
      </Modal>
    </div>
  );
}

export default function KitDemo() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg text-text"><Demo /></div>
    </ToastProvider>
  );
}
