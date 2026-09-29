# Estado de implementación — backend

Plan: `docs/superpowers/plans/2026-09-29-incubapp-backend.md`

Actualizado: 2026-09-29

## Dónde quedamos

Etapa activa: **T3 cerrado en este checkpoint**. Siguiente: **T4.1–T4.6 y T4.14**. Checkpoint T2: `29d96e9`. Checkpoint T1: `1713908`. Checkpoint T0: `653ee3b`. T2.8 y T3.6 no implementados a propósito.

## Hecho en T3

| Tarea | Estado | Notas |
|-------|--------|-------|
| T3.1 Membership | hecho | Modelo + roles; unicidad parcial `(user_id, scope_type, scope_id, role) WHERE deleted_at IS NULL`; `MembershipService` |
| T3.2 Tenant del request | hecho | `X-Incubator-Id`; `resolveTenantContext` + interceptor en el mismo ALS; header ajeno no setea ALS |
| T3.3 Matriz de permisos | hecho | `authz/permissions.ts` único mapa; `@RequirePermissions` + guard; ownership de founder |
| T3.4 Scoping extensión | hecho | `TENANT_MODELS = [Startup]` en la misma extensión soft-delete/audit; body `incubatorId` ignorado |
| T3.5 Suite anti-IDOR | hecho | `TENANT_RESOURCES`; GET/PATCH/DELETE cross-tenant → not found; list no mezcla; registry incompleto falla |
| T3.6 Visibilidad | no | Fuera de este corte |

Migración: `20260929065857_membership_incubator_startup_tenant` (Membership, Incubator, Startup + índices parciales).

Verificación del padre: **122** tests, lint 0 errores. Sesiones no exigen membresía: el 403 de tenant solo aplica con `@RequiresTenant()` (startups). `GET /api/v1/sessions` del admin sigue en 200. Health sigue en 200.

## Hecho en T2

| Tarea | Estado | Notas |
|-------|--------|-------|
| T2.1 Config Better Auth | hecho | `buildAuthOptions`; password min 10; `requireEmailVerification`; sesión 7d; `trustedOrigins` desde `CORS_ORIGINS` (fallback `WEB_ORIGIN`); cookies httpOnly / secure solo https; `secondaryStorage` Redis para rate-limit built-in de BA |
| T2.2 Montaje | hecho | Handler sigue en `/api/auth`; body parser global off; CORS lista; specs de preflight / origen ajeno |
| T2.3 Guard deny-by-default | hecho | `@AllowAnonymous` solo health; inventario + AuthGuard 401 sin sesión; `isSuperAdmin: false` no ban |
| T2.4 Request context | hecho | `@CurrentUser` + interceptor con el mismo ALS de T1.6 (`runWithUser`) |
| T2.5 Mailer | hecho | `MailerService` envuelve `send-mail.ts`; fake transport en unit; sin Mailpit |
| T2.6 Sesiones | hecho | `GET/DELETE /api/v1/sessions` + change-password con `revokeOtherSessions` vía API de BA |
| T2.7 Rate limit auth | hecho | 5 fallos / 15 min por IP+email en login/register/reset; Redis; reloj fake en spec; 429 + `Retry-After` |
| T2.8 2FA | no | Fuera de corte |

Verificación del padre: **87** tests, lint 0 errores. En vivo: `GET /api/v1/health` 200, `GET /api/v1/sessions` sin cookie 401, password corta 400, admin verificado inicia sesión, el listado de sesiones no devuelve el token. Auth sigue en `/api/auth`.

## Siguiente

T4.1–T4.6 y T4.14. No implementar T4.7–T4.13 ni T4.15 hasta que un recurso los necesite. No implementar T3.6 ni T2.8.

Formato de commit: `[:emoji:] backend - add - descripción corta`

Quedó sin prueba e2e HTTP completa de startups (la suite anti-IDOR usa service + Postgres). Sesiones de un user sin membresía ni super admin reciben 403 del tenant resolver.

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

## Fuera del corte (no implementar)

T2.8, T3.6 hasta decidir, T6.8, T6.9 hasta decidir, T6.11 completo, T6.13–T6.16, T6.18, T7.2, T7.4, T8.

## Cómo retomar

1. Leer este archivo.
2. Leer T3.6 / T4 del plan (o cerrar commit de T3.1–T3.5).
3. No correr `nest new`. No mover `/api/auth` ni `GET /api/v1/health`.
4. No commitear `.env`.
5. `createdById` sigue siendo `String` (id de Better Auth), no UUID.
