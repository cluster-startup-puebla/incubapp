# Estado de implementación — backend

Plan: `docs/superpowers/plans/2026-09-29-incubapp-backend.md`

Actualizado: 2026-09-29

## Dónde quedamos

Etapa activa: **T0 cerrado, checkpoint en curso**. Siguiente: **T1**.

## Hecho antes de este goal

- `api/` Nest 11, Prisma 7, Better Auth en `/api/auth`, Scalar en `/reference`, health `GET /api/v1/health`.
- `web/` landing que llama al health, login y registro contra el API.
- Compose: Postgres 17 en `5433`, MinIO `9000/9001`, Mailpit `1026/8026`.
- Tests unitarios de health y e2e de health ya pasaron en la sesión anterior.

## En curso (T0, en paralelo)

| Tarea | Quién | Archivos | Commit |
|-------|--------|----------|--------|
| T0.1 tooling raíz | [hooks](e7ffc84c-0bf1-4b84-9af6-dc4a384323be) | `.husky/`, `commitlint.config.js`, `package.json` raíz | hecho. Hook y commitlint verificados. Lint de api en 0 después del fix del mock |
| T0.4 Redis | [redis](494cf2c9-7eda-4774-86c8-401678c5a252) | `api/docker-compose.yml`, `README.md` | hecho. Puerto 6379, `PONG` |
| T0.5 harness | [harness](ab98570f-50a8-48a4-8f61-cdcb82ec214e) | `api/src/testing/` | hecho. 5 tests verdes |
| T0.6 CI | [ci](d25b94e8-b763-4dee-a3ae-49e544b7d787) | `.github/workflows/api.yml` | hecho. Drift con shadow DB de Postgres 17. Sin commit |

T0.2 y T0.3 los cerró [config](c7033ed5-46d8-4bde-91ae-b8a579feb154). Verificado por el agente principal: 17 tests, lint 0 errores, build 0, `GET /api/v1/health` 200, `GET /api/v1/health/ready` con postgres y redis up.

## Siguiente checkpoint

Este commit es el cierre de T0. El siguiente es T1 (convención de columnas, `isSuperAdmin`, una extensión de soft delete).

Formato de commit: `[:emoji:] backend - add - descripción corta`

## Fuera del corte (no implementar)

T2.8, T3.6 hasta decidir, T6.8, T6.9 hasta decidir, T6.11 completo, T6.13–T6.16, T6.18, T7.2, T7.4, T8.

## Cómo retomar

1. Leer este archivo.
2. Leer la etapa activa del plan.
3. No correr `nest new`. No mover `/api/auth` ni `GET /api/v1/health`.
4. No commitear `.env`.
