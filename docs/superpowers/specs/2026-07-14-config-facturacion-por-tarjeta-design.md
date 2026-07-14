# Config de facturación por tarjeta — Diseño (Sub-proyecto B de "tarjetas configurables")

Fecha: 2026-07-14
Estado: aprobado, listo para plan de implementación

## Contexto

"Agregar una tarjeta de crédito" se descompuso en tres sub-proyectos:

- **A — Gestión de cuentas:** crear/editar/activar cuentas desde la app (spec y plan hechos).
- **B — Config de facturación por tarjeta (este spec):** migrar `bice_config` (singleton) a
  config por cuenta de crédito.
- **C — Ciclos y SLRD por tarjeta:** ciclos, deuda facturada/no facturada, pago y SLRD por
  tarjeta (su propio spec → plan).

Este spec cubre **solo B**. Depende de A (necesita cuentas para asociar la config).

## Objetivo

Reemplazar la config de facturación única (`bice_config`, una fila por usuaria) por una config
**por tarjeta de crédito**, con un editor por-tarjeta en Ajustes. El comportamiento del motor de
ciclos no cambia en B: sigue operando sobre una sola tarjeta (la principal), solo que la config
ahora vive por-tarjeta.

## Estado actual

- `bice_config`: tabla singleton (`closing_day`, `due_day`, `updated_at`, PK `user_id`). Sin
  `account_id`.
- `deriveCycleDates(config: BiceConfig, closingDate)` en `src/data/cycleDates.ts` es una función
  **pura** que ya recibe la config como parámetro. No cambia en B.
- Consumidores de la config:
  - `BiceConfigSection` (Ajustes): muestra "Corte día X · Vence día Y" + Editar → `BiceConfigSheet`.
  - `CicloScreen`: lee `useBiceConfig`, la pasa a `CloseCycleSheet` y al `BiceConfigSheet`.
  - `CloseCycleSheet`: llama `deriveCycleDates(config, new Date())` al cerrar un ciclo.
  - `BiceConfigSheet` (`src/components/`): editor de días, guarda con `useSaveBiceConfig`.
- `closing_day`/`due_day` están en 1..28 (sin problemas de fin de mes; ver comentario en
  `cycleDates.ts`).

## Decisiones de alcance (cerradas en brainstorming)

1. **Esquema:** tabla nueva `card_billing_config` aparte (no columnas en `accounts`).
2. **Transición B→C aceptada:** en B se puede configurar el corte/vencimiento de cada tarjeta de
   crédito en Ajustes, pero el motor de ciclos sigue siendo de **una sola tarjeta** (la principal)
   hasta C. Configurar una 2ª tarjeta no afecta los ciclos todavía.
3. **Tarjeta principal:** primera cuenta `type='credit'` en el orden actual (hoy = BICE). Alimenta
   el cierre de ciclo transitorio. Si no tiene config, `CicloScreen` muestra "sin configurar",
   igual que hoy.
4. **`bice_config` se elimina** una vez migrada (los valores se copian a la tarjeta principal).
5. **Renombres:** `BiceConfigSection` → `CardCyclesSection`; `BiceConfigSheet` → `CardCycleSheet`
   (dejan de ser BICE-específicos).

## Fuera de alcance (C, YAGNI)

- Ciclos / `billing_cycles` / deuda facturada-no facturada / pago / SLRD por-tarjeta.
- UI multi-tarjeta en `CicloScreen` (elegir qué tarjeta cerrar, ver varias a la vez).
- Marcar una "tarjeta principal" manualmente (la regla es determinista: primera de crédito).

## Arquitectura

### Esquema + migración (corre el controller con gate humano + MCP de Supabase)

Tabla `card_billing_config`, mismo patrón de RLS que `budgets`:

