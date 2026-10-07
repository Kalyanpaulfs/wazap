# Website locale catalogs

Country comes from the local `data/user-country.mmdb` lookup of the Nginx-supplied visitor address. The public locale API sends back country, language and direction; it does not save IP addresses. On this VPS, Nginx must overwrite X-Real-IP with $remote_addr. Do not expose the Node application directly to untrusted clients.

A validated manual `wazap_site_language` cookie overrides country. With no mapped country, use the browser language, then English. Country is an approximate initial choice; multilingual countries and VPNs make the manual selector essential. Language does not change billing currency or checkout entitlement.

Public website copy uses immutable local `/locales/VERSION/LANGUAGE.json` catalogs. Catalogs were generated offline through the isolated Codex OAuth runtime from source UI copy only, never customer records or messages. They are machine translations, not human-reviewed translations. English is the fallback for missing copy. The initial release covers the marketing site, pricing, login/signup and support UI. Tools, private account pages and original legal policies remain English; support conversations retain their own language.

Customer input values, chat histories, code and explicit translate=no/data-no-localize regions are excluded. The translator edits existing text node values and selected accessibility attributes; it never inserts HTML or replaces React elements.

Regenerate from `scripts/extract-site-copy.cjs`, review source omissions against the rendered pages, and use the private catalog builder in `operations/website-localization`. Run numeric/brand/URL integrity checks and browser tests before shipping a new version. Keep previous versions for cached clients. Do not auto-translate or silently replace contractual/legal terms.

Country database source: https://github.com/sapics/ip-location-db , user-country MMDB (PDDL). The downloaded October 7, 2026 snapshot has a sibling SHA-256 file. Update from the official release, verify SHA-256, smoke-test IPv4/IPv6 and restart the app so its in-memory reader reloads.
