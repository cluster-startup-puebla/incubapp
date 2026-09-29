# IncubApp — Plan de backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API REST en `/api/v1/[resource]` con identidad en Better Auth, RBAC propio por membresía, soft delete y un contrato testeado más allá del happy path.

**Architecture:** NestJS y Next.js son apps hermanas. Better Auth queda en `/api/auth` (fuera del prefijo versionado) y el cliente de Next le pega directo. Los recursos de negocio viven en `/api/v1`. Una sola extensión de Prisma aplica soft delete, auditoría y tenant. Los errores RFC 7807 cubren `/api/v1`; `/api/auth` conserva el JSON de Better Auth.

**Tech Stack:** NestJS 11, Prisma 7 + adapter `pg`, Postgres 17, Better Auth 1.7, `@thallesp/nestjs-better-auth`, Scalar, Zod, Redis 7, MinIO, Mailpit, npm, TypeScript strict.

**Estado del repo (no re-scaffold):** `api/` ya arranca con health, Prisma, Better Auth, Scalar, Mailpit y MinIO. `web/` ya consume `GET /api/v1/health` y hace login/registro contra `/api/auth`. Este plan parte de ahí.

**Leyenda:** ✅ happy path · ⚠️ corner case · 🔒 seguridad.

**Regla de una tarea:** un PR, un commit, tests unitarios en verde, AC verificable. No se da por cerrada si solo pasa el happy path.

---

## Decisiones fijadas

| # | Decisión | Elección |
|---|----------|----------|
| D1 | Identidad | Better Auth, cookie httpOnly. Solo identidad. RBAC en `membership`. Sin plugin `admin` ni `organization`. |
| D2 | Super admin | Campo `isSuperAdmin` en `user`. El seed entra por `auth.api.signUpEmail`, no por insert crudo. |
| D3 | Validación + OpenAPI | `nestjs-zod`: un schema valida y documenta Scalar. Verificar la API vigente antes de instalar. |
| D4 | IDs | Modelos de negocio: UUID v7. `user` / `session` / `account` / `verification`: id string de Better Auth. `createdById` y compañía son `String`, FK a `user.id`. |
| D5 | Soft delete | `deletedAt` + **una** extensión de Prisma. Hard delete solo en purga de super admin. |
| D6 | Multi-tenancy | Scoping en la misma extensión + `TenantContext`. RLS de Postgres en la etapa 8, dentro de la transacción del request. |
| D7 | Paginación | Offset (`page`, `pageSize` máx 100) con `total` en listas chicas. Cursor sin `count` en audit y metric readings. |
| D8 | Errores | RFC 7807 solo en `/api/v1`. Auth no se reescribe a problem+json. |
| D9 | Concurrencia | `version` + `If-Match` en recursos editables por varias personas. |
| D10 | Nombres DB | `snake_case` con `@map`. Modelos `PascalCase`. |
| D11 | Prefijos | `GET /api/v1/health` se queda. Auth en `/api/auth`. Scalar en `/reference`. OpenAPI en `/openapi.json`. |
| D12 | Cookies | `sameSite=lax`, `secure` solo con HTTPS. Producción: `web` y `api` bajo el mismo sitio (`app.` y `api.`). Dominios distintos exigen `SameSite=None; Secure` y se tratan como cambio de D12, no como default. |
| D13 | Storage | MinIO se queda. Evidencia de hitos pasa por un puerto `ObjectStorage`, no por el controller. |
| D14 | Package manager | npm. No migrar a pnpm en este plan. |

---

## Fuera de este corte

Competiciones completas, jueces, premios, pivots, benchmarks con k-anonimato, purga masiva, k6 y RLS no bloquean el POC. Quedan especificados para no reinventarlos, y cada uno dice si es POC o después.

---

## T0 — Alinear el repo

### T0.1 Tooling sobre el Nest que ya existe

- [x] **No** correr `nest new`. Agregar en `api/`: ESLint ya presente, Prettier ya presente, husky + lint-staged + commitlint en la **raíz** del git (los dos paquetes son hermanos).

**Archivos**

- Create: `.husky/pre-commit`, `commitlint.config.js`, `lint-staged` en el `package.json` de la raíz
- Modify: `api/package.json` scripts `lint` y `test`

**Tests**

| Caso | Tipo | Qué se prueba | Esperado |
|------|------|----------------|----------|
| `build limpio` | ✅ | `npm run build` en `api/` | exit 0 |
| `lint limpio` | ✅ | `npm run lint` | exit 0 |
| `unit limpio` | ✅ | `npm test` | exit 0, incluye el spec de health |
| `pre-commit sucio` | ⚠️ | staged file con formato roto | el hook rechaza el commit |

**AC:** un commit con formato inválido no entra. Los scripts actuales de health siguen verdes.

### T0.2 Config tipada

- [x] Sustituir lecturas sueltas por `ConfigModule` global + schema Zod.

**Archivos**

- Create: `api/src/config/env.schema.ts`, `api/src/config/env.schema.spec.ts`
- Modify: `api/src/app.module.ts`, `api/src/env.ts`, `api/.env.example`
- Env nuevo: `REDIS_URL`, `CORS_ORIGINS` (lista; reemplaza el uso suelto de un solo origen en código nuevo). `WEB_ORIGIN` se lee como primer origen hasta migrar el cliente.

