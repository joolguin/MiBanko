# Retoques menores (Historial + shell) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar indicio de scroll a las filas horizontales de Historial (tabs + filtros de Movimientos) con un degradado en los bordes, y darle más aire al FAB en las pantallas con chrome.

**Architecture:** Una función pura decide qué borde atenuar según las métricas de scroll y devuelve la `mask-image` correspondiente; un componente `EdgeFadeScroller` la cablea a los eventos de scroll/resize y envuelve cualquier fila horizontal. Se usa en dos lugares de Historial. Aparte, un cambio de una línea sube el colchón inferior del shell.

**Tech Stack:** React 19, TypeScript, Tailwind 3.4, Vitest + @testing-library/react.

## Global Constraints

- Mobile-first, target Pixel 9 (375×812), dark theme. Todo en español.
- Test runner: `npm test` (`vitest run`). Typecheck real: `npm run build` (`tsc -b && vite build`) — `npx tsc --noEmit` chequea 0 archivos en este repo, no sirve como evidencia.
- Naming de tests: `should_<Resultado>_When_<Condición>`.
- No tocar la paleta ni el modelo de datos. No tocar el `nav` (`justify-around` / `px-5` / `pt-3` / `pb-6` ni el desbalance horizontal del FAB, que es a propósito).
- Componentes UI viven en `src/components/ui/`.

---

### Task 1: Funciones puras `edgeFades` y `maskImageFor`

**Files:**
- Create: `src/components/ui/edgeFades.ts`
- Test: `src/components/ui/edgeFades.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface ScrollMetrics { scrollLeft: number; scrollWidth: number; clientWidth: number }`
  - `interface EdgeFades { left: boolean; right: boolean }`
  - `function edgeFades(m: ScrollMetrics): EdgeFades`
  - `function maskImageFor(f: EdgeFades): string | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/ui/edgeFades.test.ts
import { describe, it, expect } from 'vitest'
import { edgeFades, maskImageFor } from './edgeFades'

describe('edgeFades', () => {
  it('should_ReturnNoFades_When_NoOverflow', () => {
    expect(edgeFades({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 }))
      .toEqual({ left: false, right: false })
  })

  it('should_FadeRightOnly_When_AtStartWithOverflow', () => {
    expect(edgeFades({ scrollLeft: 0, scrollWidth: 500, clientWidth: 300 }))
      .toEqual({ left: false, right: true })
  })

  it('should_FadeBoth_When_ScrolledInMiddle', () => {
    expect(edgeFades({ scrollLeft: 100, scrollWidth: 500, clientWidth: 300 }))
      .toEqual({ left: true, right: true })
  })

  it('should_FadeLeftOnly_When_ScrolledToEnd', () => {
    expect(edgeFades({ scrollLeft: 200, scrollWidth: 500, clientWidth: 300 }))
      .toEqual({ left: true, right: false })
  })
})

describe('maskImageFor', () => {
  it('should_ReturnUndefined_When_NoFades', () => {
    expect(maskImageFor({ left: false, right: false })).toBeUndefined()
  })

  it('should_MaskRightEdge_When_RightOnly', () => {
    expect(maskImageFor({ left: false, right: true }))
      .toBe('linear-gradient(to right, #000 calc(100% - 24px), transparent)')
  })

  it('should_MaskLeftEdge_When_LeftOnly', () => {
    expect(maskImageFor({ left: true, right: false }))
      .toBe('linear-gradient(to right, transparent, #000 24px)')
  })

  it('should_MaskBothEdges_When_Both', () => {
    expect(maskImageFor({ left: true, right: true }))
      .toBe('linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/ui/edgeFades.test.ts`
Expected: FAIL — `edgeFades`/`maskImageFor` no existen (import error).

- [ ] **Step 3: Write minimal implementation**

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

// 1px absorbe el redondeo sub-pixel del navegador (scrollWidth/clientWidth enteros,
// scrollLeft fraccionario en zoom/retina).
const EPSILON = 1

export function edgeFades({ scrollLeft, scrollWidth, clientWidth }: ScrollMetrics): EdgeFades {
  return {
    left: scrollLeft > EPSILON,
    right: scrollLeft + clientWidth < scrollWidth - EPSILON,
  }
}

const FADE = '24px'

