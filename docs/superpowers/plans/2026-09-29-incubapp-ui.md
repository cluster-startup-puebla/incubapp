# Portales UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar los tres portales del inventario a la API del POC, con una sola tabla, un solo sheet de alta y la marca (logo y color) de cada incubadora aplicada por variables CSS.

**Architecture:** El navegador habla con Nest por `credentials: 'include'`. No hay un BFF que reescriba GraphQL. Una capa `apiClient` desempaqueta `{ data, meta }` y problem+json. Las listas usan un solo `DataTable`. Las altas y ediciones usan un solo `FormSheet`. La ficha es un header de servidor más tabs. El color y el logo salen de la incubadora: el API los guarda y el shell los aplica a `--primary` y al `<img>`.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, shadcn/ui (Radix), TanStack Table, Better Auth por contraseña (no magic link), Vitest + Testing Library.

**Inventario:** `docs/superpowers/plans/2026-09-29-incubapp-ui-pantallas.md`.

**API de marca:** `docs/superpowers/plans/2026-09-29-incubapp-backend.md`, sección «Marca de incubadora». Ese corte se implementa antes de la tarea U4.

---

## Qué ya está y qué faltaba

| Pieza | Estado |
|---|---|
| Plan del backend del POC | Cerrado e implementado. No incluye logo ni color. |
| Inventario de pantallas | Escrito. No es un plan de implementación: no tiene tareas ni tests. |
| Tokens CSS y `brandToStyle` | Hechos en `web/src/app/globals.css` y `web/src/theme/brand.ts`. El proveedor vivo responde `null`. |
| Pantallas de producto, DataTable, FormSheet, shadcn | No existen. |
| Login | Existe con correo y contraseña. Falta verificar correo, recuperar contraseña y sesiones. |

Este archivo es el plan que faltaba.

## Reglas que no se copian de ordina-panel

ordina-panel habla con Keystone por GraphQL y un `/api/v1` propio de Next. Aquí Nest ya es `/api/v1`. Se conservan estas reglas, traducidas:

- La página de lista no arma la tabla. Delega en un `ResourceList` único.
- La ficha es servidor, `export const dynamic = "force-dynamic"`, header primero y el error antes del contenido.
- Alta y edición abren `FormSheet` lateral. No hay `Dialog` para crear.
- Borrar es soft delete por el `DELETE` del API. La confirmación también es ese sheet, en modo destructivo.
- La columna Acciones va al final.
- Campos de sistema (`id`, `deletedAt`, `createdById`, `version`) no salen en el formulario. `version` viaja en `If-Match`.
- Un 401 manda a `/login`. Un 404 de otro tenant pinta «No encontrado», no un forbidden.

## Árbol

```text
web/src/lib/api/client.ts
web/src/lib/api/problem.ts
web/src/components/ui/data-table.tsx
web/src/components/ui/sheet.tsx
web/src/components/resource/form-sheet.tsx
web/src/components/resource/resource-list.tsx
web/src/components/resource/resource-detail.tsx
web/src/components/resource/portal-shell.tsx
web/src/theme/brand-source.ts
web/src/app/app/layout.tsx
web/src/app/app/<recurso>/page.tsx
web/src/app/app/<recurso>/[id]/page.tsx
```

Un recurso nuevo agrega columnas, schema Zod y la ruta. No agrega otra tabla ni otro sheet.

---

### Task U0: Vitest

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`, `web/src/test/setup.ts`

- [ ] **Step 1:** Instalar `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`.
- [ ] **Step 2:** `npm test` corre Vitest y sigue incluyendo `src/theme/brand.test.ts` (los 7 casos de marca ya verdes).
- [ ] **Step 3:** Commit `[:white_check_mark:] web - test - add vitest for portal components`.

### Task U1: shadcn sobre los tokens que ya existen

**Files:**
- Modify: `web/components.json` (ya apunta a `src/app/globals.css` y `cssVariables: true`)
- Create: `web/src/lib/utils.ts`, `web/src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `sheet.tsx`, `skeleton.tsx`, `checkbox.tsx`, `tabs.tsx`, `badge.tsx`

