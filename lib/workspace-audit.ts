import { prisma } from "@/lib/prisma";

const SAFE_METADATA_FIELDS = new Set([
  "previousRole",
  "newRole",
  "actorNewRole",
  "role",
  "supersededInvitations",
  "keyId",
  "name",
  "prefix",
  "scopes",
  "expiresAt",
  "endpointId",
  "events",
  "effectivePlan",
  "changedAt",
]);

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => SAFE_METADATA_FIELDS.has(key))
      .map(([key, item]) => [key, item]),
  );
}

export async function workspaceAuditEvidence(input: {
  workspaceId: string;
  eventType?: string;
  limit?: number;
  after?: string | null;
}) {
  const limit = Math.max(1, Math.min(input.limit || 50, 100));
  const events = await prisma.workspaceAuditEvent.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(input.eventType ? { eventType: input.eventType } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.after ? { cursor: { id: input.after }, skip: 1 } : {}),
  });
  const page = events.slice(0, limit);
  const userIds = [...new Set(page.flatMap((event) => [event.actorUserId, event.targetUserId]).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  return {
    data: page.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actor: event.actorUserId
        ? byId.get(event.actorUserId) ?? { id: event.actorUserId, name: "Former member" }
        : null,
      target: event.targetUserId
        ? byId.get(event.targetUserId) ?? { id: event.targetUserId, name: "Former member" }
        : null,
      metadata: safeMetadata(event.metadata),
      createdAt: event.createdAt,
    })),
    hasMore: events.length > limit,
    nextCursor: events.length > limit ? page.at(-1)?.id ?? null : null,
  };
}
