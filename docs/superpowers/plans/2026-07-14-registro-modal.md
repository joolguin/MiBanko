# Registro Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/registro` deje de desbordar el viewport —monto y botón Guardar visibles a la vez— tratándola como pantalla modal sin nav, y que sus chips pasen a ser selectores de valor honestos de 44px.

**Architecture:** El router declara qué rutas van sin cromo (`screen(<X />, { chrome: false })`); `AppShell` acepta `chrome = true` y omite el `<nav>` y el `pb-24` cuando es `false`. Sin esos 96px, el `min-h-[100dvh]` de la sección deja de desbordar. Un componente nuevo `Picker` reemplaza a `Chip` dentro de Registro, sin tocar `Chip` ni Ajustes.

**Tech Stack:** React 19, react-router-dom 7, Tailwind 3.4, @phosphor-icons/react, Vitest + Testing Library (jsdom), oxlint.

Spec: `docs/superpowers/specs/2026-07-14-registro-modal-design.md`

## Global Constraints

- Contenido real de `/registro`: **634px**. Viewport objetivo 375×812 (Pixel 9).
- Área de tap mínima 44×44 px (WCAG 2.5.5) para todo control nuevo o tocado.
- Colores solo con tokens (`ink-2`, `ink-line`, `accent`, `accent-bright`, `zinc-*`). Nada de hex.
- **`Chip` (`src/components/ui/Chip.tsx`) no se toca**, y `SubscriptionSheet` queda igual.
- Íconos de `@phosphor-icons/react`, montos con `MoneyText`.
- Tests con convención `should_X_When_Y`. Todo en español.
- Conventional Commits en español. No pushear.

---

### Task 1: Componente Picker

**Files:**
- Create: `src/components/ui/Picker.tsx`
- Test: `src/components/ui/Picker.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `Picker({ label, onClick, falta }: { label: string; onClick: () => void; falta?: boolean })`. Lo usa la Task 3.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/ui/Picker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Picker } from './Picker'

describe('Picker', () => {
  it('should_CallOnClick_When_Pressed', async () => {
    const onClick = vi.fn()
    render(<Picker label="BICE Visa Gold" onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'BICE Visa Gold' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('should_ShowCurrentValueAsAccessibleName', () => {
    render(<Picker label="Comida" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Comida' })).toBeInTheDocument()
  })

  it('should_MarkAsMissing_When_FaltaIsTrue', () => {
    render(<Picker label="Categoría" onClick={vi.fn()} falta />)

    expect(screen.getByRole('button', { name: 'Categoría' })).toHaveClass('border-dashed')
  })

  it('should_NotMarkAsMissing_When_FaltaIsOmitted', () => {
    render(<Picker label="Comida" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Comida' })).not.toHaveClass('border-dashed')
  })
})
```

**Sobre los dos últimos tests:** afirman una clase, que es implementación, no comportamiento. El estado `falta` es puramente visual y jsdom no computa estilos, así que no hay una aserción de comportamiento honesta disponible; sirven como guardia contra que alguien borre la prop. La apariencia real se verifica en el navegador (Task 3, Step 6). No conviene inventar aserciones más "semánticas" acá: el estado ya se comunica por texto (`Categoría` sin elegir vs `Comida` elegida), así que no depende del color y no hace falta un `aria-*` extra.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/ui/Picker.test.tsx`
Expected: FAIL — `Failed to resolve import "./Picker"`.

- [ ] **Step 3: Implementación mínima**

Crear `src/components/ui/Picker.tsx`:

```tsx
import { CaretDown } from '@phosphor-icons/react'

interface Props { label: string; onClick: () => void; falta?: boolean }

// Distinto de Chip a propósito: Chip es un toggle (uno activo entre varios, como
// en SubscriptionSheet); Picker abre un BottomSheet y muestra el valor actual.
// min-h-11 son los 44px de WCAG 2.5.5: acá no sirve el ::after invisible del nav
// porque las filas de selectores quedan a 42px y las áreas se solaparían.
export function Picker({ label, onClick, falta }: Props) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 min-h-11 px-4 rounded-full text-sm border transition-colors active:scale-[0.98] ${
        falta ? 'border-dashed border-accent text-accent-bright' : 'border-ink-line bg-ink-2 text-zinc-200'
      }`}>
      {label}
      <CaretDown size={12} weight="bold" className="text-zinc-500" aria-hidden="true" />
    </button>
  )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/ui/Picker.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Picker.tsx src/components/ui/Picker.test.tsx
git commit -m "feat(ui): componente Picker para selectores de valor"
```

---

### Task 2: Cromo condicional en AppShell y router

**Files:**
- Modify: `src/app/AppShell.tsx:19-36` (`AppShell`)
- Modify: `src/app/router.tsx` (helper `screen` y la ruta `/registro`)
- Test: `src/app/AppShell.test.tsx` (ya existe; se le agregan dos tests)

