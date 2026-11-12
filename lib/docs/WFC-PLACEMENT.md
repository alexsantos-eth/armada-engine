# Colocación de entidades por Wave Function Collapse (plan)

**Estado: implementada (2026-11-10), sin cruce de chunks.** La fase 1 quedó así: módulo `iso::entities::wfc` con el mosaico de una casilla y huella múltiple —el solver siempre ofrece la vacancia como posibilidad—, restricciones de superficie y elevación uniforme por huella, hueco de 1 entre mismos tipos integrado en el mosaico, selección por menor entropía con tiradas `lattice_at` derivadas de la semilla, pesos por blueprint y `emptyWeight` en `content/wfc.json` (`schemaVersion` 1 entonces, 2 desde su misma publicación), validación con exigencia de peso para todo blueprint no reclamado por bioma, y chunk completamente autocontenido (sin mirar a los vecinos, para preservar el determinismo del orden de descubrimiento). Densidad reproducida como hasta ahora (≈ pesos 1, `emptyWeight` 380); arbustos y rocas crecen sueltos. El esquema 2 añade `families` (grupos de blueprints que comparten techo, p. ej. `office` junta `office_x`/`office_y`) y `maxPerChunk` (techo por chunk por blueprint o por familia, p. ej. `office` y 1 para `hospital`/`townhall`), con validación de ambos (familias no solapadas con ids de blueprint, techos finitos > 0, claves conocidas). Los biomas siguen gobernados por `iso::biomes`; el WFC reclama todo blueprint que ellos no listan. Quedan como trabajo futuro: vecindad declarativa en contenido, bosquetes para arbustos/rocas si se quieren, cruce de chunks si el diseño lo pide alguna vez.

## Objetivo

Sustituir la tirada de densidad independiente por casilla por un solver de restricciones que coloca las entidades no adscritas a biomas (edificios, muelles, barco, arbustos y rocas) con coherencia local y determinismo total.

## Restricciones heredadas (obligatorias para el solver)

- **Determinismo por semilla**: misma semilla + mismas coordenadas → mismo mundo, independientemente del orden de descubrimiento de chunks. El solver usa una corriente derivada por `derive_seed` (p. ej. `wfc-placement`) y empates rotos por `lattice_at`; nunca azar global ni orden de `HashMap` como entrada de decisión.
- **Chunk autocontenido en v1**: las restricciones se derivan del terreno (superficies, elevación) y de reglas de contenido, no de las entidades ya colocadas en chunks vecinos. Así un chunk sale igual solo que junto a sus vecinos. Si en una fase posterior se propagan fronteras entre chunks, debe hacerse con una política que no dependa del orden de carga (anillo de frontera derivado solo del terreno) o aceptar que la frontera queda sin propagar en v1.
- **Entidades biome**: los árboles siguen gobernados por `iso::biomes`; el solver gobierna lo demás y comprueba solapamiento contra lo ya colocado (`SpatialIndex`) igual que la colocación actual.
- **Multi-casilla** (huella > 1): en v1 las entidades multi-celda quedan fuera o entran como super-tiles anclados (fase 3, más abajo). Las de una casilla basta con el modelo de adjacencia.

## Modelo de decisión

1. Cada columna del chunk abre con un conjunto de posibilidades: cada blueprint cuyo huella/superficie admite la columna (huella completa en casillas del chunk, elevación uniforme de sus celdas secas), más siempre la vacancia.
2. Recorte local dirigido por el colapso: cuando una celda se asigna, sus celdas de huella quedan reclamadas; las posibilidades de las demás celdas cuya huella toca la reclamada desaparecen, igual que las del mismo blueprint a menos de 1 celda de Chebyshev (mismo tipo, hueco 1). La vacancia nunca se elimina, de modo que el mosaico nunca entra en contradicción y no hay retroceso.
3. Observación: la celda sin decidir de menor entropía; empates por `lattice_at` (corriente derivada de la semilla); la elección pesa por blueprint más `emptyWeight`.
4. El chunk es autocontenido: la vacancia siempre está disponible, no hace falta retroceso ni reinicios.

