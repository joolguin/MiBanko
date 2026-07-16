# Contraste AA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ningún texto de la app baje de 4.5:1 de contraste, reemplazando los dos tokens de Tailwind que fallan (`zinc-600` a 2.57:1 y `zinc-500` a 4.12:1) por dos tokens propios que pasan, sin perder los tres niveles de jerarquía.

**Architecture:** Dos colores nuevos en `tailwind.config.js` (`faint` 4.55:1 y `muted` 5.97:1) y un reemplazo mecánico de 64 usos. Un test unitario lee los tokens del config real y afirma el umbral: el contraste es una función pura de dos hex, así que a diferencia del foco visible sí se puede probar de verdad.

**Tech Stack:** Tailwind 3.4, Vitest, oxlint. Sin cambios de runtime en React.

Spec: `docs/superpowers/specs/2026-07-16-contraste-aa-design.md`

## Global Constraints

- Fondo de referencia: **#09090b** (`ink.DEFAULT`, el que `tokens.css` fija en `html, body, #root`). No es `ink-1`.
- Mínimo WCAG 2.1 AA (1.4.3): 4.5:1 para texto normal.
- **`text-zinc-400` no se toca**: da 7.76:1 y ya pasa.
- Colores solo por token; nada de hex en componentes.
- Los `<text>` de SVG pintan con `fill`, no con `color`: `fill-zinc-500` también cuenta.
- Tests con convención `should_X_When_Y`. Todo en español.
- Conventional Commits en español. No pushear.

**Verificado antes de escribir el plan** (para que nadie lo re-descubra):
- `import config from '../../tailwind.config.js'` desde un `.ts` bajo `src/` typechequea con exit 0, pese a que `tsconfig.app.json` no tiene `allowJs`.
- `import colors from 'tailwindcss/colors.js'` (con `.js`; sin la extensión falla en runtime) funciona bajo `tsc` y bajo vitest, y devuelve `zinc600 = #52525b`, `zinc500 = #71717a`, `zinc400 = #a1a1aa`.

---

### Task 1: Los dos tokens y su test

**Files:**
- Modify: `tailwind.config.js`
- Create: `src/theme/contrast.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: los tokens `faint` y `muted` en `theme.extend.colors`, o sea las clases `text-faint`, `text-muted`, `fill-muted`, `placeholder:text-faint`. Las usa la Task 2.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/theme/contrast.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import tailwindColors from 'tailwindcss/colors.js'
import config from '../../tailwind.config.js'

// Los tokens se LEEN del config, no se duplican: si alguien oscurece `faint`,
// el test lo caza. Duplicar los hex acá haría que el test se probara a sí mismo.
const colors = (config.theme as { extend: { colors: Record<string, any> } }).extend.colors
const FONDO: string = colors.ink.DEFAULT // #09090b, el que tokens.css fija en html/body
const AA = 4.5

function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(unHex: string, otroHex: string): number {
  const [alta, baja] = [luminancia(unHex), luminancia(otroHex)].sort((a, b) => b - a)
  return (alta + 0.05) / (baja + 0.05)
}

describe('tokens de texto atenuado', () => {
  it('should_PassAA_When_FaintOnInk', () => {
    expect(contraste(colors.faint, FONDO)).toBeGreaterThanOrEqual(AA)
  })

  it('should_PassAA_When_MutedOnInk', () => {
    expect(contraste(colors.muted, FONDO)).toBeGreaterThanOrEqual(AA)
  })

  // faint es el nivel más recesivo: si alguien invierte los valores, la jerarquía
  // del diseño se da vuelta en silencio.
  it('should_KeepFaintMoreRecessiveThanMuted', () => {
    expect(contraste(colors.faint, FONDO)).toBeLessThan(contraste(colors.muted, FONDO))
  })
})

// Estos leen la paleta real de Tailwind, no copias: documentan por qué existen
// faint y muted, y avisan si algún día Tailwind cambia sus valores.
describe('los zinc de Tailwind que motivaron los tokens', () => {
  it('should_FailAA_When_Zinc600OnInk', () => {
    expect(contraste(tailwindColors.zinc[600], FONDO)).toBeLessThan(AA)
  })

  it('should_FailAA_When_Zinc500OnInk', () => {
    expect(contraste(tailwindColors.zinc[500], FONDO)).toBeLessThan(AA)
  })

  it('should_PassAA_When_Zinc400OnInk', () => {
    expect(contraste(tailwindColors.zinc[400], FONDO)).toBeGreaterThanOrEqual(AA)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/theme/contrast.test.ts`
