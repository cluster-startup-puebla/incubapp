import { Prisma } from '../generated/prisma/client.js';
import { currentUserId } from '../context/request-context.js';

export const SOFT_DELETE_MODELS = ['Institution'] as const;

export type SoftDeleteModelName = (typeof SOFT_DELETE_MODELS)[number];

const softDeleteModelSet = new Set<string>(SOFT_DELETE_MODELS);

export function isSoftDeleteModel(model: string): model is SoftDeleteModelName {
  return softDeleteModelSet.has(model);
}

export type SoftDeleteQueryFlags = {
  withDeleted?: boolean;
  onlyDeleted?: boolean;
};

type WhereInput = Record<string, unknown> | undefined;

type Delegate = {
  findFirst: (args: unknown) => Promise<unknown>;
  findFirstOrThrow: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<unknown>;
};

function toDelegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function callerFixedDeletedAt(where: WhereInput): boolean {
  if (!where || typeof where !== 'object') {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(where, 'deletedAt');
}

export function applyListDeletedFilter(
  where: WhereInput,
  flags: SoftDeleteQueryFlags,
): WhereInput {
  if (flags.withDeleted) {
    return where;
  }

  if (flags.onlyDeleted) {
    const deletedClause = { deletedAt: { not: null } };
    if (!where || Object.keys(where).length === 0) {
      return deletedClause;
    }
    return { AND: [where, deletedClause] };
  }

  if (callerFixedDeletedAt(where)) {
    return where;
  }

  const activeClause = { deletedAt: null };
  if (!where || Object.keys(where).length === 0) {
    return activeClause;
  }
  return { AND: [where, activeClause] };
}

export function stripDeletedAtFromData<T extends Record<string, unknown>>(
  data: T,
): Omit<T, 'deletedAt'> {
  const rest = { ...data };
  delete rest.deletedAt;
  return rest;
}

export function stripDeletedAtFromCreateManyData(
  data: Record<string, unknown> | Record<string, unknown>[],
): Record<string, unknown> | Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((row) => stripDeletedAtFromData(row));
  }
  return stripDeletedAtFromData(data);
}

function relationModelNameFromIncludeKey(key: string): string | null {
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  if (isSoftDeleteModel(pascal)) {
    return pascal;
  }
  if (key.endsWith('s')) {
    const singular =
      key.slice(0, -1).charAt(0).toUpperCase() + key.slice(0, -1).slice(1);
    if (isSoftDeleteModel(singular)) {
      return singular;
    }
  }
  return null;
}

export function applyNestedSoftDeleteInclude(
  include: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!include) {
    return include;
  }

  const next: Record<string, unknown> = { ...include };
  for (const [key, value] of Object.entries(include)) {
    const childModel = relationModelNameFromIncludeKey(key);
    if (!childModel) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>;
        if (nested.include && typeof nested.include === 'object') {
          next[key] = {
            ...nested,
            include: applyNestedSoftDeleteInclude(
              nested.include as Record<string, unknown>,
            ),
          };
        }
      }
      continue;
    }

    if (value === true) {
      next[key] = { where: { deletedAt: null } };
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      next[key] = {
        ...nested,
        where: applyListDeletedFilter(nested.where as WhereInput, {}),
        ...(nested.include && typeof nested.include === 'object'
          ? {
              include: applyNestedSoftDeleteInclude(
                nested.include as Record<string, unknown>,
              ),
            }
          : {}),
      };
    }
  }
  return next;
}

function extractFlags(args: Record<string, unknown>): {
  flags: SoftDeleteQueryFlags;
  rest: Record<string, unknown>;
} {
  const { withDeleted, onlyDeleted, ...rest } = args as SoftDeleteQueryFlags &
    Record<string, unknown>;
  return {
    flags: {
      withDeleted: Boolean(withDeleted),
      onlyDeleted: Boolean(onlyDeleted),
    },
    rest,
  };
}

function actorId(): string | null {
  return currentUserId();
}

function getDelegate(client: object, model: string): Delegate {
  const key = toDelegateKey(model);
  return (client as Record<string, Delegate>)[key];
}

/**
 * Builds the soft-delete + audit Prisma client extension.
 * Uses the extended client for delete→update so update filters still apply.
 * Uses the parent client for restore so deleted rows can be revived.
 */
