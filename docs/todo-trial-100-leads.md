# DONE: Free trial = 100 leads, not unlimited

**Decided by Kalyan, 17 Oct 2026. Built 17 Oct 2026.** The 3-day Free trial now caps routed leads at 100 (`TRIAL_ROUTED_LEADS` in `lib/router-entitlements.ts`); paid plans stay unlimited. `npx tsc --noEmit`, `npx vitest run` (251 passed) and `npm run test:integration` (34 passed) all pass; `tests/e2e/customer-e2e.ts` was updated but not run (no dev server per instructions).

## What to change
- Free trial: **100 routed leads** (all other Solo features stay: 3 rotators, 3 numbers, 2 short links, widget, basic reports, 3 days, once per account).
- When a trial user reaches 100: the `/r/` link stops and goes to `/router-limit` → "You've used the 100 leads in your free trial. Choose a plan to keep routing."
- Paid plans (Solo / Growth / Agency) stay unlimited. After the trial, everything still pauses.

## Where
- Logic: `lib/router-entitlements.ts` → `routerQuota()`: active trial → limit 100; paid → unlimited; free → blocked.
- Meter: Performance page, rotator page, dashboard → "X of 100 trial leads used".
- Texts: Free trial card "Unlimited routed leads (trial)" → "100 routed leads" (`app/pricing/FreePlanStrip.tsx`), plus pricing, about, AuthShell, home, product pages, opengraph image, lead-routing page, rotator layout, emails (`lib/email.ts`), FAQ (`lib/landing-faq.ts`, `lib/growth-content.ts`, `lib/marketing-offer.ts`), support page, AI support (`services/support-worker/support-ai.mjs`), `lib/international-copy.json`.
- Tests: `lib/__tests__/router-quota.test.ts`, `router-entitlements.test.ts`, integration + `tests/e2e/customer-e2e.ts` (99 → allowed, 100 → blocked).