**Tests** (`env.schema.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `parsea env valido` | ✅ | fixture completo | objeto tipado |
| `falta DATABASE_URL` | ⚠️ | sin esa clave | throw con el nombre de la variable |
| `secret corto` | ⚠️ | `BETTER_AUTH_SECRET` de 10 chars | throw, no arranca |
| `PORT no numerico` | ⚠️ | `PORT=abc` | throw |
| `CORS_ORIGINS vacio` | ⚠️ | string vacío | throw |
| `example sin secretos` | 🔒 | leer `.env.example` | no contiene el secret real del `.env`; `.env` está en `.gitignore` |

**AC:** proceso con env inválido sale al boot. No hay default silencioso para el secret.

### T0.3 Health de liveness y readiness

- [x] Conservar `GET /api/v1/health` (lo usa `web`). Agregar chequeo de Redis en readiness sin mover la ruta pública.

**Archivos**

- Modify: `api/src/health/health.controller.ts`, `api/src/health/health.controller.spec.ts`
- Create: `api/src/health/health.service.ts`, `api/src/health/health.service.spec.ts`

**Tests** (`health.service.spec.ts`, mocks de Prisma y Redis)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `liveness` | ✅ | sin dependencias | `{ status: 'ok' }` |
| `ready con db y redis` | ✅ | ambos responden | `{ status: 'ok', postgres: 'up', redis: 'up' }` |
| `postgres caido` | ⚠️ | query rechazada | error de no disponible, redis no se llama en falso positivo |
| `redis caido` | ⚠️ | ping rechazado | no disponible aunque postgres esté up |
| `ruta sin auth` | 🔒 | metadata `@AllowAnonymous` | el guard no exige sesión (test del reflector, no e2e) |

**AC:** `GET /api/v1/health` sigue 200 sin cookie. Readiness falla si Postgres o Redis no responden. La landing de `web` no cambia de URL.

### T0.4 Compose: Redis, sin bajar Postgres

- [x] Agregar `redis:7` a `api/docker-compose.yml`. Dejar Postgres 17 en el host `5433`, Mailpit `1026/8026`, MinIO `9000/9001`.

**Tests**

| Caso | Tipo | Qué se prueba | Esperado |
|------|------|----------------|----------|
| `compose config` | ✅ | `docker compose config` | servicios `postgres`, `redis`, `minio`, `mailpit` |
| `redis ping` | ✅ | contenedor arriba | `PONG` |
| `puertos documentados` | ⚠️ | README | no dice 5432 ni 8025 como default de esta máquina |

**AC:** un dev con el README levanta infra y `npm run start:dev` sin chocar con un Postgres local en 5432.

### T0.5 Harness de unit tests

- [x] Helpers de unit, no Testcontainers todavía. Testcontainers entra cuando exista el primer e2e de recurso (T5), no como puerta de T0.

**Archivos**

- Create: `api/src/testing/prisma-mock.ts`, `api/src/testing/request-context.ts`

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `mock aisla` | ✅ | dos specs usan el mock | no comparten estado |
| `contexto por async` | ⚠️ | dos `AsyncLocalStorage.run` anidados | cada uno ve su `userId` |

**AC:** `npm test` no abre sockets a Postgres.

### T0.6 CI mínimo

- [x] GitHub Actions: install, lint, typecheck, unit. `prisma migrate diff` contra el historial, sin drift. `npm audit` informativo al inicio (no bloquea hasta T8.3).

**AC:** el workflow falla si lint, tipos, unit o el diff de migraciones fallan.

---

## T1 — Prisma, soft delete y auditoría

### T1.1 Convención de columnas de negocio

- [x] Mixin documentado y aplicado solo a modelos de negocio. **No** se lo pongas a `session`, `account`, `verification`.

Campos: `id` UUID v7, `createdAt`, `updatedAt`, `deletedAt?`, `createdById?`, `updatedById?`, `deletedById?`, `version Int @default(1)`.

**Archivos**

- Create: `api/prisma/models/README` no. En su lugar `api/src/prisma/conventions.spec.ts` que lee el DMMF generado.
- Modify: `api/prisma/schema.prisma` cuando exista el primer modelo de negocio (T3 / T6). Este task deja el spec en rojo hasta ese modelo, o lo marca skip con un fixture. Preferible: el spec corre contra un modelo `Institution` mínimo introducido aquí como tabla vacía de convención.

**Tests** (`conventions.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `modelo de negocio completo` | ✅ | DMMF de `Institution` | tiene los 8 campos y `@@map` snake_case |
| `auth sin mixin` | ⚠️ | DMMF de `Session` | no tiene `deletedAt` ni `version` |
| `createdBy es string` | 🔒 | tipo de `createdById` | `String`, no `Uuid` suelto incompatible con `user.id` |

**AC:** el spec falla si un modelo marcado `@business` (comentario convenido o lista en el spec) pierde un campo.

### T1.2 Modelos Better Auth + `isSuperAdmin`

- [x] Campo `isSuperAdmin Boolean @default(false) @map("is_super_admin")` en `User`. Regenerar con `npx auth@latest generate -y` y revisar el diff a mano para no perder `output` del generator ni el campo propio.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `migrate desde cero` | ✅ | base vacía | tablas `user`, `session`, `account`, `verification` |
| `regenerar` | ⚠️ | segunda corrida del CLI | diff vacío después de reaplicar `isSuperAdmin` si el CLI lo borra |
| `email unique global` | ⚠️ | schema | `user.email` sigue `@@unique`. No es índice parcial. Un email no se reutiliza aunque el usuario se desactive |

**AC:** `prisma migrate reset` + generate deja el client compilando.

### T1.3 PrismaService

- [x] Connect en `onModuleInit`, disconnect en destroy, log de queries > 500 ms solo si `NODE_ENV=development`.

**Archivos:** `api/src/prisma/prisma.service.ts`, `prisma.service.spec.ts`

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `conecta` | ✅ | `$connect` resuelve | no throw |
| `desconecta` | ✅ | destroy | `$disconnect` llamado una vez |
| `db caida` | ⚠️ | `$connect` rechaza | el error menciona Postgres, no un 500 genérico más tarde |
| `query lenta` | ⚠️ | evento > 500 ms en dev | se registra; en test el logger es mock |

**AC:** fallar al conectar aborta el boot.

### T1.4 Una extensión: soft delete

- [x] Un solo `$extends` en `api/src/prisma/soft-delete.extension.ts`. Modelos opt-in vía lista `SOFT_DELETE_MODELS`.

Comportamiento:

- `findMany`, `findFirst`, `count`, `aggregate`, `groupBy`: `deletedAt: null` si el caller no lo fijó.
- `findUnique`: se reescribe a `findFirst` con el mismo where + `deletedAt: null`.
- `delete` → `update` con `deletedAt` y `deletedById`.
- `deleteMany` → `updateMany`.
- `update` / `updateMany` / `upsert` sobre fila borrada no resucitan.
- `createMany` no acepta `deletedAt` desde el caller.
- `$queryRaw` no pasa por la extensión: prohibido en servicios de negocio (lint de import o spec de revisión). El plan no finge que el raw queda filtrado.

**Tests** (`soft-delete.extension.spec.ts`, contra Postgres de test o contra el query args capturado si el adapter no está)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `list oculta borrados` | ✅ | 1 activo + 1 con `deletedAt` | `findMany` where incluye `deletedAt: null` y el resultado no trae el borrado |
| `get borrado` | ✅ | id borrado | `null` / not found, no la fila |
| `delete es update` | ✅ | `delete({ id })` | args de `update` con `deletedAt` seteado, ningún `DELETE` SQL |
| `restore` | ✅ | `restore(id)` | `deletedAt: null` y vuelve a listarse |
| `deleteMany no fisico` | ⚠️ | `deleteMany` | `updateMany`, count de filas físicas igual |
| `withDeleted` | ⚠️ | opt-in | el where no fuerza `deletedAt: null` |
| `onlyDeleted` | ⚠️ | opt-in | `deletedAt: { not: null }` |
| `segundo delete` | ⚠️ | id ya borrado | not found, no 500 |
| `update de borrado` | ⚠️ | `update` del id borrado | not found |
| `upsert de borrado` | ⚠️ | `upsert` donde el match está borrado | no limpia `deletedAt` por el camino update |
| `include de hijos` | ⚠️ | padre activo, hijo borrado | el include lleva `where: { deletedAt: null }` |
| `createMany con deletedAt` | 🔒 | data trae `deletedAt` | el campo se strippea o el call falla |

**AC:** un query de modelo opt-in no devuelve borrados salvo `withDeleted` u `onlyDeleted`.

### T1.5 Unicidad con soft delete

- [x] Índices únicos parciales `WHERE deleted_at IS NULL` en SQL crudo. Prohibido `@@unique` de Prisma en campos de modelos con soft delete.

**Tests** (`partial-unique.spec.ts` + script `api/prisma/check-no-prisma-unique.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `recrear slug` | ✅ | crear, borrar, crear mismo slug | el segundo create pasa |
| `dos activos` | ⚠️ | dos activos mismo slug | error de unicidad mapeable a 409 |
| `lint de schema` | 🔒 | modelo soft-delete con `@@unique` | el script exit 1 |

**AC:** el script corre en CI junto al migrate diff.

### T1.6 Auditoría en la misma extensión

- [x] `createdById` / `updatedById` / `deletedById` salen de `RequestContext` (AsyncLocalStorage). No es una segunda extensión.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `create guarda actor` | ✅ | contexto `user-a` | data incluye `createdById: user-a` |
| `update guarda actor` | ✅ | contexto `user-a` | `updatedById: user-a`, no pisa `createdById` |
| `sin usuario` | ⚠️ | contexto vacío (seed) | campos `null`, no throw |
| `no se cruzan` | ⚠️ | dos contextos concurrentes | cada write lleva su user |

**AC:** el spec de concurrencia usa `Promise.all` de dos `run()` y assert de ids distintos.

### T1.7 Seed idempotente

- [x] Super admin vía Better Auth API. Geo de México: país, estados, municipios de Puebla. Framework v1 publicado mínimo.

**Tests** (`seed.spec.ts`, DB de test)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `segunda corrida` | ✅ | `seed()` dos veces | mismos ids, count estable |
| `sin env de admin` | ⚠️ | sin email/password de seed | no inserta usuario y el resultado trae warning |
| `password usable` | 🔒 | login del admin sembrado | Better Auth acepta la contraseña (no es un hash inventado) |

**AC:** el admin puede `signIn.email` después del seed.

---

## T2 — Autenticación

### T2.1 Config de Better Auth

- [ ] Endurecer `api/src/auth.ts`: password mínima 10, `requireEmailVerification: true`, sesión 7 días, `trustedOrigins` desde `CORS_ORIGINS`, cookies `httpOnly`. `secure` según URL https. Rate limit de Better Auth apunta a Redis cuando T0.4 exista; hasta entonces el spec documenta el storage.

**Archivos:** `api/src/auth.ts`, `api/src/auth.config.spec.ts` (inspecciona el objeto de opciones exportado, sin levantar HTTP)

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `password corta` | ⚠️ | 9 chars en el validador configurado | rechazada |
| `password de 10` | ✅ | 10 chars | aceptada por la regla |
| `verificacion requerida` | ✅ | options | `requireEmailVerification === true` |
| `origenes` | ✅ | env con dos orígenes | `trustedOrigins` tiene ambos |
| `cookie prod` | 🔒 | `BETTER_AUTH_URL` https | `useSecureCookies` true y `sameSite` lax |
| `cookie local` | ⚠️ | URL http | `secure` false, para no romper localhost |

**AC:** el cliente de `web` sigue usando `baseURL` del API sin path extra. Cambiar `basePath` no es parte de esta tarea.

### T2.2 Montaje ya existente

- [ ] No mover el handler. Verificar con tests que el body parser global está apagado y que el módulo reinyecta JSON fuera de auth.

**Tests** (unit del bootstrap, supertest liviano en `configure-app` si hace falta un e2e chico)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `auth montado` | ✅ | log o router | base path `/api/auth` |
| `json en recurso` | ✅ | POST futuro con JSON | el parser corre |
| `preflight` | ⚠️ | `OPTIONS` con `Origin` permitido | 204 y `Access-Control-Allow-Credentials: true` |
| `origen ajeno` | 🔒 | `Origin: https://evil.test` | sin `Access-Control-Allow-Origin` reflejado |

**AC:** `web` login actual sigue funcionando en http://localhost:3000 → http://localhost:3001.

### T2.3 Guard global deny by default

- [ ] El `AuthGuard` de `@thallesp/nestjs-better-auth` ya es global. Fijar `@AllowAnonymous()` solo en health, y dejar auth fuera de los controllers Nest. Agregar un spec que lee metadata de cada controller.

**Archivos:** `api/src/auth/public-routes.spec.ts`

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `health anonimo` | ✅ | reflector de `HealthController` | `@AllowAnonymous` |
| `controller nuevo sin decorator` | 🔒 | fixture de controller sin marca | el spec de inventario lo lista como protegido |
| `cookie ausente` | ⚠️ | guard con request sin sesión | 401 |
| `cookie expirada` | ⚠️ | sesión `expiresAt` pasado | 401 |
| `isSuperAdmin false no es ban` | ⚠️ | usuario normal | no 403 por “baneado”; ese caso no existe sin plugin admin |

**AC:** el spec de inventario falla si aparece un controller sin `@AllowAnonymous` ni guard. Olvidar el decorator deja la ruta cerrada, no abierta.

### T2.4 Contexto de request

- [ ] `@CurrentUser()` y población de `RequestContext` en interceptor, después del guard.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `usuario correcto` | ✅ | sesión de `user-a` | decorator devuelve `user-a` |
| `ruta publica` | ⚠️ | sin sesión y `@AllowAnonymous` | `undefined`, no throw |
| `als aislado` | ⚠️ | dos requests simulados | no comparten user |

**AC:** T1.6 lee este mismo contexto. No hay un segundo ALS.

### T2.5 Verificación de email y reset

- [ ] `MailerService` con plantilla mínima. Tokens los emite Better Auth. Mailpit en local.

**Archivos:** `api/src/mail/mailer.service.ts`, `mailer.service.spec.ts`. El adapter SMTP es el que ya está en `send-mail.ts`.

**Tests** (el servicio se prueba con un transport fake; el token, con las funciones de Better Auth mockeadas o con la DB de test)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `envia verificacion` | ✅ | sign up | `sendMail` llamado al email, asunto de verificación |
| `envia reset` | ✅ | email existente | mail con URL |
| `token expirado` | ⚠️ | `expiresAt` en el pasado | error, usuario no verificado / password igual |
| `token usado` | ⚠️ | segundo consume | error |
| `email inexistente en reset` | 🔒 | email que no está | misma respuesta pública que el email existente; el mailer no se llama |

**AC:** Mailpit muestra el correo en el flujo manual. El unit no abre Mailpit.

### T2.6 Sesiones

- [ ] Listar, revocar una, revocar todas, cambiar password revoca las demás. Endpoints bajo `/api/v1/sessions` (recurso nuestro) que llaman a la API de Better Auth. No reimplementar el almacén de sesiones.

**Tests** (`sessions.service.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `lista las propias` | ✅ | dos sesiones del user | ambas |
| `revoca una` | ✅ | id propio | esa sesión deja de resolver |
| `revoca ajena` | 🔒 | id de otro user | not found, la ajena sigue viva |
| `cambio de password` | ⚠️ | sesión actual + otra | la otra queda inválida; la actual sigue |

**AC:** revocar es inmediato: el siguiente `getSession` de esa cookie falla.

### T2.7 Rate limit de auth

- [ ] 5 intentos / 15 min por IP + email en login, registro y reset. Respuesta 429 con `Retry-After`. Storage Redis. Mensaje de login idéntico si el email no existe o la password está mal.

**Tests** (`auth-rate-limit.spec.ts`, reloj fake)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `cinco pasan` | ✅ | 5 fallos | el 5.º aún no es 429 |
| `sexto` | ⚠️ | 6.º fallo | 429 y `Retry-After` |
| `ventana` | ⚠️ | avance de 15 min | el contador vuelve a 0 |
| `no enumera` | 🔒 | email ausente vs password mala | mismo status y mismo cuerpo público |
| `otra ip` | 🔒 | misma email, otra ip | contador independiente |

**AC:** el límite no es global del proceso. Dos usuarios no comparten cubeta.

### T2.8 2FA de super admin

- [ ] **Después del POC.** No implementar en el corte de seis semanas. Cuando se haga: TOTP obligatorio solo si `isSuperAdmin`. El unit futuro exige código válido para rutas `@SuperAdmin()` y rechaza el acceso sin TOTP aunque la cookie sea válida.

---

## T3 — Autorización y tenant

### T3.1 Membership

- [ ] Modelo `(userId, scopeType, scopeId, role, validFrom, validTo, deletedAt)`. Roles: `cluster_admin`, `coorganizer`, `director`, `staff`, `mentor`, `founder`, `judge`.

**Tests** (`membership.service.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `crear` | ✅ | user + incubator + director | fila activa |
| `duplicado activo` | ⚠️ | mismo user, scope y role | 409 |
| `validTo pasado` | ⚠️ | `validTo` ayer | `isActive` false |
| `soft delete` | ⚠️ | delete | no sale en `listActive` |
| `mismo role tras borrar` | ✅ | borrar y recrear | pasa por el índice parcial |

**AC:** la unicidad es parcial (`deleted_at IS NULL`), no `@@unique` de Prisma.

### T3.2 Tenant del request

- [ ] Header `X-Incubator-Id` opcional. Se valida contra membresías activas. Super admin y `cluster_admin` pueden omitirlo.

**Tests** (`tenant-context.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `header valido` | ✅ | uuid de su incubadora | contexto con ese id |
| `header ajeno` | 🔒 | uuid de otra incubadora | 403 |
| `uuid mal formado` | ⚠️ | `not-a-uuid` | 400 |
| `una sola membresia` | ⚠️ | sin header | tenant implícito |
| `cero membresias` | ⚠️ | user sin filas y sin super admin | 403 |
| `super admin omite` | ✅ | sin header | contexto global, no 403 |

**AC:** un header no miembro nunca setea el ALS.

### T3.3 Matriz de permisos

- [ ] Un archivo `api/src/authz/permissions.ts`: `role → resource:action`. `@RequirePermissions()` + guard.

**Tests** (`permissions.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `director crea startup` | ✅ | permiso `startup:create` | allow |
| `mentor borra` | ⚠️ | `startup:delete` | deny |
| `founder edita ajena` | 🔒 | policy de dueño | deny aunque el rol tenga `startup:update` en abstracto |
| `matriz completa` | 🔒 | tabla rol × acción | cada celda tiene esperado explícito; una celda nueva sin esperado falla el spec |

**AC:** la matriz es el único lugar donde se agregan permisos. El guard no tiene `if (role === 'director')` sueltos.

### T3.4 Scoping en la misma extensión

- [ ] Modelos en `TENANT_MODELS` reciben `incubatorId` del contexto en reads y writes. Un `incubatorId` del body se ignora.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `list del tenant` | ✅ | contexto A | where incluye `incubatorId: A` |
| `create fuerza tenant` | 🔒 | body con `incubatorId: B` | data persistida usa A |
| `id de otro tenant` | 🔒 | `findFirst` id de B bajo contexto A | where trae A + id, resultado vacío (404 en el service, no 403) |

**AC:** el 404 no confirma que el id exista en B.

### T3.5 Suite anti-IDOR

- [ ] Registro `TENANT_RESOURCES`. Un spec parametrizado genera casos GET/PATCH/DELETE de A contra id de B.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `cada recurso` | 🔒 | lista registrada | todos devuelven not found |
| `list no mezcla` | 🔒 | datos en A y B | el list de A no contiene ids de B |
| `recurso nuevo` | ⚠️ | se agrega a `TENANT_MODELS` y no al registro de la suite | el spec falla |

**AC:** no hay forma de agregar un modelo tenant sin entrar a la suite.

### T3.6 Visibilidad

- [ ] Campo `visibility` (`private | incubator | cluster | public`) en startup. El clúster ve `cluster` y `public`. `private` solo el tenant dueño y super admin.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `cluster ve publico` | ✅ | visibility `cluster` | incluido |
| `cluster no ve private` | 🔒 | visibility `private` | excluido |
| `cambio auditado` | ⚠️ | patch de visibility | el diff trae antes/después |

**AC:** el filtro vive en el query, no se filtra en memoria después de traer todo.

---

## T4 — Infra transversal

### T4.1 Validación Zod global

- [ ] Pipe global, objects `strict`, query con coerción explícita.

**Tests** (`zod-validation.pipe.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `payload valido` | ✅ | dto completo | parsed |
| `campo extra` | ⚠️ | `{ extra: 1 }` | 400 |
| `tipo mal` | ⚠️ | `page: 'no'` | 400 con path del campo |
| `solo espacios` | ⚠️ | `name: '   '` | 400 |
| `body vacio` | ⚠️ | `{}` cuando hay requeridos | 400 |
| `mass assignment` | 🔒 | `id`, `deletedAt`, `createdById`, `incubatorId` en el body | el schema los rechaza (no están en el input) |

**AC:** ningún DTO de escritura incluye esos cuatro campos.

### T4.2 Filtro RFC 7807

- [ ] `{ type, title, status, detail, instance, requestId, errors? }`. Mapa Prisma: `P2002→409`, `P2025→404`, `P2003→409`, `P2034→409`.

**Tests** (`problem-details.filter.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `404` | ✅ | `NotFoundException` | `application/problem+json` y status 404 |
| `P2002` | ⚠️ | error Prisma unique | 409 |
| `P2025` | ⚠️ | record not found | 404 |
| `no controlado` | ⚠️ | `Error('sql secret')` | 500, body sin `secret`, sin stack |
| `requestId` | ✅ | header ausente | se genera y vuelve en el body |
| `prod` | 🔒 | `NODE_ENV=production` | `detail` genérico en 500 |

**AC:** un test busca en el body las palabras `select`, `prisma`, `stack`. No aparecen en 500.

### T4.3 Envelope

- [ ] Listas `{ data, meta }`. Recurso `{ data }`. Delete `204` sin body.

**Tests** de un helper `toList` / `toResource`, no de un controller todavía.

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `lista` | ✅ | 2 filas, page 1 | `meta.total` y `data.length` |
| `uno` | ✅ | entidad | `{ data: entidad }` |
| `delete` | ✅ | helper de status | 204 |

**AC:** los services devuelven el dominio; el envelope lo arma el interceptor. No se duplica en cada controller.

### T4.4 Paginación

- [ ] `page >= 1` default 1. `pageSize` 1–100 default 20. Cursor aparte, sin count.

**Tests** (`pagination.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `pagina 1 y 2` | ✅ | 25 filas, size 20 | sin ids repetidos |
| `total sin borrados` | ✅ | 3 activos, 2 borrados | `total === 3` |
| `pagina de mas` | ⚠️ | page 99 | `data: []`, no error |
| `pageSize 0, 101, -1, abc` | ⚠️ | cada uno | 400 |
| `orden estable` | ⚠️ | empate de `createdAt` | desempate por `id` |
| `cursor invalido` | ⚠️ | cursor basura | 400 |
| `cursor sin count` | ✅ | modo cursor | la respuesta no trae `total` |

**AC:** audit y metric readings no usan el helper de offset.

### T4.5 Orden

- [ ] `sort=-createdAt,name` con whitelist por recurso.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `desc y asc` | ✅ | `-createdAt,name` | orderBy correcto |
| `fuera de lista` | ⚠️ | `sort=password` | 400 |
| `relacion arbitraria` | 🔒 | `sort=user.email` | 400 |

**AC:** la whitelist es un array por recurso, default `createdAt` desc.

### T4.6 Filtros

- [ ] `filter[field]`, `filter[field][gte]`, `filter[field][in]`. Whitelist de campo y operador.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `igualdad` | ✅ | `filter[status]=active` | where |
| `combinado` | ✅ | status + gte | AND |
| `operador raro` | ⚠️ | `filter[name][regex]` | 400 |
| `fecha mala` | ⚠️ | `gte=ayer` | 400 |
| `in enorme` | ⚠️ | 201 valores | 400 |
| `inyeccion` | 🔒 | `filter[name]=x' OR 1=1` | el valor viaja como parámetro, no se parte el where |

**AC:** el spec asserta el objeto Prisma, no un string SQL concatenado.

### T4.7 Búsqueda

- [ ] `q` mínimo 2. Escapa `%` y `_`. Índice `pg_trgm` con wrapper `IMMUTABLE` de `unaccent` (la función stock es `STABLE` y no se puede indexar directo).

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `parcial` | ✅ | `q=inc` sobre "Incubadora" | match |
| `vacio` | ⚠️ | `q=` | sin cláusula de búsqueda |
| `un caracter` | ⚠️ | `q=a` | 400 |
| `comodin` | 🔒 | `q=%` | no equivale a "todo"; el `%` va escapado |
| `con filtro y page` | ⚠️ | q + filter + page 2 | las tres cláusulas conviven |
| `borra excluido` | ⚠️ | match borrado | no sale |

**AC:** la migración crea el wrapper immutable y el índice GIN. El unit del escape no necesita EXPLAIN; el EXPLAIN de 100k queda como prueba manual de T8.4.

### T4.8 Rate limit general

- [ ] Throttler con storage Redis (paquete de storage vigente; no asumir que `@nestjs/throttler` trae Redis). Default 100/min por usuario, o por IP si anónimo. Escrituras 30/min. Búsqueda 60/min. Health sin límite.

**Tests** (storage en memoria fake con la misma interfaz)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `bajo el limite` | ✅ | 10 requests | pasan |
| `excede` | ⚠️ | 31 writes | 429 y `Retry-After` |
| `por usuario` | ⚠️ | user A al límite, user B en 1 | B pasa |
| `redis caido` | ⚠️ | storage throw | fail-open y un log de alerta, no 500 a cada request |
| `xff falso` | 🔒 | `X-Forwarded-For` con `trust proxy` apagado | la IP usada es la del socket |

**AC:** health tiene `@SkipThrottle`. El comportamiento fail-open está en el spec, no en un comentario.

### T4.9 Hardening HTTP

- [ ] Helmet, CORS con lista exacta, body 1 MB, `x-powered-by` off, `trust proxy` explícito.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `origen permitido` | ✅ | origen de la lista | ACAO exacto, credentials true |
| `origen prohibido` | 🔒 | otro origen | sin ACAO |
| `body grande` | 🔒 | 1 MB + 1 | 413 |
| `powered by` | ✅ | response | header ausente |

**AC:** la lista de CORS sale del schema de T0.2. No hay `origin: true`.

### T4.10 Logs

- [ ] pino, `requestId`, `userId`, `tenantId`, duración. Redactar `authorization`, `cookie`, `password`, `token`.

**Tests** (`redact.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `linea json` | ✅ | request fake | un objeto con `requestId` y `durationMs` |
| `redacta` | 🔒 | body `{ password, token }` y header cookie | el string logueado no contiene los valores |

**AC:** el spec usa un secret canario `super-secret-value` y falla si aparece en la salida.

### T4.11 Audit log

- [ ] Tabla `audit_log`. Interceptor en POST/PATCH/DELETE/restore. Diff sin campos sensibles.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `patch` | ✅ | cambio de nombre | fila con before/after |
| `fallo` | ⚠️ | el service throw | no hay fila de éxito |
| `sensible` | 🔒 | diff con `password` | esa clave no se persiste |

**AC:** el interceptor escribe después del éxito de la transacción de negocio, no antes.

### T4.12 If-Match

- [ ] `version` coincide, se incrementa. Sin header → 428. Vieja → 409.

**Tests** (`version.spec.ts`)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `version actual` | ✅ | If-Match 3, fila 3 | update y version 4 |
| `version vieja` | ⚠️ | If-Match 2, fila 3 | 409, fila intacta |
| `sin header` | ⚠️ | PATCH sin If-Match | 428 |
| `dos a la vez` | ⚠️ | ambos leen version 3 | uno aplica, el otro 409 |

**AC:** el where del update es `{ id, version }`. No se lee y luego se escribe sin el predicado.

### T4.13 Idempotencia

- [ ] Header `Idempotency-Key` en applications y metric readings. Redis TTL 24 h.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `misma key` | ✅ | dos POST iguales | un insert, misma respuesta |
| `key y body distinto` | ⚠️ | misma key, otro JSON | 422, sin segundo insert |
| `key de otro user` | 🔒 | misma key, otro usuario | no reutiliza la respuesta ajena |

**AC:** la clave de Redis incluye user id, no solo el header.

### T4.14 Scalar

- [ ] Seguir en `/reference` y `/openapi.json`. Cada operación con summary y respuestas 400, 401, 403, 404, 429. En producción, `/reference` exige super admin o se apaga con env.

**Tests**

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `documento` | ✅ | doc generado | paths bajo `/api/v1`, sin `/api/auth` |
| `operacion incompleta` | ⚠️ | operación sin 401 | el spec del documento falla |
| `prod cerrado` | 🔒 | `NODE_ENV=production` sin sesión | `/reference` no es público |

**AC:** CI guarda `openapi.json` y falla si el diff es breaking (path o campo requerido eliminado).

### T4.15 Object storage

- [ ] `ObjectStorage` sobre el `MinioService` que ya existe. Métodos `put`, `signedGet`, `delete`. Ningún controller habla con el SDK de MinIO.

**Tests** (client fake)

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `put` | ✅ | buffer + key | key devuelta en el bucket configurado |
| `key ajena` | 🔒 | key con `../` | rechazada |
| `signed get` | ✅ | key propia | URL con expiración |
| `bucket ausente al boot` | ⚠️ | `bucketExists` false y `makeBucket` ok | el servicio actual sigue creando el bucket |

**AC:** el bucket no se elige desde el request.

---

## T5 — Receta CRUD

Se implementa primero en `institutions` (T6.2) y luego se copia. Un recurso termina solo si pasa R1–R12.

Cada paso tiene unit del service **y** un e2e delgado del HTTP. El unit no levanta Nest completo.

| Paso | Unit que tiene que existir | ✅ | ⚠️ | 🔒 |
|------|----------------------------|----|----|-----|
| R1 Create | `create` | válido → entidad + `Location` en el e2e | falta requerido 400; unique activo 409; FK inexistente 404 | `id` / `deletedAt` / `createdById` / `incubatorId` no entran por el DTO |
| R2 List | `list` | solo activos del tenant | vacío `data: []`; page+filter+q+sort juntos | no filas de otro tenant |
| R3 Get | `get` | 200 | uuid inválido 400; borrado o inexistente 404 | id de otro tenant 404 |
| R4 Update | `update` | solo campos enviados, version +1 | body vacío 400; campo inmutable 400; unique 409; version vieja 409; sin If-Match 428 | no cambia `incubatorId` |
| R5 Delete | `remove` | desaparece de list/get | segundo delete 404; hijos activos 409 | sin permiso 403 |
| R6 Restore | `restore` | vuelve a listarse | ya activo 409; unique ocupado 409 | rol sin permiso 403 |
| R7 Trash | `listDeleted` | solo borrados | — | rol sin permiso 403 |
| R8 Purge | `purge` | borra físico si ya había `deletedAt` | activo directo → 409 | no super admin → 403 |
| R9 Audit | interceptor ya de T4.11 | una fila por escritura | error no deja fila de éxito | diff sin secretos |
| R10 Docs | spec de OpenAPI | summary + errores | falta 401 y el spec falla | `/reference` cerrado en prod |
| R11 IDOR | registro T3.5 | — | recurso no registrado falla CI | GET/PATCH/DELETE cross-tenant 404 |
| R12 Rate | throttler de writes | bajo el límite pasa | 31.ª escritura 429 | la cubeta es del user |

**AC de la receta:** el módulo exporta service, DTOs Zod, policy y `*.spec.ts`. Cobertura del módulo ≥ 85 % cuando el recurso se marque terminado. Sin `any` nuevo y sin `console.log`.

---

## T6 — Recursos

Cada uno aplica la receta. Aquí solo van los tests **extra** de dominio. Si el extra no está, el recurso no cierra aunque el CRUD genérico pase.

### T6.1 `geo-units` — lectura POC, escritura super admin

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `hijos` | ✅ | parent país | estados |
| `ciclo` | ⚠️ | parent = sí mismo o descendiente | 422 |
| `nivel imposible` | ⚠️ | municipio colgando directo de país | 422 |
| `write no admin` | 🔒 | director hace POST | 403 |
| `read anonimo autenticado` | ✅ | cualquier rol con sesión | 200 |

### T6.2 `institutions` — piloto de la receta

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `nombre unico por pais` | ⚠️ | mismo nombre, mismo país, ambos activos | 409 |
| `mismo nombre otro pais` | ✅ | México y otro país | dos filas |
| `borrar con incubadoras` | ⚠️ | institution con incubator activa | 409 |
| `url` | ⚠️ | `notaurl` | 400 |
| `recrear tras delete` | ✅ | mismo nombre tras soft delete | 201 |

### T6.3 `incubators`

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `slug reutilizable` | ✅ | borrar y crear el mismo slug | 201 |
| `slug activo duplicado` | ⚠️ | dos activos | 409 |
| `lat lng` | ⚠️ | lat 120 | 400 |
| `borrar con incubaciones` | ⚠️ | hay una `active` | 409 |
| `director edita la suya` | ✅ | su id | 200 |
| `director edita otra` | 🔒 | otro id | 404 |
| `mapa` | ✅ | dos con coords, una sin | FeatureCollection con 2 features |

### T6.4 `users` y `memberships`

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `invitar email nuevo` | ✅ | email libre | user + membership + token |
| `invitar existente` | ⚠️ | email ya registrado | no duplica user, sí agrega membership |
| `escalada` | 🔒 | director asigna `cluster_admin` | 403 |
| `ultimo director` | ⚠️ | quitar el único director activo | 409 |
| `invitacion vencida` | ⚠️ | `expiresAt` pasado | 410 |
| `token ajeno` | 🔒 | token de otra invitación reusado | 403 o 404, no acepta |

### T6.5 `frameworks`, `stages`, `milestones`, `metric-defs`

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `publicado inmutable` | ⚠️ | PATCH de framework publicado | 409 |
| `nueva version` | ✅ | clonar a v2 draft | 201, v1 intacta |
| `orden de etapas` | ⚠️ | hueco o duplicado de `order` | 422 |
| `incubadora a draft` | ⚠️ | `frameworkId` no publicado | 422 |

### T6.6 `startups`

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `alta` | ✅ | nombre único | 201 y snapshot vigente |
| `parecido` | ⚠️ | mismo dominio | 409 con candidatos |
| `force admin` | ✅ | `?force=true` y super admin | 201 |
| `force founder` | 🔒 | `?force=true` sin ser admin | 403 y no crea |
| `founder edita la suya` | ✅ | su startup | 200 |
| `founder edita otra` | 🔒 | otra | 404 |
| `visibilidad` | 🔒 | `private` visto por otro tenant | 404 en get, ausente en list |

### T6.7 Snapshots

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `cierra y abre` | ✅ | cambio de nombre | transacción: el vigente gana `validTo`, nace otro |
| `dos cambios` | ✅ | dos patches | tres snapshots, contiguos |
| `solape` | ⚠️ | rangos que se pisan | el constraint lo rechaza |
| `pasado` | ⚠️ | PATCH de snapshot con `validTo` | 409 |
| `rollback` | ⚠️ | el segundo insert falla | no queda snapshot huérfano ni vigente cerrado |

**AC:** el service usa una transacción. El spec de rollback mockea el fallo del segundo write.

### T6.8 Pivots — después del POC

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `misma startup` | ⚠️ | snapshot de otra startup | 422 |
| `orden temporal` | ⚠️ | `to` anterior a `from` | 422 |
| `sin cambio` | ⚠️ | snapshots iguales en los campos vigilados | 422 |

### T6.9 Team members

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `rol duplicado activo` | ⚠️ | mismo user y rol vigente | 409 |
| `ultimo founder` | ⚠️ | cerrar al único founder | 409 |
| `equity` | ⚠️ | 101, o suma > 100 | 400 |

### T6.10 Cohorts e incubations — POC

Estados: `applied → active → graduated | dropped`.

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `transicion valida` | ✅ | applied → active | 200 |
| `transicion invalida` | ⚠️ | graduated → active | 409 |
| `dos activas` | ⚠️ | segunda incubación active en la misma incubadora | 409 |
| `fechas` | ⚠️ | `endedOn` < `startedOn` | 400 |
| `exit reason` | ⚠️ | a `dropped` sin motivo | 422 |
| `matriz` | 🔒 | cada par estado × rol | celda sin esperado falla el spec |

### T6.11 Milestone progress — después del POC, salvo el puerto de evidencia

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `etapa futura` | ⚠️ | hito de etapa n+1 con gate abierto | 422 |
| `evidencia` | ⚠️ | `evidenceRequired` sin object key | 422 |
| `score` | ⚠️ | fuera de rúbrica | 400 |
| `key de storage` | 🔒 | key que no pertenece a la startup | 403 |

### T6.12 Metric readings — POC del upsert

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `upsert` | ✅ | mismo startup, metric, period | una fila, valor nuevo |
| `idempotency` | ✅ | misma key | un solo write |
| `negativo` | ⚠️ | métrica que no lo admite | 400 |
| `periodo futuro` | ⚠️ | period > hoy | 400 |
| `verificada` | ⚠️ | edit tras `verifiedAt` | limpia verificación |
| `founder verifica` | 🔒 | founder llama verify | 403 |
| `cursor` | ⚠️ | lista larga | sin `total` |

### T6.13 Mentorías — después del POC

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `mentor del tenant` | 🔒 | mentor de otra incubadora | 404 |
| `fuera de rango` | ⚠️ | sesión fuera de la asignación | 422 |
| `minutos` | ⚠️ | 0 o 481 | 400 |
| `rating` | 🔒 | lo pone el mentor, no el mentee | 403 |

### T6.14 a T6.16 Competencias, postulaciones, jueces — después del POC

La postulación, cuando se haga, conserva estos unitarios además de la receta:

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `fechas del concurso` | ⚠️ | `closesAt` <= `opensAt` | 400 |
| `schema congelado` | ⚠️ | editar `formSchema` con postulaciones | 409 |
| `xss` | 🔒 | markdown con `<script>` | el HTML guardado no contiene el tag |
| `fuera de fecha` | ⚠️ | postular con now > closesAt | 422 |
| `no elegible` | ⚠️ | sector fuera | 422 con motivo |
| `duplicada` | ⚠️ | mismo concurso y startup | 409 |
| `answers` | ⚠️ | no cumplen `formSchema` | 400 |
| `aval ajeno` | 🔒 | otra incubadora avala | 403 |
| `retirar tarde` | ⚠️ | estado `cluster_review` | 409 |
| `juez propio` | 🔒 | juez es founder de esa startup | 403 |
| `un score` | ✅ | segundo score del mismo juez | upsert, no dos filas |
| `premio temprano` | ⚠️ | award si no está `accepted` | 409 |

### T6.17 Notifications — POC solo in-app

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `marcar leida` | ✅ | id propio | `readAt` seteado |
| `ajena` | 🔒 | id de otro user | 404 |
| `email falla` | ⚠️ | mailer throw | la fila in-app existe; el error queda en la cola, la transacción de negocio no revierte |

### T6.18 Funding y checkpoints — después del POC

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `monto` | ⚠️ | 0 o negativo | 400 |
| `moneda` | ⚠️ | `ABC` | 400 |
| `no graduada` | ⚠️ | checkpoint de startup active | 422 |

---

## T7 — Analítica del POC

### T7.1 Overview

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `conteos` | ✅ | seed conocido | etapas, incubadoras y embudo cuadran |
| `excluye` | ⚠️ | borrada y `private` | no entran al número del clúster |
| `tenant` | 🔒 | director | solo su incubadora |
| `cluster admin` | ✅ | sin header | ve el agregado permitido |
| `fechas` | ⚠️ | from > to | 400 |
| `cache` | ⚠️ | segunda lectura dentro de 5 min | no repite la query; un write borra la clave |

### T7.2 Benchmarks — después del POC

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `k anonimato` | 🔒 | grupo de 2 startups | el grupo no sale |
| `nombres` | 🔒 | director | no ve nombres de otras incubadoras |

### T7.3 Mapa

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `geojson` | ✅ | incubadoras con punto | `FeatureCollection` |
| `sin punto` | ⚠️ | `lat` null | se omite, status 200 |

### T7.4 CSV — después del POC

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `formula` | 🔒 | celda `=cmd` | el CSV escribe `'=cmd` |
| `tenant` | 🔒 | director | solo sus filas |
| `limite` | ⚠️ | sobre el máximo | 400 o trunca con header `X-Truncated`, una sola política y testeada |

---

## T8 — Hardening (después del vertical del POC)

### T8.1 RLS

`SET LOCAL app.tenant_id` dentro de la transacción que envuelve el request. No un `SET` sobre una conexión devuelta al pool.

| Caso | Tipo | Entrada | Esperado |
|------|------|---------|----------|
| `sin contexto` | 🔒 | query SQL directa sin variable | 0 filas |
| `bug de app` | 🔒 | el where de Prisma omite `incubatorId` a propósito en el spec | RLS igual devuelve solo el tenant de la transacción |

**AC:** el spec abre una transacción, setea el local, y asserta el count.

### T8.2 OWASP API

Cada fila apunta a un spec que ya existe. Si el spec no existe, este task no se marca.

| Riesgo | Spec que lo cubre |
|--------|-------------------|
| BOLA | T3.5 |
| Broken auth | T2.3, T2.5, T2.6 |
| Mass assignment | T4.1 |
| Consumo | T4.4, T4.8, T4.9 |
| BFLA | T3.3 |
| Flujos de negocio | T4.13, T6.10 |
| SSRF | T4.15 y URLs de institution (solo https, sin IP privada) |
| Misconfiguration | T4.9 |
| Inventory | T4.14, prefijo `/api/v1` |

SSRF unitario extra: `http://127.0.0.1`, `http://169.254.169.254`, `http://10.0.0.1` → 400. `https://example.com` → aceptada.

### T8.3 Dependencias

`npm audit` pasa a bloqueante en CI para high. `gitleaks` en el workflow. El spec de CI es el YAML: el job existe y falla el pipeline.

### T8.4 Carga

k6 aparte, no es unitario. AC: p95 de listados offset < 300 ms solo en el recurso que no calcula `total` sobre 100k, o se documenta el miss. No prometer 300 ms con `COUNT(*)` filtrado.

### T8.5 Backups

Runbook en `docs/superpowers/plans/` o `api/docs/restore.md` cuando se haga. AC: una restauración a una base vacía vuelve a pasar `GET /api/v1/health`.

### T8.6 Métricas

Contadores de latencia, 4xx, 5xx, 429. Unit del interceptor: una request 429 incrementa el contador 429 y no el de 500.

---

## Definition of Done

- [ ] Tests ✅, ⚠️ y 🔒 de la tarea en verde. No se cierra con solo el ✅.
- [ ] El spec nombra el archivo `*.spec.ts` de la tarea.
- [ ] Si la tarea toca HTTP de negocio: operación presente en OpenAPI con sus errores.
- [ ] Si la tarea toca un permiso: celda nueva en `permissions.spec.ts`.
- [ ] Sin `any` nuevo, sin `console.log`, sin secretos.
- [ ] Migración aplicable desde cero y el `migrate diff` de CI en cero.
- [ ] Una línea en `CHANGELOG.md`.

## Orden del corte POC

1. T0 completo.
2. T1.1–T1.7 y T2.1–T2.7.
3. T3.1–T3.5, T4.1–T4.6, T4.14.
4. Receta sobre `institutions`, luego `geo-units`, `incubators`, `users` / `memberships`.
5. `frameworks` mínimos, `startups`, snapshots, `incubations`.
6. `metric-readings` upsert, notificaciones in-app, T7.1 y T7.3.
7. T4.7–T4.13 y T4.15 cuando el primer recurso ya los necesite (búsqueda en startups, If-Match en incubators, storage cuando haya evidencia).

T2.8, T6.8, T6.11 completo, T6.13–T6.16, T6.18, T7.2, T7.4 y T8 quedan fuera del corte. Sus tests siguen escritos aquí para no reabrir el diseño.
