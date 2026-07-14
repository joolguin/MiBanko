# Gestión de cuentas en la app — Diseño (Sub-proyecto A de "tarjetas configurables")

Fecha: 2026-07-14
Estado: aprobado, listo para plan de implementación

## Contexto

"Agregar una tarjeta de crédito" se descompuso en tres sub-proyectos independientes:

- **A — Gestión de cuentas (este spec):** crear/editar/activar cuentas desde la app.
- **B — Config de facturación por tarjeta:** migrar `bice_config` (singleton) a config por
  cuenta (`account_id` → cierre/vencimiento).
- **C — Ciclos y SLRD por tarjeta:** `billing_cycles` y "ciclo abierto" por cuenta, deuda
  facturada/no facturada y pago por tarjeta, SLRD agregando por-tarjeta.

Este spec cubre **solo A**. B y C tienen sus propios spec → plan → implementación.

## Objetivo

Permitir a la usuaria crear, editar y activar/desactivar sus cuentas (débito, crédito,
inversión) directamente desde la pantalla de Ajustes, reemplazando el insert manual en la
base de datos que hoy es la única forma de agregar una cuenta.

## Estado actual

- Las cuentas viven en la tabla `accounts` de Supabase: `id`, `name`, `type`
  (`'debit' | 'credit' | 'investment'`), `bank` (nullable), `is_active` (bool),
  `user_id` (default `auth.uid()`), `created_at`.
- `useAccounts()` trae solo `is_active = true`, ordenadas credit→debit→investment; alimenta
  los selectores de Registro e Import.
- No existe UI para crear/editar cuentas. La única forma es insertar filas a mano.

## Decisiones de alcance (cerradas en brainstorming)

1. **Quitar cuenta = desactivar (soft), nunca borrar.** Las cuentas están referenciadas por
   `transactions`; borrarlas rompería el historial. Desactivar marca `is_active = false`: la
   cuenta desaparece de los selectores de Registro/Import pero se conserva para el historial.
   Es reversible (reactivar).
2. **El tipo es fijo tras crear.** Se elige al crear y luego queda bloqueado; solo se editan
   `name` y `bank`. Evita que un cambio credit↔debit descuadre ciclos/SLRD de movimientos ya
   registrados. Para corregir un tipo mal elegido: desactivar y crear de nuevo.
3. **Patrón de UI:** Sección + BottomSheet, calcando `CategoriesSection`/`CategorySheet` y
   `SubscriptionsSection`/`SubscriptionSheet` (misma UX y componentes).
4. **Default del selector de tipo:** Débito.
5. **Fila de la lista:** muestra nombre · tipo · banco.

## Fuera de alcance (YAGNI)

- Configurar el ciclo de facturación de una tarjeta de crédito nueva (eso es B/C). Una tarjeta
  de crédito creada acá compartirá el ciclo único actual hasta que B/C existan. Este spec
  **no** toca `bice_config`, `billing_cycles`, ciclos ni SLRD.
- Unicidad de nombre de cuenta (se permiten nombres repetidos; a diferencia de categorías).
- Reordenar cuentas manualmente (el orden sigue siendo por tipo).

## Arquitectura

### Capa de datos (`src/data/useAccounts.ts`, `src/data/types.ts`)

- `useAccounts()` — **sin cambios**. Sigue trayendo solo activas para los selectores.
- `useManageAccounts()` — nuevo. Trae **todas** las cuentas (activas + inactivas) del usuario,
  ordenadas: primero activas (por el orden de tipo existente credit→debit→investment), luego
  inactivas. `queryKey: ['accounts', 'manage']`.
- `useSaveAccount()` — nuevo. Upsert:
  - Crear (sin `id`): inserta `{ name, type, bank }` (con `user_id` default de la DB).
  - Editar (con `id`): actualiza **solo** `name` y `bank`; no envía `type` ni `is_active`.
  - Invalida `['accounts']` y `['accounts', 'manage']`.
- `useSetAccountActive()` — nuevo. Actualiza `is_active` de una cuenta por `id`.
  Invalida `['accounts']` y `['accounts', 'manage']`.
- Tipo nuevo:
  ```ts
  export interface AccountInput {
    id?: string
    name: string
    type: AccountType   // requerido; ignorado por useSaveAccount al editar
    bank: string | null
  }
  ```

Nota de invalidación: al desactivar/crear/editar hay que invalidar `['accounts']` para que los
selectores de Registro/Import reflejen el cambio, además de `['accounts', 'manage']`.

### Capa UI (`src/features/ajustes/`)

- `AccountsSection.tsx` — nueva sección, calcando `CategoriesSection`:
  - Encabezado "cuentas" + botón "Agregar" (abre el sheet en modo nuevo).
  - Estados loading (`Skeleton`) / error (mensaje + "Reintentar") / vacío.
  - Lista de cuentas **activas**: cada fila muestra `nombre · <tipo> · <banco>` (banco omitido si
    es null). Tap en la fila abre el sheet en modo edición. Acción "desactivar" con confirmación
    inline ("¿Desactivar? Sí / No"), igual que el borrado de categorías.
  - Debajo, si hay inactivas: subtítulo "inactivas" y filas **atenuadas** con acción "Reactivar".
  - Usa `useManageAccounts()`, `useSetAccountActive()`.
- `AccountSheet.tsx` — nuevo, calcando `CategorySheet`:
  - Título "Nueva cuenta" / "Editar cuenta".
  - Input **nombre** (requerido, placeholder "Nombre (ej: BICE Visa)").
  - Selector de **tipo**: tres opciones segmentadas (Débito / Crédito / Inversión), default Débito.
    Visible y editable solo al **crear**. Al editar, se muestra el tipo actual como texto fijo
    (no editable).
  - Input **banco** (opcional, placeholder "Banco (ej: BICE)").
  - Botón Guardar (deshabilitado si el nombre está vacío o `save.isPending`). Usa `useSaveAccount()`.
- `AjustesScreen.tsx` — insertar `<AccountsSection />` arriba de `<BiceConfigSection />`.

## Mapeo de tipo → etiqueta

`debit → "Débito"`, `credit → "Crédito"`, `investment → "Inversión"`. Helper local en
`AccountSheet`/`AccountsSection` (objeto de mapeo), no un módulo nuevo.

## Manejo de errores y estados

- Error de carga en la sección → mensaje + botón "Reintentar" (patrón de `CategoriesSection`).
- Error de guardado → mensaje bajo el formulario ("No se pudo guardar. Reintentá.").
- Error de (des)activar → mensaje en la sección ("No se pudo actualizar. Reintentá.").
- Nombre vacío → botón Guardar deshabilitado.

## Plan de pruebas

- **`AccountsSection.test.tsx`** (nuevo, calcando `CategoriesSection.test.tsx`, mockeando los
  hooks de datos): renderiza activas e inactivas; "Agregar" abre el sheet; el flujo de
  desactivar pide confirmación y llama `useSetAccountActive`; "Reactivar" en una inactiva llama
  `useSetAccountActive`.
- **`AccountSheet.test.tsx`** (nuevo, calcando `CategorySheet` con mock de `useSaveAccount`):
  crear envía `{ name, type, bank }`; editar muestra el tipo fijo y envía solo `{ id, name, bank }`;
  nombre vacío deja Guardar deshabilitado; selector de tipo cambia el valor al crear.

## Estándares

Todo el código sigue **clean-code-standards** (nombres reveladores, guard clauses, SRP —
núcleo de datos separado de UI —, funciones chicas, inmutabilidad). Commits en Conventional
Commits, en español, con trailer `Co-Authored-By`.
