import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createChannelCredential, publicChannel } from "@/lib/channels";
import {
  abandonApiMutation, authenticateApi, beginApiMutation, enqueueWebhookEvent,
  finishApiMutation, logApiRequest, replayApiMutation,
} from "@/lib/developer-platform";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "channels:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const mutation = await beginApiMutation(req, ctx, body);
  if (mutation.state === "error") {
    await logApiRequest(ctx, req, mutation.status, mutation.code);
    return error(mutation.status, mutation.code, mutation.message, ctx.requestId);
  }
  if (mutation.state === "replay") {
    await logApiRequest(ctx, req, mutation.statusCode, "idempotent_replay");
    return NextResponse.json(replayApiMutation(mutation, ctx.requestId), { status: mutation.statusCode });
  }
  const existing = await prisma.channelConnection.findFirst({ where: { id, workspaceId: ctx.workspaceId, status: { not: "disabled" } } });
  if (!existing) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Channel connection not found.", ctx.requestId);
  }
  if (existing.provider !== "custom_bridge") {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 409, "provider_managed_in_wazap");
    return error(409, "provider_managed_in_wazap", "Provider-managed credentials must be rotated by an owner or admin in Wazap.", ctx.requestId);
  }
  const credential = createChannelCredential();
  const connection = await prisma.channelConnection.update({
    where: { id },
    data: {
      signingSecretEncrypted: credential.encrypted,
      secretPrefix: credential.prefix,
      webhookPathToken: credential.pathToken,
      status: "pending_verification",
      lastVerifiedAt: null,
      lastError: null,
    },
  });
  const data = publicChannel(connection);
  await enqueueWebhookEvent(ctx.workspaceId, "channel.rotated", {
    connectionId: id, channel: connection.channel, provider: connection.provider, status: connection.status, source: "api",
  });
  const storedResponse = {
    data,
    meta: { requestId: ctx.requestId, replayed: false, secretAvailable: false },
    notice: "The signing secret was issued only in the original response. Rotate credentials again if it was not saved.",
  };
  await finishApiMutation(mutation.keyHash, 200, storedResponse);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({
    data,
    signingSecret: credential.secret,
    meta: { requestId: ctx.requestId, replayed: false, secretAvailable: true },
    notice: "Copy this signing secret now. Wazap will not store or display it in an API replay.",
  });
}
