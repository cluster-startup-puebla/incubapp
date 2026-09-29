import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Notification, Prisma } from '../generated/prisma/client.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import { currentUserId } from '../context/request-context.js';
import { MailerService } from '../mail/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NOTIFICATION_SEARCH_FIELDS } from './notification.dto.js';

export type CreateNotificationInput = {
  userId: string;
  title: string;
  body?: string | null;
  /** POC: happy path stays in-app only; set true to exercise mail failure. */
  attemptEmail?: boolean;
  emailTo?: string;
};

export type ListNotificationsArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.NotificationOrderByWithRelationInput[];
  where: Prisma.NotificationWhereInput;
  q?: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  private requireActorId(): string {
    const userId = currentUserId();
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }
    return userId;
  }

  async list(
    args: ListNotificationsArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Notification[]; total: number }> {
    const actorId = this.requireActorId();
    const search = buildSearchWhere(
      args.q,
      NOTIFICATION_SEARCH_FIELDS,
    ) as Prisma.NotificationWhereInput;
    const where = mergeWhere(
      { userId: actorId },
      mergeWhere(args.where, search),
    ) as Prisma.NotificationWhereInput;

    const [items, total] = await Promise.all([
      this.prisma.client.notification.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.notification.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Notification> {
    const actorId = this.requireActorId();
    const row = await this.prisma.client.notification.findFirst({
      where: { id, userId: actorId },
    });
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    return row;
  }

  /**
   * Marks the actor's notification as read. Another user's id → 404 (not 403).
   */
  async markRead(id: string): Promise<Notification> {
    const actorId = this.requireActorId();
    const updated = await this.prisma.client.notification.updateMany({
      where: { id, userId: actorId },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Notification not found');
    }
    return this.get(id);
  }

  /**
   * Creates an in-app notification. Email is optional and never rolls back
   * the in-app row: mailer failures are recorded for later retry.
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    const row = await this.prisma.client.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        body: input.body ?? null,
      },
    });

    if (!input.attemptEmail) {
      return row;
    }

    try {
      await this.mailer.send({
        to: input.emailTo as string,
        subject: input.title,
        text: input.body ?? input.title,
      });
      return row;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Mail delivery failed';
      await this.prisma.client.notification.updateMany({
        where: { id: row.id },
        data: {
          emailError: message,
          emailQueuedAt: new Date(),
        },
      });
      const queued = await this.prisma.client.notification.findFirst({
        where: { id: row.id },
      });
      if (!queued) {
        throw new NotFoundException('Notification not found');
      }
      return queued;
    }
  }
}