- [ ] **Step 1:** `npx shadcn@latest add button input label sheet skeleton checkbox tabs badge -y --overwrite` desde `web/`. Base Radix.
- [ ] **Step 2:** Revisar que `globals.css` no haya perdido el puente `:root` → `@theme inline` (`--color-primary: var(--primary)`). Si el CLI lo aplana a un color fijo, restaurar el `var()`.
- [ ] **Step 3:** `cn` en `web/src/lib/utils.ts` con `clsx` y `tailwind-merge`.
- [ ] **Step 4:** Un botón de prueba usa `bg-primary`. No hay hex en `components/ui`.

**AC:** cambiar `--primary` en un padre repinta el botón. Ya se comprobó en el login: el botón pasó a `rgb(200, 16, 46)` sin editar el componente.

### Task U2: DataTable único

**Files:**
- Create: `web/src/components/ui/data-table.tsx` copiado de `cincomayo-client/src/components/ui/data-table.tsx`
- Test: `web/src/components/ui/data-table.test.tsx`

Copiar la API actual: `data`, `columns`, `isLoading`, `page`, `totalPages`, `onPageChange`, `total`, `emptyMessage`, `enableRowSelection`, `renderMobileCard`. Agregar modo cursor:

```ts
pagination?: 'offset' | 'cursor';
nextCursor?: string | null;
onNextCursor?: (cursor: string) => void;
```

Con `pagination: 'cursor'` no se muestra «página N de M» ni `total`. El botón siguiente se deshabilita si `nextCursor` es null.

- [ ] **Step 1: test que falla**

```tsx
it('lista vacía muestra el mensaje y no filas', () => {
  render(
    <DataTable data={[]} columns={[{ accessorKey: 'name', header: 'Nombre' }]} />,
  );
  expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /fila/ })).not.toBeInTheDocument();
});

it('mientras carga no muestra el vacío', () => {
  render(
    <DataTable data={[]} columns={cols} isLoading />,
  );
  expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
});

it('en la última página el siguiente está deshabilitado', () => {
  render(
    <DataTable data={rows} columns={cols} page={2} totalPages={2} total={2} />,
  );
  expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
});

it('el cursor no imprime total', () => {
  render(
    <DataTable
      data={rows}
      columns={cols}
      pagination="cursor"
      nextCursor={null}
    />,
  );
  expect(screen.queryByText(/registro/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
});
```

- [ ] **Step 2:** Implementar hasta que pasen. Commit `[:art:] web - add - shared tanstack data table`.

### Task U3: FormSheet único

**Files:**
- Create: `web/src/components/resource/form-sheet.tsx`
- Test: `web/src/components/resource/form-sheet.test.tsx`

```ts
type FormSheetProps<T> = {
  title: string;
  triggerLabel: string;
  schema: ZodType<T>;
  fields: { name: keyof T & string; label: string; type?: 'text' | 'number' }[];
  submitLabel: string;
  onSubmit: (value: T) => Promise<void>;
  defaultValues?: Partial<T>;
  destructive?: boolean;
};
```

Abre por la derecha (`SheetContent side="right"`). No cierra si `onSubmit` rechaza. Muestra el `detail` del problem+json. Deshabilita el botón mientras la promesa está pendiente. Escape cierra solo si no está pendiente.

**Tests más allá del feliz**

| Caso | Esperado |
|---|---|
| submit válido | `onSubmit` recibe el objeto y el sheet se cierra |
| campo vacío con schema `.min(1)` | no llama `onSubmit`, el error queda junto al campo |
| `onSubmit` rechaza 409 | el sheet sigue abierto y muestra el detalle |
| doble click | `onSubmit` se llama una vez |
| `destructive` | el botón usa `variant="destructive"` |

Commit `[:art:] web - add - reusable form sheet`.

### Task U4: Marca en el shell

Depende de T6.3b y T6.3c del plan de backend.

**Files:**
- Modify: `web/src/theme/brand.ts`, `web/src/theme/brand-source.ts`, `web/src/theme/tenant-theme.tsx`
- Create: `web/src/theme/api-brand-source.ts`
- Test: extender `web/src/theme/brand.test.ts`

`TenantBrandConfig` gana `logoUrl: string | null`. `brandSource.load(slug)` hace `GET /api/v1/incubators?filter[slug][eq]=<slug>` y lee `brandPrimary` y `logoUrl`. Si no hay fila, devuelve null.

```ts
export function brandToStyle(brand: TenantBrandConfig | null) {
  // igual que hoy: solo escribe --primary si brandPrimary pasa COLOR_VALUE
}
```

`TenantTheme` recibe `slug` y pinta:

