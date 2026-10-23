// FEAT-QUEUE: masks a member's stored email for display on the login
// screen ("r****@gmail.com") - the salesperson types their phone number,
// never their email, so this is shown only as a hint of where the code
// went. Never reveals the email's real length.
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "****";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return "****";
  return `${local[0]}****@${domain}`;
}
