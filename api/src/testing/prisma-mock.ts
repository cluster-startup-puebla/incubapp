export type MockFn<Args extends unknown[] = unknown[], Result = unknown> = ((
  ...args: Args
) => Promise<Result>) & {
  calls: Args[];
  mockResolvedValue(value: Result): MockFn<Args, Result>;
};

function createMockFn<
  Args extends unknown[] = unknown[],
  Result = unknown,
>(): MockFn<Args, Result> {
  let resolvedValue: Result | undefined;

  const fn = ((...args: Args) => {
    fn.calls.push(args);
    return Promise.resolve(resolvedValue as Result);
  }) as MockFn<Args, Result>;

  fn.calls = [];
  fn.mockResolvedValue = (value: Result) => {
    resolvedValue = value;
    return fn;
  };

  return fn;
}

export type PrismaModelMock = {
  findMany: MockFn;
  findFirst: MockFn;
  count: MockFn;
  update: MockFn;
};

export type PrismaMock = {
  findMany: MockFn;
  findFirst: MockFn;
  count: MockFn;
  update: MockFn;
  $model(name: string): PrismaModelMock;
};

export function createPrismaMock(): PrismaMock {
  const models = new Map<string, PrismaModelMock>();

  const root = {
    findMany: createMockFn(),
    findFirst: createMockFn(),
    count: createMockFn(),
    update: createMockFn(),
    $model(name: string): PrismaModelMock {
      let model = models.get(name);
      if (!model) {
        model = {
          findMany: createMockFn(),
          findFirst: createMockFn(),
          count: createMockFn(),
          update: createMockFn(),
        };
        models.set(name, model);
      }
      return model;
    },
  };

  return root;
}