```tsx
<header>
  {brand?.logoUrl ? <img src={brand.logoUrl} alt="" /> : null}
</header>
```

El `alt` vacío es decorativo porque el nombre de la incubadora ya está en texto al lado.

**Tests**

| Caso | Esperado |
|---|---|
| incubadora con `#C8102E` y logo | style `--primary` y el `img` con ese `src` |
| `brandPrimary` null y `logoUrl` null | style vacío, sin `img` |
| 404 del listado | paleta neutra, sin throw |
| color inválido que se coló | no se escribe `--primary` |
| slug distinto al de la fila | se ignora |

El portal clúster pasa `slug={null}` hasta que elige una incubadora. Al abrir `/app/incubadoras/:id`, el shell de esa rama pasa el slug de la ficha. Ahí UPAP rojo y BUAP azul conviven en la misma app.

Commit `[:art:] web - add - incubator logo and brand color on the shell`.

### Task U5: apiClient

**Files:**
- Create: `web/src/lib/api/client.ts`, `web/src/lib/api/client.test.ts`

```ts
export async function apiClient<T>(path: string, init?: RequestInit & { incubatorId?: string | null }): Promise<T>
```

- Base `NEXT_PUBLIC_API_URL`, `credentials: 'include'`.
- Si `incubatorId` es string, manda `x-incubator-id`. Si es null, no manda el header.
- 200 con `{ data }` devuelve `data`. 200 con `{ data, meta }` devuelve el cuerpo entero.
- 204 devuelve `undefined`.
- 401 lanza `UnauthorizedError`. 404 lanza `NotFoundError` con `detail`. 422 lanza `ValidationError` con los errores de campo. Otros 4xx/5xx lanzan `ProblemError`.

**Tests:** cuerpo sin envelope no se envuelve otra vez; header ausente cuando `incubatorId` es null; HTML de un proxy no se trata como problem (cae en error genérico).

### Task U6: ResourceList y ResourceDetail

**Files:**
- Create: `web/src/components/resource/resource-list.tsx`, `resource-detail.tsx` y sus tests

`ResourceList` recibe `title`, `columns`, `fetchPage({ page })`, `create` opcional (props de `FormSheet`), `rowHref`. Estados: loading pasa `isLoading` al DataTable; error pinta el `detail`; vacío lo pinta el DataTable. Después de un create exitoso vuelve a pedir la página 1.

`ResourceDetail` recibe `title`, `fields: { label, value }[]`, `tabs: { value, name, content }[]`, `edit` opcional. Si `error` viene, muestra el aviso y no los tabs. Un field con valor null no se renderiza.

**Tests:** create oculto cuando `create` es undefined; error 404 no muestra la tabla; tab cambia `?tab=` sin perder el id de la ruta.

### Task U7: Shell de portal

**Files:**
- Create: `web/src/app/app/layout.tsx`, `web/src/components/resource/portal-nav.tsx`
- Test: `portal-nav.test.tsx`

Después de `authClient.getSession()`, sin sesión → redirect `/login`. Con sesión, el nav depende del rol:

| Rol | Links |
|---|---|
| superadmin, cluster_admin, coorganizer | Overview, mapa, instituciones, incubadoras, frameworks, geo, usuarios, avisos |
| director, staff | Overview, mapa, ficha de su incubadora, startups, incubaciones, equipo, frameworks (lectura), avisos |
| founder | Su startup, métricas, avisos |

`mentor` y `judge` no tienen nav de producto: ven avisos y una página «Tu rol no tiene portal en este corte».

Commit `[:art:] web - add - portal shell by role`.

---

## Pantallas

Cada tarea usa `ResourceList` / `ResourceDetail` / `FormSheet`. No se crea otra tabla. La prueba de la tarea monta la página con el `apiClient` mockeado y cubre vacío, 404 y el botón que ese rol no debe ver.

### Task U8: Cuenta

| Pantalla | Ruta | AC extra |
|---|---|---|
| Verificar correo | `/verificar-correo` | token vacío → no llama al API; token inválido muestra el error de Better Auth y no redirige |
| Recuperar contraseña | `/recuperar` | email desconocido igual dice «si existe, enviamos el correo»; contraseña menor a 10 caracteres no se envía |
| Sesiones | `/cuenta/sesiones` | lista las sesiones; revocar la actual manda a `/login`; revocar otra deja la lista sin esa fila |

