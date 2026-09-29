import { Prisma } from '../generated/prisma/client.js';
import {
  currentIncubatorId,
  currentUserId,
} from '../context/request-context.js';

export const SOFT_DELETE_MODELS = [
  'Institution',
  'Membership',
  'Incubator',
  'Startup',
  'GeoUnit',
] as const;

export type SoftDeleteModelName = (typeof SOFT_DELETE_MODELS)[number];

const softDeleteModelSet = new Set<string>(SOFT_DELETE_MODELS);

export function isSoftDeleteModel(model: string): model is SoftDeleteModelName {
  return softDeleteModelSet.has(model);
}

/** Models that receive incubatorId from request context on reads/writes. */
export const TENANT_MODELS = ['Startup'] as const;

export type TenantModelName = (typeof TENANT_MODELS)[number];

const tenantModelSet = new Set<string>(TENANT_MODELS);

export function isTenantModel(model: string): model is TenantModelName {
  return tenantModelSet.has(model);
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

/**
 * Forces incubatorId from ALS when a tenant is active.
 * Caller-supplied incubatorId in where/data is overwritten (body ignored).
 */
export function applyTenantFilter(
  model: string,
  where: WhereInput,
): WhereInput {
  if (!isTenantModel(model)) {
    return where;
  }
  const incubatorId = currentIncubatorId();
  if (incubatorId === null) {
    return where;
  }
  const tenantClause = { incubatorId };
  if (!where || Object.keys(where).length === 0) {
    return tenantClause;
  }
  return { AND: [where, tenantClause] };
}

export function forceTenantData<T extends Record<string, unknown>>(
  model: string,
  data: T,
): T {
  if (!isTenantModel(model)) {
    return data;
  }
  const incubatorId = currentIncubatorId();
  if (incubatorId === null) {
    return data;
  }
  return { ...data, incubatorId };
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
      next[key] = {
        where: applyTenantFilter(childModel, { deletedAt: null }),
      };
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      next[key] = {
        ...nested,
        where: applyTenantFilter(
          childModel,
          applyListDeletedFilter(nested.where as WhereInput, {}),
        ),
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

function applySoftDeleteAndTenantWhere(
  model: string,
  where: WhereInput,
  flags: SoftDeleteQueryFlags,
): WhereInput {
  return applyTenantFilter(model, applyListDeletedFilter(where, flags));
}

/**
 * Builds the soft-delete + audit + tenant Prisma client extension.
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
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            if (!isSoftDeleteModel(model)) {
              return query({
                ...args,
                where: applyTenantFilter(model, args.where),
              });
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applySoftDeleteAndTenantWhere(
                model,
                rest.where as WhereInput,
                flags,
              ),
              include: applyNestedSoftDeleteInclude(
                rest.include as Record<string, unknown> | undefined,
              ),
            });
          },

          async findFirst({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            if (!isSoftDeleteModel(model)) {
              return query({
                ...args,
                where: applyTenantFilter(model, args.where),
              });
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applySoftDeleteAndTenantWhere(
                model,
                rest.where as WhereInput,
                flags,
              ),
              include: applyNestedSoftDeleteInclude(
                rest.include as Record<string, unknown> | undefined,
              ),
            });
          },

          async findFirstOrThrow({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            if (!isSoftDeleteModel(model)) {
              return query({
                ...args,
                where: applyTenantFilter(model, args.where),
              });
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applySoftDeleteAndTenantWhere(
                model,
                rest.where as WhereInput,
                flags,
              ),
              include: applyNestedSoftDeleteInclude(
                rest.include as Record<string, unknown> | undefined,
              ),
            });
          },

          async findUnique({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
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
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
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
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            if (!isSoftDeleteModel(model)) {
              return query({
                ...args,
                where: applyTenantFilter(model, args.where),
              });
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applySoftDeleteAndTenantWhere(
                model,
                rest.where as WhereInput,
                flags,
              ),
            });
          },

          async aggregate({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            if (!isSoftDeleteModel(model)) {
              return query({
                ...args,
                where: applyTenantFilter(model, args.where),
              });
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applySoftDeleteAndTenantWhere(
                model,
                rest.where as WhereInput,
                flags,
              ),
            });
          },

          async groupBy({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            if (!isSoftDeleteModel(model)) {
              return query({
                ...args,
                where: applyTenantFilter(model, args.where),
              });
            }
            const { flags, rest } = extractFlags(args);
            return query({
              ...rest,
              where: applySoftDeleteAndTenantWhere(
                model,
                rest.where as WhereInput,
                flags,
              ),
            } as typeof args);
          },

          async create({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            let data = {
              ...(args.data as Record<string, unknown>),
            };
            if (isSoftDeleteModel(model)) {
              data = stripDeletedAtFromData(data);
              if (data.createdById === undefined) {
                data.createdById = actorId();
              }
            }
            data = forceTenantData(model, data);
            return query({ ...args, data } as typeof args);
          },

          async createMany({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            const actor = actorId();
            const raw = args.data as
              Record<string, unknown> | Record<string, unknown>[];
            const rows = isSoftDeleteModel(model)
              ? stripDeletedAtFromCreateManyData(raw)
              : raw;
            const withActor = Array.isArray(rows)
              ? rows.map((row) => {
                  const next = { ...row };
                  if (
                    isSoftDeleteModel(model) &&
                    next.createdById === undefined
                  ) {
                    next.createdById = actor;
                  }
                  return forceTenantData(model, next);
                })
              : (() => {
                  const next = { ...rows };
                  if (
                    isSoftDeleteModel(model) &&
                    next.createdById === undefined
                  ) {
                    next.createdById = actor;
                  }
                  return forceTenantData(model, next);
                })();
            return query({ ...args, data: withActor } as typeof args);
          },

          async update({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            let data = {
              ...(args.data as Record<string, unknown>),
            };
            if (isSoftDeleteModel(model)) {
              data = stripDeletedAtFromData(data);
              if (data.updatedById === undefined) {
                data.updatedById = actorId();
              }
            }
            data = forceTenantData(model, data);
            return query({
              ...args,
              where: applySoftDeleteAndTenantWhere(model, args.where, {}),
              data,
            } as typeof args);
          },

          async updateMany({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }
            let data = {
              ...(args.data as Record<string, unknown>),
            };
            if (isSoftDeleteModel(model)) {
              data = stripDeletedAtFromData(data);
              if (data.updatedById === undefined) {
                data.updatedById = actorId();
              }
            }
            data = forceTenantData(model, data);
            return query({
              ...args,
              where: applySoftDeleteAndTenantWhere(model, args.where ?? {}, {}),
              data,
            });
          },

          async upsert({ model, args, query }) {
            if (!isSoftDeleteModel(model) && !isTenantModel(model)) {
              return query(args);
            }

            let createData = {
              ...(args.create as Record<string, unknown>),
            };
            let updateData = {
              ...(args.update as Record<string, unknown>),
            };

            if (isSoftDeleteModel(model)) {
              createData = stripDeletedAtFromData(createData);
              if (createData.createdById === undefined) {
                createData.createdById = actorId();
              }
              updateData = stripDeletedAtFromData(updateData);
              if (updateData.updatedById === undefined) {
                updateData.updatedById = actorId();
              }
            }

            createData = forceTenantData(model, createData);
            updateData = forceTenantData(model, updateData);

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
              where: applySoftDeleteAndTenantWhere(model, args.where ?? {}, {}),
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
