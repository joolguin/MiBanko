# Diseño — Import de cartola (BICE Visa + Santander)

**Fecha:** 2026-07-11 · **Backlog v2, ítem #1** · **Estado:** aprobado, pendiente de plan

---

## 1. Problema y valor

Registrar cada gasto a mano toma ~15 s. La mayor parte del tipeo son los gastos de la
**BICE Visa Gold** (crédito), que además son los que bajan el SLRD. Importar la cartola
elimina ese tipeo: subes el archivo, revisas, confirmas. El objetivo primario es la
Visa (deuda/SLRD); el débito Santander es analítica de categorías.

## 2. Alcance

**Dentro:**
- Importar **BICE Visa Gold** (crédito) desde CSV → gastos del ciclo actual que bajan el SLRD.
- Importar **Santander Vista** (débito, Cuentamática) desde PDF → solo analítica de categorías.
- Vista previa editable con control total del usuario antes de insertar.
- Detección de duplicados como *pista* (el usuario decide).
- Asignación de categoría en la preview (por fila y en lote), con sugerencia banco→categoría.

**Fuera (YAGNI):**
- Cuenta **BICE en pesos** (débito) — no se importa salvo pedido explícito futuro.
- Auto-categorización por reglas de keyword (ítem aparte del backlog v2).
- Modelado de **cuotas** (el plan decidió no usarlas; se importa el monto del período y se
  señala si el movimiento viene en cuotas).
- OCR de PDFs escaneados (se asume PDF con capa de texto, generado por el banco).

## 3. Arquitectura

Un solo pipeline compartido, un adaptador de parseo por fuente:

```
Archivo (BICE .csv | Santander .pdf)
   │
   ▼  [ Adaptador de parseo ]  →  RawMovement[]   (formato neutro, agnóstico del banco)
   │
   ▼  [ Vista previa editable ]  (checkbox, tipo, categoría, badge de duplicado)
   │
   ▼  [ Insert en lote ]  →  transactions (source='import')
   │
   ▼  invalida queries slrd + mes → dashboard e historial se refrescan
```

La pantalla de import no conoce columnas de BICE ni layout de PDF; solo consume
`RawMovement[]`. Esto aísla la parte frágil (PDF) del resto y hace cada parser testeable
por separado con fixtures.

### Tipo neutro e interfaz

```ts
type CartolaSource = 'bice_visa' | 'santander_vista'

interface RawMovement {
  date: string                 // 'YYYY-MM-DD'
  amount: number               // entero CLP, valor absoluto
  description: string          // glosa del banco, limpia
  kind: 'gasto' | 'ingreso'    // inferido; editable en la preview
  suggestedCategory?: string   // solo BICE: mapeo banco→categoría de la app
  installments?: string        // solo BICE: "N de M" si M>1, para señalar en la preview
  pending?: boolean            // solo BICE: el movimiento venía con "* " (sujeto a confirmación)
}

interface CartolaParser { parse(file: File): Promise<RawMovement[]> }
```

## 4. Modelo de datos

Cambio mínimo, una sola migración.

- `supabase/migrations/0008_source_import.sql`: alterar el CHECK de `transactions.source`
  a `('manual','auto','import')`. Las tx importadas se marcan `source='import'`.
- **Sin columnas nuevas.** El dedup es en memoria (§7), no persiste huella.
- Tras la migración: **regenerar `src/types/db.ts`** (o el build se rompe en silencio).

Las tx importadas usan: `source='import'`, `channel=null` (el canal no viene en la cartola),
`transaction_date` de la cartola, `description`=glosa, `category_id` asignada o null.

## 5. Los parsers

### 5.1 BICE Visa (CSV) — robusto, Fase A

CSV report-style (no tabular limpio): preámbulo, sección de totales, header, datos, footer.

