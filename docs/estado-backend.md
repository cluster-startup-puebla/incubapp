# Estado de implementación — backend

Plan: `docs/superpowers/plans/2026-09-29-incubapp-backend.md`

Actualizado: 2026-09-29

## Dónde quedamos

Etapa activa: **T6.2 institutions cerrado en este checkpoint**. Siguiente: T6.1 `geo-units`. Checkpoint T4: `a81ca55`. Checkpoint T3: `ee05768`. Checkpoint T2: `29d96e9`. Checkpoint T1: `1713908`. Checkpoint T0: `653ee3b`.

## Hecho en T5 / T6.2 (`institutions`)

| Pieza | Estado | Notas |
|-------|--------|-------|
| R1–R8 CRUD | hecho | create/list/get/update/delete/restore/trash/purge; deletes 204; Location en create; envelope via `toList`/`toResource` |
| R4 If-Match | hecho | sin header → 428; stale → 409; where `{ id, version }` + increment |
| R2 `q` | hecho | min 2, escape `%`/`_`, contains CI; sin migración GIN/unaccent |
| R9 Audit | hecho | tabla `audit_log` + interceptor en institutions (POST/PATCH/DELETE/restore/purge); secrets strip; fallo no escribe |
| R10 OpenAPI | hecho | operations con summary + ApiStandardErrors; `openapi:check` verde |
| R11 IDOR | hecho | Institution en `GLOBAL_RESOURCES` (`idor: permission`); **no** en `TENANT_MODELS` |
| R12 write rate | hecho | 30 writes/min por user; 429 + Retry-After; Redis fail-open; health skip |
| T6.2 extras | hecho | unique name×country; mismo nombre otro país; recreate tras soft-delete; delete con incubadora activa → 409; website URL |
| Permisos | hecho | `restore`/`purge` en matriz; purge solo super admin (bypass); institutions sin `@RequiresTenant()` |

Migración: `20260929072225_institution_website_audit_log` (`website` + `audit_log`). `Incubator.institutionId` ya existía.

Verificación del padre: **222** tests al repetir la suite, lint 0 errores, `openapi:check` y `db:check-uniques` ok. En vivo: health `{"status":"ok"}`, `GET /api/v1/institutions` sin cookie 401, con admin 200 `{ data, meta }`.

## Hecho en T4

| Tarea | Estado | Notas |
|-------|--------|-------|
| T4.1 Validación Zod | hecho | `ZodValidationPipe` global + `createZodDto` / `nestjs-zod`; objects `strict`; write DTOs sin `id`/`deletedAt`/`createdById`/`incubatorId` |
| T4.2 RFC 7807 | hecho | `ProblemDetailsFilter` solo `/api/v1`; Prisma P2002/P2025/P2003/P2034; 500 sin secretos; `/api/auth` intacto |
| T4.3 Envelope | hecho | Un `EnvelopeInterceptor` + helpers `toList`/`toResource`; health excluido; deletes 204 |
| T4.4 Paginación | hecho | Offset + cursor helpers; page/pageSize defaults; sin `total` en cursor; no offset para audit/metrics |
| T4.5 Orden | hecho | `parseSort` con whitelist; default `createdAt` desc; rechaza relaciones |
| T4.6 Filtros | hecho | `parseFilters` → Prisma where parametrizado; ops + `in` máx 200 |
| T4.7 Búsqueda | parcial | helper `q` en institutions; sin GIN/unaccent |
| T4.8 Rate limit writes | parcial | slice de writes 30/min (R12); no throttler global 100/min ni búsqueda 60/min |
| T4.9–T4.10 | no | Fuera de este corte |
| T4.11 Audit log | hecho | scoped a institutions (R9) |
| T4.12 If-Match | hecho | scoped a institutions (R4) |
| T4.13 Idempotencia | no | Fuera de este corte |
| T4.14 Scalar/OpenAPI | hecho | `/reference` + `/openapi.json`; `ApiStandardErrors`; prod exige super admin o `API_REFERENCE_ENABLED=false`; `npm run openapi:check` en CI |
| T4.15 Storage | no | Fuera de este corte |

Startups list/get/create/update usan pipe + envelope + query helpers. Sessions list usa envelope de lista. Health sigue `{ status: 'ok', ... }` sin envelope.

Verificación del padre (pre-institutions): **163** tests. Post-receta: **222**.

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

T6.1 `geo-units` (lectura con sesión, escritura solo super admin). No implementar T3.6 ni T2.8.

Formato de commit: `[:emoji:] backend - add - descripción corta`

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

T2.8, T3.6 hasta decidir, T4.9–T4.10, T4.13, T4.15, T6.1, T6.3–T6.18 (salvo T6.2), T7.2, T7.4, T8.

## Cómo retomar

1. Leer este archivo.
2. Copiar la receta de `institutions` al siguiente recurso (T6.1 / T6.3 / T6.4).
3. No correr `nest new`. No mover `/api/auth` ni `GET /api/v1/health`.
4. No commitear `.env`.
5. `createdById` sigue siendo `String` (id de Better Auth), no UUID.
