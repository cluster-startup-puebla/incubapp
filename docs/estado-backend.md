# Estado de implementación — backend

Plan: `docs/superpowers/plans/2026-09-29-incubapp-backend.md`

Actualizado: 2026-09-29

## Dónde quedamos

Etapa activa: **T6.6 startups en curso** (alta en vivo 409 por llave foránea, sin commit). T4.9–T4.15 del corte transversal ya están. Checkpoint frameworks: `bc139bf`. Checkpoint memberships: `c3cfa82`. Checkpoint incubators: `07acced`. Checkpoint geo-units: `6727035`. Checkpoint institutions: `73a0e34`. Checkpoint T4: `a81ca55`. Checkpoint T3: `ee05768`. Checkpoint T2: `29d96e9`. Checkpoint T1: `1713908`. Checkpoint T0: `653ee3b`.

## Hecho en T6.6 (`startups` mínimo POC)

| Pieza | Estado | Notas |
|-------|--------|-------|
| Alta + snapshot vigente | hecho | create en transacción escribe `startup_snapshot` con `validTo` null |
| Dominio parecido | hecho | mismo `domain` → 409 + `candidates` en problem+json; no es unique index |
| Force admin / founder | hecho | `?force=true` solo super admin → 201; no-admin → 403 y no crea |
| Founder ownership | hecho | edita la suya → 200; ajena (mismo tenant) → **404**; `ownerUserId` del actor al create |
| Visibilidad private | hecho | default `INCUBATOR`; `PRIVATE` otro tenant → 404 get / ausente en list (filtro en query) |
| Receta institutions | hecho | Zod `.strict()`, envelope, If-Match, AuditModule + interceptor, trash/restore/purge |
| Soft delete / uniques | hecho | Startup ya en `SOFT_DELETE_MODELS`; sin `@@unique`; unique parcial name×incubator intacta |
| OpenAPI | hecho | controller en `openapi-check.ts` y `public-routes.spec.ts` |

Migración: `20260929081701_startup_domain_visibility_snapshot` (`domain`, `visibility`, `startup_snapshot`).

El subagente reportó **363** tests, lint 0 errores, `openapi:check` (41 paths) y `db:check-uniques` ok. El padre todavía no cierra el checkpoint: `POST /api/v1/startups` en vivo respondió **409** `P2003`.

## Hecho en paralelo (`T4.9` / `T4.10` / `T4.13` / `T4.15`)

| Pieza | Estado | Notas |
|-------|--------|-------|
| Hardening | hecho | helmet, `x-powered-by` off, `trust proxy` = 1, CORS allow-list, JSON 1 MB fuera de `/api/auth` |
| Logs | hecho | `RequestLoggingInterceptor` global; redacta password, token, authorization y cookie |
| Idempotencia | hecho | store Redis TTL 24 h, key con user id; opt-in `@RequireIdempotency()` |
| Object storage | hecho | `ObjectStorage` put / signedGet / delete sobre MinIO; bucket desde config |

Verificación del padre en T4.9: spec 9/9. En vivo: health `{status:ok}` sin `x-powered-by`; origen `http://localhost:3000` con ACAO exacto; origen ajeno sin ACAO.

Gaps aceptados: sin T6.7 (cerrar/abrir snapshot al rename, overlap, PATCH cerrado, rollback). Sin resto de T3.6 (cluster ve public, audit diff de visibility). Sin T6.8+ / T6.10 / T2.8.

## Hecho en T6.5 (`frameworks` / stages / milestones / metric-defs)

| Pieza | Estado | Notas |
|-------|--------|-------|
| Publicado inmutable | hecho | PATCH de framework `PUBLISHED` → 409; clonar a nueva major |
| Clone v2 DRAFT | hecho | `POST /:id/clone` (cluster_admin / super admin) → 201; v1 intacta; copia stages/milestones/metricDefs |
| Orden de etapas | hecho | `sortOrder` contiguo 1..n sin huecos ni duplicados → 422 |
| Incubadora → draft | hecho | `Incubator.frameworkId` solo si framework `PUBLISHED` → 422 |
| Soft delete | hecho | Framework, FrameworkStage, Milestone, MetricDef en `SOFT_DELETE_MODELS` + check-uniques |
| Unique parcial | hecho | `(name, major_version)`, `(framework_id, sort_order)`, `(stage_id, sort_order)`, `(framework_id, key)` |
| HTTP | hecho | list/get/create/update/delete/restore/trash/purge + stages/publish/clone; estilo institutions |
| Permisos | hecho | recurso `framework`; publish/clone solo cluster_admin/super admin; director lee publicados |
| OpenAPI | hecho | controller en `openapi-check.ts` y `public-routes.spec.ts` |

Migración: `20260929080639_framework_milestone_metric_incubator` (`milestone`, `metric_def`, `incubator.framework_id` + índices parciales).

Verificación del padre: **333** tests, lint 0 errores, `openapi:check` (38 paths) y `db:check-uniques` ok. El API arrancó con `FrameworksModule`. En vivo: PATCH publicado 409, clone 201 DRAFT major 2 con v1 intacta, hueco de `sortOrder` 422, incubadora con framework DRAFT 422.

