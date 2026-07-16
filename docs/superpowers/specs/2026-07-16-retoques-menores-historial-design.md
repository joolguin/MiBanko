# Propuesta #5 — Retoques menores (Historial + shell)

**Fecha:** 2026-07-16
**Estado:** aprobado, listo para plan de implementación

## Contexto

Última propuesta pendiente del recorrido de crítica UI/UX. Al mirar la UI real
y el código, el alcance original (4 sub-issues) se redujo a **2 fixes**: dos de
los cuatro problemas se disolvieron al inspeccionarlos de cerca.

### Decisiones de alcance

| # | Tema | Decisión | Motivo |
|---|------|----------|--------|
| 1 | Tabs de Historial se cortan | **Arreglar** — scroll horizontal con degradado | 4 tabs no caben en 375px; "Movimientos" queda cortada sin indicio de scroll |
| 2 | Colores del donut fuera de paleta | **No tocar** | Al comparar paletas sobre el donut real, Josefa prefiere la actual: la categórica vívida gana en distinguibilidad |
| 3 | "Ingreso" tratado como gasto | **Fuera de esta tanda** | No es un bug de display: es un hueco de producto (Registrar hardcodea `type: 'gasto'`, no se pueden registrar ingresos). Se decide por separado |
| 4 | FAB tapa el umbral en Ajustes | **Bump de colchón** | El colchón actual (96px) ya despeja el último elemento por 8px; el solape es inherente al FAB flotante. Único accionable: más aire |

## Fix 1 — Scroll con degradado (tabs + filtros)

### Problema

En Historial, la fila de 4 tabs (`SLRD · Gasto · Presupuestos · Movimientos`)
es un `flex gap-2` sin manejo de overflow ([HistorialScreen.tsx:25](../../../src/features/historial/HistorialScreen.tsx)).
Las tabs no caben en 375px y "Movimientos" queda cortada contra el borde sin
ningún indicio de que hay más. La fila de filtros de Movimientos
(los tres `<select>`: `Todas / Todos / Todas` en [TransactionsTab.tsx](../../../src/features/historial/TransactionsTab.tsx))
tiene exactamente el mismo corte.

### Solución

**Función pura `edgeFades` + componente `EdgeFadeScroller`.**

#### `edgeFades(metrics)` — función pura

```ts
// src/components/ui/edgeFades.ts
export interface ScrollMetrics {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
}
export interface EdgeFades {
  left: boolean
  right: boolean
}
export function edgeFades(m: ScrollMetrics): EdgeFades
```

Reglas:
- `left = scrollLeft > EPSILON` — hay contenido oculto a la izquierda (ya se scrolleó).
- `right = scrollLeft + clientWidth < scrollWidth - EPSILON` — hay contenido oculto a la derecha.
- Sin overflow (`scrollWidth <= clientWidth`) → `{ left: false, right: false }`.
- `EPSILON` (p. ej. 1px) absorbe el redondeo sub-pixel del navegador.

Es la única lógica con ramas: se testea aislada.

#### `EdgeFadeScroller` — componente

```tsx
// src/components/ui/EdgeFadeScroller.tsx
export function EdgeFadeScroller(
  { children, className }: { children: ReactNode; className?: string }
): JSX.Element
```

- Renderiza un `div` scrolleable horizontalmente: `overflow-x-auto` + ocultar la
  barra (utilidad `scrollbar-hide` / `[-ms-overflow-style:none] [scrollbar-width:none]`
  + `::-webkit-scrollbar { display:none }`).
- Mantiene el estado `{ left, right }` calculado con `edgeFades` a partir de las
  métricas del div, actualizado en:
  - el evento `scroll` del contenedor,
  - un `ResizeObserver` sobre el contenedor (cambios de ancho / de contenido),
  - una medición inicial en el mount (`useLayoutEffect`).
- Aplica el degradado con `mask-image` (funciona sobre cualquier fondo, no
  depende de hardcodear el `#09090b`):
  - solo derecha: `linear-gradient(to right, #000 calc(100% - 24px), transparent)`
  - solo izquierda: `linear-gradient(to right, transparent, #000 24px)`
  - ambos: `linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent)`
  - ninguno: sin `mask-image`.
