import { readFile } from "node:fs/promises";
import { renderWelcomeEmail } from "../lib/email.ts";

const recipient = process.argv[2];
if (!recipient) throw new Error("Recipient email is required");

const env = await readFile(new URL("../.env", import.meta.url), "utf8");
const keyLine = env.split(/\r?\n/).find(line => line.startsWith("BREVO_API_KEY="));
const apiKey = keyLine?.slice("BREVO_API_KEY=".length).trim().replace(/^['\"]|['\"]$/g, "");
if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

const response = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    sender: { name: "Wazap", email: "hello@wazap.lt" },
    to: [{ email: recipient, name: "Joseph" }],
    subject: "Welcome to Wazap — your workspace is ready",
    htmlContent: renderWelcomeEmail("Joseph", "https://wazap.lt"),
  }),
});

const body = await response.json().catch(() => ({}));
console.log(JSON.stringify({
  accepted: response.ok,
  status: response.status,
  messageId: body.messageId || null,
  error: response.ok ? null : (body.message || "Brevo rejected the request"),
}));

if (!response.ok) process.exit(1);
