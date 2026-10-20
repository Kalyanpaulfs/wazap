-- Audience feature ("Audience" card on /results, Growth/Agency only): device,
-- OS, country and city of the people who click a customer's links. Additive,
-- nullable columns, no default behaviour change - existing rows stay NULL,
-- and this never changes how a click is counted. Safe to run on production.
--
-- Privacy: these are derived labels only (lib/audience.ts for device/os,
-- lib/geo-city.ts for country/city). Wazap still never stores a raw IP
-- address or a raw user-agent string anywhere - see lib/conversations.ts.

ALTER TABLE "ConversationStart" ADD COLUMN IF NOT EXISTS "device" TEXT;
ALTER TABLE "ConversationStart" ADD COLUMN IF NOT EXISTS "os" TEXT;
ALTER TABLE "ConversationStart" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "ConversationStart" ADD COLUMN IF NOT EXISTS "city" TEXT;
