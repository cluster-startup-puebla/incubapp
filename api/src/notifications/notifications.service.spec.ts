import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import type { MailerService } from '../mail/mailer.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

function createMockFn<Args extends unknown[] = unknown[], Result = unknown>() {
  let resolved: Result | undefined;
  let rejected: unknown;
  let impl: ((...args: Args) => Promise<Result>) | undefined;
  const calls: Args[] = [];
  const fn = ((...args: Args) => {
    calls.push(args);
    if (impl) {
      return impl(...args);
    }
    if (rejected !== undefined) {
      return Promise.reject(
        rejected instanceof Error ? rejected : new Error('mock rejection'),
      );
    }
    return Promise.resolve(resolved as Result);
  }) as ((...args: Args) => Promise<Result>) & {
    calls: Args[];
    mockResolvedValue: (value: Result) => void;
    mockRejectedValue: (error: unknown) => void;
    mockImplementation: (fn: (...args: Args) => Promise<Result>) => void;
  };
  fn.calls = calls;
  fn.mockResolvedValue = (value: Result) => {
    resolved = value;
    rejected = undefined;
    impl = undefined;
  };
  fn.mockRejectedValue = (error: unknown) => {
    rejected = error;
    impl = undefined;
  };
  fn.mockImplementation = (next: (...args: Args) => Promise<Result>) => {
    impl = next;
    rejected = undefined;
  };
  return fn;
}

const OWN_ID = '01900000-0000-7000-8000-000000000001';
const OTHER_ID = '01900000-0000-7000-8000-000000000002';
const ACTOR = 'user-actor-1';
const OTHER_USER = 'user-other-2';

type NotificationRow = {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  readAt: Date | null;
  emailError: string | null;
  emailQueuedAt: Date | null;
  version: number;
  deletedAt: Date | null;
};

function sample(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: OWN_ID,
    userId: ACTOR,
    title: 'Hito aprobado',
    body: 'Tu evidencia fue aceptada',
    readAt: null,
    emailError: null,
    emailQueuedAt: null,
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('NotificationsService (T6.17)', () => {
  function setup() {
    const notification = {
      findMany: createMockFn(),
      count: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
      updateMany: createMockFn(),
    };
    const prisma = {
      client: { notification },
      base: {},
    } as unknown as PrismaService;
    const mailer = {
      send: createMockFn<
        [{ to: string; subject: string; text: string }],
        void
      >(),
    };
    const service = new NotificationsService(
      prisma,
      mailer as unknown as MailerService,
    );
    return { service, notification, mailer };
  }

  function asUser<T>(userId: string, fn: () => T): T {
    return runWithRequestContext(
      {
        userId,
        actorId: userId,
        incubatorId: null,
        isSuperAdmin: false,
      },
      fn,
    );
  }

  it('marcar leida', async () => {
    const { service, notification } = setup();
    const unread = sample();
    const read = sample({ readAt: new Date('2026-09-29T12:00:00.000Z') });
    notification.updateMany.mockResolvedValue({ count: 1 });
    notification.findFirst.mockResolvedValue(read);

    const result = await asUser(ACTOR, () => service.markRead(OWN_ID));

    expect(result.readAt).toEqual(read.readAt);
    const updateArgs = notification.updateMany.calls[0][0] as {
      where: { id: string; userId: string };
      data: { readAt: Date };
    };
    expect(updateArgs.where).toEqual({ id: OWN_ID, userId: ACTOR });
    expect(updateArgs.data.readAt).toBeInstanceOf(Date);
    void unread;
  });

  it('ajena', async () => {
    const { service, notification } = setup();
    notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      asUser(ACTOR, () => service.markRead(OTHER_ID)),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(notification.updateMany.calls[0][0]).toMatchObject({
      where: { id: OTHER_ID, userId: ACTOR },
    });
  });

  it('email falla', async () => {
    const { service, notification, mailer } = setup();
    const created = sample({ userId: OTHER_USER });
    const queued = sample({
      userId: OTHER_USER,
      emailError: 'SMTP down',
      emailQueuedAt: new Date('2026-09-29T12:05:00.000Z'),
    });
    notification.create.mockResolvedValue(created);
    mailer.send.mockRejectedValue(new Error('SMTP down'));
    notification.updateMany.mockResolvedValue({ count: 1 });
    notification.findFirst.mockResolvedValue(queued);

    const result = await service.create({
      userId: OTHER_USER,
      title: created.title,
      body: created.body,
      attemptEmail: true,
      emailTo: 'founder@example.com',
    });

    expect(result.id).toBe(created.id);
    expect(result.emailError).toBe('SMTP down');
    expect(result.emailQueuedAt).toEqual(queued.emailQueuedAt);
    expect(mailer.send.calls).toHaveLength(1);
    expect(notification.create.calls).toHaveLength(1);
    const queueArgs = notification.updateMany.calls[0][0] as {
      where: { id: string };
      data: { emailError: string; emailQueuedAt: Date };
    };
    expect(queueArgs.where).toEqual({ id: created.id });
    expect(queueArgs.data.emailError).toBe('SMTP down');
    expect(queueArgs.data.emailQueuedAt).toBeInstanceOf(Date);
  });

  it('create in-app no llama mailer', async () => {
    const { service, notification, mailer } = setup();
    const created = sample();
    notification.create.mockResolvedValue(created);

    const result = await service.create({
      userId: ACTOR,
      title: created.title,
      body: created.body,
    });

    expect(result).toEqual(created);
    expect(mailer.send.calls).toHaveLength(0);
  });

  it('get sin auth 401', async () => {
    const { service } = setup();
    await expect(service.get(OWN_ID)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('list filtra por actor', async () => {
    const { service, notification } = setup();
    notification.findMany.mockResolvedValue([sample()]);
    notification.count.mockResolvedValue(1);

    await asUser(ACTOR, () => service.list());

    expect(notification.findMany.calls[0][0]).toMatchObject({
      where: { userId: ACTOR },
    });
  });
});
