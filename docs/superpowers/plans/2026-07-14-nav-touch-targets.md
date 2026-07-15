# Nav Touch Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los cinco ítems del bottom nav tengan un área de tap de al menos 44×44 px y que la app tenga foco visible, sin mover un solo pixel de la interfaz.

**Architecture:** El área de tap crece con un pseudo-elemento `::after` absoluto de 44×44 centrado en cada `<Link>` del nav. Al ser absoluto no participa del layout, así que las cajas siguen midiendo lo mismo y ninguna posición cambia. El foco visible es una única regla `:focus-visible` global en `src/index.css`.

**Tech Stack:** React 19, react-router-dom 7, Tailwind CSS 3.4 (soporta las variantes `after:`), Vitest + Testing Library sobre jsdom, oxlint.

Spec: `docs/superpowers/specs/2026-07-14-nav-touch-targets-design.md`

## Global Constraints

- **Las posiciones no cambian.** Los centros de los íconos son 47.7, 103.1, 174.5 (FAB), 253.4 y 321.8 px, y el nav mide 75px de alto. Estos valores deben ser idénticos antes y después. El desbalance del FAB (13px a la izquierda del centro de la pantalla) se conserva a propósito.
- **No tocar** `justify-around`, `px-5`, `pt-3`, `pb-6` del `<nav>`, ni `w-14 h-14 -mt-8` del FAB.
- Área de tap mínima: 44×44 px (WCAG 2.1 AA, criterio 2.5.5).
- Colores solo vía tokens de Tailwind (`accent`, `accent-bright`, `ink-*`), nunca hex hardcodeado.
- Tests con la convención `should_X_When_Y`. Todo en español.
- Commits en Conventional Commits, en español. No pushear.

---

### Task 1: Red de seguridad para el nav

Antes de refactorizar `NavItem` hace falta un test que falle si el refactor rompe la navegación. `AppShell` no tiene tests hoy.

**Nota sobre estos tests:** pasan en verde apenas se escriben, porque describen comportamiento que ya funciona. No son TDD (no hay red→green): son tests de caracterización, una red de seguridad para el refactor de la Task 2. Es esperado y correcto que pasen a la primera; si alguno falla, algo se entendió mal y hay que frenar.

**Files:**
- Create: `src/app/AppShell.test.tsx`

**Interfaces:**
- Consumes: `AppShell` desde `src/app/AppShell.tsx` (export nombrado, prop `children: ReactNode`).
- Produces: nada que otras tasks consuman.

`AppShell` llama `useLocation()`, así que necesita un router. El resto de los tests del repo usa `MemoryRouter` (ver `src/features/ciclo/CicloScreen.test.tsx:3`); seguir ese patrón.

- [ ] **Step 1: Escribir los tests**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'

