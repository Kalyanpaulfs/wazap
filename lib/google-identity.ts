export function trustedGoogleIdentity(profile: { sub?: string; email?: string; email_verified?: boolean; hd?: string }) {
  const email = profile.email?.trim().toLowerCase();
  if (!profile.sub || !email || profile.email_verified !== true) return null;
  // Google is authoritative for Gmail and verified Workspace addresses only.
  const authoritative = email.endsWith("@gmail.com") || (!!profile.hd && email.split("@")[1] === profile.hd.toLowerCase());
  return { subject: profile.sub, email, authoritative };
}
