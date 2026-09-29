import { seed, type SeedAuthApi, type SeedPrisma } from '../../prisma/seed.js';

type UserRow = { id: string; email: string; isSuperAdmin: boolean };
type Row = { id: string; [key: string]: unknown };

function createSeedPrismaMock(): SeedPrisma & {
  counts: {
    geoCreate: number;
    frameworkCreate: number;
    stageCreate: number;
    signUp: number;
  };
  users: Map<string, UserRow>;
} {
  const users = new Map<string, UserRow>();
  const geoUnits = new Map<string, Row>();
  const frameworks = new Map<string, Row>();
  const stages = new Map<string, Row>();
  const counts = {
    geoCreate: 0,
    frameworkCreate: 0,
    stageCreate: 0,
    signUp: 0,
  };

  return {
    counts,
    users,
    user: {
      async findUnique({ where }) {
        await Promise.resolve();
        return users.get(where.email) ?? null;
      },
      async update({ where, data }) {
        await Promise.resolve();
        for (const [email, user] of users) {
          if (user.id === where.id) {
            Object.assign(user, data);
            users.set(email, user);
            return user;
          }
        }
        return null;
      },
    },
    geoUnit: {
      async findFirst(args: unknown) {
        await Promise.resolve();
        const where = (args as { where: Record<string, unknown> }).where;
        for (const row of geoUnits.values()) {
          if (row.code === where.code && row.level === where.level) {
            return row;
          }
        }
        return null;
      },
      async create(args: unknown) {
        await Promise.resolve();
        counts.geoCreate += 1;
        const data = (args as { data: Record<string, unknown> }).data;
        const id = `geo-${geoUnits.size + 1}`;
        const row = { id, ...data };
        geoUnits.set(id, row);
        return { id };
      },
    },
    framework: {
      async findFirst(args: unknown) {
        await Promise.resolve();
        const where = (args as { where: Record<string, unknown> }).where;
        for (const row of frameworks.values()) {
          if (
            row.name === where.name &&
            row.majorVersion === where.majorVersion
          ) {
            return row;
          }
        }
        return null;
      },
      async create(args: unknown) {
        await Promise.resolve();
        counts.frameworkCreate += 1;
        const data = (args as { data: Record<string, unknown> }).data;
        const id = `fw-${frameworks.size + 1}`;
        const row = { id, ...data };
        frameworks.set(id, row);
        return { id };
      },
    },
    frameworkStage: {
      async findFirst(args: unknown) {
        await Promise.resolve();
        const where = (args as { where: Record<string, unknown> }).where;
        for (const row of stages.values()) {
          if (
            row.frameworkId === where.frameworkId &&
            row.name === where.name
          ) {
            return row;
          }
        }
        return null;
      },
      async create(args: unknown) {
        await Promise.resolve();
        counts.stageCreate += 1;
        const data = (args as { data: Record<string, unknown> }).data;
        const id = `stage-${stages.size + 1}`;
        const row = { id, ...data };
        stages.set(id, row);
        return { id };
      },
    },
  };
}

describe('seed', () => {
  it('segunda corrida', async () => {
    const prisma = createSeedPrismaMock();
    const auth: SeedAuthApi = {
      async signUpEmail({ body }) {
        await Promise.resolve();
        prisma.counts.signUp += 1;
        const id = `user-${prisma.counts.signUp}`;
        prisma.users.set(body.email, {
          id,
          email: body.email,
          isSuperAdmin: false,
        });
        return { user: { id, email: body.email } };
      },
    };

    const env = {
      SEED_ADMIN_EMAIL: 'admin@example.com',
      SEED_ADMIN_PASSWORD: 'password-long-enough',
    };

    const first = await seed({ prisma, auth, env });
    const second = await seed({ prisma, auth, env });

    expect(first.adminUserId).toBe(second.adminUserId);
    expect(first.geo.countryId).toBe(second.geo.countryId);
    expect(first.framework.id).toBe(second.framework.id);
    expect(first.framework.stageId).toBe(second.framework.stageId);
    expect(prisma.counts.signUp).toBe(1);
    expect(prisma.counts.geoCreate).toBe(5);
    expect(prisma.counts.frameworkCreate).toBe(1);
    expect(prisma.counts.stageCreate).toBe(1);
  });

  it('sin env de admin', async () => {
    const prisma = createSeedPrismaMock();
    let signUpCalls = 0;
    const auth: SeedAuthApi = {
      async signUpEmail() {
        await Promise.resolve();
        signUpCalls += 1;
        return null;
      },
    };

    const result = await seed({
      prisma,
      auth,
      env: {},
    });

    expect(result.adminUserId).toBeNull();
    expect(result.warnings[0]).toMatch(/SEED_ADMIN_EMAIL/);
    expect(signUpCalls).toBe(0);
    expect(result.geo.countryId).toBeTruthy();
    expect(result.framework.id).toBeTruthy();
  });
});
