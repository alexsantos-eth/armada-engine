# Colocación de entidades por Wave Function Collapse (plan)

**Estado: plan propuesto, no implementado.** Este documento reserva el diseño para cuando se aborde la fase de colocación del resto de entidades. Nada de esto existe aún en el código; la fase actual (biomas) sigue usando `place_entities_with_biomes`.

## Objetivo

Sustituir la tirada de densidad independiente por casilla por un solver de restricciones (wave function collapse simplificado) que place las entidades no adscritas a biomas (arbustos, rocas, edificios, muelles y, cuando el juego lo quiera, todas) con coherencia local: huecos creíbles, reglas de vecindad, densidad acotada y determinismo total.

## Restricciones heredadas (obligatorias para el solver)

- **Determinismo por semilla**: misma semilla + mismas coordenadas → mismo mundo, independientemente del orden de descubrimiento de chunks. El solver usa una corriente derivada por `derive_seed` (p. ej. `wfc-placement`) y empates rotos por `lattice_at`; nunca azar global ni orden de `HashMap` como entrada de decisión.
- **Chunk autocontenido en v1**: las restricciones se derivan del terreno (superficies, elevación) y de reglas de contenido, no de las entidades ya colocadas en chunks vecinos. Así un chunk sale igual solo que junto a sus vecinos. Si en una fase posterior se propagan fronteras entre chunks, debe hacerse con una política que no dependa del orden de carga (anillo de frontera derivado solo del terreno) o aceptar que la frontera queda sin propagar en v1.
- **Entidades biome**: los árboles siguen gobernados por `iso::biomes`; el solver gobierna lo demás y comprueba solapamiento contra lo ya colocado (`SpatialIndex`) igual que la colocación actual.
- **Multi-casilla** (huella > 1): en v1 las entidades multi-celda quedan fuera o entran como super-tiles anclados (fase 3, más abajo). Las de una casilla basta con el modelo de adjacencia.

## Modelo de decisión

1. Cada columna del chunk abre con un conjunto de posibilidades: cada blueprint del catálogo cuya huella y superficie admiten la columna, más un «vacio» opcional.
2. Propagación por consistencia de arco (AC-3): si una posibilidad de la celda A exige/prohibe algo en B, recortar B; repetir hasta fijar o contradecir.
3. Observación: elegir la celda de menor entropía; si hay empate, la de menor índice por la corriente derivada; observar rolando por peso.
4. Contradicción: retroceso acotado (pila de decisiones, límite fijo) o reinicio de la celda desempate con otra semilla derivada; si agotado, dejar la celda vacía (nunca panic, nunca relleno arbitrario).

## Contenido (`content/wfc.json`, `schemaVersion` 1 — futuro)

```jsonc
{
  "schemaVersion": 1,
  "weights": { "bush": 1.0, "large_rock": 0.7 },
  "maxPerChunk": { "house": 1, "townhall": 1 },
  "adjacency": [
    { "a": "pier_x_reverse", "b": "pier_y_reverse", "allow": true },
    { "a": "house", "b": "house", "allow": false, "gap": 2 }
  ],
  "surfaces": {
    "pier_x_reverse": ["water", "sand", "grass"]
  }
}
```

Validado con las mismas puertas que `biomes.json` (ids únicos, pesos finitos positivos, blueprints citados existentes en `entities.json`). La superficie ya vive en el catálogo de entidades y no se duplica; `wfc.json` solo añade pesos, cotas y vecindad.

## Fases

1. **Solver núcleo + paridad**: módulo `iso::entities::wfc` con el mosaico de una casilla; resolver con la única regla "superficies admitidas" y fijar paridad con la colocación actual en tests (mismos conjuntos de casillas disponibles).
2. **Vecindad y cotas**: reglas `adjacency` y `maxPerChunk`, integradas con `SpatialIndex` para las comprobaciones.
3. **Huellas múltiplex**: super-tiles con verificación de uniformidad de elevación y superficie por celda (equivalente al chequeo actual de `find_placement`).
4. **Cruce de chunks (opcional)**: frontera derivada de terreno únicamente, o nada; medir antes de tocar.
5. **Retirada del camino legado**: `place_entities_with_biomes` pasa a ser un caso del solver; se conserva hasta entonces.

## Integración prevista (costuras ya presentes)

- `ChunkManager` ya recibe el "mundo de colocación" por puerto (`set_biomes`): el solver llegaría como un puerto análogo (`set_wfc` o contenido unido) sin tocar streaming ni guardado.
- `place_entities_with_biomes(columns, catalog, rules, Option<&WorldBiomes>)` marca el punto de sustitución: el WFC consumiría el mismo `Vec<TerrainColumn>` y el mismo `EntityCatalog`, y devolvería el mismo `PlacementResult`.
- `TerrainColumn`, superficies y elevación no cambian; el guardado tampoco (las entidades guardadas siguen siendo blueprint + posición).

## Presupuesto

Chunk de 32×32 = 1024 celdas; conjuntos de posibilidades pequeños (≤ blueprints del catálogo); AC-3 en Rust es trivial de sobra para un paso por chunk en el descubrimiento. Si se supera el presupuesto, el solver es abortable por celda (se deja vacía) y medible con `src/perf` antes de optimizar nada.

## Preguntas para la fase de implementación (no bloquean el plan)

1. ¿Qué blueprints entran en el solver en la primera iteración: solo naturaleza (arbustos/rocas), o también muelles y edificios?
2. ¿Reglas de vecindad iniciales mínimas (distancia entre mismos tipos, muelles junto al agua) o catálogo completo desde el principio?
3. ¿Techos de densidad por tipo (`maxPerChunk`) por defecto, o sin techo más allá de la superficie?
4. ¿Se mantiene la "estética de prado" (arbustos y rocas sueltos fuera de bosquete) o el solver los junta también en manchas?