```sql
create table card_billing_config (
  account_id  uuid primary key references accounts(id) on delete cascade,
  closing_day int not null check (closing_day between 1 and 28),
  due_day     int not null check (due_day between 1 and 28),
  updated_at  timestamptz not null default now(),
  user_id     uuid not null default auth.uid()
);
alter table card_billing_config enable row level security;
create policy card_billing_config_own on card_billing_config
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

**Migración de datos:** copiar `bice_config` a la tarjeta principal, verificando que haya
exactamente una cuenta `type='credit'`:

```sql
insert into card_billing_config (account_id, closing_day, due_day)
select a.id, b.closing_day, b.due_day
from accounts a cross join bice_config b
where a.type = 'credit';
-- verificar 1 fila insertada antes de continuar
drop table bice_config;
```

Tras la migración: regenerar `src/types/db.ts` (o el build se rompe en silencio — ver memoria del
proyecto).

### Capa de datos (`src/data/useCardBillingConfig.ts` nuevo; se elimina `useBiceConfig.ts`)

- Tipos:
  - `CardBillingConfig { accountId: string; closingDay: number; dueDay: number }`.
  - Se conserva `BiceConfig { closingDay: number; dueDay: number }` (lo usa `deriveCycleDates`).
- `useCardBillingConfigs()` → `CardBillingConfig[]` de todas las tarjetas de crédito.
  `queryKey: ['card-billing-config']`.
- `useSaveCardBillingConfig()` → upsert `{ accountId, closingDay, dueDay }` con
  `onConflict: 'account_id'`. Invalida `['card-billing-config']`.
- `usePrimaryCardConfig()` → `BiceConfig | null`: la config de la tarjeta principal (primera cuenta
  de crédito), o `null` si no está configurada. Compone `useAccounts()` + `useCardBillingConfigs()`.

### Capa UI

- `src/features/ajustes/CardCyclesSection.tsx` (reemplaza `BiceConfigSection`): lista cada cuenta de
  **crédito** (de `useAccounts` filtrando `type='credit'`) con su "Corte día X · Vence día Y" o
  "Sin configurar", y Editar por tarjeta → abre `CardCycleSheet` para ese `accountId`.
- `src/components/CardCycleSheet.tsx` (reemplaza `BiceConfigSheet`): recibe `accountId` +
  `initial: BiceConfig | null`; edita corte/vence (1..28) y guarda con `useSaveCardBillingConfig`.
- `CicloScreen`: se repunta de `useBiceConfig` a `usePrimaryCardConfig()`. `CloseCycleSheet` mantiene
  su prop `config: BiceConfig` (solo cambia la fuente). El `BiceConfigSheet` que hoy monta
  `CicloScreen` para editar la config pasa a `CardCycleSheet` de la tarjeta principal.
- `AjustesScreen`: `<BiceConfigSection />` → `<CardCyclesSection />`.

## Manejo de errores y estados

- Carga/guardado de config: mismos patrones que hoy (mensaje + reintento en la sección; error bajo
  el formulario del sheet).
- Rango inválido de días (fuera de 1..28): el sheet deshabilita Guardar (validación en UI, además
  del CHECK en DB).
- Tarjeta principal sin config: `CicloScreen` muestra "sin configurar" (comportamiento actual).

## Plan de pruebas

- `deriveCycleDates` (existente): **sin cambios**, sus tests deben seguir verdes.
- `CardCycleSheet.test.tsx` (nuevo): guardar llama `useSaveCardBillingConfig` con
  `{ accountId, closingDay, dueDay }`; días fuera de 1..28 dejan Guardar deshabilitado.
- `CardCyclesSection.test.tsx` (nuevo): lista solo cuentas de crédito con su config o "sin
  configurar"; Editar abre el sheet con el `accountId` correcto.
- `usePrimaryCardConfig`: se cubre indirectamente vía el render de `CicloScreen` (o un test chico de
  composición si el plan lo separa en función pura testeable).

## Estándares

clean-code-standards (SRP: datos separados de UI; funciones puras donde aplique; nombres
reveladores; inmutabilidad). Commits Conventional, en español, con trailer `Co-Authored-By`.