export function createSoftDeleteExtension() {
  return Prisma.defineExtension((client) => {
    // Self-referential holder so delete can call extended delegates.
    const ref: { client: object | null } = { client: null };

    const extended = client.$extends({
      name: 'soft-delete-audit',
      model: {
        $allModels: {
          async restore(this: unknown, id: string): Promise<unknown> {
            const ctx = Prisma.getExtensionContext(this) as { $name?: string };
            const modelName = ctx.$name ?? '';
            if (!isSoftDeleteModel(modelName)) {
              throw new Error(`restore() is not supported on ${modelName}`);
            }

            return getDelegate(client, modelName).update({
              where: { id },
              data: {
                deletedAt: null,
                deletedById: null,
                updatedById: actorId(),
              },
            });
          },
        },
      },
      query: {
        $allModels: {
          async findMany({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applyListDeletedFilter(rest.where as WhereInput, flags),
              include: applyNestedSoftDeleteInclude(
                rest.include as Record<string, unknown> | undefined,
              ),
            });
          },

          async findFirst({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applyListDeletedFilter(rest.where as WhereInput, flags),
              include: applyNestedSoftDeleteInclude(
                rest.include as Record<string, unknown> | undefined,
              ),
            });
          },

          async findFirstOrThrow({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applyListDeletedFilter(rest.where as WhereInput, flags),
              include: applyNestedSoftDeleteInclude(
                rest.include as Record<string, unknown> | undefined,
              ),
            });
          },

          async findUnique({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            void query;
            const { flags, rest } = extractFlags(args);
            // Forward flags. The extended findFirst applies the filter once.
            return getDelegate(ref.client as object, model).findFirst({
              ...rest,
              withDeleted: flags.withDeleted,
              onlyDeleted: flags.onlyDeleted,
            });
          },

          async findUniqueOrThrow({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            void query;
            const { flags, rest } = extractFlags(args);
            return getDelegate(ref.client as object, model).findFirstOrThrow({
              ...rest,
              withDeleted: flags.withDeleted,
              onlyDeleted: flags.onlyDeleted,
            });
          },

          async count({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applyListDeletedFilter(rest.where as WhereInput, flags),
            });
          },

          async aggregate({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applyListDeletedFilter(rest.where as WhereInput, flags),
            });
          },

          async groupBy({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applyListDeletedFilter(rest.where as WhereInput, flags),
            } as typeof args);
          },

          async create({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const data = stripDeletedAtFromData({
              ...(args.data as Record<string, unknown>),
            });
            if (data.createdById === undefined) {
              (data as Record<string, unknown>).createdById = actorId();
            }
            return query({ ...args, data } as typeof args);
          },

          async createMany({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const actor = actorId();
            const raw = args.data as
              Record<string, unknown> | Record<string, unknown>[];
            const stripped = stripDeletedAtFromCreateManyData(raw);
            const withActor = Array.isArray(stripped)
              ? stripped.map((row) => ({
                  ...row,
                  createdById:
                    row.createdById === undefined ? actor : row.createdById,
                }))
              : {
                  ...stripped,
                  createdById:
                    stripped.createdById === undefined
                      ? actor
                      : stripped.createdById,
                };
            return query({ ...args, data: withActor } as typeof args);
          },

          async update({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const data = stripDeletedAtFromData({
              ...(args.data as Record<string, unknown>),
            });
            if (data.updatedById === undefined) {
              (data as Record<string, unknown>).updatedById = actorId();
            }
            return query({
              ...args,
              where: applyListDeletedFilter(args.where, {}),
              data,
            } as typeof args);
          },

          async updateMany({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            const data = stripDeletedAtFromData({
              ...(args.data as Record<string, unknown>),
            });
            if (data.updatedById === undefined) {
              (data as Record<string, unknown>).updatedById = actorId();
            }
            return query({
              ...args,
              where: applyListDeletedFilter(args.where, {}),
              data,
            });
          },

          async upsert({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }

            const createData = stripDeletedAtFromData({
              ...(args.create as Record<string, unknown>),
            });
            if (createData.createdById === undefined) {
              (createData as Record<string, unknown>).createdById = actorId();
            }

            const updateData = stripDeletedAtFromData({
              ...(args.update as Record<string, unknown>),
            });
            if (updateData.updatedById === undefined) {
              (updateData as Record<string, unknown>).updatedById = actorId();
            }

            return query({
              ...args,
              create: createData,
              update: updateData,
            } as typeof args);
          },

          async delete({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            void query;
            // Parent client bypasses update's deletedAt strip; filter active rows first.
            const existing = (await getDelegate(
              ref.client as object,
              model,
            ).findFirst({
              where: args.where,
            })) as { id: string } | null;
            if (!existing) {
              throw new Prisma.PrismaClientKnownRequestError(
                'Record to delete does not exist.',
                {
                  code: 'P2025',
                  clientVersion: Prisma.prismaVersion.client,
                  meta: { modelName: model, cause: 'Record not found' },
                },
              );
            }
            return getDelegate(client, model).update({
              where: { id: existing.id },
              data: {
                deletedAt: new Date(),
                deletedById: actorId(),
                updatedById: actorId(),
              },
            });
          },

          async deleteMany({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }
            void query;
            return getDelegate(client, model).updateMany({
              where: applyListDeletedFilter(args.where ?? {}, {}),
              data: {
                deletedAt: new Date(),
                deletedById: actorId(),
                updatedById: actorId(),
              },
            });
          },
        },
      },
    });

    ref.client = extended;
    return extended;
  });
}

export const softDeleteExtension = createSoftDeleteExtension();