Gaps aceptados: sin HTTP CRUD de milestones/metric-defs (schema + soft-delete + copia en clone). Publish/clone solo `cluster_admin` o super admin.

## Hecho en T6.4 (`users` / `memberships`)

| Pieza | Estado | Notas |
|-------|--------|-------|
| Invite nuevo email | hecho | `signUpEmail` (password random no logueado) + membership + token |
| Invite existente | hecho | no duplica user; sí agrega membership |
| Escalada | hecho | director → `cluster_admin` = 403; incubadora ajena = **404** |
| Último director | hecho | soft-delete del único director activo → 409 |
| Invitación vencida | hecho | `expiresAt` pasado → 410 Gone en accept |
| Token ajeno | hecho | token de otra invitación → 403; no acepta |
| HTTP | hecho | `/api/v1/memberships` (list/get/invite/accept/delete) + `/api/v1/users` (list/get) |
| Permisos | hecho | recurso `user` en matriz; membership cells existentes; controllers protected |
| OpenAPI | hecho | controllers en `openapi-check.ts`; 30 paths |

Migración: `20260929075028_membership_invitation` (`membership_invitation`).

Verificación del padre: **308** tests, lint 0 errores, `openapi:check` (30 paths) y `db:check-uniques` ok. El arranque fallaba porque `MembershipModule` no importaba `AuditModule`; ya importa. En vivo: invite nuevo 201 con token, segundo invite del mismo email reutiliza el user.

## Hecho en T6.3 (`incubators`)

| Pieza | Estado | Notas |
|-------|--------|-------|
| Soft delete | hecho | `Incubator` ya en `SOFT_DELETE_MODELS` + `check-no-prisma-unique`; sin `@@unique` |
| Unique parcial | hecho | `slug WHERE deleted_at IS NULL` (desde T3); recreate tras soft-delete → 201 |
| Lat/lng | hecho | `latitude`/`longitude` opcionales; Zod -90..90 / -180..180; lat 120 → 400 |
| CRUD + map | hecho | list/get/create/update/delete/restore/trash/purge + `GET /map` GeoJSON FeatureCollection |
| Delete guard | hecho | tabla mínima `incubation` (id, incubatorId, status); delete con `active` → 409 |
| Scope IDOR | hecho | director edita su `scopeId` → 200; otra incubadora → **404** (no 403); no en `TENANT_MODELS` |
| Permisos | hecho | recurso `incubator` en matriz; purge solo super admin; sin `@RequiresTenant()` |
| Envelope / audit / If-Match | hecho | estilo institutions; mapa sin envelope (FeatureCollection crudo) |

Migración: `20260929074238_incubator_lat_lng_incubation` (`latitude`/`longitude` + `incubation`).

Verificación del padre: **289** tests, lint 0 errores, `openapi:check` (24 paths, incluye incubators) y `db:check-uniques` ok. En vivo: lat 120 → 400, create 201, mapa `FeatureCollection`.

## Hecho en T6.1 (`geo-units`)

| Pieza | Estado | Notas |
|-------|--------|-------|
| Soft delete | hecho | `GeoUnit` en `SOFT_DELETE_MODELS` + `check-no-prisma-unique`; sin `@@unique` |
| Unique parcial | hecho | `(level, code) WHERE deleted_at IS NULL` |
| CRUD + children | hecho | list/get/children/create/update/delete/restore/trash/purge; envelope `toList`/`toResource` |
| Jerarquía | hecho | COUNTRY sin parent; STATE→COUNTRY; MUNICIPALITY→STATE; skip de nivel → 422; ciclo self/descendant → 422 |
| Permisos | hecho | list/read para roles autenticados; create/update/delete/restore/purge solo via `isSuperAdmin` bypass (director sin delete) |
| Global | hecho | sin `@RequiresTenant()`; en `GLOBAL_RESOURCES`; controller protected en `public-routes.spec.ts` |
| Seed | reutilizado | México + 2 estados + 2 municipios Puebla |

Migración: `20260929073800_geo_unit_partial_unique`.

Verificación del padre: **254** tests, lint 0 errores, `openapi:check` y `db:check-uniques` ok. En vivo: sin cookie 401, admin lista México, hijos `CDMX` y `PUE`, municipio colgando del país 422.

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

T6.7 snapshots lifecycle (cerrar/abrir al rename, overlap, PATCH cerrado, rollback). No implementar T3.6 completo ni T2.8.

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

T2.8, T3.6 hasta decidir, T4.9–T4.10, T4.13, T4.15, T6.5–T6.18, T7.2, T7.4, T8.

## Cómo retomar

1. Leer este archivo.
2. Copiar la receta de `institutions` / `incubators` / `memberships` al siguiente recurso (T6.5).
3. No correr `nest new`. No mover `/api/auth` ni `GET /api/v1/health`.
4. No commitear `.env`.
5. `createdById` sigue siendo `String` (id de Better Auth), no UUID.