Expected: FAIL en los 3 tests de `tokens de texto atenuado` — `colors.faint` y `colors.muted` son `undefined`, así que `hex.slice` revienta con `TypeError: Cannot read properties of undefined (reading 'slice')`.

Los 3 de `los zinc de Tailwind` pasan de entrada: describen la realidad de Tailwind, que ya existe. Es esperado.

- [ ] **Step 3: Agregar los tokens**

En `tailwind.config.js`, dentro de `theme.extend.colors`, después de `debt`:

```js
        debt: '#dc6a5a',
        // Grises de texto que pasan WCAG AA (4.5:1) sobre el fondo #09090b de la
        // app. Los zinc-600/500 de Tailwind dan 2.57 y 4.12 ahí: no alcanzan.
        // #787881 es el mínimo que pasa con el tinte zinc, elegido para conservar
        // la mayor recesividad posible. Ver src/theme/contrast.test.ts.
        faint: '#787881', // 4.55:1 — el nivel más recesivo
        muted: '#8c8c95', // 5.97:1 — texto secundario
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/theme/contrast.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js src/theme/contrast.test.ts
git commit -m "feat(theme): tokens faint y muted que pasan contraste AA"
```

---

### Task 2: Reemplazar los 64 usos

**Files:**
- Modify: 20 archivos bajo `src/` (los que usan `text-zinc-600`, `text-zinc-500` o `fill-zinc-500`)

**Interfaces:**
- Consumes: los tokens `faint` y `muted` de la Task 1.
- Produces: nada.

Ningún test afirma esas clases (verificado con grep sobre `*.test.ts*`), así que la suite no debería moverse. Los tests que sí afirman clases son de `text-accent-bright` y `border-dashed`, que no se tocan.

- [ ] **Step 1: Contar antes, para poder verificar después**

Run:
```bash
grep -rhoE "(text|fill|placeholder:text)-zinc-(500|600)" src/ | sort | uniq -c
```
Expected: `3 fill-zinc-500`, `1 placeholder:text-zinc-600`, `38 text-zinc-500`, `22 text-zinc-600`. Total 64.

- [ ] **Step 2: Reemplazar**

El orden importa: `text-zinc-500` antes que `fill-zinc-500` no se pisan (prefijos distintos), y `placeholder:text-zinc-600` contiene `text-zinc-600`, así que la primera regla lo cubre sola.

```bash
grep -rlE "(text|fill)-zinc-(500|600)" src/ | xargs sed -i '' \
  -e 's/text-zinc-600/text-faint/g' \
  -e 's/text-zinc-500/text-muted/g' \
  -e 's/fill-zinc-500/fill-muted/g'
```

- [ ] **Step 3: Verificar que no quedó ninguno**

Run:
```bash
grep -rnE "(text|fill|placeholder:text)-zinc-(500|600)" src/ || echo "OK: no quedan usos"
grep -rhoE "(text|fill|placeholder:text)-(faint|muted)" src/ | sort | uniq -c
```
Expected: "OK: no quedan usos", y el conteo nuevo suma 64 (`3 fill-muted`, `1 placeholder:text-faint`, `38 text-muted`, `22 text-faint`).

- [ ] **Step 4: Confirmar que `zinc-400` sigue intacto**