- Parseo con **papaparse** (maneja comillas y comas embebidas).
- **Detección de header:** localizar la fila cuya celda == `"Fecha"`; fijar índices de
  `Fecha`, `Categoria`, `Detalle`, `Cuotas`, `Monto $`.
- **Datos:** leer filas siguientes mientras `Fecha` sea un `DD/MM/YYYY` válido; parar en el
  footer (ej. "* Movimientos sujetos a confirmación…", "Infórmate sobre…").
- **Monto:** la coma es separador de miles (`"5,500"` → `5500`). Quitar comas → entero.
  (Verificado: 5.500 + 2.470 + 3.250 = 11.220 = Total Cargos del archivo.)
- **Fecha:** `DD/MM/YYYY` → ISO.
- **Detalle:** quitar `"* "` inicial (marca de pendiente) → `pending=true`; guardar el resto
  como `description`.
- **Categoria del banco** ("Hogar", "Autos Y Transporte") → `suggestedCategory` vía
  `bankCategoryMap`.
- **Cuotas:** `"1 de 1"` = sin cuotas; `"N de M"` con M>1 → `installments`, se señala en la
  preview (no se modela cuotas, se importa el monto mostrado).
- **kind:** default `gasto` (el sample tiene Total Abonos 0). Un abono/pago/reversa se
  corrige en la preview.
- **Encoding:** decodificar Latin-1/Windows-1252 si aplica, para no romper tildes/ñ.

### 5.2 Santander Vista (PDF) — frágil, aislado, Fase B

- **pdfjs-dist** extrae la capa de texto; luego `parseSantanderLines(text)` (función pura).
- Separar *extracción* (pdf.js) de *parseo de líneas* → el core se testea con strings.
- **Estructura de movimiento:** `[NUMERO] 93 DESCRIPCION MONTO[DD/MM]`. La fecha `DD/MM`
  aparece **pegada al monto** del primer movimiento de cada día (`250.00001/06`); se arrastra
  a los movimientos siguientes hasta la próxima fecha. `--- Saldo Dia --- <saldo>` cierra el día.
- **Monto:** punto = separador de miles (`"250.000"` → `250000`). Quitar puntos → entero.
- **kind por glosa:** `"Transf de …"` → `ingreso` (abono); `"Compra …"`, `"Giro …"`,
  `"Pago …"`, `"Transf a …"` → `gasto` (cargo).
- **Año:** el PDF trae el rango de la cartola en el header (`DESDE HASTA`); se usa para
  completar el año de las fechas `DD/MM`.
- **Límite honesto:** PDF escaneado sin texto no funciona (fuera de alcance). Lo que el parser
  saque mal se corrige/elimina en la preview.

## 6. Vista previa, insert e impacto en SLRD

Pantalla `Importar movimientos`, accesible desde **Ajustes** (el bottom-nav no se toca).

1. Elegir **fuente** (BICE Visa / Santander Vista) → define cuenta + parser.
2. Seleccionar archivo → parsear a `RawMovement[]`.
3. **Tabla editable**, una fila por movimiento:
   - checkbox (importar sí/no) — default marcado; desmarcado si es duplicado sospechoso.
   - fecha · glosa · monto (lectura).
   - tipo (gasto/ingreso) prellenado, editable.
   - categoría (dropdown) prellenada con la sugerencia (BICE), editable.
   - badge ⚠ "posible duplicado" cuando aplica.
   - acciones en lote: seleccionar varias → asignar categoría; marcar todas / ninguna.
   - cabecera resumen: N seleccionados · suma · rango de fechas · duplicados detectados.
4. **Impacto SLRD (honestidad):** BICE → "estos N gastos entran al ciclo actual y bajarán tu
   SLRD en $X". Santander → "solo analítica, no afecta tu SLRD".
5. **Confirmar** → insert en lote.