Login y registro ya existen. Se les cambia el markup a `Input`, `Label` y `Button` sin cambiar el flujo `signIn.email` / `signUp.email`.

### Task U9: Overview y mapa

- `GET /api/v1/analytics/overview`. Clúster sin header. Incubadora con `x-incubator-id`.
- `from > to` muestra el 400 junto a los campos, no un overview en cero.
- Mapa: `GET /api/v1/analytics/map`. El cuerpo es FeatureCollection, no `{ data }`. Cero features pinta el mapa vacío, status que el API ya dio 200. Founder no ve el link.

### Task U10: Instituciones

Columnas: nombre, país, sitio. Sheet: `name`, `countryCode` (2 letras), `website`. `countryCode` de 1 letra no envía. Founder e incubadora no ven el trigger Crear. Borrar con incubadoras activas muestra el 409 dentro del sheet.

### Task U11: Incubadoras y marca

Directorio solo en el nav del clúster. Sheet de alta: `name`, `slug`, `brandPrimary` opcional. Slug con mayúsculas no envía.

Ficha `/app/incubadoras/[id]`: header con logo, nombre, slug, color. Sheet de edición manda `If-Match` con `version`. Input de color escribe `brandPrimary`. Input file llama `POST /api/v1/incubators/:id/logo`. Sin `If-Match` el cliente ni lo intenta y muestra «Recarga la ficha». Tipo que no es imagen muestra el 400. Al guardar el color, `TenantTheme` de esa rama recibe el slug y el portal cambia `--primary`.

Founder ve logo y nombre, sin sheet.

### Task U12: Frameworks

Lista con estado DRAFT/PUBLISHED. Publicar y clonar son botones de la ficha, no del sheet de alta. Coorganizer ve el sheet de borrador y no ve Publicar. PATCH a uno PUBLISHED muestra el 409. Founder e incubadora entran en lectura: sin sheet.

### Task U13: Geografía

Árbol país → estado → municipio con el mismo DataTable de hijos. Superadmin ve el sheet. Un municipio con `parentId` de país muestra el 422. El resto de roles no ve el trigger.

### Task U14: Startups, ficha y métricas

Lista bajo la incubadora activa. Sheet: `name`, `domain`, `visibility`. Dominio repetido sin `force` muestra el 409 y los candidatos. Founder no ve otras filas: su nav abre directo `/app/startups/:id`. GET de una ajena pinta 404.

Métricas usan `pagination="cursor"`. Sheet: `metricDefId`, `period`, `value`. Periodo futuro muestra el 400. Valor negativo con métrica que no lo permite muestra el 400. El botón Verificar no se renderiza si el rol es founder. La misma `Idempotency-Key` no se reutiliza entre valores distintos: cada submit genera una key nueva.

### Task U15: Incubaciones

Sheet: `status`, fechas `YYYY-MM-DD`, `exitReason`. `from` visual no aplica; `endedOn < startedOn` muestra el 400. `dropped` sin motivo muestra el 422. Segunda `active` muestra el 409. Founder no ve el sheet.

### Task U16: Equipo, usuarios y avisos

Equipo: sheet de invitación con email y rol. Director no puede elegir `cluster_admin` (el select no lo incluye; si el API respondiera 403, se muestra). Staff no ve el trigger. Founder no tiene la ruta.

Usuarios: solo lista y ficha de lectura. No hay sheet de alta.

Avisos: DataTable de los propios. Marcar leída llama `POST /api/v1/notifications/:id/read`. Un id ajeno pinta 404 y la fila no desaparece de otra bandeja.

---

## Orden

1. U0–U3 (herramienta, shadcn, tabla, sheet).
2. T6.3b y T6.3c del plan de backend, luego U4.
3. U5–U7.
4. U8–U16. Cada pantalla se puede hacer al terminar U7. No se saltan U2 ni U3.

## Definition of Done

- [ ] Las 17 pantallas de producto y las 3 de cuenta que faltan usan `DataTable` o no son listas.
- [ ] Ninguna alta usa `Dialog`.
- [ ] `rg "#[0-9a-fA-F]{3,8}" web/src/components` no encuentra color de marca hardcodeado.
- [ ] Logo y `brandPrimary` se leen del API. El proveedor estático de ejemplo no se usa en runtime.
- [ ] Tests de U2, U3, U4 y U5 verdes, incluidos los casos ⚠️ y 🔒 de arriba.
- [ ] `npm test` en `web/` y `npm test` en `api/` verdes.
