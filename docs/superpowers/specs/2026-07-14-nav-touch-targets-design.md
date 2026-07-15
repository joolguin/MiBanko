# Bottom nav: áreas de tap accesibles y foco visible

Fecha: 2026-07-14
Estado: aprobado

## Problema

Los ítems del bottom nav son más chicos que el mínimo de 44×44 CSS px que exige
WCAG 2.1 AA (criterio 2.5.5, *Target Size*). Medido en el DOM con el viewport en
375×812:

| Ítem      | Tamaño real | ¿Pasa 44×44? |
| --------- | ----------- | ------------ |
| Inicio    | 24×39       | no           |
| Ciclo     | 24×39       | no           |
| Registrar | 56×56       | sí           |
| Historial | 39×39       | no           |
| Ajustes   | 35×39       | no           |

**Causa raíz**: el `<nav>` es `flex` y cada `<Link>` es un flex item sin ancho
propio, así que se encoge al tamaño de su contenido (ícono de 22px + label de
10px). `/registro` es la excepción porque declara `w-14 h-14` explícito.

El impacto es real, no teórico: durante el recorrido de la UI se falló el tap a
Ajustes dos veces.

Además, la app no define ninguna regla `:focus-visible` (0 coincidencias en las
hojas de estilo), así que la navegación por teclado no muestra foco en ningún
lado.

## Fuera de alcance

Los links del nav **sí** tienen nombre accesible: cada uno contiene su texto
("Inicio", "Ciclo", …). Una lectura inicial del árbol de accesibilidad sugirió
lo contrario, pero se verificó contra el DOM y era incorrecto. No se agregan
`aria-label`; el único que los necesitaba es el FAB y ya lo tiene.

## Restricciones

Las dos vienen de decisiones de diseño de la usuaria:

1. **La altura de la barra no cambia** y los íconos no se mueven — ni vertical
   ni horizontalmente. El área de tap crece de forma invisible.
2. El desbalance horizontal actual **se conserva**. Hoy `justify-around` con
   ítems de ancho desigual deja el FAB 13px a la izquierda del centro de la
   pantalla; normalizarlo movería los íconos hasta 16px y fue rechazado
   explícitamente.

## Diseño

### Área de tap por pseudo-elemento

Cada `<Link>` del nav recibe `relative` y un `::after` absoluto de 44×44
centrado sobre el ítem:

```
relative after:absolute after:left-1/2 after:top-1/2
after:-translate-x-1/2 after:-translate-y-1/2
after:w-11 after:h-11 after:content-['']
```

Un pseudo-elemento absoluto no participa del layout, así que las cajas siguen
midiendo 24×39 y ninguna posición cambia. Los clicks sobre el `::after` burbujean
al `<a>` que lo origina.

**No hay colisión entre áreas.** Centros medidos: 47.7, 103.1, 174.5 (FAB),
253.4, 321.8. La distancia mínima entre centros consecutivos es 55.4px
(Inicio→Ciclo), mayor que los 44px del área. Verticalmente, un área de 44px
centrada en el bloque de contenido abarca de 9.5px a 53.5px desde el borde
superior del nav, que mide 75px: entra completa.

El FAB (`/registro`) ya mide 56×56 y no se toca.

### Código muerto que se retira

`NavItem` acepta hoy una prop `disabled` y contempla el caso sin `to`, pero
ninguno de los cuatro call sites (`AppShell.tsx:25-32`) pasa `disabled` ni omite
`to`. Esa rama nunca se ejecuta. Como el refactor toca justo ese componente, se
elimina: `to` pasa a ser requerido y `NavItem` siempre devuelve un `<Link>`.

### Foco visible global

En `src/index.css`, dentro de `@layer base`:

```css
:focus-visible {
  outline: 2px solid theme(colors.accent.bright);
  outline-offset: 2px;
}
:focus:not(:focus-visible) {
  outline: none;
}
```

Global y no por componente: la regla faltaba en toda la app, así que también
cubre Ajustes, Historial y los formularios. `accent-bright` (#34d399) sobre
`ink-1` da 10.17:1, muy por encima del 3:1 que pide WCAG para componentes de UI.

## Verificación

Los tests de Testing Library corren sobre jsdom, que no computa layout ni
pseudo-elementos. Un test que afirme "el área mide 44×44" en jsdom sería mentira.
Por eso la verificación se parte en dos:

**Tests unitarios** (`src/app/AppShell.test.tsx`, convención `should_X_When_Y`) —
cubren lo que jsdom sí puede afirmar:

- los cinco destinos renderizan como link con su nombre accesible
- el ítem activo se marca según `pathname`
- `AppShell` renderiza sus children

Estos tests pasan en verde apenas se escriben: describen comportamiento que ya
funciona. No son TDD, son tests de caracterización que actúan como red de
seguridad para el refactor de `NavItem`.

**Verificación en navegador** — cubre lo que jsdom no puede:

- `document.elementFromPoint()` en las cuatro esquinas del área de 44×44 de cada
  ítem resuelve al link correcto
- las posiciones de los íconos y la altura del nav son idénticas antes y después
  (comparación de `getBoundingClientRect` contra los valores de este documento)
- el anillo de foco es visible al tabular

## Criterios de aceptación

- Los cinco ítems del nav tienen un área de tap de al menos 44×44 px.
- Ninguna posición de ícono ni la altura del nav cambian respecto de hoy.
- Las áreas de tap no se superponen entre sí.
- El foco es visible al navegar con teclado en toda la app.
- Los tests existentes siguen en verde.
