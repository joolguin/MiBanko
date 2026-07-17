# Propuestas de mejora UI/UX — MiBanko

> Respuesta al brief `docs/contexto-ui-para-diseno.md` (§8). Mobile 375×812, dark.
> Cada propuesta: problema → solución (boceto) → cómo respeta los principios
> (honestidad del dato, fricción mínima, identidad visual) y las decisiones intocables.
> Ancladas en el código real: `DashboardScreen.tsx`, `CicloScreen.tsx`,
> `UnpaidCyclesSection.tsx`.

---

## P1 — Unificar el lenguaje de chips/pills/tabs

**Problema.** Tres tratamientos conviviendo (componente `Chip`,
`bg-accent text-accent-deep` a mano, variantes intermedias). El mismo concepto
("esto está seleccionado") se dibuja distinto según la pantalla, y eso erosiona
la sensación de app cuidada.

**Solución.** Un solo componente con dos variantes semánticas y una regla para elegir:

- **Selección exclusiva** (tabs de Historial, rangos 30d/90d/Todo): relleno
  sólido `bg-accent text-accent-deep`. El tratamiento más fuerte, porque siempre
  hay exactamente una activa.
- **Filtro/toggle acumulable** (filtros de Movimientos): el `Chip` actual
  (`border-accent text-accent-bright bg-accent/10`). Más liviano, porque puede
  haber varias activas o ninguna.

Mismo radio, misma altura, misma tipografía; tap ≥44px vía `::after` absoluto
(el truco ya aprobado para el nav). Migrar las instancias hechas a mano a estas
dos variantes.

**Respeta:** identidad (consolida lo existente en vez de inventar), y es la mejora
con mejor relación costo/impacto en consistencia. La distinción sólido = exclusivo
/ borde = acumulable le da significado al estilo en vez de ser variación arbitraria.

---

## P1 — Jerarquía del Dashboard: un solo protagonista

**Problema.** El SLRD inmediato es el número protagonista por definición del
producto, pero comparte zona con el tachado, el total con Fintual y el desglose
de deuda — 6 números en una columna casi continua. Cuando todo pide atención,
nada la tiene.

**Solución.** Tres bloques con aire creciente entre sí (ritmo en múltiplos de 8,
el salto más grande después del bloque 1):

```
Hola, Josefa                   hace 2 días

DISPONIBLE DE VERDAD
$1.237.450                                    ← 46px accent-bright (sin cambio)

  $2.114.300̶   lo que el banco te muestra    ← bloque 2: contexto, junto con ↓
  Con Fintual (total)            $4.912.180

┌─────────────────────────────────────────┐
│ DEUDA COMPROMETIDA                       │
│ Facturado BICE   vence 15 jul  −$430.000 │
│ Ciclo actual     sin facturar  −$446.850 │
└─────────────────────────────────────────┘  ← bloque 3: card bg-ink-2
```

1. **La respuesta:** label + SLRD inmediato display + estado de frescura si
   aplica. Nada más en su línea de vista.
2. **El contexto:** tachado y "Con Fintual (total)" juntos, en cuerpo secundario.
   El gag narrativo del tachado se conserva, pero baja un escalón: funciona mejor
   contrastando algo secundario que compitiendo con el héroe.
3. **La deuda:** card `ink-2` con las dos filas en mono/tabular alineadas a la
   derecha, para leer los montos en columna. La fila de facturado aprovecha el
   `due_date` que ya existe ("vence 15 jul") en lugar del genérico "pendiente de
   pago". El ícono de warning ámbar (hoy decoración permanente en ambas filas,
   `DashboardScreen.tsx:105`) se reserva para vencimiento cercano (≤3 días).

**Respeta:** los estados de frescura no se tocan (gris + badge ámbar + banner
siguen aplicando al bloque 1 tal cual); el tachado no desaparece, solo baja de
nivel; cero colores nuevos.

---

## P2 — Ciclo: hacer visible el tiempo

**Problema.** El ciclo BICE es esencialmente temporal (corte, vencimiento) pero
la pantalla lo presenta como listas estáticas. "vence 15 jul"
(`UnpaidCyclesSection.tsx:30`) obliga a hacer la resta mental de cuántos días
faltan — que es justo el dato accionable.

**Solución.**

```
CICLO ACTUAL — SIN FACTURAR
▓▓▓▓▓▓▓▓░░░░░░░░  día 12 de 30              ← 2px, ink-line + relleno accent
14 gastos                        $446.850

FACTURADO — PENDIENTE DE PAGO
$430.000
vence 15 jul · en 3 días        [Marcar pagada]
        └── si ≤2 días, la coletilla va en ámbar --fresh-warn
```

- Distancia en días junto a la fecha: `vence 15 jul · en 3 días`. Con ≤2 días,
  la coletilla en ámbar `--fresh-warn` — el mismo rol semántico que ya tiene ese
  color ("dato que exige acción pronto"), sin agregar color nuevo.
- Barra fina de progreso corte-a-corte bajo el encabezado del ciclo actual: da
  contexto al total sin facturar ("mitad del ciclo y ya van $X") sin agregar números.

**Respeta:** honestidad (muestra más contexto del dato real), sobriedad (una
línea de 2px con tokens existentes), identidad (ámbar reusado, no nuevo).

---

## P2 — Movimientos: agrupar por día

**Problema.** La lista plana repite "14 jul" en cada ítem y hace difícil el
scanning de "¿cuánto gasté el finde?".

**Solución.**

```
14 JUL                            −$23.400   ← header 11px uppercase faint
Uber a casa          Transporte    −$8.900        + subtotal día en mono
Almuerzo             Comida       −$14.500

13 JUL                            −$61.200
...
```

Encabezados de día con el patrón de label existente (11px uppercase `faint`),
fecha una sola vez por grupo, subtotal del día en mono a la derecha. Los ítems
pierden su fecha individual y ganan una línea de aire para descripción +
categoría. Cero componentes nuevos: es reorganización de los mismos datos.

**Respeta:** identidad (patrón de label ya existente), fricción mínima de lectura.

---

## Fuera de alcance de UI pero conectado

El bug conocido de **dedup import vs registro manual** (un gasto manual se
duplica al importar la cartola) tiene una salida parcial por diseño: en
`/importar`, un paso de "posibles duplicados" que muestre los matches dudosos
(mismo monto ± misma fecha, descripción distinta) y deje confirmar/descartar
antes de insertar. Convierte un bug de datos en un momento de honestidad
explícita. Anotado porque el rediseño del import lo habilita, pero es más
producto que UI.

---

## Priorización final

| # | Propuesta | Por qué este orden |
|---|-----------|--------------------|
| P1 | Chips unificados | Cierra deuda de UI conocida |
| P1 | Dashboard: jerarquía en 3 bloques | El protagonista aún compite; pura reorganización |
| P2 | Ciclo: tiempo visible | Valioso pero menos frecuente que Dashboard/Registro |
| P2 | Movimientos por día | Pulido de scanning |

**Intocables respetados en todas:** FAB descentrado (13px), estados de frescura,
saldo contable tachado (baja de nivel, no desaparece), paleta del donut, verde
como único acento, cero colores nuevos (el ámbar ya existe como `--fresh-warn`).
