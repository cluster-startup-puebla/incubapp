# Estado de implementación — backend

Plan: `docs/superpowers/plans/2026-09-29-incubapp-backend.md`

Actualizado: 2026-09-29

## Dónde quedamos

Etapa activa: **T2 cerrado en este checkpoint**. Siguiente: **T3**. Checkpoint T1: `1713908`. Checkpoint T0: `653ee3b`. T2.8 (2FA) no implementado a propósito.

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

T3.1–T3.5. No implementar T3.6 ni T2.8.

Formato de commit: `[:emoji:] backend - add - descripción corta`

Quedó sin prueba e2e: Mailpit abierto a mano, tokens de verificación expirados o reusados contra la base, y el 429 del limiter contra Redis (el spec usa reloj falso; el proceso live sí usa Redis).

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
2. Leer T3 del plan (o cerrar commit de T2).
3. No correr `nest new`. No mover `/api/auth` ni `GET /api/v1/health`.
4. No commitear `.env`.
5. `createdById` sigue siendo `String` (id de Better Auth), no UUID.
