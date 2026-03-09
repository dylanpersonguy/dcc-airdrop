import prisma from '../db/prisma';

interface AuditParams {
  actorType: string;
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function audit(params: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
