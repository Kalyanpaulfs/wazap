# Configuration inventory — 9 October 2026

Live-source comparison found no missing or differing application file contents under the documented source filters. The separately deployed support worker is included as source; runtime state and provider authorization are excluded.

## Additional configuration names

The following names were extracted from application/library/script source. They are an inventory, not instructions to enable every integration. Provision only the required sandbox features; blank values are not production configuration.

```
AI_EXECUTION_DISABLED
BREVO_API_KEY
BREVO_WEBHOOK_SECRET
CRON_SECRET
CUSTOMER_AUTOMATION_SINCE
CUSTOMER_NURTURE_READY
DATABASE_URL
DODO_CHECKOUT_ENABLED
DODO_ENVIRONMENT
DODO_PAYMENTS_API_KEY
DODO_PRODUCT_ID_BASIC
DODO_PRODUCT_ID_BUSINESS
DODO_PRODUCT_ID_PRO
DODO_PRODUCT_ID_ULTIMATE
DODO_WEBHOOK_KEY
EMAIL_AUTOMATION_READY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_SITE_VERIFICATION
INDEXNOW_KEY
META_APP_ID
META_APP_SECRET
META_CONFIG_ID
META_GRAPH_VERSION
META_VERIFY_TOKEN
MFA_ENCRYPTION_KEY
NEXTAUTH_SECRET
NEXTAUTH_URL
NEXT_PUBLIC_BASE_URL
NEXT_PUBLIC_GA_MEASUREMENT_ID
NODE_ENV
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_TIMEOUT_MS
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_ENVIRONMENT
PAYPAL_LEGACY_PLAN_IDS_BASIC
PAYPAL_LEGACY_PLAN_IDS_BUSINESS
PAYPAL_LEGACY_PLAN_IDS_PRO
PAYPAL_LEGACY_PLAN_IDS_ULTIMATE
PAYPAL_PLAN_ID_BASIC
PAYPAL_PLAN_ID_BUSINESS
PAYPAL_PLAN_ID_PRO
PAYPAL_PLAN_ID_ULTIMATE
PAYPAL_WEBHOOK_ID
RESEND_API_KEY
SEO_ORIGIN
SEO_SITEMAP_ORIGIN
SUPPORT_EMAIL_AUTOMATION_READY
SUPPORT_INBOX_POLLING
SUPPORT_MONITOR_SINCE
SUPPORT_TELEGRAM_BOT_TOKEN
SUPPORT_TELEGRAM_CHAT_IDS
TELEGRAM_ALLOW_USER_IDS
TELEGRAM_BOT_TOKEN
WAZAP_CHAT_FALLBACK_DIR
WAZAP_CODEX_SUPPORT
WAZAP_DATABASE_NAME
WAZAP_DATABASE_URL
WAZAP_DEFAULT_WHATSAPP_NUMBER
WAZAP_QA_BASE_URL
WAZAP_ROUTING_CACHE_DIR
WAZAP_SUPPORT_MONITOR_STATE
WEBHOOK_ENCRYPTION_KEY
```

Some modules use stored configuration or dynamic environment access; this inventory does not replace reading their setup requirements. Never use real production database URLs for QA.

## Deployment templates

- `ops/ecosystem.config.cjs`: web process bound to localhost port 5000, matching inspected production invocation.
- `ops/wazap-support-worker.service`: inspected worker systemd service.
- `services/support-worker/runtime.env.example`: worker non-secret configuration template.

Reverse proxy/TLS configuration, firewall rules, scheduled jobs, credentials, OAuth approvals, Codex executable package and private authentication require separate infrastructure provisioning. They are not supplied by cloning this repository. Existing cron/rebuild/backup helpers are in `scripts/` and root scripts. Do not install or execute them indiscriminately.

Verification scope: source parity, TypeScript and source syntax—not successful live payments, a clean-room deployment, a penetration test, or certification of business completeness.
