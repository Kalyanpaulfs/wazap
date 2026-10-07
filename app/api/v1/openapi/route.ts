import { NextResponse } from "next/server";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/lib/developer-platform";

export const dynamic = "force-dynamic";

const response = (description: string, schema = "Resource") => ({
  description,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
});
const operation = (summary: string, operationId: string, scope: string, success = "Resource") => ({
  summary,
  operationId,
  security: [{ bearerAuth: [] }],
  "x-wazap-scope": scope,
  responses: {
    "200": response("Successful request.", success),
    "400": response("Validation error.", "Error"),
    "401": response("Invalid or missing API key.", "Error"),
    "403": response("Insufficient scope.", "Error"),
    "404": response("Resource not found.", "Error"),
    "429": response("Rate limit exceeded.", "Error"),
  },
});
const publicOperation = (summary: string, operationId: string, success: string) => ({
  summary,
  operationId,
  security: [],
  responses: {
    "200": response("Successful public request.", success),
    "404": response("Published resource not found.", "Error"),
    "429": response("Rate limit exceeded.", "Error"),
  },
});
const idParameter = { name: "id", in: "path", required: true, schema: { type: "string" } };
const idempotencyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description: "Stable retry key retained for 24 hours. Reusing it with a different body returns 409.",
  schema: { type: "string", minLength: 8, maxLength: 200 },
};
const jsonBody = (properties: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: {
    "application/json": {
      schema: { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false },
    },
  },
});
const pagination = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
  { name: "after", in: "query", schema: { type: "string" } },
];

