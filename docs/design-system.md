# Wazap design system ("Midnight Jade", light)

How to build UI that matches the site. History and decisions live in `design-system-revamp.md`.

## Rules
1. **Colours come from tokens, never literals.** Use Tailwind utilities backed by `app/theme/tokens.css`
   (`bg-bg`, `bg-surface`, `bg-surface-2`, `text-text`, `text-muted`, `border-border`, `bg-accent`,
   `text-on-accent`, `bg-accent-soft`, `bg-highlight`, `text-danger` …). `tests/design-tokens.test.ts`
   (`npm run check:design`, also part of `npm test`) fails on new hex colours, Tailwind palette classes
   (`text-slate-400`) and arbitrary colours (`bg-[#111]`). Exceptions are listed, with a reason, in that test.
2. **Light theme only for now.** Tokens are semantic, so dark mode later means adding a `[data-theme="dark"]`
   block to `tokens.css` and a toggle, not touching components.
3. **Contrast must stay AA.** `node scripts/check-contrast.mjs` checks every text/background token pair.
   Brand jade for text and buttons is `--color-accent` (#087f50). `--color-jade-bright` (#0fa968) is decorative only.
4. **Don't name tokens like Tailwind's own** (`--radius-*`, `--ease-out`): they override utilities site-wide.
   `@theme` must be imported from the file that has `@import "tailwindcss"` (`globals.css`).
5. **Keep translation working.** Change markup, not copy. Keep `SiteLocaleProvider`, `LanguageSelector`
   (`app/Navbar.tsx`, `app/components/AuthShell.tsx`), `translate="no"` / `data-no-localize` / `.wp-profile` markers.
   Split `title<br/><span>highlight</span>` text nodes exactly as `SectionHeader` does. Use logical properties
   (`ps-`/`pe-`, `ms-`/`me-`, `start`/`end`) so right-to-left works.
6. **Legal text is never rewritten by design work.**

## Where things live
| Path | What |
|---|---|
| `app/theme/tokens.css` | colour, shadow, easing, font tokens (single source of truth) |
| `app/theme/base.css` | headings font, focus ring, selection, reduced motion, pointer cursors |
| `app/theme/utilities.css` | `.eyebrow`, `.surface-card`, `.glass`, `.btn-press`, `.btn-shine`, `.text-gradient-brand`, scroll reveal, marquee |
| `app/ui/` | primitives: Button/ButtonLink/IconButton, Input/Textarea/Select/Field, Checkbox, Switch, Card, Badge, Chip, Avatar, Skeleton, Progress, Tooltip, CopyButton, Modal (+drawer), Tabs, Toast |
| `app/ui/marketing/` | Container, Section, SectionHeader, ScrollReveal, HeadlineReveal (GSAP, lazy), Marquee |
| `app/Navbar.tsx`, `app/Footer.tsx` | light site chrome for every non-app route (`app/product/AppFrame.tsx` picks it) |
| `app/product/product.css` + `AppFrame.tsx` | logged-in app shell (`wp-*` classes, token-based) |
| `/design/kit` (dev only) | living style guide of every primitive |
| `public/art/` + `manifest.json` | generated 3D art; prompts in `docs/design-assets/prompts.md` |

## Recipes
- **New marketing page:** `AppFrame` already wraps non-app routes in the light chrome (`ds-light`). Use `Container`, `Section` (alternate `tone="bg"|"surface"`), `SectionHeader`, `Card`, `ButtonLink`; add `data-animate`
  to blocks that should reveal on scroll and render `<ScrollReveal />` once on the page.
- **New app page:** render inside the shell, use `Card`, `Input`, `Button`, `Badge`; avoid page-local CSS.
- **Dark section on a light page** (CTA cards): `bg-ink text-white` with `Button variant="inverse"` / `"inverseOutline"`.
- **Illustrations:** generate with `~/Projects/tools/gpt-image` using the style brief in `docs/design-assets/prompts.md`
  (soft 3D clay-and-glass, jade + ink + saffron, plain #F7F8F5 background), export webp, show with `next/image`,
  `mix-blend-multiply` and a `closest-side` radial `mask-image` so edges disappear. Add the file to `public/art/manifest.json`.
- **Migrating old markup:** `python3 scripts/migrate-classes.py <files>` (Tailwind classes) and
  `python3 scripts/migrate-css.py <files>` (plain CSS) swap dark colours for tokens, then review leftovers by hand.

## Checks before shipping UI
`npx tsc --noEmit`, `npm test`, `npm run check:design`, then look at the page at 1280 and 375 px,
switch the language to Arabic (right-to-left) and confirm the language selector is visible after a reload.
