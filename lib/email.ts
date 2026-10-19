import { localizeEmail } from './email-localization';
import { brandEmail, emailIdentity, emailReplyTo, type EmailChannel } from "./email-brand";
// Lightweight provider failover via HTTP APIs — no SMTP connection is held by
// the application. Resend is preferred and Brevo is used when configured.
export function isEmailConfigured(): boolean {
  return process.env.EMAIL_AUTOMATION_READY === "true" && !!(process.env.RESEND_API_KEY || process.env.BREVO_API_KEY);
}

export type EmailSendResult = {
  accepted: boolean;
  provider: "resend" | "brevo" | "not_configured";
  messageId?: string;
  error?: string;
  uncertain?: boolean;
};

export async function sendEmail(opts: { to: string; subject: string; html: string; channel?: EmailChannel; headers?: Record<string, string> }): Promise<EmailSendResult> {
  const identity = emailIdentity(opts.channel || "support");
  const from = identity.from;
  const replyTo = emailReplyTo(opts.channel || "support");
  let html = brandEmail(opts.html, opts.channel || "support");
  try { const localized=await localizeEmail(opts.to,opts.subject,html);opts={...opts,subject:localized.subject};html=localized.html; } catch(error) {return {accepted:false,provider:"not_configured",error:error instanceof Error?error.message:"Email translation unavailable"};}
  if (process.env.EMAIL_AUTOMATION_READY !== "true") return { accepted: false, provider: "not_configured", error: "Email activation pending: verify mailboxes, provider and delivery before enabling automation." };
  const resendKey = process.env.RESEND_API_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  if (!resendKey && !brevoKey) return { accepted: false, provider: "not_configured", error: "Email provider is not configured" };
  try {
    const provider = resendKey ? "resend" as const : "brevo" as const;
    const res = resendKey
      ? await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html, reply_to: replyTo.email, headers: opts.headers }),
          signal: AbortSignal.timeout(10000),
        })
      : await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevoKey!, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ sender: { name: identity.name, email: identity.email }, to: [{ email: opts.to }], subject: opts.subject, htmlContent: html, replyTo, headers: opts.headers }),
          signal: AbortSignal.timeout(10000),
        });
    const payload = await res.json().catch(() => ({})) as { id?: string; messageId?: string; message?: string; code?: string };
    const messageId = payload.id || payload.messageId;
    if (!res.ok) {
      return { accepted: false, provider, uncertain: res.status >= 500, error: payload.message || payload.code || `Provider returned HTTP ${res.status}` };
    }
    return { accepted: true, provider, messageId };
  } catch (error) {
    return { accepted: false, provider: resendKey ? "resend" : "brevo", uncertain: true, error: error instanceof Error ? error.message : "Provider request failed" };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function renderWelcomeEmail(name: string | null, base: string): string {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323;box-shadow:0 18px 50px rgba(0,0,0,.24)">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323">
      <span style="display:inline-block;width:12px;height:12px;border:2px solid #25D366;border-radius:50%;vertical-align:-1px;margin-right:9px"></span><span style="color:#25D366;font-weight:800;font-size:20px;letter-spacing:-.4px">Wazap</span>
    </div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${hi}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:28px;line-height:1.2;letter-spacing:-.7px">Turn more WhatsApp clicks into conversations.</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">Your account is ready, with a 3-day free trial—everything in Solo ($9 plan), no card required, 100 routed leads while it lasts. Create your first professional WhatsApp workflow in a few minutes.</p>
      <div style="background:#0f1b13;border:1px solid #1d3323;border-radius:14px;padding:17px 18px;margin:0 0 22px">
        <div style="color:#fff;font-weight:700;margin-bottom:7px">A good first workflow</div>
        <div style="color:#9fb0a3">Create a tracked link or QR code, add your message, then follow every click from your dashboard. Teams can also route leads automatically with a Lead rotator.</div>
      </div>
      <p style="margin:22px 0">
        <a href="${base}/dashboard" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px;margin:0 8px 8px 0">Create my first workflow →</a>
        <a href="${base}/pricing" style="display:inline-block;border:1px solid #31513a;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;margin-bottom:8px">See plans</a>
      </p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">Need help choosing a plan? Reply to this email or open Wazap support and tell us how many people handle your WhatsApp leads.</p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Professional WhatsApp workflow software</div>
  </div>`;
}

export function renderTrialReminderEmail(name: string | null, days: number, base: string): string {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${hi}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">Your free trial has ${days} day${days !== 1 ? "s" : ""} left.</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">Keep your tracked links, QR codes, and Lead rotators active by choosing a plan before the trial ends.</p>
      <p style="margin:22px 0"><a href="${base}/pricing" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Choose my plan →</a></p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">No automatic charge will occur. If you do not choose a plan, your links and reports pause when the trial ends; your saved data remains in your workspace.</p>
    </div>
  </div>`;
}

// Sent once when the 3-day Free trial lapses with no paid plan chosen
// (FEAT-FREE-TRIAL). Wired from app/api/cron/trial-lifecycle's "expired"
// sweep - see trialEndedEmailSentAt on User, which also guards against
// re-sending if the cron runs again before the next pause sync.
export function renderTrialEndedEmail(name: string | null, base: string): string {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${hi}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">Your free trial has ended.</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">Your lead rotators, WhatsApp links, ad links and website button are now paused, and no new leads are being routed. Nothing was deleted — choose a plan to turn everything back on instantly.</p>
      <p style="margin:22px 0"><a href="${base}/billing#plans" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Choose a plan →</a></p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">Your saved data stays in your workspace. You can still sign in, see your Account, and use the free QR maker any time.</p>
    </div>
  </div>`;
}

export function renderTrialConversionEmail(name: string | null, days: number, base: string): string {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const timeLeft = days > 0
    ? `${days} day${days !== 1 ? "s" : ""} left in your free trial`
    : "your free trial ending today";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${hi}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">Keep your Wazap workflows working after your trial.</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">With ${timeLeft}, now is the best time to choose the plan that fits how you handle WhatsApp leads.</p>
      <div style="background:#0f1b13;border:1px solid #1d3323;border-radius:14px;padding:17px 18px;margin:0 0 22px;color:#9fb0a3">
        <div style="color:#fff;font-weight:700;margin-bottom:8px">Plans start at $9/month</div>
        Keep your tracked links, QR codes, Lead rotators, results reporting and higher usage limits. Pay securely by card or PayPal.
      </div>
      <p style="margin:22px 0"><a href="${base}/pricing?utm_source=trial_email&amp;utm_medium=email&amp;utm_campaign=trial_conversion_20260813" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Choose my Wazap plan →</a></p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">No automatic charge will occur. Need help choosing? Reply to this email and tell us how many people handle your WhatsApp leads.</p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Business conversation software</div>
  </div>`;
}

export function renderPasswordResetEmail(opts: { name: string | null; resetUrl: string }): string {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  const resetUrl = escapeHtml(opts.resetUrl);
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${greeting}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">Reset your Wazap password</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">Use the secure link below within 30 minutes. It can only be used once.</p>
      <p style="margin:22px 0"><a href="${resetUrl}" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Choose a new password →</a></p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">If you did not request this, ignore the email. Your password remains unchanged. Completing a reset signs out existing Wazap sessions.</p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Secure business conversation workspace</div>
  </div>`;
}

export function renderEmailCodeEmail(opts: { code: string; purpose: "login" | "confirm"; minutes: number }): string {
  const code = escapeHtml(opts.code);
  const title = opts.purpose === "login" ? "Your Wazap sign-in code" : "Confirm this account action";
  const intro = opts.purpose === "login"
    ? "Enter this code on the Wazap sign-in page to continue."
    : "Enter this code in Wazap to confirm the change you requested.";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">${title}</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">${intro}</p>
      <p style="margin:22px 0;font-size:36px;font-weight:800;letter-spacing:10px;color:#25D366;font-family:Menlo,Consolas,monospace">${code}</p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">The code expires in ${opts.minutes} minutes and works once. If you did not request it, ignore this email. Nobody can sign in without it. Wazap will never ask you for this code by phone or chat.</p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Secure business conversation workspace</div>
  </div>`;
}

export function renderAccountClosureEmail(opts: { name: string | null; scheduledFor: Date; accountUrl: string }): string {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  const date = escapeHtml(opts.scheduledFor.toLocaleDateString("en-GB", { dateStyle: "long" }));
  const accountUrl = escapeHtml(opts.accountUrl);
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${greeting}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">Account closure scheduled</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">Your Wazap account is scheduled for permanent deletion on <strong style="color:#fff">${date}</strong>. You can cancel this request from Account settings any time before then.</p>
      <p style="margin:22px 0"><a href="${accountUrl}" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Review or restore my account →</a></p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">If you did not request this, restore the account immediately and change your password. Active subscriptions prevent closure.</p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Secure business conversation workspace</div>
  </div>`;
}

export function renderAccountRestoredEmail(opts: { name: string | null; accountUrl: string }): string {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  const accountUrl = escapeHtml(opts.accountUrl);
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${greeting}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">Account closure cancelled</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">Your Wazap account stays active, including your lead rotators, tracked links, leads and results. No data was deleted.</p>
      <p style="margin:22px 0"><a href="${accountUrl}" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Open Account settings →</a></p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Secure business conversation workspace</div>
  </div>`;
}

export function renderOperationalIncidentEmail(opts: { name: string | null; workspaceName: string; title: string; severity: string; incidentUrl: string; escalated?: boolean }): string {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  const heading = opts.escalated ? "Incident acknowledgement is overdue" : "A workspace incident needs an owner";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap Operations</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${greeting}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">${heading}</h1>
      <p style="margin:0 0 10px;color:#9fb0a3"><strong style="color:#fff">${escapeHtml(opts.workspaceName)}</strong> · ${escapeHtml(opts.severity.toUpperCase())}</p>
      <p style="margin:0 0 20px;color:#dbe7de">${escapeHtml(opts.title)}</p>
      <p style="margin:22px 0"><a href="${escapeHtml(opts.incidentUrl)}" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Open incident workspace →</a></p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">Do not reply with credentials or customer conversation content. Record evidence and customer-safe updates inside Wazap.</p>
    </div>
  </div>`;
}


export function renderSupportReplyEmail(opts: {
  name: string | null;
  subject: string;
  reply: string;
  base: string;
}): string {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  const reply = escapeHtml(opts.reply).replace(/\n/g, "<br>");
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323">
      <span style="display:inline-block;width:12px;height:12px;border:2px solid #25D366;border-radius:50%;vertical-align:-1px;margin-right:9px"></span><span style="color:#25D366;font-weight:800;font-size:20px">Wazap Support</span>
    </div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${greeting}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:25px;line-height:1.25">We replied to your ${escapeHtml(opts.subject)} inquiry.</h1>
      <div style="background:#0f1b13;border:1px solid #1d3323;border-radius:14px;padding:17px 18px;margin:20px 0;color:#dbe7de">${reply}</div>
      <p style="margin:22px 0">
        <a href="${opts.base}/dashboard" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Open my Wazap dashboard →</a>
      </p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">You can also reply directly to this email if you still need help.</p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Professional WhatsApp workflow software</div>
  </div>`;
}

export function renderSupportChatContinueEmail(opts: {
  name: string | null;
  reply: string;
  continueUrl: string;
}): string {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  const reply = escapeHtml(opts.reply).replace(/\n/g, "<br>");
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323">
      <span style="display:inline-block;width:12px;height:12px;border:2px solid #25D366;border-radius:50%;vertical-align:-1px;margin-right:9px"></span><span style="color:#25D366;font-weight:800;font-size:20px">Wazap Support</span>
    </div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${greeting}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:25px;line-height:1.25">Our team replied to your chat.</h1>
      <div style="background:#0f1b13;border:1px solid #1d3323;border-radius:14px;padding:17px 18px;margin:20px 0;color:#dbe7de">${reply}</div>
      <p style="margin:22px 0">
        <a href="${escapeHtml(opts.continueUrl)}" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Continue the chat →</a>
      </p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">This link opens your saved conversation and works for 14 days. You can also reply directly to this email.</p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Professional WhatsApp workflow software</div>
  </div>`;
}

export function renderExpiryEmail(name: string | null, planLabel: string, days: number, base: string): string {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const when = days <= 0 ? "today" : `in ${days} day${days !== 1 ? "s" : ""}`;
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;background:#0e140e;border-radius:16px;overflow:hidden;border:1px solid #1e2a1e">
    <div style="background:#111811;padding:20px 24px;border-bottom:1px solid #1e2a1e">
      <span style="color:#25D366;font-weight:700;font-size:18px">Wazap</span>
    </div>
    <div style="padding:24px;color:#cbd5e1;font-size:14px;line-height:1.6">
      <p style="margin:0 0 12px">${hi}</p>
      <p style="margin:0 0 12px">Your <b style="color:#fff">${escapeHtml(planLabel)}</b> plan expires <b style="color:#fbbf24">${when}</b>. Renew now to keep uninterrupted access to every Wazap tool — website button, lead rotator, QR and more.</p>
      <p style="margin:20px 0">
        <a href="${base}/pricing" style="display:inline-block;background:#25D366;color:#000;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;font-size:14px">Renew my plan →</a>
      </p>
      <p style="margin:16px 0 0;color:#64748b;font-size:12px">You can manage your plan and tools from your Wazap dashboard.</p>
    </div>
    <div style="padding:14px 24px;background:#0a0f0a;color:#475569;font-size:11px;text-align:center">
      Wazap.lt · You’re receiving this because you have a paid Wazap plan.
    </div>
  </div>`;
}

export function renderPaidReceiptEmail(opts: {
  name?: string | null;
  plan: string;
  amount: number;
  txId?: string | null;
  paidAt?: Date;
  base: string;
}): string {
  const hi = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  const planLabel = ({ basic: "Solo", pro: "Growth", ultimate: "Agency", business: "Business" } as Record<string, string>)[opts.plan] || opts.plan.charAt(0).toUpperCase() + opts.plan.slice(1);
  const date = (opts.paidAt || new Date()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const txLine = opts.txId
    ? `<tr><td style="padding:8px 0;color:#64748b">Transaction ID</td><td style="padding:8px 0;text-align:right;color:#e2e8f0">${escapeHtml(opts.txId)}</td></tr>`
    : "";

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#0e140e;border-radius:16px;overflow:hidden;border:1px solid #1e2a1e">
    <div style="background:#111811;padding:20px 24px;border-bottom:1px solid #1e2a1e">
      <span style="color:#25D366;font-weight:700;font-size:18px">Wazap</span>
    </div>
    <div style="padding:24px;color:#cbd5e1;font-size:14px;line-height:1.6">
      <p style="margin:0 0 12px">${hi}</p>
      <p style="margin:0 0 16px">Thank you for your payment. Your <b style="color:#fff">${escapeHtml(planLabel)}</b> plan is active and your account access has been updated.</p>
      <table style="width:100%;border-collapse:collapse;background:#0a0f0a;border:1px solid #1e2a1e;border-radius:12px;overflow:hidden;margin:18px 0">
        <tr><td style="padding:8px 0;color:#64748b">Plan</td><td style="padding:8px 0;text-align:right;color:#e2e8f0">${planLabel}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Amount paid</td><td style="padding:8px 0;text-align:right;color:#e2e8f0">USD ${opts.amount.toFixed(2)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Payment date</td><td style="padding:8px 0;text-align:right;color:#e2e8f0">${date}</td></tr>
        ${txLine}
      </table>
      <p style="margin:20px 0">
        <a href="${opts.base}/dashboard" style="display:inline-block;background:#25D366;color:#000;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;font-size:14px">Open Wazap dashboard</a>
      </p>
      <p style="margin:16px 0 0;color:#64748b;font-size:12px">No further payment is due for this billing period.</p>
    </div>
    <div style="padding:14px 24px;background:#0a0f0a;color:#475569;font-size:11px;text-align:center">
      Wazap.lt · Digital tools and services
    </div>
  </div>`;
}