export function maskImageFor({ left, right }: EdgeFades): string | undefined {
  if (left && right) {
    return `linear-gradient(to right, transparent, #000 ${FADE}, #000 calc(100% - ${FADE}), transparent)`
  }
  if (right) return `linear-gradient(to right, #000 calc(100% - ${FADE}), transparent)`
  if (left) return `linear-gradient(to right, transparent, #000 ${FADE})`
  return undefined
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/ui/edgeFades.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/edgeFades.ts src/components/ui/edgeFades.test.ts
git commit -m "feat(ui): edgeFades — lógica pura de degradado por scroll"
```

---

### Task 2: Componente `EdgeFadeScroller`

**Files:**
- Create: `src/components/ui/EdgeFadeScroller.tsx`
- Test: `src/components/ui/EdgeFadeScroller.test.tsx`

**Interfaces:**
- Consumes: `edgeFades`, `maskImageFor`, `ScrollMetrics`, `EdgeFades` de `./edgeFades`.
- Produces: `function EdgeFadeScroller({ children, className }: { children: ReactNode; className?: string }): JSX.Element`

**Nota de diseño:** jsdom no implementa layout ni `ResizeObserver`. `scrollWidth`/`clientWidth` valen 0 en los tests, así que `edgeFades` devuelve `{false,false}` y no se aplica máscara — el test verifica el wiring (children + contenedor scrolleable), no el cálculo del fade (eso ya está cubierto en Task 1). El uso de `ResizeObserver` se guarda con `typeof` para no romper en jsdom.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/EdgeFadeScroller.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EdgeFadeScroller } from './EdgeFadeScroller'

describe('EdgeFadeScroller', () => {
  it('should_RenderChildren_When_Given', () => {
    render(<EdgeFadeScroller><span>hola</span></EdgeFadeScroller>)
    expect(screen.getByText('hola')).toBeInTheDocument()
  })

  it('should_BeHorizontallyScrollable', () => {
    render(<EdgeFadeScroller><span>hola</span></EdgeFadeScroller>)
    const scroller = screen.getByTestId('edge-fade-scroller')
    expect(scroller.className).toContain('overflow-x-auto')
  })

  it('should_MergeExtraClassName', () => {
    render(<EdgeFadeScroller className="mt-3"><span>hola</span></EdgeFadeScroller>)
    expect(screen.getByTestId('edge-fade-scroller').className).toContain('mt-3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/ui/EdgeFadeScroller.test.tsx`
Expected: FAIL — `EdgeFadeScroller` no existe (import error).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/ui/EdgeFadeScroller.tsx
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { edgeFades, maskImageFor, type EdgeFades } from './edgeFades'

// Envuelve una fila horizontal, la hace scrolleable sin barra visible y atenúa
// (mask-image) solo los bordes donde hay contenido oculto, como indicio de scroll.
export function EdgeFadeScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fades, setFades] = useState<EdgeFades>({ left: false, right: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setFades(edgeFades({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
  }, [])

  useLayoutEffect(measure, [measure])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', measure, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    return () => {
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [measure])

  const mask = maskImageFor(fades)

  return (
    <div
      ref={ref}
      data-testid="edge-fade-scroller"
      className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ''}`}
      style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/ui/EdgeFadeScroller.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/EdgeFadeScroller.tsx src/components/ui/EdgeFadeScroller.test.tsx
git commit -m "feat(ui): EdgeFadeScroller — fila scrolleable con degradado en bordes"
```

---

### Task 3: Envolver las tabs de Historial

**Files:**
- Modify: `src/features/historial/HistorialScreen.tsx`

**Interfaces:**
- Consumes: `EdgeFadeScroller` de `../../components/ui/EdgeFadeScroller`.
- Produces: nada nuevo.

**Detalle crítico:** en un contenedor `overflow-x-auto`, los hijos flex se encogen (flex-shrink) en vez de desbordar, y no habría scroll. El div interno lleva `w-max` para tomar el ancho de su contenido y forzar el overflow horizontal.

- [ ] **Step 1: Add the import**

En [HistorialScreen.tsx](../../../src/features/historial/HistorialScreen.tsx), agregar junto a los imports existentes:

```tsx
import { EdgeFadeScroller } from '../../components/ui/EdgeFadeScroller'
```

- [ ] **Step 2: Wrap the tab row**

Reemplazar el bloque:

```tsx
      <div className="flex gap-2 mt-3">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`rounded-lg px-3 py-1.5 text-sm active:scale-[0.98] ${
              tab === t.value ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
```

por:

```tsx
      <EdgeFadeScroller className="mt-3">
        <div className="flex gap-2 w-max">
          {TABS.map((t) => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className={`rounded-lg px-3 py-1.5 text-sm active:scale-[0.98] ${
                tab === t.value ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </EdgeFadeScroller>
```

- [ ] **Step 3: Run the existing Historial tests**

Run: `npm test -- src/features/historial/HistorialScreen.test.tsx`
Expected: PASS (sin regresiones — el cambio de las tabs de tab sigue funcionando).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: exit 0 (typecheck real).

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/HistorialScreen.tsx
git commit -m "fix(historial): tabs con indicio de scroll (EdgeFadeScroller)"
```

---

### Task 4: Envolver los filtros de Movimientos

**Files:**
- Modify: `src/features/historial/TransactionsTab.tsx`

**Interfaces:**
- Consumes: `EdgeFadeScroller` de `../../components/ui/EdgeFadeScroller`.
- Produces: nada nuevo.

- [ ] **Step 1: Add the import**

En [TransactionsTab.tsx](../../../src/features/historial/TransactionsTab.tsx), agregar junto a los imports existentes:

```tsx
import { EdgeFadeScroller } from '../../components/ui/EdgeFadeScroller'
```

- [ ] **Step 2: Wrap the filter row**

Reemplazar el bloque de los tres `<select>`:

```tsx
          <div className="flex gap-2 mt-4 text-sm">
            <label className="sr-only" htmlFor="f-cat">Categoría</label>
            <select id="f-cat" aria-label="Categoría" value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todas</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-type">Tipo</label>
            <select id="f-type" aria-label="Tipo" value={type}
              onChange={(e) => setType(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todos</option>
              {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t as TxType]}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-acc">Cuenta</label>
            <select id="f-acc" aria-label="Cuenta" value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todas</option>
              {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
```

por (mismo contenido, envuelto; `mt-4` pasa al scroller y el flex interno lleva `w-max`):

```tsx
          <EdgeFadeScroller className="mt-4">
            <div className="flex gap-2 w-max text-sm">
              <label className="sr-only" htmlFor="f-cat">Categoría</label>
              <select id="f-cat" aria-label="Categoría" value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
                <option value={ALL}>Todas</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="sr-only" htmlFor="f-type">Tipo</label>
              <select id="f-type" aria-label="Tipo" value={type}
                onChange={(e) => setType(e.target.value)}
                className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
                <option value={ALL}>Todos</option>
                {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t as TxType]}</option>)}
              </select>
              <label className="sr-only" htmlFor="f-acc">Cuenta</label>
              <select id="f-acc" aria-label="Cuenta" value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
                <option value={ALL}>Todas</option>
                {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </EdgeFadeScroller>
```

- [ ] **Step 3: Run the existing TransactionsTab tests**

Run: `npm test -- src/features/historial/TransactionsTab.test.tsx`
Expected: PASS (los filtros siguen operando por `aria-label`, que no cambió).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/TransactionsTab.tsx
git commit -m "fix(historial): filtros de Movimientos con indicio de scroll"
```

---

### Task 5: Subir el colchón del FAB en el shell

**Files:**
- Modify: `src/app/AppShell.tsx:32`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

**Nota:** cambio puramente visual sin test unitario (la cobertura de `AppShell` no mide padding). Se verifica midiendo en la app real.

- [ ] **Step 1: Change the padding**

En [AppShell.tsx:32](../../../src/app/AppShell.tsx), reemplazar:

```tsx
      <div className={chrome ? 'flex-1 pb-24' : 'flex-1'}>{children}</div>
```

por:

```tsx
      <div className={chrome ? 'flex-1 pb-28' : 'flex-1'}>{children}</div>
```

- [ ] **Step 2: Run AppShell tests**

Run: `npm test -- src/app/AppShell.test.tsx`
Expected: PASS (sin regresiones).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/AppShell.tsx
git commit -m "fix(shell): más aire entre el contenido y el FAB (pb-24 -> pb-28)"
```

---

### Task 6: Verificación end-to-end en la app real

**Files:** ninguno (solo verificación).

Levantar el dev server (`mibanko-dev`, puerto 5173) en 375×812 dark y confirmar con screenshot + medición. La regla de esta sesión: una medición responde lo que preguntás; el screenshot muestra lo que no se te ocurrió preguntar — mirar la imagen siempre.

- [ ] **Step 1: Tabs de Historial**

Ir a Historial. Verificar (screenshot): al entrar, la tab "Movimientos" ya no aparece cortada de golpe contra el borde, sino con un **degradado a la derecha** que insinúa más contenido. Scrollear la fila y confirmar que aparece el degradado izquierdo y desaparece el derecho al llegar al final.

- [ ] **Step 2: Filtros de Movimientos**

En la tab Movimientos, confirmar (screenshot) el mismo degradado en la fila de filtros (`Todas / Todos / Todas`).

- [ ] **Step 3: Colchón del FAB en Ajustes**

Ir a Ajustes. Medir en consola:

```js
const fab = document.querySelector('a[aria-label="Registrar"]')
const el = document.querySelector('[class*="pb-28"]') // contenedor de contenido
const vh = window.innerHeight
JSON.stringify({ fabTop_fromBottom: Math.round(vh - fab.getBoundingClientRect().top), colchonPx: 112 })
```

Expected: `fabTop_fromBottom` ≈ 88, colchón 112 → el último elemento despeja el FAB por ~24px. Screenshot de Ajustes scrolleado al fondo confirmando aire entre "Guardar umbral" y el FAB.

- [ ] **Step 4: Suite completa + build**

Run: `npm test` y `npm run build`
Expected: toda la suite verde, build exit 0.

- [ ] **Step 5: No hay commit** (tarea de verificación).

---

## Self-Review

**Spec coverage:**
- Fix 1 (scroll con degradado) → Tasks 1 (lógica), 2 (componente), 3 (tabs), 4 (filtros). ✔
- Fix 2 (colchón FAB) → Task 5. ✔
- Verificación final del spec → Task 6. ✔
- #2 (colores donut) y #3 (ingresos) están marcados fuera de alcance en el spec — sin tasks, correcto. ✔

**Placeholder scan:** sin TBD/TODO; todo el código está completo en cada step. ✔

**Type consistency:** `edgeFades`/`maskImageFor`/`ScrollMetrics`/`EdgeFades` definidos en Task 1 y consumidos con los mismos nombres/firmas en Task 2. `EdgeFadeScroller({ children, className })` definido en Task 2 y usado igual en Tasks 3 y 4. ✔
