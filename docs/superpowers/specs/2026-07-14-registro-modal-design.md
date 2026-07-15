# Registrar: pantalla modal y selectores de valor

Fecha: 2026-07-14
Estado: aprobado

## Problema

En 375×812 la pantalla `/registro` desborda el viewport y **nunca deja ver el
monto y el botón Guardar al mismo tiempo**:

| | scroll arriba | scroll abajo |
| --- | --- | --- |
| Monto | visible (top 53) | cortado (top −43) |
| Guardar | tapado por el nav | libre (bottom 716) |

**Causa raíz**: `RegistroScreen` es `min-h-[100dvh]` (812px) y `AppShell` envuelve
a sus children en `<div className="flex-1 pb-24">`, que agrega 96px debajo. La
página mide 908px en un viewport de 812: desborda exactamente esos 96px.

No es falta de espacio. El contenido real mide **634px** — entra en el viewport
con nav (716 disponibles, 82px de holgura) y sin nav (812, 178px de holgura). El
desborde es puramente la suma `min-h-[100dvh] + pb-24`.

### Los chips no dicen lo que parecen decir

En `RegistroScreen.tsx:68-71`, tres de los cuatro chips tienen `active` fijo en
`true` (cuenta, tipo y canal siempre tienen valor). Un estado que nunca varía no
comunica nada: el verde deja de significar "elegido" y pasa a ser decoración que
compite con el monto.

Además `<Chip label="Gasto" active />` (línea 69) no recibe `onClick`: es un
`<button>` que se escala al tocarlo y no hace nada. Miente sobre su affordance.

La app tiene hoy tres tratamientos de chip conviviendo:

1. `bg-accent text-accent-deep` inline en `HistorialScreen`, `SlrdTab` y
   `BudgetSheet` — el patrón documentado en CLAUDE.md, duplicado a mano y sin
   pasar por ningún componente.
2. El componente `Chip`: `border-accent text-accent-bright bg-accent/10`.
3. `SubscriptionSheet`, que usa `Chip` con semántica de selector real
   (`active={channel === c.id}`: exactamente uno activo).

Unificar los tres está **fuera de alcance** de este cambio.

### Los chips fallan el tamaño de tap

Medidos: 34px de alto, con las filas separadas 42px. Fallan WCAG 2.5.5 (44×44),
igual que el nav. A diferencia del nav, acá **no sirve** el truco del `::after`
invisible: un área de 44px se solaparía con la fila de al lado (42px de
separación). Tienen que crecer de verdad.

## Decisiones de diseño

Tomadas por Josefa sobre mockups comparativos:

1. **Modal sin nav** (opción A sobre "conservar el nav"). En una pantalla de
   captura el nav es una trampa: tocar "Ciclo" a mitad de un gasto pierde lo
   cargado sin avisar. Y el FAB apunta a la pantalla donde ya estás.
2. **Selectores neutros** (sobre "patrón de la casa literal" y "no tocar"). El
   monto es el protagonista; el verde se reserva para lo único que falta elegir.

## Diseño

### Cromo condicional

El router es quien sabe qué rutas son modales, así que la decisión vive ahí y no
dentro de `AppShell`:

```tsx
{ path: '/registro', element: screen(<RegistroScreen />, { chrome: false }) }
```

`AppShell` acepta `chrome = true` por defecto. Con `chrome: false` no renderiza
el `<nav>` y el wrapper de children pierde el `pb-24`. Sin esos 96px, el
`min-h-[100dvh]` de la sección deja de desbordar: 634px de contenido en 812.

No se hardcodea `'/registro'` dentro del shell.

### Header y salida

Una fila superior con el label `registrar gasto` —mismo estilo que las secciones
del Dashboard: `text-[11px] uppercase tracking-[0.14em] text-zinc-600`— y un
botón ✕ a la derecha con `aria-label="Cancelar"`.

El ✕ hace `nav(-1)`: volvés de donde viniste, que es el contrato de un modal. La
PWA declara `start_url: '/'`, así que `/registro` nunca es un arranque en frío y
no hay riesgo de salir de la app.

El label `monto` se elimina: con el header diciendo qué estás haciendo, un número
de 52px con signo `$` no necesita que le expliquen que es plata.

### Componente Picker

Nuevo, en `src/components/ui/Picker.tsx`. Separado de `Chip` a propósito, porque
son cosas distintas:

- `Chip` es un toggle: uno activo entre varios (`SubscriptionSheet`). **No se
  toca**, así que Ajustes queda igual.
- `Picker` abre un BottomSheet y muestra el valor actual con un `▾`.

```
neutro: border-ink-line bg-ink-2 text-zinc-200
falta:  border-dashed border-accent text-accent-bright
altura: min-h-11 (44px, WCAG 2.5.5)
```

En `RegistroScreen`, cuenta y canal usan `Picker` neutro; `Categoría` usa
`falta={!category}`. `Gasto` deja de ser un `<button>` y pasa a texto plano.

## Verificación

**Tests unitarios** (convención `should_X_When_Y`):

- `AppShell.test.tsx`: el nav no se renderiza con `chrome={false}`; sí con el
  default.
- `RegistroScreen.test.tsx`: el ✕ navega hacia atrás; `Gasto` no es un botón.
- `Picker.test.tsx` (nuevo): dispara `onClick`; refleja el estado `falta`.

**Test existente a actualizar**: `should_DefaultToBiceGastoWallet_When_Opened` usa
`getByText(/gasto/i)`, que con el header `registrar gasto` matchearía dos
elementos y fallaría. Se ajusta en el mismo commit.

**Verificación en navegador** — lo que jsdom no puede medir:

- `scrollHeight === clientHeight` en `/registro`: no hay desborde.
- El monto y el botón Guardar visibles simultáneamente, sin scroll.
- Los cuatro selectores con alto ≥44px.
- El nav ausente en `/registro` y presente en el resto.

## Criterios de aceptación

- `/registro` no scrollea: monto y Guardar visibles a la vez.
- El nav y el FAB no aparecen en `/registro`; sí en las demás rutas.
- El ✕ vuelve a la pantalla anterior.
- Los selectores miden al menos 44px de alto.
- `Chip` y `SubscriptionSheet` quedan sin cambios.
- La suite existente sigue en verde.