**Interfaces:**
- Consumes: nada de la Task 1.
- Produces: `AppShell({ children, chrome = true }: { children: ReactNode; chrome?: boolean })`, y `screen(node: ReactNode, opts?: { chrome?: boolean })` en el router.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar dentro del `describe('AppShell')` de `src/app/AppShell.test.tsx`, después del test `should_HighlightActiveItem_When_RouteMatches`:

```tsx
  it('should_HideNav_When_ChromeIsFalse', () => {
    render(
      <MemoryRouter initialEntries={['/registro']}>
        <AppShell chrome={false}><p>contenido</p></AppShell>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('should_ShowNav_When_ChromeIsOmitted', () => {
    renderShell('/')

    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Correr los tests y verificar que uno falla**

Run: `npx vitest run src/app/AppShell.test.tsx`
Expected: FAIL en `should_HideNav_When_ChromeIsFalse` — el `<nav>` se renderiza igual, así que `queryByRole('navigation')` no da null. (`should_ShowNav_When_ChromeIsOmitted` ya pasa: el nav siempre está hoy.)

- [ ] **Step 3: Implementar el prop en AppShell**

Reemplazar el cuerpo de `AppShell` en `src/app/AppShell.tsx` (líneas 19 a 36) por:

```tsx
// chrome=false es para pantallas modales (/registro): sin nav ni FAB, y sin el
// pb-24 que les hace de colchón. Ese padding sumado al min-h-[100dvh] de la
// pantalla es lo que hacía desbordar el viewport en 96px.
export function AppShell({ children, chrome = true }: { children: ReactNode; chrome?: boolean }) {
  const { pathname } = useLocation()
  return (
    <div className="min-h-[100dvh] flex flex-col font-sans">
      <div className={chrome ? 'flex-1 pb-24' : 'flex-1'}>{children}</div>
      {chrome && (
        <nav className="fixed bottom-0 inset-x-0 border-t border-ink-line bg-ink-1 flex items-center justify-around px-5 pt-3 pb-6">
          <NavItem to="/" active={pathname === '/'} label="Inicio" icon={<House size={22} />} />
          <NavItem to="/ciclo" active={pathname === '/ciclo'} label="Ciclo" icon={<CalendarBlank size={22} />} />
          <Link to="/registro" aria-label="Registrar"
            className="w-14 h-14 -mt-8 rounded-full bg-accent flex items-center justify-center border-4 border-ink active:scale-[0.97] transition-transform">
            <Plus size={26} weight="bold" className="text-accent-deep" />
          </Link>
          <NavItem to="/historial" active={pathname === '/historial'} label="Historial" icon={<ChartLine size={22} />} />
          <NavItem to="/ajustes" active={pathname === '/ajustes'} label="Ajustes" icon={<GearSix size={22} />} />
        </nav>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/app/AppShell.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Cablear el router**

En `src/app/router.tsx`, reemplazar el helper `screen`:

```tsx
function screen(node: ReactNode, opts?: { chrome?: boolean }) {
  return (
    <AppShell chrome={opts?.chrome}>
      <Suspense fallback={<RouteFallback />}>{node}</Suspense>
    </AppShell>
  )
}
```

Y la ruta de `/registro`:

```tsx
  { path: '/registro', element: screen(<RegistroScreen />, { chrome: false }) },
```

Las otras seis rutas quedan igual: `screen(<X />)` pasa `chrome={undefined}`, que toma el default `true`.

- [ ] **Step 6: Correr la suite y el typecheck**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: todo verde.

- [ ] **Step 7: Commit**

```bash
git add src/app/AppShell.tsx src/app/AppShell.test.tsx src/app/router.tsx
git commit -m "feat(registro): cromo condicional por ruta en AppShell"
```

---

### Task 3: RegistroScreen — header, salida y selectores

**Files:**
- Modify: `src/features/registro/RegistroScreen.tsx:62-83` (header, monto y chips)
- Modify: `src/features/registro/RegistroScreen.test.tsx`

**Interfaces:**
- Consumes: `Picker` de la Task 1 (`{ label, onClick, falta }`); el `chrome: false` de la Task 2 ya deja `/registro` sin nav.
- Produces: nada.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/features/registro/RegistroScreen.test.tsx`:

(a) Al principio del archivo, **antes** de los `vi.mock` de datos, mockear `useNavigate` para poder afirmar la navegación del ✕. `vi.hoisted` es necesario porque `vi.mock` se iza por encima de las declaraciones:

```tsx
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))
```

(b) En el `beforeEach`, agregar `navigate.mockReset()` junto a `mutate.mockReset()`.

(c) Reemplazar el test `should_DefaultToBiceGastoWallet_When_Opened` por esta versión. El `getByText(/gasto/i)` actual matchea dos elementos con el header nuevo (`registrar gasto` y `Gasto`) y falla; `getByText('Gasto')` es exacto y solo matchea el texto plano:

```tsx
  it('should_DefaultToBiceGastoWallet_When_Opened', () => {
    renderScreen()
    expect(screen.getByText('BICE Visa Gold')).toBeInTheDocument()
    expect(screen.getByText('Gasto')).toBeInTheDocument()
    expect(screen.getByText('Wallet Pixel')).toBeInTheDocument()
  })
```

(d) Agregar estos dos tests dentro del `describe('RegistroScreen')`:

```tsx
  it('should_GoBack_When_CancelPressed', async () => {
    renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(navigate).toHaveBeenCalledWith(-1)
  })

  // "Gasto" era un <button> con onClick: se escalaba al tocarlo y no hacía nada.
  it('should_NotRenderGastoAsButton', () => {
    renderScreen()

    expect(screen.queryByRole('button', { name: 'Gasto' })).toBeNull()
    expect(screen.getByText('Gasto')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/features/registro/RegistroScreen.test.tsx`
Expected: FAIL — `should_GoBack_When_CancelPressed` no encuentra el botón "Cancelar", y `should_NotRenderGastoAsButton` falla porque hoy "Gasto" sí es un botón.

- [ ] **Step 3: Actualizar los imports**

En `src/features/registro/RegistroScreen.tsx`, agregar el ícono y el `Picker`, y quitar el `Chip`:

```tsx
import { X } from '@phosphor-icons/react'
import { Picker } from '../../components/ui/Picker'
```

Borrar la línea `import { Chip } from '../../components/ui/Chip'`.

- [ ] **Step 4: Reemplazar header, monto y chips**

Sustituir las líneas 63 a 72 de `src/features/registro/RegistroScreen.tsx` (desde `<section` hasta el `</div>` que cierra el bloque de chips) por:

```tsx
    <section className="px-6 pt-8 flex flex-col min-h-[100dvh]">
      <header className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">registrar gasto</p>
        <button type="button" onClick={() => nav(-1)} aria-label="Cancelar"
          className="-mr-3 p-3 text-zinc-400 active:scale-[0.9] transition-transform">
          <X size={20} />
        </button>
      </header>
      <MoneyText value={amount} className="text-[52px] leading-none text-zinc-50 mt-1" />

      <div className="flex flex-wrap items-center gap-2 mt-6">
        <Picker label={account?.name ?? 'Cuenta'} onClick={() => setSheet('account')} />
        <span className="text-sm text-zinc-400 px-1">Gasto</span>
        <Picker label={CHANNELS.find((c) => c.id === channel)!.label} onClick={() => setSheet('channel')} />
        <Picker label={category?.name ?? 'Categoría'} onClick={() => setSheet('category')} falta={!category} />
      </div>
```

Notas sobre este bloque:
- Desaparece el `<p>` con el label `monto`: el header ya dice qué pantalla es.
- El ✕ usa `p-3` con un ícono de 20px, o sea 44×44 de área. El `-mr-3` compensa el padding para que el ícono quede alineado con el borde del `px-6`.
- `nav` es el `useNavigate()` que ya está declarado en la línea 25.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run src/features/registro/RegistroScreen.test.tsx`
Expected: PASS, 7 tests.

Después la suite entera: `npm test && npx tsc --noEmit && npm run lint`
Expected: todo verde.

- [ ] **Step 6: Verificar en el navegador**

Con `mibanko-dev` corriendo y el viewport en 375×812, navegar a `/registro` y ejecutar:

```js
(() => {
  const de = document.documentElement
  const guardar = [...document.querySelectorAll('button')].find(b => /Guardar/.test(b.textContent))
  const monto = document.querySelector('section header + span') // MoneyText renderiza un <span>
  const pickers = [...document.querySelectorAll('section button')].filter(b => b.className.includes('rounded-full'))
  const cancelar = document.querySelector('button[aria-label="Cancelar"]')
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= de.clientHeight }
  return JSON.stringify({
    pathname: location.pathname,
    desborde: de.scrollHeight - de.clientHeight,
    navPresente: !!document.querySelector('nav'),
    montoVisible: vis(monto),
    guardarVisible: vis(guardar),
    selectores: pickers.map(p => ({ t: p.textContent.trim(), alto: Math.round(p.getBoundingClientRect().height) })),
    cancelar: [Math.round(cancelar.getBoundingClientRect().width), Math.round(cancelar.getBoundingClientRect().height)],
  }, null, 1)
})()
```

Expected:
- `pathname` = `/registro`, `desborde` = 0
- `navPresente` = false
- `montoVisible` y `guardarVisible` = true (los dos a la vez, que es el criterio del spec)
- los cuatro `selectores` con `alto` ≥ 44
- `cancelar` = `[44, 44]`

Después navegar a `/` y confirmar que ahí `navPresente` vuelve a ser true.

Tomar screenshot de `/registro` como evidencia.

- [ ] **Step 7: Commit**

```bash
git add src/features/registro/RegistroScreen.tsx src/features/registro/RegistroScreen.test.tsx
git commit -m "feat(registro): pantalla modal con selectores de valor"
```

---

## Verificación final

- [ ] `npm test` en verde
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` sin errores nuevos (hay 13 warnings preexistentes en `router.tsx`)
- [ ] `/registro`: `desborde` 0, monto y Guardar visibles a la vez, sin nav
- [ ] Las otras seis rutas conservan el nav
- [ ] `Chip.tsx` y `SubscriptionSheet.tsx` sin cambios: `git diff main --stat` no los menciona