Run: `grep -rc "text-zinc-400" src/ | grep -v ":0" | wc -l`
Expected: los mismos archivos que antes; el conteo total de `text-zinc-400` sigue en 27.

Run: `grep -rhoE "text-zinc-400" src/ | wc -l`
Expected: `27`.

- [ ] **Step 5: Suite, typecheck y lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: todo verde, sin cambios en la cantidad de tests.

- [ ] **Step 6: Re-auditar las 8 pantallas en el navegador**

Con `mibanko-dev` corriendo y el viewport en 375×812, ejecutar en cada ruta este script, que lee `fill` en SVG y `color` en HTML (la versión que solo leía `color` era ciega a los `<text>` de SVG y daba el gráfico por bueno):

```js
(() => {
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null
    const [r,g,b] = m.slice(0,3).map(Number).map(v => { v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4) })
    return 0.2126*r + 0.7152*g + 0.0722*b }
  const ratio = (fg,bg) => { const a=lum(fg), b=lum(bg); if(a===null||b===null) return null
    const [hi,lo] = a>b?[a,b]:[b,a]; return +((hi+0.05)/(lo+0.05)).toFixed(2) }
  const fondoReal = (el) => { let n = el
    while (n && n !== document.documentElement) {
      if (n.namespaceURI === 'http://www.w3.org/2000/svg') { n = n.parentElement; continue }
      const bg = getComputedStyle(n).backgroundColor
      const m = bg.match(/[\d.]+/g)
      if (m && (m.length < 4 || Number(m[3]) === 1) && bg !== 'transparent') return bg
      n = n.parentElement }
    return 'rgb(9, 9, 11)' }
  const out = []
  document.querySelectorAll('body *').forEach(el => {
    const txt = [...el.childNodes].filter(n => n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim()
    if (!txt) return
    const s = getComputedStyle(el)
    if (s.visibility==='hidden' || s.display==='none') return
    const esSvg = el.namespaceURI === 'http://www.w3.org/2000/svg'
    const fg = esSvg ? s.fill : s.color
    const px = parseFloat(s.fontSize); const bold = Number(s.fontWeight) >= 700
    const minimo = (px >= 24 || (bold && px >= 18.66)) ? 3 : 4.5
    const r = ratio(fg, fondoReal(el))
    if (r !== null && r < minimo) out.push({ txt: txt.slice(0,24), px, r, fg })
  })
  const input = document.querySelector('input[placeholder]')
  const ph = input ? getComputedStyle(input, '::placeholder').color : null
  return JSON.stringify({
    pantalla: location.pathname, fallan: out.length, detalle: out,
    placeholder: ph ? { ratio: ratio(ph, 'rgb(9,9,11)'), pasa: ratio(ph, 'rgb(9,9,11)') >= 4.5 } : null,
  }, null, 1)
})()
```

Rutas: `/`, `/ciclo`, `/historial` (las 4 tabs: SLRD, Gasto, Presupuestos, Movimientos), `/ajustes`, `/registro`.

Expected: `fallan: 0` en las 8, y `placeholder.pasa: true` en `/registro`.

Referencia de lo que había antes: Dashboard 7, Ciclo 13, SLRD 6, Gasto 6, Presupuestos 3, Movimientos 10, Ajustes 6, Registro 1 + placeholder.

- [ ] **Step 7: Screenshot de comparación**

Tomar screenshot del Dashboard y del gráfico del SLRD en 375×812 dark. Mirarlos: el objetivo es que los grises suban sin que la jerarquía se aplane. Si algo quedó gritando, decirlo en vez de darlo por bueno.

- [ ] **Step 8: Commit**

```bash
git add src/
git commit -m "fix(a11y): los grises de texto pasan contraste AA"
```

---

## Verificación final

- [ ] `npm test` en verde
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` sin errores nuevos
- [ ] 0 fallos de contraste en las 8 pantallas
- [ ] El placeholder de Registro pasa
- [ ] `text-zinc-400` sigue con sus 27 usos
- [ ] Screenshots mirados, no solo medidos
