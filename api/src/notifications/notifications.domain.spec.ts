import { createNotificationSchema } from './notification.dto.js';

describe('T6.17 notifications domain', () => {
  it('create dto rechaza id mass-assignment', () => {
    const parsed = createNotificationSchema.safeParse({
      userId: 'user-1',
      title: 'Hola',
      id: '01900000-0000-7000-8000-000000000001',
      deletedAt: '2026-01-01',
      createdById: 'hacker',
    });
    expect(parsed.success).toBe(false);
  });

  it('create dto valido', () => {
    const parsed = createNotificationSchema.safeParse({
      userId: 'user-1',
      title: 'Hito aprobado',
      body: 'Ok',
    });
    expect(parsed.success).toBe(true);
  });

  it('attemptEmail exige emailTo', () => {
    const parsed = createNotificationSchema.safeParse({
      userId: 'user-1',
      title: 'Hola',
      attemptEmail: true,
    });
    expect(parsed.success).toBe(false);
  });
});
