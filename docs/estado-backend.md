# Estado de implementación — backend

Plan: `docs/superpowers/plans/2026-09-29-incubapp-backend.md`

Actualizado: 2026-09-29

## Dónde quedamos

Etapa activa: **T1 cerrado en este checkpoint**. Siguiente: **T2**.

Checkpoint anterior de T0: `653ee3b`.

## Hecho en T1

| Tarea | Estado | Notas |
|-------|--------|-------|
| T1.1 Convención + `Institution` | hecho | `conventions.spec.ts`; Session sin mixin |
| T1.2 `isSuperAdmin` en `User` | hecho | `additionalFields`, sin plugin admin |
| T1.3 `PrismaService` | hecho | `$connect` / `$disconnect`; log >500ms solo en development |
| T1.4 Soft delete | hecho | Una extensión. `findUnique` reenvía `withDeleted` |
| T1.5 Unicidad parcial | hecho | índice `WHERE deleted_at IS NULL`; `db:check-uniques` en CI |
| T1.6 Auditoría ALS | hecho | `src/context/request-context.ts` |
| T1.7 Seed | hecho | `signUpEmail`. Login real del admin sembrado verificado en local |

Migraciones:

- `20260929063105_business_models_soft_delete_admin`
- `20260929063115_institution_partial_unique`

Verificación del padre: 48 tests + integración de soft delete, lint 0 errores, `db:check-uniques` OK, seed idempotente y `signIn.email` acepta la contraseña (`isSuperAdmin: true`).

## Hecho antes (T0)

Commit `653ee3b`. Health `GET /api/v1/health`, readiness con Postgres y Redis, tooling, CI.

## Siguiente

T2.1–T2.7. No implementar T2.8 (2FA).

Formato de commit: `[:emoji:] backend - add - descripción corta`

## Fuera del corte (no implementar)

T2.8, T3.6 hasta decidir, T6.8, T6.9 hasta decidir, T6.11 completo, T6.13–T6.16, T6.18, T7.2, T7.4, T8.

## Cómo retomar

1. Leer este archivo.
2. Leer T2 del plan.
3. No correr `nest new`. No mover `/api/auth` ni `GET /api/v1/health`.
4. No commitear `.env`.
5. `createdById` sigue siendo `String` (id de Better Auth), no UUID.
