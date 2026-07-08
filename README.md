# MiBanko — Saldo Líquido Real Disponible (SLRD)

Sistema personal de finanzas de usuaria única. El número protagonista no es el saldo
bancario, sino el **Saldo Líquido Real Disponible (SLRD)**: cuánto dinero es realmente
tuyo después de descontar toda la deuda ya comprometida (facturada o no).

Ver el plan completo en [`docs/plan-slrd.md`](docs/plan-slrd.md).

## Stack
- Frontend: React + Vite + TypeScript + Tailwind (Fase 1)
- Backend/DB: Supabase (Postgres + Auth + RLS)
- Hosting: Vercel (Fase 4)

## Base de datos

Proyecto Supabase: `MiBanko` (org `joolguin`, región `sa-east-1`).

Migraciones en [`supabase/migrations/`](supabase/migrations/):

| Orden | Archivo | Contenido |
|---|---|---|
| 0001 | `0001_schema.sql` | Tablas, checks, índices |
| 0002 | `0002_rls.sql` | Row Level Security por usuario |
| 0003 | `0003_views.sql` | Vistas `v_latest_snapshots` y `v_slrd` |

Datos de prueba: [`supabase/seed.sql`](supabase/seed.sql).
Verificación del cálculo: [`supabase/verify_slrd.sql`](supabase/verify_slrd.sql).

## Fórmulas del SLRD

```
deuda_no_facturada = Σ transactions (cuenta credit/BICE, type=gasto, billing_cycle_id is null)
deuda_facturada    = Σ bice_billing_cycles.billed_amount (is_paid = false)
slrd_inmediato = saldo_debito (Santander) − deuda_facturada − deuda_no_facturada
slrd_total     = slrd_inmediato + saldo_inversion (Fintual)
saldo_contable = saldo_debito + saldo_inversion   -- el número "mentiroso"
```

## App (Fase 1)

```bash
npm install
cp .env.example .env.local
npm run dev      # http://localhost:5173
npm test         # tests
```

Requiere el usuario único creado en Supabase con signups deshabilitados.
