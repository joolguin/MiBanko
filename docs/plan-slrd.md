# Plan de Desarrollo — App de Saldo Líquido Real Disponible (SLRD)
**Usuaria única:** Josefa · **Fecha:** Julio 2026 · **Estado:** Plan aprobado

---

## 1. Visión y problema
Sistema personal de finanzas que resuelve la **falsa sensación de liquidez** creada por el
desfase temporal entre gasto con crédito (BICE Visa Gold) y salida real de dinero
(Santander/Fintual). El número protagonista no es el saldo bancario, sino el **Saldo Líquido
Real Disponible (SLRD)**: cuánto dinero es realmente tuyo después de descontar toda la deuda
ya comprometida, facturada o no.

## 2. Principios de diseño
1. **Costo cero**: solo servicios con free tier permanente (Supabase, Vercel).
2. **Una sola usuaria**: auth mínimo, sesión persistente, sin gestión de usuarios.
3. **Fricción mínima**: registrar un gasto debe tomar ~15 segundos desde el teléfono.
4. **Honestidad del dato**: si la información está desactualizada, la app lo dice; nunca
   muestra un número viejo como si fuera exacto.
5. **Arquitectura híbrida**: snapshots mandan en el lado activos; ledger manda en el lado deuda.
6. **Extensible sin migración**: el esquema v1 ya soporta las features v2.

## 3. Alcance

### Dentro de v1
- Cálculo y visualización del SLRD (inmediato y total)
- Registro manual rápido de transacciones con categoría y canal
- Snapshots manuales de saldos (Santander, Fintual)
- Gestión de ciclos de facturación BICE (cierre de ciclo, marca de pago)
- Suscripciones fijas auto-registradas (cron)
- Historial y gráfico SLRD vs saldo contable
- PWA instalable en Pixel

### Fuera de v1 (backlog v2+)
- Compras en cuotas (decisión: no se usarán)
- Import de cartola CSV (Santander/BICE)
- Auto-categorización (reglas por keyword → luego API de Claude)
- Estimación de gasto por categoría
- Integración con APIs bancarias (descartado Fintoc por costo B2B)

## 4. Stack técnico
| Capa | Tecnología | Costo |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | $0 |
| Animaciones (opcional) | Framer Motion | $0 |
| Backend/DB | Supabase (Postgres + Auth + RLS) | $0 (free tier 500MB) |
| Cron | Supabase `pg_cron` | $0 |
| Hosting | Vercel (free tier) | $0 |
| PWA | vite-plugin-pwa | $0 |

## 5. Modelo de datos

```
accounts            id, user_id, name, type(debit|credit|investment), bank, is_active
balance_snapshots   id, user_id, account_id, balance, snapshot_date
categories          id, user_id, name (unique por usuario)
transactions        id, user_id, account_id, type, amount, transaction_date, channel,
                    category_id?, description, billing_cycle_id?, source(manual|auto), created_at
bice_billing_cycles id, user_id, cycle_start, cycle_end, due_date, billed_amount, is_paid
fixed_subscriptions id, user_id, name, amount, charge_day_of_month, category_id, channel, is_active
```

**Todas las tablas** llevan `user_id uuid` con RLS: `user_id = auth.uid()`.

### Reglas de integridad (fuente de verdad por estado)
- Gasto BICE **no facturado** → cuenta desde `transactions` con `billing_cycle_id is null`.
- Deuda **facturada** → cuenta solo `billed_amount` del ciclo; las transacciones asignadas
  quedan solo como detalle/analítica (la boleta manda).
- `pago_tarjeta` y `transferencia_interna` **nunca** afectan el SLRD directamente; su efecto
  entra vía snapshot y vía `is_paid`.
- Transacciones de débito (Santander) son solo analítica de categorías; no calculan saldo.

## 6. Fórmulas del SLRD
```
deuda_no_facturada = Σ transactions (account=BICE, type=gasto, billing_cycle_id is null)
deuda_facturada    = Σ bice_billing_cycles.billed_amount (is_paid = false)
slrd_inmediato = último_snapshot(Santander) − deuda_facturada − deuda_no_facturada
slrd_total     = slrd_inmediato + último_snapshot(Fintual)
saldo_contable = último_snapshot(Santander) + último_snapshot(Fintual)   -- el "mentiroso"
```
Implementadas como **vistas SQL** en Supabase (`v_slrd`).

## 7. Autenticación y seguridad
- Supabase Auth con **un solo usuario** (email + password). Registro deshabilitado.
- RLS activado en todas las tablas.
- Sesión persistente (refresh token) → login una vez.
- La anon key de Supabase vive en el frontend sin riesgo gracias a RLS.

## 8. Pantallas (v1)
1. **Dashboard** — SLRD inmediato (protagonista), SLRD total, saldo contable tachado,
   desglose de deuda, aviso de frescura, próximo vencimiento BICE.
2. **Registro rápido** — monto → tipo → cuenta → canal → categoría → descripción.
   Defaults: BICE + gasto + wallet_pixel.
3. **Snapshots** — Santander y Fintual. Guardar.
4. **Ciclo BICE** — ver gastos del ciclo, cerrar ciclo (billed_amount + alerta de diferencia),
   marcar como pagada.
5. **Historial / Analítica** — gráfico SLRD vs saldo contable, lista con filtros, gasto por categoría.
6. **Configuración** — CRUD categorías/suscripciones, fechas BICE.

## 9. Automatizaciones (v1)
- **Cron diario (`pg_cron`)**: revisa `fixed_subscriptions`; si `charge_day_of_month` = hoy,
  inserta la transacción BICE con `source = 'auto'`. Idempotente.
- **Snapshot de SLRD diario** (opcional): guarda el valor en `slrd_history` para el gráfico.

## 10. Fases de desarrollo
| Fase | Contenido | Resultado verificable |
|---|---|---|
| **0. Setup** | Proyecto Supabase, migraciones (tablas + RLS + vistas), seed, usuario único | SLRD calculable vía SQL |
| **1. Core** | Vite/React/TS/Tailwind, auth, dashboard SLRD real, registro rápido | Registrar gasto y ver SLRD bajar |
| **2. Ciclos** | Snapshots, gestión de ciclo BICE (cerrar, pagar) | Ciclo completo: gastar → facturar → pagar |
| **3. Confort** | Suscripciones + cron, historial + gráfico, avisos de frescura | App usable a diario |
| **4. PWA + deploy** | vite-plugin-pwa, deploy en Vercel, instalación en Pixel | App en el teléfono |

## 11. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Olvido de snapshots → SLRD desactualizado | Aviso de frescura en dashboard; rutina semanal |
| Olvido de registrar gastos BICE | Suscripciones automatizadas + import CSV en v2 |
| Boleta BICE difiere del ledger | El cierre compara y alerta; `billed_amount` manda |
| Free tier de Supabase pausa proyectos inactivos | Uso diario + cron cuentan como actividad |
| Pérdida de datos | Export CSV manual + backup desde dashboard |

## 12. Backlog v2 (por valor/esfuerzo)
1. Import de cartola (Santander/BICE) — elimina el 90% del tipeo.
2. Gasto por categoría con gráficos.
3. Reglas de auto-categorización (keyword → categoría).
4. Estimación de gasto (promedio móvil).
5. Insights con API de Claude.
6. Presupuestos por categoría con alertas.
