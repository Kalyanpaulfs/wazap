import { emailArtwork } from './email-artwork';
export type EmailChannel = "hello" | "billing" | "support" | "marketing" | "joseph";
const names: Record<EmailChannel, string> = { hello: "Wazap", billing: "Wazap Billing", support: "Wazap Support", marketing: "Wazap", joseph: "Joseph Toubia | Wazap" };
const roles: Record<EmailChannel, string> = { hello: "Welcome & onboarding", billing: "Billing & subscriptions", support: "Customer support", marketing: "Product updates", joseph: "Founder" };
export function emailChannel(type = ""): EmailChannel {
  if (type.startsWith("marketing_") || type.startsWith("crm_")) return "marketing";
  if (/^(billing_|payment_|subscription_|trial_ending|expiry_)/.test(type)) return "billing";
  if (/^(welcome|workspace_invite|workspace_ownership)/.test(type)) return "hello";
  return "support";
}
export function emailIdentity(channel: EmailChannel) {
  const email = `${channel}@wazap.lt`;
  return { name: names[channel], email, from: `${names[channel]} <${email}>` };
}
export function emailReplyTo(channel: EmailChannel) {
  return channel === "marketing" ? { name: "Joseph Toubia | Wazap", email: "joseph@wazap.lt" } : { name: names[channel], email: `${channel}@wazap.lt` };
}
export function emailSignature(channel: EmailChannel): string {
  const { name, email } = emailIdentity(channel);
  if (channel === "marketing") return `<table role="presentation" data-wazap-signature="marketing" width="100%" style="background:#ffffff;font-family:Arial,Helvetica,sans-serif"><tr><td style="padding:22px 32px 30px;border-top:1px solid #e2e8df"><div style="font-size:15px;font-weight:bold;color:#14281d">The Wazap team</div><div style="margin:7px 0 13px;font-size:12px;color:#6b746c">Business conversations, organised.</div><a href="mailto:marketing@wazap.lt" style="color:#167a43;font-size:13px;text-decoration:none">marketing@wazap.lt</a><span style="color:#adb7ae"> &nbsp;|&nbsp; </span><a href="https://wazap.lt" style="color:#167a43;font-size:13px;text-decoration:none">wazap.lt</a></td></tr></table>`;
  return `<table role="presentation" data-wazap-signature="${channel}" style="width:100%;max-width:600px;margin:0 auto;background:#0b120d;border-top:1px solid #24442d;font-family:Arial,Helvetica,sans-serif"><tr><td style="padding:24px 28px;color:#dbe7de"><div style="font-size:18px;font-weight:bold;color:#25d366">${name}</div><div style="margin:6px 0 12px;font-size:12px;color:#9fb0a3">${roles[channel]} · Business conversations, organised.</div><a href="mailto:${email}" style="color:#dbe7de;font-size:13px;text-decoration:none">${email}</a><span style="color:#718078"> &nbsp;|&nbsp; </span><a href="https://wazap.lt" style="color:#25d366;font-size:13px;text-decoration:none">wazap.lt</a></td></tr></table>`;
}
export function brandEmail(html: string, channel: EmailChannel): string {
  let result=html.replace(/Wazap · Office 502, Oxford Tower, Business Bay, Dubai, UAE/g, "Wazap");
  if(!result.includes('data-wazap-signature=')){
    const signature=emailSignature(channel);
    result=/<\/body>/i.test(result)?result.replace(/<\/body>/i,`${signature}</body>`):`${result}${signature}`;
  }
  if(!result.includes('data-wazap-artwork=')){
    const language=result.match(/<html[^>]*lang=["']([a-zA-Z-]+)["']/i)?.[1]||'en';
    const artwork=emailArtwork(channel,language);
    result=/<body[^>]*>/i.test(result)?result.replace(/<body[^>]*>/i,match=>`${match}${artwork}`):`${artwork}${result}`;
  }
  return result;
}
