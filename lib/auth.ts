import { mfaState, verifyMfa } from "./mfa";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { trustedGoogleIdentity } from "./google-identity";
import { prisma } from "./prisma";
import { sharedRateLimit } from "./shared-rate-limit";
import { isPlanExpired } from "./billing";
import { downgradeIfExpired } from "./billing-expiry";
import { effectivePlan, newProductTrial } from "./entitlements";
import { createHash } from "node:crypto";
import { requestIp } from "./request-ip";
import { checkEmailCodeDetailed, consumeEmailCode, ipBlockedForCodes, normalizeEmail, recordWrongCode } from "./email-code";
import { cleanAttribution, createVerifiedAccount } from "./account-create";
import { readPartnerTouchCookie } from "./partner-attribution";
import { CONSENT_WORDING } from "./marketing-consent";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  jwt: { maxAge: 7 * 24 * 60 * 60 },
  useSecureCookies: process.env.NODE_ENV === "production",
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
      async profile(profile) {
        const identity = trustedGoogleIdentity(profile);
        if (!identity) throw new Error("Unverified Google identity");
        const user = await prisma.$transaction(async tx => {
          const linked = await tx.user.findUnique({ where: { googleSubject: identity.subject } });
          if (linked) return linked;
          if (!identity.authoritative) throw new Error("Email ownership requires additional verification");
          const existing = await tx.user.findUnique({ where: { email: identity.email } });
          if (existing) {
            if (existing.googleSubject) throw new Error("Account already linked to another Google identity");
            // An unverified legacy account may have been pre-registered by someone
            // else: Google proves ownership, so drop any password and old sessions.
            return tx.user.update({ where: { id: existing.id }, data: existing.emailVerifiedAt
              ? { googleSubject: identity.subject }
              : { googleSubject: identity.subject, emailVerifiedAt: new Date(), password: null, sessionVersion: { increment: 1 } } });
          }
          const created = await tx.user.create({ data: { email: identity.email, name: String(profile.name || "").slice(0, 100) || null, googleSubject: identity.subject, emailVerifiedAt: new Date(), ...newProductTrial() } });
          const workspace = await tx.workspace.create({ data: { name: `${created.name || identity.email.split("@")[0]}'s workspace`, slug: `workspace-${created.id.slice(-12).toLowerCase()}`, ownerId: created.id } });
          await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: created.id, role: "owner" } });
          return tx.user.update({ where: { id: created.id }, data: { activeWorkspaceId: workspace.id } });
        }, { isolationLevel: "Serializable" });
        if ((await mfaState(user.id))?.enabled) throw new Error("Use password and authenticator sign-in for this protected account");
        return { id: user.id, email: user.email, name: user.name, plan: effectivePlan(user), isAdmin: user.isAdmin, sessionVersion: user.sessionVersion };
      },
    })] : []),
    CredentialsProvider({
      id: "email-code",
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Email code", type: "text" },
        otp: { label: "Authenticator or recovery code", type: "text" },
        name: { label: "Name", type: "text" },
        attribution: { label: "Attribution", type: "text" },
        marketing: { label: "Marketing opt-in", type: "text" },
      },
      async authorize(credentials, req) {
        const email = normalizeEmail(credentials?.email);
        if (!email || !credentials?.code) return null;
        const requestHeaders = new Headers((req as any)?.headers || {});
        const ip = requestIp(requestHeaders);
        const accountKey = createHash("sha256").update(email).digest("hex");
        if (!await sharedRateLimit(`login-ip:${ip}`, 20, 15 * 60_000)) return null;
        if (!await sharedRateLimit(`login-account:${accountKey}`, 8, 15 * 60_000)) return null;
        if (await ipBlockedForCodes(ip)) throw new Error("IP_BLOCKED");
        const check = await checkEmailCodeDetailed(email, "login", credentials.code);
        if (!check.ok && check.reason !== "expired") await recordWrongCode(ip);
        // Surface the reason so the form can show how many tries are left.
        if (!check.ok) throw new Error(check.reason === "wrong" ? `CODE_WRONG:${check.remaining}` : check.reason === "locked" ? "CODE_LOCKED" : "CODE_EXPIRED");
        const codeId = check.id;
        let user = await prisma.user.findUnique({ where: { email } });
        let mfaVerified = false;
        if (user) {
          const factor = await mfaState(user.id);
          if (factor?.enabled) {
            // The email code stays valid so the user can add the authenticator code.
            const otp = String(credentials.otp || "").slice(0, 64);
            if (!otp) throw new Error("MFA_REQUIRED");
            mfaVerified = await verifyMfa(user.id, otp);
            if (!mfaVerified) throw new Error("MFA_INVALID");
          }
        }
        if (!await consumeEmailCode(codeId)) return null;
        if (!user) {
          user = await createVerifiedAccount({
            email,
            name: String(credentials.name || "").trim().slice(0, 100) || null,
            attribution: cleanAttribution(credentials.attribution),
            partnerTouchToken: readPartnerTouchCookie(new Request("https://wazap.lt", { headers: requestHeaders })),
            marketingConsent: credentials.marketing === "true"
              ? { wording: CONSENT_WORDING.signup_checkbox, ip, userAgent: requestHeaders.get("user-agent") }
              : undefined,
          });
        } else if (!user.emailVerifiedAt) {
          // First proof of ownership for a legacy account: remove any password
          // (possibly set by someone else) and sign out older sessions.
          user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), password: null, sessionVersion: { increment: 1 } } });
        }
        if (isPlanExpired(user.plan, user.planExpiresAt)) {
          await downgradeIfExpired(user);
          return { id: user.id, email: user.email, name: user.name ?? "", plan: effectivePlan({ ...user, plan: "free" }), isAdmin: user.isAdmin, sessionVersion: user.sessionVersion, mfaVerified };
        }
        return { id: user.id, email: user.email, name: user.name ?? "", plan: effectivePlan(user), isAdmin: user.isAdmin, sessionVersion: user.sessionVersion, mfaVerified };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.plan = (user as any).plan;
        token.isAdmin = (user as any).isAdmin;
        token.sessionVersion = (user as any).sessionVersion;
        token.invalidated = false;
        token.mfaVerified = (user as any).mfaVerified === true;
        token.mfaVerifiedAt = token.mfaVerified ? Date.now() : undefined;
      }
      if (token.id) {
        const fresh = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (!fresh) {
          token.id = undefined;
          token.invalidated = true;
          return token;
        }
        if (token.sessionVersion === undefined) token.sessionVersion = fresh.sessionVersion;
        if (token.sessionVersion !== fresh.sessionVersion) {
          token.id = undefined;
          token.invalidated = true;
          return token;
        }
        if (isPlanExpired(fresh.plan, fresh.planExpiresAt)) {
          await downgradeIfExpired(fresh);
          token.plan = effectivePlan({ ...fresh, plan: "free" });
        } else {
          token.plan = effectivePlan(fresh);
        }
        const factor = fresh.isAdmin ? await mfaState(fresh.id) : null;
        token.isAdmin = fresh.isAdmin && (!factor?.enabled || (token.mfaVerified === true && Number.isFinite(Number(token.mfaVerifiedAt)) && Date.now() - Number(token.mfaVerifiedAt) < 12 * 60 * 60_000));
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.invalidated || !token.id) {
          (session as any).user = undefined;
          return session;
        }
        (session.user as any).id = token.id;
        (session.user as any).plan = token.plan;
        (session.user as any).isAdmin = token.isAdmin;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};
