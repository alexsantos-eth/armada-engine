# Revisión del core

Backlog vivo de la skill `armada-core-review`. Cada revisión añade una entrada, actualiza el estado de los hallazgos anteriores y no repite lo ya registrado. Vive en la raíz (no en `docs/`, que es salida de Typedoc).

Criterio: el core debe sostener un **RPG isométrico procedural de supervivencia**: mundo por semilla y por chunks, simulación determinista y persistente, sistemas RPG data-driven, guardado/carga y rendimiento con miles de entidades.

Niveles: **Bloqueante** (rompe la visión) · **Alta** (reescritura cara cuando llegue un sistema previsto) · **Media** (corregible localmente) · **Baja** (higiene).

## 2026-10-16 — Modelo World y core sin `window`

Aplicadas las fases 1 y 2 del plan, a petición del usuario.

| # | Estado | Cambio |
|---|---|---|
| 5 | Corregido | `engine/world`: `World` (seed, tamaño, `spawnPlateau`, columnas, superficies, entidades) es la fuente de verdad. `generateWorld()` genera; `createIsometricScene(app, world)` solo lee y renderiza. La meseta central de demo es ahora `applySpawnPlateau()`/`getSpawnArea()` en `terrain/spawn.ts`, opción `spawnPlateau` (por defecto activa). Eliminada la caché singleton `getOrCreateTerrain()`. |
| 5 | Corregido | Guardado: `serializeWorld()` → `WorldSnapshot` JSON versionado (terreno regenerado desde la semilla, entidades como datos) y `restoreWorld()` con `Entity.fromData()`. |
| 8 | Corregido | `WIDTH` es una constante estática (1300); el core no lee `window`. Eliminado el shim `tests/setup.ts`: si un módulo del core vuelve a leer `window`, la suite falla. |
| 11 | Corregido | `colorVariant` forma parte de `EntityData`: se elige al crear la entidad (flujo `"entity-color-variants"`) y se guarda. `getColorVariationCount`/`pickColorVariation` pasan de `render/svg` a `entities/variants`. |

Pendiente del plan: fases 3 (capas: `Box`/`fillElevations` a `terrain`, renombrar `board`/`projection`, contenido fuera de `entities`), 4 (chunks) y 5 (bucle y cámara). Nota para la fase 4: los snapshots solo guardan entidades; cuando el terreno sea modificable habrá que guardar sus deltas y subir `WORLD_SNAPSHOT_VERSION`.

## 2026-10-16 — Primera revisión (tras el trabajo de formaciones)

Las formaciones (`formation.ts`) están bien aisladas, son puras y consumen `random` de forma documentada. Los hallazgos son del core en general.

### Corregido en esta revisión

| # | Nivel | Hallazgo | Corrección |
|---|---|---|---|
| 1 | Bloqueante | Mundo no reproducible: `getOrCreateTerrain()` usaba `Date.now()` como semilla, `createEntitiesFromConfig()` y `replaceSvgColors()` usaban `Math.random()`. Sin semilla no hay guardado, mundos compartidos ni depuración reproducible. | Nuevo módulo `engine/random` (`createSeededRandom`, `deriveSeed`, `DEFAULT_WORLD_SEED`, `resolveWorldSeed`). La escena recibe `seed` y deriva un flujo por sistema. `page.tsx` es el único sitio con `Math.random()` y acepta `?seed=`. Tests de determinismo en terreno, entidades y escena. |
| 2 | Alta | Las entidades no tenían identidad de instancia: imposible referenciarlas desde guardado, IA, eventos o inventario. | `EntityData.id` / `Entity.id` estable (`<tipo>@<x>,<y>` del ancla al crearse), con `id` explícito para restaurar. |
| 3 | Media | Una textura y un `fetch` del SVG por cada instancia con `colorReplacements` (`entity:${index}`): coste lineal en memoria de GPU y red con el número de árboles/edificios. | Una textura por (tipo, variación). `pickColorVariation()` / `getColorVariationCount()` en `render/svg`; `replaceSvgColors` y `createSvgColorVariant` reciben un índice en vez de un `random`. |
| 4 | Baja | `generatePerlinTerrain` duplicaba un RNG privado. | Usa `createSeededRandom` compartido. |

