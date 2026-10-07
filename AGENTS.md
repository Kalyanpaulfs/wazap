<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Preserve deployed website localization

The country-language release is owned by `operations/website-localization/`. Preserve `SiteLocaleProvider` in `app/Providers.tsx` and `LanguageSelector` in both `app/Navbar.tsx` and `app/components/AuthShell.tsx`. Country detection and a visible saved manual choice are one feature; do not remove either as unrelated cleanup or while deploying SEO/auth/CRM work. Compare current VPS source before copying shared files, and verify the selector remains visible after hydration and reload. Public UI translation does not authorize replacing original legal policies or translating customer messages or private account data. Read the release report before expanding translated routes or changing catalog generation.