## Contenido (`content/wfc.json`, `schemaVersion` 2)

```jsonc
{
  "schemaVersion": 2,
  "emptyWeight": 380.0,
  "weights": { "house": 6.0, "bush": 4.0, "large_rock": 1.0, "...": 1.0 },
  "families": { "office": ["office_x", "office_y"] },
  "maxPerChunk": { "office": 2, "hospital": 1, "townhall": 1 }
}
```

Validado con las mismas puertas que `biomes.json` (pesos finitos positivos, blueprints citados existentes en `entities.json`); además exige un peso para cada blueprint que ningún bioma reclama, para que nada quede fuera del mundo en silencio. La superficie ya vive en el catálogo de entidades y no se duplica; `wfc.json` solo añade pesos y cuánto pesa la vacancia. Los 8 árboles que los biomas reclaman no reciben peso (su hueco lo gobierna el bosquete).

## Fases

1. ~~**Solver núcleo + paridad**~~ **Hecha**: `iso::entities::wfc` con mosaico de una casilla y huella múltiple nativa (los muelles y edificios largos son anclas con huella completa).
2. ~~**Vecindad y cotas**~~ **Recortada**: viven en el motor solo el hueco 1 mismo tipo y los techos `maxPerChunk` compartidos por familia (`families`) desde el esquema 2; la vecindad declarativa sigue para una iteración de contenido sin tocar código.
3. ~~**Huellas múltiples**~~ **Hecha**: la huella completa se valida en casillas del chunk (superficie y elevación uniforme de celdas secas), reclamando también las celdas intermedias para el mosaico.
4. **Cruce de chunks (opcional)**: no hecho; la v1 es autocontenida por diseño.
5. **Retirada del camino legado**: no hecha; `place_entities_with_content` conserva el camino legado cuando no hay catálogo wfc (`wfc: None`), que es lo que usan los tests del dominio.

## Integración (implementada)

- `ChunkManager::set_wfc(wfc: WfcCatalog)` análogo a `set_biomes`; se llama en el arranque antes del primer descubrimiento, sin tocar streaming ni guardado.
- `place_entities_with_content(columns, catalog, rules, PlacementContent { biomes, wfc, seed })` une ambos pases sobre el mismo `SpatialIndex`: biomas primero, wfc después.
- `TerrainColumn`, superficies y elevación no cambian; el guardado tampoco (las entidades guardadas siguen siendo blueprint + posición).

## Presupuesto

Chunk de 32×32 = 1024 celdas; conjuntos de posibilidades pequeños (≤ blueprints del catálogo); AC-3 en Rust es trivial de sobra para un paso por chunk en el descubrimiento. Si se supera el presupuesto, el solver es abortable por celda (se deja vacía) y medible con `src/perf` antes de optimizar nada.

## Decisiones tomadas en la fase de implementación

1. Entra **todo** lo que ningún bioma reclama (30 blueprints en el catálogo actual, los 8 árboles — 22 con peso en `wfc.json`: edificios, muelles, barco, arbustos y rocas) — los biomas conservan los 8 árboles.
2. Vecindad inicial **mínima**: hueco 1 mismo tipo; nada de vecindad declarativa en esta iteración.
3. Los techos por chunk se añadieron en el esquema 2 como `families` + `maxPerChunk` (validados en `parse_wfc`): `office` comparte techo entre `office_x`/`office_y`, `hospital` y `townhall` se limitan a 1 por chunk. Todo sigue acotado por pesos, superficies y la vacancia; la vecindad declarativa sigue fuera del motor.
4. Arbustos y rocas **sueltos**; la densidad reproduce más o menos la de antes (pesos 1, `emptyWeight` 380).
