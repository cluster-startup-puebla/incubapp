# Inventario de pantallas — POC

El plan de implementación está en `docs/superpowers/plans/2026-09-29-incubapp-ui.md`. Este archivo solo lista pantallas.

Tres portales, una sola app. El rol oculta botones y cambia el alcance. No copia la pantalla.

Portales: **Clúster** (superadmin, `cluster_admin`, `coorganizer`), **Incubadora** (`director`, `staff`), **Startup** (`founder`). `mentor` y `judge` no tienen portal en este corte.

## Producto

| Pantalla | Ruta | Clúster | Incubadora | Startup | Reuso |
|---|---|---|---|---|---|
| Overview | `/app/overview` | Clúster completo | Solo su incubadora | — | Misma pantalla. Cambia el alcance |
| Mapa | `/app/mapa` | Todos los puntos | El punto de la suya | — | Misma pantalla. Cambia el alcance |
| Instituciones | `/app/instituciones` | Crea y edita | Lee | Lee | Misma lista. Los botones dependen del rol |
| Ficha de institución | `/app/instituciones/:id` | Edita | Lee | Lee | Misma ficha |
| Directorio de incubadoras | `/app/incubadoras` | Crea y abre cualquiera | — | — | Solo clúster. La ficha sí se comparte |
| Ficha de incubadora | `/app/incubadoras/:id` | Edita cualquiera, logo y color | Edita la suya, logo y color | Lee logo y color | Misma ficha. Staff edita y no borra. El color pinta el portal |
| Frameworks | `/app/frameworks` | Borrador, clonar, publicar | Lee | Lee | Misma lista. Publicar es `cluster_admin` o superadmin |
| Ficha de framework | `/app/frameworks/:id` | Etapas y versión | Lee | Lee | Misma ficha. Coorganizer no publica |
| Geografía | `/app/geo` | Lee. Escribe solo superadmin | Lee | Lee | Misma pantalla. México, Puebla, municipio |
| Startups | `/app/incubadoras/:id/startups` | Al abrir una incubadora | Lista de la suya | — | Misma lista para clúster e incubadora |
| Ficha de startup | `/app/startups/:id` | Edita | Edita | Edita la suya | Misma ficha. El founder no borra y no ve la ajena |
| Métricas | `/app/startups/:id/metricas` | Carga y verifica | Carga y verifica | Carga. No verifica | Misma pantalla. El botón verificar se oculta al founder |
| Incubaciones | `/app/incubaciones` | Al abrir una incubadora | Crea y cambia estado | Lee | Misma lista. Es de la incubadora, no de una startup |
| Ficha de incubación | `/app/incubaciones/:id` | Cambia estado | Cambia estado | Lee | Misma ficha. Staff no borra |
| Equipo e invitaciones | `/app/equipo` | Invita | Director invita. Staff lee | — | Misma pantalla para clúster e incubadora |
| Usuarios | `/app/usuarios` | Lee | Lee | — | Misma lista. No hay alta directa: entran por invitación |
| Avisos | `/app/avisos` | Los suyos | Los suyos | Los suyos | Misma bandeja, filtrada por usuario |

17 pantallas de producto. 16 se reutilizan. 1 es solo del clúster: el directorio de incubadoras.

## Cuenta, fuera de los portales

| Pantalla | Ruta | Estado |
|---|---|---|
| Inicio | `/` | Ya existe |
| Entrar | `/login` | Ya existe |
| Registro | `/register` | Ya existe |
| Verificar correo | `/verificar-correo` | Falta. El API ya lo exige |
| Recuperar contraseña | `/recuperar` | Falta |
| Sesiones | `/cuenta/sesiones` | Falta |

Estas seis son una sola vez para los tres portales.