- `children` se renderizan tal cual dentro del div scrolleable; el componente NO
  impone estilos sobre ellos (las tabs y los selects conservan su apariencia).

#### Puntos de uso

1. **Tabs** — envolver la fila `flex gap-2` de tabs en [HistorialScreen.tsx](../../../src/features/historial/HistorialScreen.tsx)
   con `EdgeFadeScroller`. Las tabs (`<button>`) no cambian de estilo.
2. **Filtros de Movimientos** — envolver la fila `flex gap-2` de los tres
   `<select>` en [TransactionsTab.tsx](../../../src/features/historial/TransactionsTab.tsx)
   con `EdgeFadeScroller`. Los selects no cambian.

### Qué NO cambia

- Estilos, colores, tamaños y estado activo de tabs y selects.
- El orden y los labels de las tabs.
- La lógica de filtrado.

## Fix 2 — Colchón del FAB

### Problema

Al abrir Ajustes sin scrollear, la fila anteúltima ("Avisarme si el snapshot
supera (días)") queda parcialmente bajo el FAB. Medición en la app real:
la punta del FAB llega a **88px** desde el fondo del viewport; el colchón del
shell es **96px** (`pb-24` en [AppShell.tsx:32](../../../src/app/AppShell.tsx)).
El último elemento ya despeja el FAB, pero apenas por 8px, y el solape de la
anteúltima fila mientras la página está sin scrollear se siente apretado.

### Solución

Subir el colchón del contenedor de contenido con chrome de `pb-24` (96px) a
`pb-28` (112px) en [AppShell.tsx:32](../../../src/app/AppShell.tsx):

```diff
- <div className={chrome ? 'flex-1 pb-24' : 'flex-1'}>{children}</div>
+ <div className={chrome ? 'flex-1 pb-28' : 'flex-1'}>{children}</div>
```

Efecto: el último elemento pasa a despejar el FAB por ~24px en vez de 8px, en
todas las pantallas con chrome.

### Qué NO cambia

- El `nav` (se conserva `justify-around` / `px-5` / `pt-3` / `pb-6` y el
  desbalance horizontal del FAB, que es a propósito).
- El FAB (`-mt-8`, `border-4 border-ink`, tamaño).
- La rama `chrome=false` de los modales (`/registro`): sigue sin colchón.

## Testing

- `edgeFades()` — 4 casos: sin overflow → `{false,false}`; scroll al inicio →
  `{false,true}`; scroll al medio → `{true,true}`; scroll al final →
  `{true,false}`.
- `EdgeFadeScroller` — render test: envuelve los children y expone un contenedor
  scrolleable; no rompe el estado activo de las tabs cuando se usa en Historial.
- Colchón del FAB — se verifica midiendo en la app real (screenshot + medición
  del clearance), no con test unitario.

## Verificación final (375×812, dark)

1. Tabs de Historial: el fade derecho aparece al entrar, el izquierdo aparece al
   scrollear, y ambos desaparecen en los extremos correctos.
2. Filtros de Movimientos: mismo comportamiento de fade.
3. Ajustes: el umbral y "Guardar umbral" despejan el FAB con más aire.
4. `npm run build` en verde (el typecheck real de este repo) + suite de tests.

## Alcance total

- **Nuevos:** `src/components/ui/edgeFades.ts` (+ test),
  `src/components/ui/EdgeFadeScroller.tsx` (+ test).
- **Editados:** `HistorialScreen.tsx` (envolver tabs),
  `TransactionsTab.tsx` (envolver filtros), `AppShell.tsx` (una línea).
- **Sin cambios de datos, sin cambios de paleta.**

## Fuera de alcance (registrado)

- **Soporte real de ingresos** (#3): Registrar solo crea `type: 'gasto'`; la
  categoría "Ingreso" es un workaround que se guarda como gasto y ensucia el
  donut y Movimientos. Requiere su propia spec (toggle gasto/ingreso, flujo a
  donut / movimientos / SLRD). Decisión de producto pendiente.
