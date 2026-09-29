import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAuditDiff } from './audit-sanitize.js';

export type AuditWriteInput = {
  actorId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  requestId: string | null;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditWriteInput): Promise<void> {
    const diff = buildAuditDiff(input.before, input.after);
    await this.prisma.client.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        before:
          diff.before === undefined
            ? undefined
            : (diff.before as Prisma.InputJsonValue),
        after:
          diff.after === undefined
            ? undefined
            : (diff.after as Prisma.InputJsonValue),
        requestId: input.requestId,
      },
    });
  }
}