export async function GET() {
  const document = {
    openapi: "3.1.0",
    info: {
      title: "Wazap Business Conversations API",
      version: "1.0.0",
      description: "Workspace-scoped APIs for channels, leads, conversations, messages, tasks, automations, and AI agent profiles. API keys are hashed, rate-limited to 120 requests per minute, constrained by explicit scopes, and mutation retries are protected with idempotency keys. Channel signing secrets are returned only on the original create or rotate response and are redacted from idempotent replays.",
      contact: { name: "Wazap Support", url: "https://wazap.lt/contact" },
    },
    externalDocs: { description: "API lifecycle, compatibility, reliability, and incident policy", url: "https://wazap.lt/api-policy" },
    servers: [{ url: "https://wazap.lt/api/v1", description: "Production" }],
    tags: [
      { name: "Leads", description: "CRM lead lifecycle." },
      { name: "Conversations", description: "Omnichannel conversation records." },
      { name: "Messages", description: "Idempotent message recording and provider delivery." },
      { name: "Tasks", description: "Recoverable follow-up task lifecycle." },
      { name: "Automations", description: "Draft and dry-run automation management. Live activation always requires an owner or admin in Wazap." },
      { name: "Agents", description: "AI employee profiles constrained to drafts and human-approved response modes. Activation and autonomous sending are never available to API keys." },
      { name: "Channels", description: "Omnichannel connection lifecycle. Public creation is limited to signed custom bridges; provider-managed credentials remain owner/admin operations in Wazap." },
      { name: "WhatsApp", description: "Consent records, Meta-approved templates, and draft campaigns. API keys cannot schedule or launch broadcasts." },
      { name: "Analytics", description: "Aggregate workspace conversation, acquisition, pipeline, campaign, automation, AI, and integration metrics without contact-level data." },
      { name: "Operations", description: "Current workspace operational health and recent retained snapshots." },
      { name: "Partners", description: "Referral tracking and verified influenced-revenue metrics. Commissions and payouts are not enabled by this API." },
      { name: "Audit", description: "Workspace-scoped security and administrative evidence with personal contact details and unsafe metadata removed." },
      { name: "Marketplace", description: "Public discovery of reviewed, published, currently free Wazap Store packages and their latest published versions." },
    ],
    paths: {
      "/leads": {
        get: { ...operation("List leads", "listLeads", "leads:read", "Collection"), tags: ["Leads"], parameters: pagination },
        post: { ...operation("Create a lead", "createLead", "leads:write"), tags: ["Leads"], parameters: [idempotencyParameter], requestBody: jsonBody({ name: { type: "string", maxLength: 100 }, phone: { type: "string" }, email: { type: ["string", "null"], format: "email" }, source: { type: "string" }, campaign: { type: ["string", "null"] }, notes: { type: "string", maxLength: 2000 } }, ["name", "phone"]), responses: { ...operation("", "", "").responses, "201": response("Lead created."), "409": response("Idempotency conflict or request still in progress.", "Error") } },
      },
      "/leads/{id}": {
        get: { ...operation("Get a lead", "getLead", "leads:read"), tags: ["Leads"], parameters: [idParameter] },
        patch: { ...operation("Update a lead", "updateLead", "leads:write"), tags: ["Leads"], parameters: [idParameter, idempotencyParameter], requestBody: jsonBody({ name: { type: "string" }, phone: { type: "string" }, email: { type: ["string", "null"], format: "email" }, status: { type: "string", enum: ["new", "contacted", "qualified", "proposal", "won", "lost"] }, owner: { type: ["string", "null"] }, estimatedValue: { type: ["number", "null"], minimum: 0 }, currency: { type: "string", minLength: 3, maxLength: 3 }, nextFollowUpAt: { type: ["string", "null"], format: "date-time" }, notes: { type: "string" }, lostReason: { type: ["string", "null"] } }), responses: { ...operation("", "", "").responses, "409": response("Idempotency conflict or request still in progress.", "Error") } },
        delete: { ...operation("Archive a lead", "archiveLead", "leads:write"), tags: ["Leads"], parameters: [idParameter, idempotencyParameter], responses: { ...operation("", "", "").responses, "409": response("Idempotency conflict or request still in progress.", "Error") } },
      },
      "/conversations": {
        get: { ...operation("List conversations", "listConversations", "conversations:read", "Collection"), tags: ["Conversations"], parameters: [...pagination, { name: "status", in: "query", schema: { type: "string", enum: ["open", "pending", "resolved"] } }] },
        post: { ...operation("Create or reopen a conversation", "createConversation", "conversations:write"), tags: ["Conversations"], parameters: [idempotencyParameter], requestBody: jsonBody({ channel: { type: "string", enum: ["whatsapp", "instagram", "messenger", "email", "sms", "rcs", "telegram"] }, contactName: { type: "string" }, contactAddress: { type: "string" }, initialMessage: { type: "string", maxLength: 4000 } }, ["contactName", "contactAddress"]), responses: { ...operation("", "", "").responses, "200": response("Existing conversation reopened."), "201": response("Conversation created."), "409": response("Idempotency conflict or request still in progress.", "Error") } },
      },
      "/conversations/{id}": {
        get: { ...operation("Get a conversation with recent history", "getConversation", "conversations:read"), tags: ["Conversations"], parameters: [idParameter] },
        patch: { ...operation("Update conversation status, priority, or tags", "updateConversation", "conversations:write"), tags: ["Conversations"], parameters: [idParameter, idempotencyParameter], requestBody: jsonBody({ status: { type: "string", enum: ["open", "pending", "resolved"] }, priority: { type: "string", enum: ["low", "normal", "high", "urgent"] }, tags: { type: "array", maxItems: 10, items: { type: "string", maxLength: 30 } } }), responses: { ...operation("", "", "").responses, "409": response("Idempotency conflict or request still in progress.", "Error") } },
      },
      "/conversations/{id}/messages": {
        post: {
          ...operation("Record or transmit a message", "createMessage", "messages:write"),
          tags: ["Messages"],
          parameters: [idParameter, idempotencyParameter],
          requestBody: jsonBody({ text: { type: "string", maxLength: 4000 }, direction: { type: "string", enum: ["inbound", "outbound"], default: "outbound" } }, ["text"]),
          responses: { ...operation("", "", "").responses, "201": response("Message accepted or recorded."), "409": response("The idempotency key was reused with a changed or unverifiable body, or the original attempt failed.", "Error"), "502": response("The provider rejected the message.", "Error") },
        },
      },
      "/tasks": {
        get: { ...operation("List follow-up tasks", "listTasks", "tasks:read", "Collection"), tags: ["Tasks"], parameters: [...pagination, { name: "status", in: "query", schema: { type: "string", enum: ["open", "completed"] } }] },
        post: { ...operation("Create a follow-up task", "createTask", "tasks:write"), tags: ["Tasks"], parameters: [idempotencyParameter], requestBody: jsonBody({ title: { type: "string", maxLength: 180 }, priority: { type: "string", enum: ["low", "normal", "high", "urgent"] }, dueAt: { type: ["string", "null"], format: "date-time" }, conversationId: { type: ["string", "null"] }, assignedMemberId: { type: ["string", "null"] } }, ["title"]), responses: { ...operation("", "", "").responses, "201": response("Task created."), "409": response("Idempotency conflict or request still in progress.", "Error") } },
      },
      "/tasks/{id}": {
        get: { ...operation("Get a follow-up task", "getTask", "tasks:read"), tags: ["Tasks"], parameters: [idParameter] },
        patch: { ...operation("Update or complete a follow-up task", "updateTask", "tasks:write"), tags: ["Tasks"], parameters: [idParameter, idempotencyParameter], requestBody: jsonBody({ title: { type: "string", maxLength: 180 }, status: { type: "string", enum: ["open", "completed"] }, priority: { type: "string", enum: ["low", "normal", "high", "urgent"] }, dueAt: { type: ["string", "null"], format: "date-time" }, assignedMemberId: { type: ["string", "null"] } }), responses: { ...operation("", "", "").responses, "409": response("Idempotency conflict or request still in progress.", "Error") } },
        delete: { ...operation("Archive a follow-up task", "archiveTask", "tasks:write"), tags: ["Tasks"], parameters: [idParameter, idempotencyParameter], responses: { ...operation("", "", "").responses, "409": response("Idempotency conflict or request still in progress.", "Error") } },
      },
      "/automations": {
        get: { ...operation("List automation rules", "listAutomations", "automations:read", "Collection"), tags: ["Automations"], parameters: pagination },
        post: {
          ...operation("Create a disabled dry-run automation", "createAutomation", "automations:write"),
          tags: ["Automations"],
          parameters: [idempotencyParameter],
          requestBody: jsonBody({
            name: { type: "string", maxLength: 100 },
            trigger: { type: "string", enum: ["conversation.created", "message.received", "conversation.updated", "lead.created", "lead.updated", "scheduled.daily"] },
            conditions: { type: "object" },
            actions: { type: "array", minItems: 1, maxItems: 10, items: { type: "object" } },
          }, ["name", "trigger", "actions"]),
          responses: { ...operation("", "", "").responses, "201": response("Draft automation created."), "409": response("Idempotency conflict or request still in progress.", "Error") },
        },
      },
      "/automations/{id}": {
        get: { ...operation("Get an automation with recent runs", "getAutomation", "automations:read"), tags: ["Automations"], parameters: [idParameter] },
        patch: {
          ...operation("Update a draft or dry-run automation", "updateAutomation", "automations:write"),
          tags: ["Automations"],
          parameters: [idParameter, idempotencyParameter],
          requestBody: jsonBody({
            name: { type: "string", maxLength: 100 },
            trigger: { type: "string" },
            conditions: { type: "object" },
            actions: { type: "array", minItems: 1, maxItems: 10, items: { type: "object" } },
            status: { type: "string", enum: ["draft", "paused"] },
            runMode: { type: "string", enum: ["dry_run"] },
          }),
          responses: { ...operation("", "", "").responses, "409": response("Live activation requires human owner or admin approval.", "Error") },
        },
        delete: { ...operation("Archive an automation", "archiveAutomation", "automations:write"), tags: ["Automations"], parameters: [idParameter, idempotencyParameter], responses: { ...operation("", "", "").responses, "409": response("Idempotency conflict or request still in progress.", "Error") } },
      },
      "/agents": {
        get: { ...operation("List AI agent profiles", "listAgents", "agents:read", "Collection"), tags: ["Agents"], parameters: pagination },
        post: {
          ...operation("Create a disabled AI agent profile", "createAgent", "agents:write"),
          tags: ["Agents"],
          parameters: [idempotencyParameter],
          requestBody: jsonBody({
            name: { type: "string", maxLength: 80 },
            roleType: { type: "string", enum: ["sales_rep", "receptionist", "support_agent", "recruiter", "appointment_setter", "collections_agent", "real_estate_agent"] },
            instructions: { type: "string", minLength: 20, maxLength: 6000 },
            responseMode: { type: "string", enum: ["draft_only", "approval_required"] },
            tone: { type: "string", maxLength: 40 },
            language: { type: "string", maxLength: 20 },
            allowedTopics: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
            prohibitedTopics: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
            escalationKeywords: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
            requireHumanFor: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
            maxMessagesPerThread: { type: "integer", minimum: 1, maximum: 20 },
          }, ["name", "instructions"]),
          responses: { ...operation("", "", "").responses, "201": response("Disabled agent profile created."), "409": response("Name or idempotency conflict.", "Error") },
        },
      },
      "/agents/{id}": {
        get: { ...operation("Get an AI agent with recent runs and handoffs", "getAgent", "agents:read"), tags: ["Agents"], parameters: [idParameter] },
        patch: {
          ...operation("Update a disabled or paused AI agent", "updateAgent", "agents:write"),
          tags: ["Agents"],
          parameters: [idParameter, idempotencyParameter],
          requestBody: jsonBody({
            name: { type: "string", maxLength: 80 },
            roleType: { type: "string" },
            instructions: { type: "string", minLength: 20, maxLength: 6000 },
            status: { type: "string", enum: ["draft", "paused"] },
            responseMode: { type: "string", enum: ["draft_only", "approval_required"] },
            tone: { type: "string", maxLength: 40 },
            language: { type: "string", maxLength: 20 },
            allowedTopics: { type: "array", maxItems: 20, items: { type: "string" } },
            prohibitedTopics: { type: "array", maxItems: 20, items: { type: "string" } },
            escalationKeywords: { type: "array", maxItems: 20, items: { type: "string" } },
            requireHumanFor: { type: "array", maxItems: 20, items: { type: "string" } },
            maxMessagesPerThread: { type: "integer", minimum: 1, maximum: 20 },
          }),
          responses: { ...operation("", "", "").responses, "409": response("Activation, autonomous sending, name conflict, or idempotency conflict.", "Error") },
        },
        delete: { ...operation("Archive an AI agent", "archiveAgent", "agents:write"), tags: ["Agents"], parameters: [idParameter, idempotencyParameter], responses: { ...operation("", "", "").responses, "409": response("Active marketplace install or idempotency conflict.", "Error") } },
      },
      "/channels": {
        get: { ...operation("List active channel connections", "listChannels", "channels:read", "Collection"), tags: ["Channels"], parameters: pagination },
        post: {
          ...operation("Create a signed custom bridge", "createChannel", "channels:write"),
          tags: ["Channels"],
          parameters: [idempotencyParameter],
          requestBody: jsonBody({
            channel: { type: "string", enum: ["whatsapp", "instagram", "messenger", "email", "sms", "rcs", "telegram"] },
            displayName: { type: "string", maxLength: 80 },
            externalAccountId: { type: ["string", "null"], maxLength: 120 },
            provider: { type: "string", enum: ["custom_bridge"], default: "custom_bridge" },
          }, ["channel", "displayName"]),
          responses: {
            ...operation("", "", "").responses,
            "201": response("Connection created. signingSecret is included only in the original response."),
            "409": response("Provider management or idempotency conflict.", "Error"),
          },
        },
      },
      "/channels/{id}": {
        get: { ...operation("Get a channel connection", "getChannel", "channels:read"), tags: ["Channels"], parameters: [idParameter] },
        patch: {
          ...operation("Pause or resume a verified channel", "updateChannel", "channels:write"),
          tags: ["Channels"],
          parameters: [idParameter, idempotencyParameter],
          requestBody: jsonBody({ status: { type: "string", enum: ["paused", "active"] } }, ["status"]),
          responses: { ...operation("", "", "").responses, "409": response("Connection is not in a compatible lifecycle state.", "Error") },
        },
        delete: {
          ...operation("Disable a channel while retaining history", "disableChannel", "channels:write"),
          tags: ["Channels"],
          parameters: [idParameter, idempotencyParameter],
          responses: { ...operation("", "", "").responses, "409": response("Idempotency conflict or request still in progress.", "Error") },
        },
      },
      "/channels/{id}/rotate": {
        post: {
          ...operation("Rotate custom bridge credentials", "rotateChannelCredential", "channels:write"),
          tags: ["Channels"],
          parameters: [idParameter, idempotencyParameter],
          requestBody: jsonBody({}),
          responses: {
            ...operation("", "", "").responses,
            "409": response("Provider management or idempotency conflict.", "Error"),
          },
          description: "Returns signingSecret only in the original response. An idempotent replay returns the same connection metadata with meta.secretAvailable=false and never replays the secret.",
        },
      },
      "/whatsapp/consents": {
        get: { ...operation("List WhatsApp consent records", "listWhatsAppConsents", "whatsapp:read", "Collection"), tags: ["WhatsApp"], parameters: [...pagination, { name: "status", in: "query", schema: { type: "string", enum: ["opted_in", "opted_out"] } }] },
        post: {
          ...operation("Record or withdraw WhatsApp consent", "upsertWhatsAppConsent", "whatsapp:write"),
          tags: ["WhatsApp"], parameters: [idempotencyParameter],
          requestBody: jsonBody({
            contactAddress: { type: "string", description: "International WhatsApp number." },
            status: { type: "string", enum: ["opted_in", "opted_out"] },
            source: { type: "string", maxLength: 80 },
            proof: { type: "string", maxLength: 500, description: "Required for opt-in." },
            expiresAt: { type: ["string", "null"], format: "date-time" },
          }, ["contactAddress", "status", "source"]),
          responses: { ...operation("", "", "").responses, "409": response("Idempotency conflict or request still in progress.", "Error") },
        },
      },
      "/whatsapp/templates": {
        get: { ...operation("List synchronized Meta templates", "listWhatsAppTemplates", "whatsapp:read", "Collection"), tags: ["WhatsApp"], parameters: [...pagination, { name: "status", in: "query", schema: { type: "string" } }] },
      },
      "/whatsapp/campaigns": {
        get: { ...operation("List WhatsApp campaigns without recipient addresses", "listWhatsAppCampaigns", "whatsapp:read", "Collection"), tags: ["WhatsApp"], parameters: [...pagination, { name: "status", in: "query", schema: { type: "string" } }] },
        post: {
          ...operation("Create a consent-filtered draft campaign", "createWhatsAppCampaign", "whatsapp:write"),
          tags: ["WhatsApp"], parameters: [idempotencyParameter],
          requestBody: jsonBody({
            connectionId: { type: "string" },
            templateId: { type: "string" },
            name: { type: "string", maxLength: 120 },
            audience: { type: "array", minItems: 1, maxItems: 10000, items: { type: "string" } },
          }, ["connectionId", "templateId", "name", "audience"]),
          responses: {
            ...operation("", "", "").responses,
            "201": response("Draft campaign created. Recipient addresses are not returned."),
            "409": response("Assets, attribution, or idempotency conflict.", "Error"),
          },
          description: "Creates a draft only. An owner or admin must review current consent and schedule the campaign in Wazap.",
        },
      },
      "/analytics/summary": {
        get: {
          ...operation("Get aggregate workspace analytics", "getAnalyticsSummary", "analytics:read"),
          tags: ["Analytics"],
          parameters: [{ name: "days", in: "query", schema: { type: "integer", enum: [7, 30, 90], default: 30 } }],
          description: "Returns aggregate metrics, bounded daily trends, and categorical breakdowns. No contact, message, or recipient-level records are included.",
        },
      },
      "/operations/health": {
        get: {
          ...operation("Get workspace operational health", "getOperationalHealth", "operations:read"),
          tags: ["Operations"],
          description: "Returns a live 24-hour health calculation and up to 24 recent operational snapshots for the authenticated workspace.",
        },
      },
      "/operations/incidents": {
        get: {
          ...operation("List workspace operational incidents and retained updates", "listOperationalIncidents", "operations:read", "Collection"),
          tags: ["Operations"],
          description: "Returns workspace-scoped incident ownership, severity, response targets, escalation, customer-safe/internal updates, and resolution evidence. It does not expose owner email addresses.",
        },
      },
      "/reliability": {
        get: {
          ...operation("Get 30-day API and webhook reliability evidence", "getDeveloperReliability", "operations:read"),
          tags: ["Operations"],
          description: "Returns observed API latency, availability, webhook terminal-success, time-to-delivery, and attempt evidence. Objective results remain null until the published minimum evidence threshold is met.",
        },
      },
      "/partners/summary": {
        get: {
          ...operation("Get partner attribution summary", "getPartnerSummary", "partners:read"),
          tags: ["Partners"],
          description: "Returns the workspace partner profile, accepted terms version, 30-day first-touch policy, anonymous attribution statuses, and verified influenced-value totals. It does not enable or promise compensation or payouts.",
        },
      },
      "/audit/events": {
        get: {
          ...operation("List workspace audit evidence", "listAuditEvents", "audit:read", "Collection"),
          tags: ["Audit"],
          parameters: [
            ...pagination,
            { name: "eventType", in: "query", schema: { type: "string", pattern: "^[a-z0-9_.-]{1,80}$" } },
          ],
          description: "Returns workspace-scoped administrative and security events. Actor and target email addresses, invitation recipients, webhook destinations, secrets, and unapproved metadata fields are excluded.",
        },
      },
      "/marketplace/listings": {
        get: {
          ...publicOperation("Search published marketplace listings", "listMarketplaceListings", "CatalogCollection"),
          tags: ["Marketplace"],
          parameters: [
            { name: "q", in: "query", schema: { type: "string", maxLength: 80 } },
            { name: "category", in: "query", schema: { type: "string", maxLength: 40 } },
            { name: "packageType", in: "query", schema: { type: "string", enum: ["agent", "external_tool"] } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 25 } },
            { name: "after", in: "query", schema: { type: "string" } },
          ],
          description: "Public catalog endpoint. Only reviewed published listings with a published free version are returned. Drafts, moderation records, review notes, workspace identities, and install configuration are excluded.",
        },
      },
      "/marketplace/listings/{slug}": {
        get: {
          ...publicOperation("Get a published marketplace listing", "getMarketplaceListing", "CatalogResource"),
          tags: ["Marketplace"],
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Wazap API key" },
      },
      schemas: {
        Resource: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: ["object", "array"] },
            meta: { type: "object", required: ["requestId"], properties: { requestId: { type: "string" }, replayed: { type: "boolean" } } },
          },
        },
        Collection: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: "array", items: { type: "object" } },
            meta: { type: "object", required: ["requestId", "hasMore"], properties: { requestId: { type: "string" }, hasMore: { type: "boolean" }, nextCursor: { type: ["string", "null"] } } },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } },
            meta: { type: "object", properties: { requestId: { type: "string" } } },
          },
        },
        CatalogResource: {
          type: "object",
          required: ["data"],
          properties: { data: { type: "object" } },
        },
        CatalogCollection: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: "array", items: { type: "object" } },
            meta: { type: "object", required: ["hasMore"], properties: { hasMore: { type: "boolean" }, nextCursor: { type: ["string", "null"] } } },
          },
        },
      },
    },
    "x-wazap-api-scopes": API_SCOPES,
    "x-wazap-webhook-events": WEBHOOK_EVENTS,
  };
  return NextResponse.json(document, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
