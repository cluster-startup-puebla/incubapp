import { fileURLToPath } from 'node:url';

export type SeedAuthApi = {
  signUpEmail: (args: {
    body: { email: string; password: string; name: string };
  }) => Promise<{ user?: { id: string; email: string } } | null>;
};

export type SeedPrisma = {
  user: {
    findUnique: (args: {
      where: { email: string };
    }) => Promise<{ id: string; email: string; isSuperAdmin: boolean } | null>;
    update: (args: {
      where: { id: string };
      data: { isSuperAdmin: boolean; emailVerified?: boolean };
    }) => Promise<unknown>;
  };
  geoUnit: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  framework: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  frameworkStage: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
};

export type SeedEnv = {
  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;
};

export type SeedResult = {
  warnings: string[];
  adminUserId: string | null;
  geo: {
    countryId: string;
    stateIds: string[];
    municipalityIds: string[];
  };
  framework: {
    id: string;
    stageId: string;
  };
};

const MX_FIXTURE = {
  country: { code: 'MX', name: 'México' },
  states: [
    { code: 'PUE', name: 'Puebla' },
    { code: 'CDMX', name: 'Ciudad de México' },
  ],
  municipalities: [
    { code: 'PUE-001', name: 'Puebla', stateCode: 'PUE' },
    { code: 'PUE-002', name: 'San Andrés Cholula', stateCode: 'PUE' },
  ],
} as const;

const FRAMEWORK_FIXTURE = {
  name: 'IncubApp Framework',
  majorVersion: 1,
  stageName: 'Ideación',
} as const;

async function ensureGeo(prisma: SeedPrisma): Promise<SeedResult['geo']> {
  let country = await prisma.geoUnit.findFirst({
    where: { code: MX_FIXTURE.country.code, level: 'COUNTRY' },
  });
  if (!country) {
    country = await prisma.geoUnit.create({
      data: {
        level: 'COUNTRY',
        code: MX_FIXTURE.country.code,
        name: MX_FIXTURE.country.name,
      },
    });
  }

  const stateIds: string[] = [];
  const stateIdByCode = new Map<string, string>();

  for (const state of MX_FIXTURE.states) {
    let row = await prisma.geoUnit.findFirst({
      where: { code: state.code, level: 'STATE' },
    });
    if (!row) {
      row = await prisma.geoUnit.create({
        data: {
          level: 'STATE',
          code: state.code,
          name: state.name,
          parentId: country.id,
        },
      });
    }
    stateIds.push(row.id);
    stateIdByCode.set(state.code, row.id);
  }

  const municipalityIds: string[] = [];
  for (const municipio of MX_FIXTURE.municipalities) {
    let row = await prisma.geoUnit.findFirst({
      where: { code: municipio.code, level: 'MUNICIPALITY' },
    });
    if (!row) {
      row = await prisma.geoUnit.create({
        data: {
          level: 'MUNICIPALITY',
          code: municipio.code,
          name: municipio.name,
          parentId: stateIdByCode.get(municipio.stateCode),
        },
      });
    }
    municipalityIds.push(row.id);
  }

  return {
    countryId: country.id,
    stateIds,
    municipalityIds,
  };
}

async function ensureFramework(
  prisma: SeedPrisma,
): Promise<SeedResult['framework']> {
  let framework = await prisma.framework.findFirst({
    where: {
      name: FRAMEWORK_FIXTURE.name,
      majorVersion: FRAMEWORK_FIXTURE.majorVersion,
    },
  });
  if (!framework) {
    framework = await prisma.framework.create({
      data: {
        name: FRAMEWORK_FIXTURE.name,
        majorVersion: FRAMEWORK_FIXTURE.majorVersion,
        status: 'PUBLISHED',
      },
    });
  }

  let stage = await prisma.frameworkStage.findFirst({
    where: {
      frameworkId: framework.id,
      name: FRAMEWORK_FIXTURE.stageName,
    },
  });
  if (!stage) {
    stage = await prisma.frameworkStage.create({
      data: {
        frameworkId: framework.id,
        name: FRAMEWORK_FIXTURE.stageName,
        sortOrder: 1,
      },
    });
  }

  return { id: framework.id, stageId: stage.id };
}

async function ensureSuperAdmin(
  prisma: SeedPrisma,
  auth: SeedAuthApi,
  env: SeedEnv,
): Promise<{ adminUserId: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    warnings.push(
      'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD missing; skipped super admin seed',
    );
    return { adminUserId: null, warnings };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isSuperAdmin) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isSuperAdmin: true, emailVerified: true },
      });
    }
    return { adminUserId: existing.id, warnings };
  }

  const signedUp = await auth.signUpEmail({
    body: {
      email,
      password,
      name: 'Super Admin',
    },
  });

  const userId = signedUp?.user?.id;
  if (!userId) {
    const created = await prisma.user.findUnique({ where: { email } });
    if (!created) {
      warnings.push('Better Auth signUpEmail did not create the seed admin');
      return { adminUserId: null, warnings };
    }
    await prisma.user.update({
      where: { id: created.id },
      data: { isSuperAdmin: true, emailVerified: true },
    });
    return { adminUserId: created.id, warnings };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isSuperAdmin: true, emailVerified: true },
  });
  return { adminUserId: userId, warnings };
}

export async function seed(options?: {
  prisma?: SeedPrisma;
  auth?: SeedAuthApi;
  env?: SeedEnv;
}): Promise<SeedResult> {
  const env = options?.env ?? {
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
  };

  let prisma = options?.prisma;
  let auth = options?.auth;

  if (!prisma || !auth) {
    const { prisma: realPrisma } =
      await import('../src/prisma/prisma.client.js');
    const { auth: realAuth } = await import('../src/auth.js');
    prisma ??= realPrisma as unknown as SeedPrisma;
    auth ??= {
      signUpEmail: (args) =>
        realAuth.api.signUpEmail(args) as Promise<{
          user?: { id: string; email: string };
        } | null>,
    };
  }

  const admin = await ensureSuperAdmin(prisma, auth, env);
  const geo = await ensureGeo(prisma);
  const framework = await ensureFramework(prisma);

  return {
    warnings: admin.warnings,
    adminUserId: admin.adminUserId,
    geo,
    framework,
  };
}

async function main(): Promise<void> {
  const result = await seed();
  for (const warning of result.warnings) {
    console.warn(warning);
  }
  console.log(
    JSON.stringify(
      {
        adminUserId: result.adminUserId,
        geo: result.geo,
        framework: result.framework,
      },
      null,
      2,
    ),
  );
  await (await import('../src/prisma/prisma.client.js')).prisma.$disconnect();
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
