import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountClosureBlockers, ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/account-lifecycle";
import { rateLimit } from "@/lib/rate-limit";
import { renderAccountClosureEmail, renderAccountRestoredEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      accountDeletionRequestedAt: true,
      accountDeletionScheduledFor: true,
    },
  });
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blockers = await accountClosureBlockers(user.id);
  return NextResponse.json({
    requestedAt: user.accountDeletionRequestedAt,
    scheduledFor: user.accountDeletionScheduledFor,
    blockers,
    graceDays: ACCOUNT_DELETION_GRACE_DAYS,
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`account-lifecycle:${user.id}`, 6, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many account changes. Please wait." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string; password?: string; confirmation?: string };
  const action = String(body.action || "");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";

  if (action === "cancel_deletion") {
    if (!user.accountDeletionScheduledFor) return NextResponse.json({ restored: true, notice: "No closure request is active." });
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { accountDeletionRequestedAt: null, accountDeletionScheduledFor: null },
      }),
      prisma.outboundEmail.create({
        data: {
          userId: user.id,
          recipient: user.email,
          type: "account_closure_cancelled",
          subject: "Your Wazap account closure was cancelled",
          html: renderAccountRestoredEmail({ name: user.name, accountUrl: `${base}/account` }),
        },
      }),
    ]);
    return NextResponse.json({ restored: true, notice: "Account closure cancelled. No data was deleted." });
  }

  if (action !== "request_deletion") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  if (body.confirmation !== "DELETE MY WAZAP ACCOUNT") {
    return NextResponse.json({ error: "Type the complete confirmation phrase." }, { status: 400 });
  }
  if (!user.password || !body.password || !(await bcrypt.compare(body.password, user.password))) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 403 });
  }
  const blockers = await accountClosureBlockers(user.id);
  if (blockers.billing || blockers.sharedOwnedWorkspaces.length) {
    return NextResponse.json({
      error: blockers.billing
        ? "Cancel the active subscription before closing this account."
        : "Transfer or remove the other members from workspaces you own before closing this account.",
      blockers,
    }, { status: 409 });
  }
  const now = new Date();
  const scheduledFor = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { accountDeletionRequestedAt: now, accountDeletionScheduledFor: scheduledFor },
    }),
    prisma.outboundEmail.create({
      data: {
        userId: user.id,
        recipient: user.email,
        type: "account_closure_scheduled",
        subject: "Your Wazap account closure is scheduled",
        html: renderAccountClosureEmail({ name: user.name, scheduledFor, accountUrl: `${base}/account` }),
      },
    }),
  ]);
  return NextResponse.json({
    scheduled: true,
    scheduledFor,
    notice: `Account closure scheduled. You can restore the account during the ${ACCOUNT_DELETION_GRACE_DAYS}-day grace period.`,
  });
}
