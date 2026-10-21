'use client';
import { useState } from 'react';
import { Button, Checkbox, Input } from '../ui';

export default function NewsletterForm() {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  return (
    <form
      className="mt-7 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const response = await fetch('/api/crm/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, consent }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setNotice(result.message);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Could not save your request.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input label="Full name" required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Email address" required type="email" maxLength={255} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Checkbox required checked={consent} onChange={(e) => setConsent(e.target.checked)} label="I want Wazap newsletters, product updates and business tips." className="items-start text-sm text-muted" />
      <Button type="submit" size="lg" disabled={busy || !consent} loading={busy}>{busy ? 'Saving request…' : 'Request my subscription'}</Button>
      {notice && <p role="status" className="text-sm leading-6 text-muted">{notice}</p>}
    </form>
  );
}
