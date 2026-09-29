import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSoftDeleteUniques } from '../../prisma/check-no-prisma-unique.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('partial unique + schema lint', () => {
  it('lint de schema', () => {
    const schema = readFileSync(
      join(__dirname, '../../prisma/schema.prisma'),
      'utf8',
    );
    expect(findSoftDeleteUniques(schema)).toEqual([]);
  });

  it('lint de schema detects @@unique', () => {
    const dirty = `
model Institution {
  id   String @id
  name String
  @@unique([name])
  @@map("institution")
}
`;
    expect(findSoftDeleteUniques(dirty, ['Institution'])).toEqual([
      'Institution: has @@unique or @unique (use partial SQL index)',
    ]);
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL);

(hasDatabase ? describe : describe.skip)('partial unique (integration)', () => {
  let prisma: {
    institution: {
      create: (args: unknown) => Promise<{ id: string }>;
      delete: (args: unknown) => Promise<unknown>;
      findMany: (args?: unknown) => Promise<unknown[]>;
    };
    geoUnit: {
      create: (args: unknown) => Promise<{ id: string }>;
      delete: (args: unknown) => Promise<unknown>;
    };
    $executeRawUnsafe: (sql: string) => Promise<unknown>;
    $disconnect: () => Promise<void>;
  };

  beforeAll(async () => {
    const { prisma: client } = await import('./prisma.client.js');
    prisma = client;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('recrear name tras soft delete', async () => {
    const suffix = `${Date.now()}`;
    const name = `Partial Unique ${suffix}`;
    const countryCode = 'MX';

    const first = await prisma.institution.create({
      data: { name, countryCode },
    });
    await prisma.institution.delete({ where: { id: first.id } });

    const second = await prisma.institution.create({
      data: { name, countryCode },
    });
    expect(second.id).not.toBe(first.id);

    // cleanup physical rows for this test
    await prisma.$executeRawUnsafe(
      `DELETE FROM institution WHERE name = '${name.replace(/'/g, "''")}'`,
    );
  });

  it('recrear geo level+code tras soft delete', async () => {
    const suffix = `${Date.now()}`;
    const code = `PU-${suffix}`;

    const first = await prisma.geoUnit.create({
      data: { level: 'COUNTRY', code, name: `Geo ${suffix}` },
    });
    await prisma.geoUnit.delete({ where: { id: first.id } });

    const second = await prisma.geoUnit.create({
      data: { level: 'COUNTRY', code, name: `Geo 2 ${suffix}` },
    });
    expect(second.id).not.toBe(first.id);

    await prisma.$executeRawUnsafe(
      `DELETE FROM geo_unit WHERE code = '${code.replace(/'/g, "''")}'`,
    );
  });

  it('dos activos conflict', async () => {
    const suffix = `${Date.now()}`;
    const name = `Conflict Unique ${suffix}`;
    const countryCode = 'MX';

    await prisma.institution.create({
      data: { name, countryCode },
    });

    let error: unknown;
    try {
      await prisma.institution.create({
        data: { name, countryCode },
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error).toMatchObject({ code: 'P2002' });

    await prisma.$executeRawUnsafe(
      `DELETE FROM institution WHERE name = '${name.replace(/'/g, "''")}'`,
    );
  });
});