### Pendiente — requiere decisión (plan por fases)

| # | Nivel | Hallazgo | Dónde |
|---|---|---|---|
| 5 | Alta (corregido) | **La escena es la fuente de verdad y el generador del mundo.** `createIsometricScene` genera terreno, aplica una meseta central fija (código de demo), rellena columnas, crea entidades y renderiza. No existe un modelo `World` independiente de Pixi que se pueda simular, guardar o probar sin render. | `scene/scene.ts` (generación + meseta en las líneas iniciales de la función) |
| 6 | Alta | **Mundo de tamaño fijo, sin chunks.** `TERRAIN_WIDTH × TERRAIN_HEIGHT` y caché singleton de módulo. El ruido ya se muestrea en coordenadas absolutas (bien), pero ni terreno, ni entidades, ni render trabajan por chunk. | `terrain/terrain.ts`, `constants.ts` |
| 7 | Alta | **Render estático, sin bucle ni cámara.** Se crean sprites una vez, el culling se hace solo al construir (lo que queda fuera nunca existe) y no hay bucle de simulación de paso fijo, reloj de juego ni movimiento de cámara. | `scene/scene.ts`, `projection.ts` |
| 8 | Media (corregido) | **El core depende de `window` al importarse.** `constants.ts` lee `window.innerWidth`; impide ejecutar la simulación en un worker o en Node sin el shim de `tests/setup.ts`. Las medidas de pantalla deben llegar como configuración de vista. | `constants/constants.ts` |
| 9 | Media | **Responsabilidades cruzadas.** `Box` (terreno) vive en `entities`; `projection.ts` importa `Box` y hace relleno de columnas + culling, mientras la proyección real está en `board`. Contenido (`ENTITY_CONFIG`) dentro del módulo de motor `entities`. | `entities/entities.ts`, `projection/`, `board/`, `entities/config.ts` |
| 10 | Media | **Índice espacial por strings.** Claves `` `${x}:${y}` `` dispersas y `Map`/`Set` globales para todo el mapa. Sirve a 32×32; no escala a consultas de vecindad, colisión ni pathfinding en mundos grandes. | `entities.ts`, `surfaces.ts`, `scene.ts` |
| 11 | Media (corregido) | **La variación de color no forma parte del estado de la entidad.** Se reproduce desde la semilla, pero si una entidad se crea o se mueve en partida no conserva su variante al guardar. | `scene.ts` → debería pasar a `EntityData` |
| 12 | Baja | `renderBlock()` con 12 parámetros posicionales; difícil de extender (animación, selección, sombras). | `render/render.ts` |

### Plan propuesto (no aplicado, pendiente de tu confirmación)

1. **World como modelo de dominio** (#5, #11): `engine/world/` con `generateWorld(seed, options) → World` (columnas, superficies, entidades con variante) y serialización `{ version, seed, deltas }`. La escena pasa a `renderWorld(app, world)`. La meseta central se convierte en una opción explícita de generación (zona de aparición) o se elimina.
2. **Vista y constantes** (#8): `ViewConfig` (ancho, alto, tamaño de tile) creado en `page.tsx` y pasado a escena/render; las constantes del core quedan sin `window`.
3. **Capas** (#9): mover `Box` a `terrain`, `fillElevations` a `terrain`, renombrar `board` → `projection` y la actual `projection` → `culling`; mover `ENTITY_CONFIG` a una carpeta de contenido (`src/isometric/content/`).
4. **Chunks** (#6, #10): coordenadas tipadas (mundo/chunk/local), `ChunkKey` numérica, generación de terreno y entidades por chunk con `deriveSeed(seed, "chunk:x:y")`, índice espacial por chunk.
5. **Bucle y cámara** (#7): `GameClock` con paso fijo + acumulador, sistemas registrados que actúan sobre el `World`, cámara con carga/descarga de chunks y culling por frame.

Orden recomendado: 1 → 2 → 3 → 4 → 5. Cada fase es un cambio revisable con cobertura al 100%.
