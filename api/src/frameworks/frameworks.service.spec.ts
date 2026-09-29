import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import { FrameworksService } from './frameworks.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

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

type FrameworkRow = {
  id: string;
  name: string;
  majorVersion: number;
  status: 'DRAFT' | 'PUBLISHED';
  version: number;
  deletedAt: Date | null;
  stages?: Array<{
    id: string;
    name: string;
    sortOrder: number;
    milestones?: Array<{
      id: string;
      name: string;
      sortOrder: number;
      evidenceRequired: boolean;
    }>;
  }>;
  metricDefs?: Array<{
    id: string;
    key: string;
    name: string;
    allowNegative: boolean;
  }>;
};

const ID = '01900000-0000-7000-8000-0000000000f1';
const ID_V2 = '01900000-0000-7000-8000-0000000000f2';

function sample(overrides: Partial<FrameworkRow> = {}): FrameworkRow {
  return {
    id: ID,
    name: 'IncubApp Framework',
    majorVersion: 1,
    status: 'PUBLISHED',
    version: 1,
    deletedAt: null,
    stages: [
      {
        id: 'stage-1',
        name: 'Ideation',
        sortOrder: 1,
        milestones: [],
      },
    ],
    metricDefs: [],
    ...overrides,
  };
}

describe('FrameworksService', () => {
  function setup() {
    const framework = {
      findMany: createMockFn(),
      count: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
      updateMany: createMockFn(),
      delete: createMockFn(),
      restore: createMockFn(),
    };
    const frameworkStage = {
      create: createMockFn(),
    };
    const baseFramework = { delete: createMockFn() };
    const baseFrameworkStage = {
      findMany: createMockFn(),
      deleteMany: createMockFn(),
    };
    const baseMilestone = { deleteMany: createMockFn() };
    const baseMetricDef = { deleteMany: createMockFn() };

    const prisma = {
      client: { framework, frameworkStage },
      base: {
        framework: baseFramework,
        frameworkStage: baseFrameworkStage,
        milestone: baseMilestone,
        metricDef: baseMetricDef,
      },
    } as unknown as PrismaService;

    const service = new FrameworksService(prisma);
    return { service, framework, frameworkStage };
  }

  it('publicado inmutable 409', async () => {
    const { service, framework } = setup();
    framework.findFirst.mockResolvedValue(sample());
    await expect(
      service.update(ID, 1, { name: 'Hack' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('nueva version clone 201 shape', async () => {
    const { service, framework } = setup();
    const source = sample();
    const draft = sample({
      id: ID_V2,
      majorVersion: 2,
      status: 'DRAFT',
      stages: [
        { id: 'stage-2', name: 'Ideation', sortOrder: 1, milestones: [] },
      ],
    });

    let findCalls = 0;
    framework.findFirst.mockImplementation(() => {
      findCalls += 1;
      if (findCalls === 1) {
        return Promise.resolve(source);
      }
      return Promise.resolve(null);
    });
    framework.create.mockResolvedValue(draft);

    const cloned = await runWithRequestContext(
      {
        userId: 'admin',
        actorId: 'admin',
        incubatorId: null,
        isSuperAdmin: true,
      },
      () => service.clone(ID, ['cluster_admin']),
    );

    expect(cloned.id).toBe(ID_V2);
    expect(cloned.majorVersion).toBe(2);
    expect(cloned.status).toBe('DRAFT');
    expect(framework.create.calls.length).toBe(1);
    const createData = framework.create.calls[0]?.[0] as {
      data: { majorVersion: number; status: string };
    };
    expect(createData.data.majorVersion).toBe(2);
    expect(createData.data.status).toBe('DRAFT');
  });

  it('clone exige cluster_admin', async () => {
    const { service } = setup();
    await expect(
      runWithRequestContext(
        {
          userId: 'dir',
          actorId: 'dir',
          incubatorId: null,
          isSuperAdmin: false,
        },
        () => service.clone(ID, ['director']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('orden de etapas gap 422', async () => {
    const { service, framework, frameworkStage } = setup();
    framework.findFirst.mockResolvedValue(
      sample({
        status: 'DRAFT',
        stages: [{ id: 's1', name: 'A', sortOrder: 1, milestones: [] }],
      }),
    );
    await expect(
      service.addStage(ID, { name: 'C', sortOrder: 3 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(frameworkStage.create.calls.length).toBe(0);
  });

  it('orden de etapas duplicado 422', async () => {
    const { service, framework } = setup();
    framework.findFirst.mockResolvedValue(
      sample({
        status: 'DRAFT',
        stages: [{ id: 's1', name: 'A', sortOrder: 1, milestones: [] }],
      }),
    );
    await expect(
      service.addStage(ID, { name: 'B', sortOrder: 1 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('assertPublishedFramework draft 422', async () => {
    const { service, framework } = setup();
    framework.findFirst.mockResolvedValue(sample({ status: 'DRAFT' }));
    await expect(service.assertPublishedFramework(ID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('assertPublishedFramework missing 404', async () => {
    const { service, framework } = setup();
    framework.findFirst.mockResolvedValue(null);
    await expect(service.assertPublishedFramework(ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('draft update ok', async () => {
    const { service, framework } = setup();
    const draft = sample({ status: 'DRAFT', name: 'Draft' });
    let finds = 0;
    framework.findFirst.mockImplementation(() => {
      finds += 1;
      if (finds === 1) {
        return Promise.resolve(draft);
      }
      return Promise.resolve({
        ...draft,
        name: 'Renamed',
        version: 2,
        stages: draft.stages,
      });
    });
    framework.updateMany.mockResolvedValue({ count: 1 });

    const updated = await service.update(ID, 1, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });
});
