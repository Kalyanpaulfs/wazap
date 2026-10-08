import { mfaState, verifyMfa } from "./mfa";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { trustedGoogleIdentity } from "./google-identity";
import { prisma } from "./prisma";
import { sharedRateLimit } from "./shared-rate-limit";
import { isPlanExpired } from "./billing";
import bcrypt from "bcryptjs";
import { effectivePlan, newProductTrial } from "./entitlements";
import { createHash } from "node:crypto";
import { requestIp } from "./request-ip";

const DUMMY_PASSWORD_HASH = "$2b$10$0DE6z2y1FufGUqELY2ClweF7ggBV.RdMWnyu8QaBQZeSTcKxoHpsq";

export const TRIAL_DAYS = 30;

export const PLAN_LIMITS = {
  free:     { opens: 5,   qr: 2 },   // qr only during trial
  basic:    { opens: 50,  qr: 10 },
  pro:      { opens: 200, qr: 50 },
  ultimate: { opens: Infinity, qr: Infinity },
  business: { opens: Infinity, qr: Infinity },
};

export function getQrLimit(plan: string, createdAt: Date): number {
  if (plan === "ultimate" || plan === "business") return Infinity;
  if (plan !== "free") return PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.qr ?? 0;
  const trialEnd = new Date(createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  return new Date() < trialEnd ? PLAN_LIMITS.free.qr : 0;
}

export function isTrialActive(createdAt: Date): boolean {
  const trialEnd = new Date(createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  return new Date() < trialEnd;
}

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
            return tx.user.update({ where: { id: existing.id }, data: { googleSubject: identity.subject } });
          }
          const created = await tx.user.create({ data: { email: identity.email, name: String(profile.name || "").slice(0, 100) || null, googleSubject: identity.subject, ...newProductTrial() } });
          const workspace = await tx.workspace.create({ data: { name: `${created.name || identity.email.split("@")[0]}'s workspace`, slug: `workspace-${created.id.slice(-12).toLowerCase()}`, ownerId: created.id } });
          await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: created.id, role: "owner" } });
          return tx.user.update({ where: { id: created.id }, data: { activeWorkspaceId: workspace.id } });
        }, { isolationLevel: "Serializable" });
        if ((await mfaState(user.id))?.enabled) throw new Error("Use password and authenticator sign-in for this protected account");
        return { id: user.id, email: user.email, name: user.name, plan: effectivePlan(user), isAdmin: user.isAdmin, sessionVersion: user.sessionVersion };
      },
    })] : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "Authenticator or recovery code", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password || credentials.password.length > 128) return null;
        const email = credentials.email.trim().toLowerCase().slice(0, 320);
        const requestHeaders = new Headers((req as any)?.headers || {});
        const ip = requestIp(requestHeaders);
        const accountKey = createHash("sha256").update(email).digest("hex");
        if (!await sharedRateLimit(`login-ip:${ip}`, 20, 15 * 60_000)) return null;
        if (!await sharedRateLimit(`login-account:${accountKey}`, 8, 15 * 60_000)) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        const valid = await bcrypt.compare(credentials.password, user?.password || DUMMY_PASSWORD_HASH);
        if (!user || !user.password || !valid) return null;
        const factor = await mfaState(user.id);
        const mfaVerified = factor?.enabled ? await verifyMfa(user.id, String(credentials.otp || "").slice(0, 64)) : false;
        if (factor?.enabled && !mfaVerified) return null;
        if (isPlanExpired(user.plan, user.planExpiresAt)) {
          await prisma.user.update({ where: { id: user.id }, data: { plan: "free", planExpiresAt: null } });
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
          await prisma.user.update({ where: { id: fresh.id }, data: { plan: "free", planExpiresAt: null } });
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
