CREATE TABLE IF NOT EXISTS "OperationalIncident" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ownerMemberId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "impact" TEXT NOT NULL DEFAULT '',
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'investigating',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "sourceKey" TEXT,
  "responseTargetAt" TIMESTAMP(3) NOT NULL,
  "nextUpdateAt" TIMESTAMP(3) NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  "lastObservedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationalIncident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OperationalIncident_ownerMemberId_fkey" FOREIGN KEY ("ownerMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentUpdate" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "actorMemberId" TEXT,
  "status" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'internal',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentUpdate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "OperationalIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentUpdate_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OperationalIncident_workspaceId_status_severity_createdAt_idx" ON "OperationalIncident"("workspaceId", "status", "severity", "createdAt");
CREATE INDEX IF NOT EXISTS "OperationalIncident_workspaceId_sourceKey_status_idx" ON "OperationalIncident"("workspaceId", "sourceKey", "status");
CREATE INDEX IF NOT EXISTS "OperationalIncident_ownerMemberId_status_idx" ON "OperationalIncident"("ownerMemberId", "status");
CREATE INDEX IF NOT EXISTS "OperationalIncident_status_responseTargetAt_idx" ON "OperationalIncident"("status", "responseTargetAt");
CREATE INDEX IF NOT EXISTS "IncidentUpdate_incidentId_createdAt_idx" ON "IncidentUpdate"("incidentId", "createdAt");
CREATE INDEX IF NOT EXISTS "IncidentUpdate_audience_createdAt_idx" ON "IncidentUpdate"("audience", "createdAt");