function renderShell(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppShell><p>contenido</p></AppShell>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('should_RenderChildren', () => {
    renderShell('/')

    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('should_LinkToEveryDestination', () => {
    renderShell('/')

    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Ciclo' })).toHaveAttribute('href', '/ciclo')
    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', '/registro')
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/historial')
    expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes')
  })

  it('should_HighlightActiveItem_When_RouteMatches', () => {
    renderShell('/ciclo')

    expect(screen.getByRole('link', { name: 'Ciclo' }).firstChild).toHaveClass('text-accent-bright')
    expect(screen.getByRole('link', { name: 'Inicio' }).firstChild).not.toHaveClass('text-accent-bright')
  })
})
```

- [ ] **Step 2: Correr los tests**

Run: `npx vitest run src/app/AppShell.test.tsx`
Expected: PASS, 3 tests. Si alguno falla, parar y entender por qué antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add src/app/AppShell.test.tsx
git commit -m "test(nav): red de seguridad para AppShell antes del refactor"
```

---

### Task 2: Área de tap de 44×44 por ítem

**Files:**
- Modify: `src/app/AppShell.tsx:5-17` (`NavItem`)

**Interfaces:**
- Consumes: los tests de la Task 1 deben seguir pasando sin editarlos.
- Produces: `NavItem` con la firma `({ icon, label, active, to }: { icon: ReactNode; label: string; active?: boolean; to: string })`.

**Cambio de firma:** la prop `disabled` y la rama `!to` se eliminan. Ningún call site las usa (verificado: los cuatro `<NavItem>` de `AppShell.tsx:25-32` pasan siempre `to` y ninguno pasa `disabled`), así que son código muerto. Por eso `to` pasa de opcional a requerido y el componente ya no devuelve un `<div>` pelado. Esto también retira de la Task 1 la necesidad de testear una rama que deja de existir.

- [ ] **Step 1: Reemplazar `NavItem`**

Sustituir las líneas 5 a 17 de `src/app/AppShell.tsx` por:

```tsx
// El ::after es un área de tap de 44x44 (WCAG 2.5.5). Va absoluto y centrado a
// propósito: así no participa del layout y los íconos no se mueven ni un pixel.
// Los centros de los ítems están a 55px o más entre sí, así que no se solapan.
function NavItem({ icon, label, active, to }: {
  icon: ReactNode; label: string; active?: boolean; to: string
}) {
  return (
    <Link
      to={to}
      className="relative after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:h-11 after:w-11 after:content-['']"
    >
      <div className={`flex flex-col items-center gap-0.5 text-[10px] ${
        active ? 'text-accent-bright' : 'text-zinc-400'
      }`}>
        {icon}<span>{label}</span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Correr los tests de la red de seguridad**

Run: `npx vitest run src/app/AppShell.test.tsx`
Expected: PASS, 3 tests. Prueban que el refactor no rompió links ni estado activo.

- [ ] **Step 3: Correr toda la suite y el typecheck**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: todo verde. `tsc` confirma que ningún call site pasaba `disabled`.

- [ ] **Step 4: Verificar la geometría en el navegador**

El área de tap no se puede medir en jsdom (no computa layout ni pseudo-elementos). Se verifica en el navegador contra los valores de las Global Constraints.

Con el dev server `mibanko-dev` corriendo y el viewport en 375×812, ejecutar en la página:

```js
(() => {
  const nav = document.querySelector('nav')
  const navBox = nav.getBoundingClientRect()
  const out = [...nav.querySelectorAll('a')].map((a) => {
    const r = a.getBoundingClientRect()
    const cx = Math.round((r.left + r.right) / 2 * 10) / 10
    const cy = (r.top + r.bottom) / 2
    // Las cuatro esquinas del área de 44x44 que debe pertenecer a este link.
    const corners = [[-21, -21], [21, -21], [-21, 21], [21, 21]]
    const hits = corners.map(([dx, dy]) => {
      const el = document.elementFromPoint(cx + dx, cy + dy)
      return el === a || a.contains(el)
    })
    return { href: a.getAttribute('href'), centroX: cx, hitOk: hits.every(Boolean) }
  })
  return JSON.stringify({ navAlto: Math.round(navBox.height), items: out }, null, 1)
})()
```

Expected:
- `navAlto` = 75
- `centroX` = 47.7, 103.1, 174.5, 253.4, 321.8 en ese orden
- `hitOk` = `true` en los cinco

Si algún `centroX` cambió, el layout se movió y el cambio está mal: revisar que no se haya tocado el `<nav>`.

- [ ] **Step 5: Commit**

```bash
git add src/app/AppShell.tsx
git commit -m "fix(a11y): área de tap de 44x44 en el bottom nav"
```

---

### Task 3: Anillo de foco visible global

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: los tokens `accent-bright` de `tailwind.config.js`.
- Produces: regla CSS global; ningún componente la importa explícitamente.

No lleva test unitario: jsdom no computa `:focus-visible` ni estilos de outline, así que un test que afirmara "el foco se ve" sería falso. Se verifica en el navegador, en el Step 3.

- [ ] **Step 1: Agregar la regla**

`src/index.css` termina hoy en las tres directivas `@tailwind`. Agregar al final del archivo:

```css
@layer base {
  /* La app no tenía foco visible en ningún lado. accent-bright sobre ink-1 da
     10.17:1, muy por encima del 3:1 que pide WCAG para componentes de UI. */
  :focus-visible {
    outline: 2px solid theme(colors.accent.bright);
    outline-offset: 2px;
  }
  :focus:not(:focus-visible) {
    outline: none;
  }
}
```

- [ ] **Step 2: Confirmar que la suite sigue verde**

Run: `npm test && npm run lint`
Expected: todo verde. Ningún test existente depende de estilos de foco.

- [ ] **Step 3: Verificar el foco en el navegador**

Con el dev server corriendo en `/`, tabular hasta el primer link del nav y confirmar que el outline se ve. Ejecutar en la página:

```js
(() => {
  const a = document.querySelector('nav a')
  a.focus()
  const s = getComputedStyle(a)
  return JSON.stringify({
    match: a.matches(':focus-visible'),
    outline: s.outlineColor + ' / ' + s.outlineWidth + ' / ' + s.outlineStyle,
  })
})()
```

Expected: `match: true` y `outline: rgb(52, 211, 153) / 2px / solid`.

Además, tomar un screenshot con el foco puesto para dejar evidencia visual.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "fix(a11y): anillo de foco visible global"
```

---

## Verificación final

- [ ] `npm test` en verde
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` sin errores
- [ ] Screenshot del nav antes y después: idénticos a simple vista
- [ ] Los cinco `hitOk` en `true` y los cinco `centroX` sin cambios
