# Wazap Premium Design System Revamp — Plan & Progress Tracker

> **How to use this file:** Each phase has checkboxes. Tick them as work lands and add a line to the
> **Session log** at the bottom (date, what was done, what's next). When you come back, read
> "Current status" first, then continue with the first unticked item.

## Current status

- **Phase:** 6 done. Phase 7 (QA + release) is next; blocked on visual QA of logged-in screens (Phase 5 list) and the VPS source comparison
- **Last updated:** 2026-10-19
- **Next action:** Phase 7 (below). To migrate a page: swap its dark classes for tokens, delete its local nav/footer, then add its route to `lightRoutes` in `app/product/AppFrame.tsx`. The AppShell (dashboard sidebar) is built in Phase 5 together with the app pages.
- **Branch:** `dev-roki` only (no separate branch). Nothing committed yet. The earlier uncommitted work on `dev-roki` (auth email-code, logo/icon files) is still uncommitted in the working tree and is not part of this revamp.

---

## 1. Goal

Raise wazap-business to the **quality level** of `~/Projects/link-generator`: its consistency, reusable components, motion, polish and 3D assets.

- **No 1:1 copying.** We borrow the *engineering patterns* and *craft standards*, not the look.
- Wazap gets its own **premium palette and identity** (§3).
- Wazap gets **real light + dark themes**. Link-generator is light-only, so this is where we can beat it.
- Every page uses one shared component library. No more page-local navs, footers or hard-coded hex values.
- New, consistent **brand assets** are generated with `~/Projects/tools/gpt-image`.

## 2. What we found (baseline audit, 2026-10-19)

### Reference: link-generator (what makes it premium)

| Area | Pattern worth adopting (re-implemented, not copied) |
|---|---|
| Stack | Tailwind v4 CSS-first `@theme`, hand-written components, lucide icons, `next/font` (Inter body + Plus Jakarta Sans display) |
| Surfaces | Hairline borders; soft, **tinted, negative-spread shadows** that only appear on hover; `rounded-3xl` cards, `rounded-full` buttons, `rounded-xl` inputs |
| Glass | `.liquid-glass`: backdrop blur, inset highlight, gradient ring via mask-composite, plus a glow fallback |
| Typography | Display font on all headings with `tracking-tight`; `.eyebrow` label (11px, uppercase, hairline before it) instead of pill badges |
| Motion | Two custom easings (`--ease-out`, `--ease-in-out`); `[data-animate]` + IntersectionObserver scroll reveal; `.btn-press` scale(0.97); `.btn-shine`; GSAP SplitText headline reveals; full `prefers-reduced-motion` override |
| Components | `ui/` (Button with 5 variants and 3 sizes, 44px touch targets, focus-visible ring, `aria-busy`; Modal with full a11y; Input, Card, Badge, Skeleton, Spinner, Snackbar) and `app/` (StatCard with count-up, Tabs, Field, PageHeader, SectionCard, DataTable, EmptyState, ActionMenu) |
| Marketing | One `SectionHeader` used by every section (eyebrow, title, animated highlight word, `align`, `tone`) |
| Assets | AI-generated 3D renders in `public/images/*.webp`; `ImagePlaceholder` stores the generation prompt next to the slot |
| Weak spots (we do better) | No semantic color tokens, no dark mode |

### Current wazap-business

- Tailwind v4, but **no `@theme`**. The only tokens are 4 vars in `app/design/system.css` (`--wz-bg`, `--wz-surface`, `--wz-border`, `--wz-accent`).
- **Dark-only**, with no theme system. `globals.css` forces body `#0a0f0a` and **Arial**, even though Geist is loaded (a bug).
- **Hard-coded color debt:**
  - 823 hex literals across 85 `.tsx` files (`#25d366` ×571, `#111811` ×105, `#1fba58` ×47)
  - 735 arbitrary Tailwind values like `bg-[#..]`
  - about 2,010 named color classes
  - 654 hex literals in CSS
- `app/design/system.css` styles elements through **attribute selectors on class names** (`[class*="rounded-2xl"][class*="border"]`, `body nav.sticky`). Any class rename breaks it silently, so it must be retired deliberately.
- **Duplication:**
  - `<nav>` is built separately in 14 files: legal ×6, languages ×2, results, links, ToolSeo, GrowthArticle.
  - Local footers in `tools/page.tsx`, `pricing/page.tsx` and AuthShell.
  - Three brand marks: the BrandLogo image, a `MessageCircle` icon in the app shell, and `.gradient-text`.
  - Two accent hovers: `#1fba58` and `#34eb70`.
- **59 pages:** about 30 marketing, 17 app, 5 admin, 3 auth. No route groups; `app/product/AppFrame.tsx` picks the chrome at runtime with a regex.
- **CSS scattered across about 12 files:** `globals.css`, `design/system.css`, `design/home.css`, `product/product.css`, `components/auth.css`, `growth-*.css`, 3 CSS modules, `localization/language-control.css`, `admin/crm/*.css`.
- **Assets:**
  - Brand logos in `public/brand/`, landing art and growth art.
  - Leftovers to delete: Next starter SVGs, and customer files `astraterra-*` and `binance-pay.png`. Their usage must be checked before deleting.

### Hard constraints (from AGENTS.md and the code)

1. **Localization must survive.** Keep `SiteLocaleProvider` (`app/Providers.tsx`) and `LanguageSelector` in **both** `app/Navbar.tsx` and `app/components/AuthShell.tsx`.
   - The translator works by **text matching through a MutationObserver**. Changing English copy or how text is split across elements can drop translations.
   - Rule: change markup, not copy. Where copy must change, re-run catalog generation.
2. **RTL:** the rules in `globals.css` are tied to `.wz-home`, `.wz-eyebrow`, `.wz-button` and `.wz-industry-visual`. New components must use logical properties (`ps-`/`pe-`, `ms-`/`me-`, `start`/`end`).
3. AGENTS.md says the release report lives in `operations/website-localization/`, but that folder **does not exist locally**. Pull it from the VPS before touching localization files. Also compare VPS source before copying any shared file.
4. Next.js 16.4 differs from training data. Read `node_modules/next/dist/docs/` before using any Next API (fonts, `next/image`, metadata, cache).
5. Legal policy text and customer or private data are never translated or rewritten as part of this work.
6. Keep `.wp-profile`, `[data-no-localize]` and `translate="no"` markers wherever they exist now.

## 3. New premium palette — "Midnight Jade" (proposal, needs approval)

**Direction:** Wazap is a WhatsApp business tool, so green stays the hero. It moves away from raw WhatsApp `#25D366` (cheap-looking at scale) and from link-generator's emerald + zinc.

- **Neutrals:** deep ink-navy instead of zinc or green-black, which feels more fintech-premium.
- **Accent:** a refined jade green.
- **Highlight:** warm saffron, used sparingly for "money/results" moments.

### Semantic tokens

Defined once in `app/theme/tokens.css` via `@theme`, and switched by `[data-theme]` and `prefers-color-scheme`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#F7F8F5` (warm paper) | `#070B12` (midnight ink) | page background |
| `--color-surface` | `#FFFFFF` | `#0D1420` | cards |
| `--color-surface-2` | `#F0F2EE` | `#131C2B` | raised and hover surfaces, inputs |
| `--color-border` | `#E3E6E0` | `#1F2A3B` | hairlines |
| `--color-text` | `#0E1726` | `#EEF2F7` | primary text |
| `--color-muted` | `#5B6676` | `#93A0B4` | secondary text (must pass 4.5:1) |
| `--color-accent` | `#0FA968` (jade) | `#2BD98A` | primary CTA, links, focus |
| `--color-accent-hover` | `#0B8F58` | `#4BE6A0` | single hover shade (replaces both old ones) |
| `--color-accent-soft` | `#E3F7EC` | `#0F2A20` | tinted backgrounds, badges |
| `--color-on-accent` | `#FFFFFF` | `#04110B` | text on accent |
| `--color-highlight` | `#E9A23B` (saffron) | `#F4B860` | "results" moments: stats, wins, star ratings (sparingly) |
| `--color-ink-glow` | `rgba(15,169,104,.35)` | `rgba(43,217,138,.30)` | tinted shadows and glows |
| `--color-success` / `warning` / `danger` / `info` | standard set | standard set | states (the WhatsApp brand green stays only inside WhatsApp-UI mockups) |

**Gradients:**

- `--grad-brand`: jade → teal `#0FA968 → #0E9AA7`
- `--grad-hero-dark`: radial ink with a jade glow
- `--grad-highlight`: saffron sheen, used only for premium badges

**Typography:**

- Display: **Sora** or **Manrope**. Pick one in Phase 1. Both are distinct from link-generator's Jakarta.
- Body: **Inter**, loaded through `next/font`.
- Numbers: `font-variant-numeric: tabular-nums` on all stats and tables.

**Scale tokens:**

- Radius: `--radius-sm 8`, `md 12`, `lg 16`, `xl 24`, `pill 999`.
- Shadow: `--shadow-hairline`, `--shadow-raise`, `--shadow-float` and `--shadow-accent`, all negative-spread and tinted with `--color-ink-glow` or ink.
- Motion: `--ease-out: cubic-bezier(.16,1,.3,1)`, `--ease-spring: cubic-bezier(.34,1.56,.64,1)`, durations `--dur-fast 140ms`, `--dur-base 220ms`, `--dur-slow 650ms`.

**Approval:**

- [x] Owner approved the palette (light column used now; dark column kept for later).
- [ ] Contrast check script passes AA for every text/background pair in both themes.

## 4. Target architecture

```
app/theme/
  tokens.css          # @theme + light/dark vars (single source of truth)
  base.css            # resets, typography, focus ring, selection, reduced-motion
  utilities.css       # .eyebrow, .surface-card, .glass, .btn-press, .btn-shine, [data-animate]
  ThemeProvider.tsx   # data-theme on <html>, system default, saved choice, no flash (inline script)
  ThemeToggle.tsx
app/ui/               # primitives (no business logic)
  Button, IconButton, Link, Input, Textarea, Select, Checkbox, Switch, Field,
  Card, Badge, Chip, Avatar, Tooltip, Modal/Dialog, Drawer, Tabs, Menu,
  Toast/Snackbar, Skeleton, Spinner, Progress, Divider, Kbd, CopyButton
  cx.ts               # tiny className join helper (no new deps unless agreed)
app/ui/app/           # dashboard building blocks
  PageHeader, SectionCard, StatCard (count-up), DataTable, EmptyState,
  FilterBar, ActionMenu, ChartCard (recharts themed), Sidebar, Topbar
app/ui/marketing/     # site building blocks
  Container, Section, SectionHeader (eyebrow + title + highlight), Hero,
  FeatureGrid, FeatureSpotlight, StepList, LogoCloud, Testimonial, PricingCard,
  FAQ, FinalCta, ScrollReveal, CountUp, PhoneMockup (WhatsApp chat), Art (next/image + prompt)
app/ui/layout/
  SiteNavbar (keeps LanguageSelector), SiteFooter, LegalLayout, AuthShell (keeps LanguageSelector),
  AppShell (replaces .wp-shell markup), BrandLogo (single brand mark everywhere)
```

**Rules:**

- Components read colors **only from tokens** (`bg-surface`, `text-muted`, `border-border`, `shadow-raise`).
- An ESLint rule or CI grep fails the build on new `#hex` or `bg-[#` values in `.tsx` files.

## 5. Asset plan (generated with `~/Projects/tools/gpt-image`)

**Style brief** (keeps every render consistent):

- Soft 3D clay/glass, studio-lit on a transparent or ink background.
- Jade + saffron accents, midnight ink shadows, slight bloom.
- No text inside images. Square 1024 or 1536×1024 source, exported to `.webp`.

Store the prompts in `docs/design-assets/prompts.md`. Put files in `public/art/<area>/` and record each one in `public/art/manifest.json` (file, prompt, date, used-by).

| # | Asset | Used on |
|---|---|---|
| A1 | Hero 3D scene: phone with WhatsApp chat + floating link/QR chips | home hero (light + dark variants) |
| A2 | Glass chips: link, QR, chart, router, lead, bell | feature cards, hero orbit |
| A3 | Feature illustrations ×4 (short links, lead routing, ad tracking, website widget) | `whatsapp-*` product pages (replace `landing-art/*-v1.png`) |
| A4 | Solutions and industry set ×6–8 | `solutions/*`, compare, guides covers |
| A5 | Dashboard empty states ×6 (no links, no leads, no data, error, success, paused) | app `EmptyState` |
| A6 | Pricing plan badges ×3 (Solo / Team / Business) | pricing, plans, billing |
| A7 | Auth side art (login/signup) | AuthShell |
| A8 | Legal/help/support covers | legal layout, support |
| A9 | OG image template + favicon/app icon refresh in new palette | `opengraph-image.tsx`, `icon.svg`, manifest icons |
| A10 | Email header images ×4 | `public/email-assets/` |
| A11 | Subtle background textures (grain, mesh gradient), made in SVG/CSS where possible | sections |

**Asset tasks:**

- [ ] Write the style brief and all prompts, and get them approved.
- [ ] Generate, curate (pick the best of N), remove backgrounds, compress to webp (< 200 KB each).
- [ ] Build the `Art` component: `next/image` with sizes, blur placeholder, and the prompt kept beside the slot (like `ImagePlaceholder`).
- [ ] Remove unused leftovers (starter SVGs, old v1 art), but only after grepping for references. Customer files (`astraterra-*`, `binance-pay.png`) need an **owner decision**.

## 6. Phased execution plan

Each phase ends with:

- `npm run lint`, typecheck and tests
- visual check of key pages in both themes at 375 / 768 / 1280 widths
- language selector visible after hydration and reload, and RTL (ar) checked
- a session log entry

### Phase 0: Plan & decisions

- [x] Audit both codebases (§2)
- [x] Write this tracker
- [x] Approve palette, display font, theme default (§8)
- [ ] **Deferred to before deploy (Phase 7), not needed for local UI work:** pull `operations/website-localization/` release report from the VPS and diff `Navbar.tsx`, `AuthShell.tsx`, `Providers.tsx`, `globals.css`. `ssh hostinger` does not resolve here; needs the real host. Only a safety check so we don't overwrite live-only edits when deploying.
- [x] ~~Create branch~~ not needed: all work stays on local `dev-roki`
- [x] Baseline screenshots (11 public routes × 375/1280px) in `docs/design-baseline/`. Caveats: taken after the Phase 1 font swap (so headings are already Plus Jakarta Sans); the home hero is mid-animation (blurred); logged-in app/admin routes are not captured (need a session), so add those before Phase 5.

### Phase 1: Foundation (tokens, theme, fonts). Low risk, no visual rewrite yet.

- [x] `app/theme/tokens.css` (`@theme static`, light only); imported in `layout.tsx`. Brand jade is `#087f50` (accessible on white). The brighter `#0fa968` is `--color-jade-bright`, decorative only.
- [x] Fix the font bug (also fixed a second Arial rule in `app/design/home.css`): drop Arial and load Plus Jakarta Sans (headings) + Inter (body) via `next/font`
- [x] ~~ThemeProvider/ThemeToggle~~ skipped: light only for now (§8)
- [x] `base.css`: focus-visible ring, selection color, `prefers-reduced-motion`, tabular numbers
- [x] `utilities.css`: eyebrow, surface-card, glass, btn-press, btn-shine, scroll-reveal
- [ ] Map the old `--wz-*` vars to the new tokens. **Deferred to the Phase 3/4 colour flip:** the old vars hold dark values, so aliasing now would break every page. Until then the site stays dark and the new tokens are used only by new components.
- [x] Contrast check script `scripts/check-contrast.mjs` (all pairs pass AA; it caught the original jade failing on white text)

### Phase 2: UI primitives (`app/ui/`)

- [x] Built (`app/ui/`): Button/ButtonLink/IconButton, Input/Textarea/Select/Field, Checkbox, Switch, Card (default/glass/flat), Badge, Chip, Avatar, Skeleton, Progress, Divider, Kbd, Tooltip, CopyButton, Modal (also side drawer via `placement="side"`), Tabs, Toast, Spinner. **Not built yet:** Menu/dropdown (needed with ActionMenu in Phase 5). Built per §4, each with variants, sizes, states (hover, active, focus, disabled, loading), 44px touch targets, ARIA and RTL-safe logical properties
- [x] Internal preview route `/design/kit` (dev only: 404 in production) (noindex, admin-only or dev-only) showing every component in both themes. This is the living style guide.
- [x] Vitest tests `tests/ui-primitives.test.tsx` (markup/ARIA/helpers, 9 tests). No jsdom in the repo, so interactions were verified in a real browser via Playwright (modal open/Esc, tab arrows, toast) with zero console errors. Add jsdom + testing-library only if you approve the new dev dependencies.

### Phase 3: Layout shells (the biggest consistency win)

**How the transition works:** pages move to light one by one. `lightRoutes` in `app/product/AppFrame.tsx` lists the routes that use the new `SiteNavbar` + `SiteFooter`. Everything else keeps the legacy dark chrome until migrated. Light zones carry the `ds-light` class. Legacy CSS (`design/system.css`, `design/home.css`) is scoped with `:not(.ds-light *)` so it can't restyle light pages.

- [x] `SiteNavbar` (`app/ui/layout/`): light, keeps the shared `LanguageSelector`, same links and mobile menu. Legacy `Navbar.tsx` is kept for unmigrated routes.
- [x] `SiteFooter`: light, same links and copy. (The local footers in `tools/page.tsx` and `pricing/page.tsx` go away when those pages migrate in Phase 4.)
- [x] Legal pages (privacy, terms, cookie, refund, acceptable-use, api-policy, partner-terms): local navs removed, classes moved to tokens, **policy text verified identical** (diffed with classes stripped). No `LegalLayout` component was needed.
- [x] `AuthShell` redesigned (light form side + ink side panel with recoloured lock art); LanguageSelector kept; login and signup form components (`EmailCodeSignIn`, `GoogleSignInButton`) moved to tokens. Copy unchanged. `EmailCodeConfirm` is still dark: it is also used outside auth, so it moves with the page that uses it.
- [x] Single `BrandLogo` with `tone="onLight"` (new `public/brand/wazap-logo-ink.png`, wordmark recoloured to ink, mark untouched) and `tone="onDark"` (default).
- [x] `app/theme/light-scope.css` restyles the language selector inside `.ds-light` without editing `SiteLocale.tsx` or its CSS.
- [ ] `AppShell` (dashboard/admin sidebar and topbar): **moved to Phase 5**. Its content pages are still dark, so flipping the frame now would leave unreadable pages.
- [ ] Retire the `MessageCircle` brand in `AppFrame`, and the `.gradient-text` class: Phase 5 / Phase 6.
- [ ] Remaining local `<nav>`s (languages ×2, results, links, ToolSeo, GrowthArticle): replaced as each page migrates (Phase 4/5).

**Verified:** typecheck, 436 tests, production build; browser checks at 1280 and 375 widths; language menu opens and stays visible after reload; Arabic switches to RTL with the layout mirrored; no console errors; legacy dark navbar unchanged on `/tools`.

### Phase 4: Marketing pages

**Done (home `/`):**
- [x] Marketing kit in `app/ui/marketing/`: `Container`, `Section` (bg/surface tones), `SectionHeader` (eyebrow + `title<br/><span>highlight</span>`, keeps the original text-node shape for translation), `ScrollReveal` (arms `[data-animate]`; nothing is hidden without JS or with reduced motion), `HeadlineReveal` (GSAP, lazy `import("gsap")`, lines visible for crawlers/no-JS), `Marquee` (CSS only, pauses on hover). `Button` gained an `inverse` variant for dark sections.
- [x] `app/design/HomeExperience.tsx` rewritten on the kit. **All copy, section ids (`#demo`, `#how-it-works`, `#features`, `#faq`), the interactive routing demo, industry tabs (arrow/Home/End keys), FAQ (from `lib/landing-faq`) and the JSON-LD in `app/page.tsx` are unchanged.** The sticky scroll-story was replaced by three alternating feature rows (simpler, more robust, no scroll-jacking).
- [x] `GrowthResources` rewritten on tokens (its CSS file deleted).
- [x] Removed dead legacy files `app/design/MotionScenes.tsx` and `useMotion.ts`.
- [x] Art generated with `gpt-image` into `public/art/home/` (4 webp, 204 KB total; prompts in `docs/design-assets/prompts.md`, `home-jobs.json`; manifest `public/art/manifest.json`). Image backgrounds are #F7F8F5 and are blended with `mix-blend-multiply` + a radial mask. **If you change `--color-bg`, regenerate or re-tint the art.**
- [x] `/` added to `lightRoutes`. Do not give new light pages the legacy `wz-home` class: `design/home.css` has unlayered rules (`.wz-home p{margin:0}`, `h1 span` green) that override Tailwind utilities.
- Verified: typecheck, 436 tests, build; Chrome at 1280 and 375 (no horizontal scroll, no console errors); demo, tabs and language menu work; Arabic flips to RTL with headline translated. Strings not yet translated in Arabic come from the live translation API, not from this page.

**Still to do (next: about, contact, then growth/solutions templates):**
- [x] `/pricing` (+ `/plans`, a redirect): class-only migration of `PricingPlans`, `FreePlanStrip`, `PlanChangeAction`, `WazapCardPayment`; verified logic and copy identical to HEAD with classes stripped; local footer removed (SiteFooter). Card-pay button is now an outline button on light. Verified at 1280/375, no console errors.
- [x] **Reusable migration script `scripts/migrate-classes.py`** (dark classes to tokens, class names only; prints leftover hex/palette classes for manual review). Usage: `python3 scripts/migrate-classes.py app/<page>/*.tsx`, then fix the leftovers by hand, add the route to `lightRoutes`, screenshot with a Playwright script.
- [x] `ProductLandingPage` (4 `whatsapp-*` pages) rebuilt on the kit with a generated hero per page (`public/art/products/`, A3). Same props and copy (`art` is a new optional prop); plan table still reads limits from `lib/plan-limits`. New `Button` variant `inverseOutline`.
- [x] **Cursor fix (global):** Tailwind v4 resets `button{cursor:default}`. `app/theme/base.css` now sets `cursor:pointer` on buttons, links, tabs, switches, summaries, selects, checkboxes/radios, and `not-allowed` on disabled controls. Audited `/`, `/login`, `/pricing`, `/tools`: zero controls with the wrong cursor.
- [x] about, contact, newsletter, developers (class-only; developers needs a login so it was not visually verified), link-paused, router-limit, languages (+ `/languages/[language]`, RTL checked). `NewsletterForm` rewritten on `Input`/`Checkbox`/`Button` (same logic and copy).
- [ ] **`/partners` deferred to Phase 5:** it is a logged-in route inside the dark app frame, so migrating its content now would give dark text on dark. (Reverted to original.)
- [x] `GrowthArticle` + `/resources` + guides/compare/solutions: `growth-editorial.css` and `GrowthVisual.module.css` rewritten on tokens (same class names, markup and text untouched). 8 new light 3D illustrations (`public/growth/art/*-v2.webp`, prompts in `docs/design-assets/prompts.md`) replace the dark v1 set (deleted, except `inbox-v1.webp` which is still referenced). Images use `object-fit: cover`.
- [ ] **Tools hub + 5 tool pages + `/qr` deferred to Phase 5:** `AppFrame` shows these inside the dark app frame for logged-in users, so they flip together with the AppShell. They stay dark for now.
- [ ] Remaining art from §5 (A5–A11) and the OG image refresh
- [ ] After each page: copy unchanged (or catalogs regenerated), language selector and RTL verified

### Phase 5: App & admin

**Done (2026-10-19):**
- [x] **App shell restyled to light** (`app/product/product.css` + `AppFrame.tsx`): 248px sidebar with the real logo (`BrandLogo tone="onLight"`), grouped nav, RTL-safe active indicator (`::before`, logical properties), sticky blurred topbar with a profile pill, mobile "Workspace menu". Class names (`wp-shell`, `wp-profile`, `wp-nav-link`…) are unchanged, so `CrmNavigation`, the localization skip markers and every page that uses them still work.
- [x] **`scripts/migrate-css.py`**: converts hard-coded dark hex/rgba in plain CSS to tokens by property role (bg/text/border/shadow, alpha via `color-mix`). Ran on `product/product.css`, `admin/crm/experience.css`, `admin/crm/support-readability.css`: 287 hex colours to 0.
- [x] **`scripts/migrate-classes.py` run across 91 files** (account, admin, analytics, billing, dashboard, links, operations, partners, performance, qr, reports, results, support, tools, plus ChatWidget, PlanPausedBadge, PhoneInput, EmailCodeConfirm, ToolGuideSection, AnalyticsConsent, AnnouncementPopup, CountryPicker, Install*, WazapTool). One-offs fixed by hand (panel backgrounds, chat bubble, text on accent/highlight). Remaining hex in `.tsx` is intentional: QR colour swatches and the widget colour picker (`qr/QRGenerator`, `tools/widget`), embed-snippet inline styles (`tools/link`), and SVG icon artwork (`#087f50`).
- [x] **Chrome switch-over:** `app/Navbar.tsx` and `app/Footer.tsx` are now the light implementations (`ui/layout/Site*` re-export them; AGENTS.md names `Navbar.tsx` for the LanguageSelector). `AppFrame` gives every non-app route the light navbar + footer; `lightRoutes` and the `footer` prop are gone.
- [x] **Deleted legacy `app/design/home.css` and `app/design/system.css`.** `globals.css` is now ~40 lines on tokens (body, RTL contact fields, translation notice). `themeColor` is `#F7F8F5`.
- [x] Local footer removed from `tools/page.tsx`; `/tools`, `/qr`, `/support` verified logged-out and (with a mocked session) inside the shell at 1280 and 375.

**Not yet verified visually (needs a real logged-in session; I only checked the shell + tools via a mocked client session):**
- [ ] dashboard, links (list/new/created/detail), results, reports, analytics, performance, billing, account (+ security), operations, support, partners, admin + CRM (overview, contacts, customers, support, broadcast, reports, billing, health)
- [ ] Contrast pass on semi-transparent text produced by the CSS codemod (`color-mix` values), especially CRM tables, status pills and the growth board.
- [ ] Any page-local hex/inline styles in `.wp-*` content that the codemods could not see (inline `style={{}}`, 27 sites).
- [ ] `ChatWidget` (global) in both contexts.

### Phase 6: Cleanup & guardrails (done 2026-10-19)

- [x] Legacy attribute-selector overrides gone: `app/design/system.css` and `app/design/home.css` deleted (done in Phase 5); `.text-slate-500/600` override and `.gradient-text` / `.hero-bg` removed from `globals.css`.
- [x] Unused files deleted: `ProductMotionScene.tsx` + module CSS, `LandingVisual.module.css`, `theme/light-scope.css` (the selector CSS is now token-based at source), Next starter SVGs, `public/landing-art/`, `public/wazap-routing-concept-v1.webp`. Customer files in `public/` (`astraterra-*`, `binance-pay.png`, `wa-catalog-qr.png`) were left as agreed.
- [x] `app/localization/language-control.css` converted to tokens (selector verified visible, opens, survives reload).
- [x] Remaining hard-coded colours in `.tsx` reduced to an explicit, justified allowlist (QR/widget colour pickers, embed snippets, SVG artwork, OG image, viewport meta).
- [x] **CI guard:** `tests/design-tokens.test.ts` fails on new hex, Tailwind palette classes and arbitrary colours in `app/**` (excluding `api/`). `npm run check:design` runs it plus the contrast check. It runs in `npm test`.
- [x] Brand refresh: `public/manifest.json` colours, `public/design-release.json`, `themeColor`, and a new light social card (`app/opengraph-image.tsx`, uses `public/art/home/hero-og.jpg`).
- [x] `docs/design-system.md` written (rules, file map, recipes, pre-ship checklist).
- Not changed: favicons/app icons (your approved logo mark works on any background).

### Phase 7: QA & release

- [x] **Lighthouse (2026-10-19, production build, mobile, simulated Slow 4G / 4x CPU).** Accessibility 100, Best Practices 100, SEO 100 on every public page except login/signup (SEO 69 = intentional `noindex`).

  | Page | Perf | A11y | LCP | CLS |
  |---|---|---|---|---|
  | `/` | 91 | 100 | 3.4 s | 0 |
  | `/pricing` | 94 | 100 | 3.1 s | 0.005 |
  | `/whatsapp-lead-routing`, `/whatsapp-ad-tracking` | 94 | 100 | 3.1 s | 0 |
  | `/resources` | 91 | 100 | 3.5 s | 0 |
  | `/guides/one-whatsapp-link-multiple-numbers` | 90 | 100 | 3.6 s | 0 |
  | `/about`, `/contact` | 95, 94 | 100 | 3.0, 3.1 s | 0 |
  | `/tools` | 95 | 100 | 3.0 s | 0 |
  | `/login`, `/signup` | 86, 92 | 100 | 4.2, 3.4 s | 0.01, 0 |

  Home with real (devtools) throttling: 99, LCP 1.6 s; desktop: 100, LCP 0.8 s.
- Fixes made from the audit: the home headline entrance is now pure CSS (the GSAP version hid the headline until the library loaded: Perf 80 to 91, Speed Index 4.9 s to 1.1 s); GSAP now powers a pointer-parallax on the hero art, loaded on first mouse move only; hero visuals on resources/guides load eagerly with high priority; inline links in paragraphs are underlined (WCAG 1.4.1); the Google sign-in slot reserves its space (login CLS 0.066 to 0.01).
- [ ] Visual QA of logged-in screens (Phase 5 list).
- [ ] Axe/keyboard pass on the dashboard and admin once visible.
- [ ] Before/after screenshots for all baseline routes.
- [ ] Localization verification per AGENTS.md on the real deploy candidate (selector visible after hydration and reload, translations, RTL). Done locally for `/`, `/login`, `/pricing`, `/languages/ar`.
- [ ] Compare against the VPS source (`Navbar.tsx`, `AuthShell.tsx`, `Providers.tsx`, `globals.css`, `language-control.css`), then deploy following `docs/operations-runbook.md`.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Translation drift from changed markup or copy | Keep English strings identical; test 3 locales + ar after each page; regenerate catalogs only through the documented flow |
| `system.css` attribute selectors breaking during migration | Keep it loaded until Phase 6; delete per-selector with a visual check |
| Huge diff (2,700+ color sites) | Token aliasing first (Phase 1), migrate page-by-page, small commits per page |
| Bundle bloat from GSAP/motion libs | Prefer CSS and the existing motion; add GSAP only for the home hero, lazy-loaded |
| Dark/light flash on load | Inline pre-hydration theme script |
| VPS has newer edits than local | Diff before every shared-file change (AGENTS.md rule) |
| Generated art looks inconsistent | One style brief, same seed wording, curated sets, manifest with prompts |

## 8. Decisions (owner, 2026-10-19)

1. **Palette:** go with "Midnight Jade" (§3).
2. **Heading font:** same as link-generator, **Plus Jakarta Sans** (body stays Inter). *Interpreted from "use the header from same"; confirm if you meant the navbar layout instead.*
3. **Theme:** **light only for now. No dark theme.** Phase 1 skips `ThemeProvider`/`ThemeToggle` and the dark token column. Tokens stay semantic so dark can be added later without touching components. The current dark look is replaced by the light palette.
4. **GSAP:** approved (headline/highlight reveals; lazy-load, home first).
5. **Generated assets** go in `public/` (`public/art/<area>/` + manifest). Customer-specific files already in `public/` are left alone for now.

---

## Session log

| Date | Work done | Next |
|---|---|---|
| 2026-10-19 | Audited link-generator + wazap UI; wrote this plan | Owner decisions §8 → Phase 0 remaining items |
| 2026-10-19 | Owner decisions recorded (§8): Midnight Jade, Plus Jakarta Sans, light only, GSAP, assets in public | Phase 0 leftovers → Phase 1 |
| 2026-10-19 | Work stays on `dev-roki`; baseline shots; Phase 1: tokens/base/utilities CSS, Inter + Plus Jakarta Sans, contrast script, `gsap` installed. Typecheck, 427 tests and production build pass. Existing pages stay dark until the colour flip. | VPS host for localization diff; Phase 2 |
| 2026-10-19 | Phase 2: `app/ui/` primitives, `/design/kit`, tests. Lessons: (1) `@theme` must be imported from the file that has `@import "tailwindcss"` (now in `globals.css`) or color utilities are not generated; (2) never name tokens like Tailwind's own (`--radius-*`, `--ease-out`) because they override utilities site-wide. 436 tests + build pass. | Phase 3 |
| 2026-10-19 | Phase 3: SiteNavbar/SiteFooter, light AuthShell + login/signup forms, legal pages on tokens, BrandLogo light variant, `lightRoutes` switch in AppFrame. Fixed legacy `a{color:inherit}` and `main:not(.wz-home)` rules overriding the new styles (scoped with `:not(.ds-light *)`). AppShell deferred to Phase 5. | Phase 4 (home first) |
| 2026-10-19 | Phase 4 step 1: home page rebuilt on the new kit with GSAP headline + 4 generated 3D images; dead legacy motion files removed. | `/pricing`, then product pages |
| 2026-10-19 | `/pricing` migrated; added `scripts/migrate-classes.py` for the remaining pages. | `whatsapp-*` product pages |
| 2026-10-19 | Product pages (4) on the new template + 4 generated heroes; global pointer-cursor rule. | about, contact, partners, developers, newsletter, resources |
| 2026-10-19 | Phase 4 (public marketing) done except tools/qr/partners, which share the app frame with logged-in users and move to Phase 5. Added about, contact, newsletter, developers, languages, link-paused, router-limit, guides/compare/solutions/resources + 8 new illustrations. | Phase 5: AppShell + dashboard/links/results/billing/account/admin + tools/qr/partners |
| 2026-10-19 | Phase 5: app shell light; CSS + class codemods across the logged-in app (91 files); real Navbar/Footer now light for all non-app routes; legacy `home.css`/`system.css` deleted. Server-gated screens not yet seen. | Visual QA with a logged-in session; Phase 6 |
| 2026-10-19 | Phase 6: guard test + `check:design`, legacy files removed, OG/manifest/design-release refreshed, `docs/design-system.md`. | Phase 7: logged-in QA, Lighthouse, VPS diff, deploy |
| 2026-10-19 | Lighthouse run; fixed home perf (CSS headline, lazy GSAP parallax), eager hero visuals, underlined inline links, login CLS. | Logged-in QA, VPS diff, deploy |