**Insert:** las filas marcadas → un solo `supabase.from('transactions').insert([...])`:
- BICE → `account = Visa (credit)`, `billing_cycle_id = null` (ciclo actual sin facturar) → baja SLRD.
- Santander → `account = Vista (debit)` → `slrdDelta = 0`, no toca SLRD.
- **Atómico:** un statement; si falla, no entra nada.
- Al terminar: invalidar `['slrd']` y `['month', …]`, volver con aviso "N importados".
- Sin update optimista (el import no es el hot-path de 15 s; tolera un refetch).

## 7. Detección de duplicados

Al parsear, `useImportPreview` consulta las tx existentes de la cuenta seleccionada dentro de
`[min(date), max(date)]` del archivo. `importDedup` (puro) marca como sospechosa toda fila
que calce en `(transaction_date, amount, description-normalizada)`. Marcadas → checkbox off,
badge ⚠. El usuario puede re-marcarlas. No se persiste ninguna huella.

## 8. Módulos

```
parsers/types.ts                     RawMovement, CartolaSource, CartolaParser
parsers/biceVisaCsv.ts               parseBiceVisaCsv + helpers puros (findHeader, parseAmount, parseDate)
parsers/santanderPdf.ts              extractPdfText (pdf.js) + parseSantanderLines (puro)
features/import/importDedup.ts       flag de duplicados (puro)
features/import/bankCategoryMap.ts   Categoria BICE → categoría de la app (puro)
features/import/ImportScreen.tsx     orquesta: fuente, archivo, estado de preview
features/import/PreviewTable.tsx     tabla editable
data/useImportPreview.ts             fetch de tx existentes para dedup (por cuenta + rango)
data/useImportTransactions.ts        mutación de insert en lote
```

Cada unidad: una responsabilidad, interfaz clara, testeable en aislamiento.

## 9. Testing (TDD, patrón AAA)

| Unidad | Casos |
|---|---|
| `parseBiceVisaCsv` | preámbulo/header/footer, monto con coma de miles, `* ` pendiente, cuotas `N de M`, fecha `DD/MM/YYYY` |
| `parseSantanderLines` | fecha pegada al monto, arrastre de día, `--- Saldo Dia ---`, "Transf de" vs "Compra", año desde el rango |
| `importDedup` | marca duplicados exactos; no marca montos/fechas/glosas distintas |
| `bankCategoryMap` | mapeo conocido → categoría; desconocido → null |
| `useImportTransactions` | payload del insert en lote (source='import', billing_cycle_id, channel null) |
| `PreviewTable` / `ImportScreen` | render, toggle de filas, asignación en lote, confirmar con payload correcto, estados loading/error/empty |

Fixtures: los CSV/PDF reales con montos tachados, guardados en `src/parsers/__fixtures__/`.

## 10. Fases de implementación (un spec, dos slices)

- **Fase A — Pipeline + BICE Visa (CSV).** Todo lo compartido (pantalla, preview, dedup,
  insert en lote, migración `source='import'`) + parser robusto. Mayor valor (baja el SLRD);
  se puede shippear solo.
- **Fase B — Santander Vista (PDF).** Suma el adaptador frágil al mismo pipeline. Aislado,
  no toca la Fase A.

Cada fase será su propio plan de implementación.

## 11. Dependencias nuevas

- `papaparse` (+ `@types/papaparse`) — CSV robusto.
- `pdfjs-dist` — extracción de texto del PDF.
- Ambas **lazy**, solo en el chunk de import (encaja con el code-splitting por ruta ya existente).

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Layout del PDF Santander cambia o extrae mal | Parser aislado + preview editable; el usuario corrige/elimina filas |
| Formato de monto ambiguo (coma vs punto de miles) | Normalización explícita por parser + tests con fixtures reales |
| Importar un período BICE ya facturado (doble conteo) | Alcance: solo ciclo actual sin facturar; `billing_cycle_id=null` |
| Reimportar solapado → duplicados | Detección + preview con control del usuario |
| Cartola BICE trae abonos/reversas | `kind` editable en la preview; default `gasto` |
