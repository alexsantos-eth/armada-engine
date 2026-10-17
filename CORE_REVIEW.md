# Revisión del core

Backlog vivo de la skill `armada-core-review`. Cada revisión añade una entrada, actualiza el estado de los hallazgos anteriores y no repite lo ya registrado. Vive en la raíz (no en `docs/`, que es salida de Typedoc).

Criterio: el core debe sostener un **RPG isométrico procedural de supervivencia**: mundo por semilla y por chunks, simulación determinista y persistente, sistemas RPG data-driven, guardado/carga y rendimiento con miles de entidades.

Niveles: **Bloqueante** (rompe la visión) · **Alta** (reescritura cara cuando llegue un sistema previsto) · **Media** (corregible localmente) · **Baja** (higiene).

## 2026-10-17 — Sombras dinámicas (paso 4 de la iluminación)

Alcance: nuevo módulo `engine/lighting` (`getShadowShape`), `render/shadow.ts` (`getShadowMatrix`, `createShadowView`, `placeShadowView`), `getBlockDepth()` extraído de `createBlockViews()`, sombras en la escena, nueva orientación del sol, `?hour=` (`resolveStartTick`) y 18 SVG sin su sombra pintada. Consultado el código de `pixi.js` 8.22.0: `Container.setFromMatrix()` descompone con `Matrix.decompose()`, que admite sesgo, así que la matriz isométrica (con sesgo y reflexión) se aplica exacta; las sombras van en el mismo render group del mundo.

| # | Estado | Cambio |
|---|---|---|
| 24 | Corregido (Alta) | **Sombras fijas en los assets.** 18 SVG llevaban un polígono translúcido `#1e2a10` que no se movía con el sol; los generadores y `ISO_ASSET_AGENT.md` lo exigían. Eliminado de los SVG (verificado: XML válido, ninguno con `#1e2a10`), de `pier.py`, `tree_birch.py`, `tree_cypress.py` y de la guía de assets. El motor dibuja una sombra por entidad. |
| 25 | Corregido (Media) | **El sol iluminaba desde detrás por la mañana.** Con la orientación del paso 1, de 06:00 a ~10:00 las sombras caían hacia la cámara y las casillas de delante (dibujadas después) las habrían cortado. Primera corrección insuficiente: ver #29. |
| 29 | Corregido (Alta) | **Sombras cortadas por las casillas de delante** (reportado por el usuario con captura, a media tarde). Exigir que la sombra se alejara de la cámara (`x + y` creciente) no bastaba: una sombra hacia `+x −y` entra en la fila `y − 1`, que se dibuja después, y sale con un corte diagonal recto. Condición correcta: la sombra no debe entrar en ninguna casilla con `x` o `y` menor. Ahora el acimut del sol gira un cuarto de vuelta, de `−y` a `−x` (siempre delante), y `getShadowShape()` desplaza hacia atrás la elipse de huellas de varias casillas vistas en diagonal. Tests: `time/sun.test.ts` (componentes del sol nunca positivas de día) y `lighting/shadow.test.ts` (ninguna sombra pasa de la huella hacia `−x`/`−y` en ninguna hora ni tamaño). Verificado en Chromium a las 07:30, 10:00, 14:00, 16:00 y 17:30, sin cortes. |
| 26 | Adoptado | **Geometría en el dominio, vista en render.** `getShadowShape()` es pura y se prueba sin Pixi; `getShadowMatrix()` es una función pura de la vista. La profundidad de la sombra sale de `getBlockDepth()`, la misma que usan los bloques, sin duplicar la fórmula. Verificado en Chromium (`?seed=1337&timeScale=0&hour=8/12/16/17.5`): sombras largas a la izquierda por la mañana, manchas cortas al mediodía, largas a la derecha por la tarde y tenues al atardecer, sin errores. |
| 27 | Pendiente (Baja) | **Coste por tick con muchas entidades.** Cada tick (20 por segundo) recoloca todas las sombras con `setFromMatrix()`. Con los cientos de entidades actuales es despreciable; con chunks y miles visibles, actualizar solo cuando la forma cambie de forma apreciable o cada N ticks. |
| 28 | Pendiente (Baja) | **Límites visuales.** La sombra queda en el plano del suelo de quien la proyecta (no se pliega sobre desniveles), en el borde del mapa cae sobre el fondo, las sombras giran un cuarto de vuelta al día (no media) y el terreno no proyecta sombra. Algunos assets con zócalo propio conservan una sombra opaca pequeña sobre él (permitida por la guía). |

## 2026-10-17 — Luz ambiente con render group (paso 3 de la iluminación)

Alcance: `scene.ts` (render group, listener de luz ambiente), `render/color.ts` (`rgbToTint`) y la dependencia `scene → time`. Consultadas: [Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups) (tinte, alfa y transformaciones de un grupo se aplican en GPU; usar pocos), [Container](https://pixijs.com/8.x/guides/components/scene-objects/container) (no documenta la herencia del tinte) y el código de `pixi.js` 8.22.0: `updateRenderGroupTransform` copia el `localColor` de la raíz al `worldColor` del grupo (uniforme global) y `updateColorBlendVisibility` multiplica el tinte de cada hijo con el de su padre; `set tint` no hace nada si el color no cambia.

| # | Estado | Cambio |
|---|---|---|
| 21 | Adoptado (Media) | **Render group para el mundo.** Cambiar el tinte de un contenedor normal con miles de hijos recalcula el color de todos ellos en CPU en cada cambio; como render group, el tinte ambiente se aplica en GPU. Es un único grupo (la guía advierte contra usar muchos) y servirá también para mover la cámara (#7) sin tocar los hijos. Verificado en Chromium (`?seed=1337`, `timeScale` 10 y 120): día idéntico al anterior, dorado a las 17:37, anaranjado a las 18:07, noche azulada, sin errores. |
| 22 | Pendiente (Baja) | **La noche no desatura.** El tinte es multiplicativo: el pasto, muy saturado, queda verde oliva oscuro. Primer recurso: ajustar `DEFAULT_SKY_PALETTE` (son datos). Un filtro de desaturación sobre el mundo costaría un render a textura por frame; medir antes de adoptarlo. |
| 23 | Nota | Las luces puntuales (antorchas, fogatas) no caben en un tinte multiplicativo global: necesitarán una capa de luz aditiva o el buffer de caras del plan de iluminación. El render group del mundo no lo impide. |

## 2026-10-17 — Bucle de simulación de paso fijo (paso 2 de la iluminación)

Alcance: nuevo módulo `engine/simulation` (`stepper.ts`, `simulation.ts`, tipos en `core/types/simulation.ts`), `formatClockTime()` en `time` y el cableado en `page.tsx`. Consultadas: [Ticker](https://pixijs.com/8.x/guides/components/ticker), [Render Loop](https://pixijs.com/8.x/guides/concepts/render-loop) y el código de `pixi.js` 8.22.0 (`TickerPlugin`: `Application` dibuja con `UPDATE_PRIORITY.LOW`; `Ticker.elapsedMS` es tiempo real sin recortar ni escalar). La guía no trata el paso fijo; se implementa en el dominio, como pedía esta skill.

| # | Estado | Cambio |
|---|---|---|
| 7 | Avanzado (Alta) | **Bucle de paso fijo.** `createSimulation(world)` convierte el `elapsedMS` del ticker en ticks enteros con un acumulador (`consumeFrame`: recorte a 250 ms de tiempo real, `timeScale`, pausa, alpha de interpolación) y los ejecuta con `stepWorld()`, único punto de entrada de la simulación. `page.tsx` lo registra en `app.ticker` con prioridad `HIGH`, antes del render. Se adopta el `Ticker` de Pixi; no hay `requestAnimationFrame` propio. Verificado en Chromium (WebGL, `?seed=1337&timeScale=600`): la hora avanza unos 2 s reales por día, sin errores. Queda de #7 la cámara. |
| 18 | Corregido (Media) | **Canvas movido dentro de la etiqueta de hora.** La primera versión de la etiqueta era un primer hijo condicional sin `key`; al aparecer, Preact reutilizó el `<div>` del canvas y lo anidó dentro de ella (detectado en el navegador, no en los tests). La etiqueta está siempre montada y va después del contenedor. Además, si la página se desmonta mientras la escena carga, ya no se registra el bucle sobre una aplicación destruida. |
| 19 | Pendiente (Baja) | **`page.tsx` sin tests.** Hoy cablea semilla, mundo, escena, bucle y HUD sin ninguna prueba (no entra en la cobertura porque ningún test lo importa); el fallo #18 solo se vio en el navegador. Cuando el HUD o los controles crezcan, extraer la lógica a funciones probadas o añadir un test de la página con mocks de Pixi. |
| 20 | Pendiente (Baja) | **Pasos por frame sin tope con `timeScale` alto.** El recorte es de tiempo real (250 ms), así que `?timeScale=600` puede pedir 3 000 pasos en un frame. Hoy un paso solo suma al reloj; cuando haya sistemas con coste, añadir `maxStepsPerFrame` al acumulador. Además, `stepWorld()` avanza el reloj de una vez: cuando llegue el primer sistema, debe iterar tick a tick para que cada sistema vea cada tick en orden. |

## 2026-10-17 — Reloj de juego y estado del sol (paso 1 de la iluminación)

Alcance: nuevo módulo `engine/time` (`clock.ts`, `sun.ts`, tipos en `core/types/time.ts`), `World.clock` y `WorldSnapshot` v3. No toca render ni escena, así que no se consultó la guía de PixiJS en esta revisión.

| # | Estado | Cambio |
|---|---|---|
| 7 | Avanzado (Alta) | **Reloj de juego.** `World.clock` (`{ tick }` entero) es estado del mundo, se guarda (`WorldSnapshot` v3, campo `tick`) y solo lo avanza `advanceClock()`. `getTimeOfDay()`, `getClockTime()` y `getSunState()` derivan del tick la hora y la luz (dirección del sol en ejes del mundo, `daylight`, color ambiente por paleta). Siguen pendientes de #7 el bucle de paso fijo y la cámara. |
| 16 | Corregido (Baja) | `getTimeOfDay()` devolvía fracciones negativas con ticks negativos (el `%` de JS conserva el signo); cualquier desfase horario futuro (zonas, eventos "hace N horas") habría producido un sol fuera de rango. Ahora envuelve en `[0, 1)`. Tests en `time/clock.test.ts`. |
| 17 | Pendiente (Media) | **Sin comunicación tipada entre sistemas.** El ciclo día/noche, el clima y las necesidades reaccionarán a cambios de hora (amanecer, anochecer) y de estado. Sin un bus de eventos tipado, cada sistema leerá o llamará a los demás directamente. Proponer un bus mínimo en el dominio cuando llegue el primer sistema que lo necesite (probablemente con el bucle, paso 2). |

Notas para el paso 2 (bucle): el `Ticker` de Pixi marca los frames y alimenta con `elapsedMS` un acumulador de paso fijo **en el dominio** (`1000 / TICKS_PER_SECOND` ms por tick), con tope de pasos por frame para no entrar en espiral tras una pausa del navegador; pausa y escala de tiempo viven en ese acumulador, no en el reloj. Consultar antes https://pixijs.com/8.x/guides/components/ticker y https://pixijs.com/8.x/guides/concepts/render-loop. El estado del sol usa flotantes (`Math.sin`/`Math.cos`): es presentación; la lógica de juego que dependa de la hora debe decidir con el tick entero.

## 2026-10-17 — Culling y orden de dibujo con PixiJS

Consultadas: [Culler Plugin](https://pixijs.com/8.x/guides/components/application/culler-plugin), [Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips), [Container](https://pixijs.com/8.x/guides/components/scene-objects/container) y el código de `pixi.js` 8.22.0 (`Culler`, `sortMixin`).

| # | Estado | Cambio |
|---|---|---|
| 14 | Corregido (Alta) | **Culling propio que impedía la cámara.** `isWithinViewport()` descartaba al construir lo que quedaba fuera de pantalla, así que nunca se creaba. Ahora la escena crea todas las vistas con `cullable = true` y el `CullerPlugin` (`page.tsx`) omite dibujarlas por frame. Eliminado el módulo `engine/culling` y `VIEW_CULL_MARGIN`. |
| 15 | Corregido (Media) | **Orden por `sortableChildren` sobre miles de hijos.** Pixi solo reordena cuando algo cambia, pero asignar `zIndex` activa `sortableChildren` en el padre: cualquier entidad en movimiento habría reordenado el mundo entero. Ahora `createBlockViews()` devuelve cada vista con su profundidad (`DepthView`) sin tocar `zIndex`, y la escena las añade una vez en orden con `addInDepthOrder()`. `renderBlock()` desaparece. |

Verificado en Chromium (WebGL) con `?seed=1337`: la escena se dibuja igual, sin errores. El orden es el mismo que antes porque ambos son un ordenamiento estable por la misma profundidad sobre el mismo orden de creación.

Pendiente ligado a esto: con la cámara (#7), recolocar la vista de una entidad que se mueve (inserción por profundidad, sin reordenar todo) y medir el coste del culler por frame (la guía avisa de que empeora si la CPU es el cuello de botella); si hace falta, agrupar por chunk con `cullArea` o `cacheAsTexture`.

## 2026-10-16 — `renderBlock()` con objeto de opciones

| # | Estado | Cambio |
|---|---|---|
| 12 | Corregido | `renderBlock(container, options)`: de 12 parámetros posicionales a `RenderBlockOptions` (`texture`, `box`, `metrics` y opcionales con valor por defecto). Las medidas de casilla se agrupan en `TileMetrics` (`core/types/iso.ts`) y `TILE_METRICS` (`constants`). Comportamiento idéntico: los tests de render no cambiaron de aserciones. Prepara el renderer para animación, selección o sombras sin romper llamadas. |

## 2026-10-16 — Coordenadas tipadas e índice espacial (paso 2)

| # | Estado | Cambio |
|---|---|---|
| 10 | Corregido | Nuevo módulo `engine/grid`: `WorldCoord`/`ChunkCoord`/`LocalCoord`/`WorldRect` (`core/types/grid.ts`), conversiones mundo ↔ chunk ↔ local con `CHUNK_SIZE = 32`, claves numéricas `cellKey`/`chunkKey` (±2²⁰), `CellMap` y `SpatialIndex` (consultas por celda, rectángulo y radio, deterministas). Eliminadas todas las claves `"x:y"` del motor. |
| 10 | Corregido | `createEntitiesFromConfig()` usa un `SpatialIndex` para ocupación y `gap`; `classifyColumnSurfaces()` devuelve `CellMap`; la escena usa `CellMap`. `World.occupancy` expone el índice de entidades (derivado, no se guarda). Verificado: con `ENTITY_CONFIG` y 4 semillas, las más de 1.000 entidades generadas son idénticas a las de antes del cambio. |
| 10 | Guardián | `architecture.test.ts` prohíbe plantillas `` `${…}:${…}` `` en el código del motor. |

Siguiente: bucle de paso fijo, reloj y cámara (#7), después chunks (#6), que ya pueden apoyarse en `ChunkCoord`, `chunkRect()` y `chunkKey()`.

## 2026-10-16 — Contenido fuera del motor y sin meseta de aparición (fase 3 completa)

| # | Estado | Cambio |
|---|---|---|
| 9 | Corregido | `ENTITY_CONFIG` pasa de `engine/entities/config.ts` a `src/isometric/content/entities.ts`. El motor ya no trae contenido: `generateWorld({ entityDefinitions })` y `createEntitiesFromConfig(boxes, definitions, …)` lo reciben obligatoriamente; `page.tsx` lo conecta. |
| 13 | Corregido (Media) | Contenido sin validar: una errata en la configuración no daba error, solo entidades que no aparecían. `validateEntityDefinitions()` (`entities/validation.ts`) se ejecuta en `generateWorld()` y lanza `EntityConfigError` con todos los problemas; `content/entities.test.ts` la aplica a `ENTITY_CONFIG`. |
| — | Eliminado (por decisión del usuario) | Meseta de aparición: `terrain/spawn.ts` (`applySpawnPlateau`, `getSpawnArea`), la opción y el campo `spawnPlateau`. El terreno es el ruido sin retoques. `WORLD_SNAPSHOT_VERSION` sube a 2 porque el snapshot cambia de forma; los de versión 1 se rechazan. |
| 9 | Guardián ampliado | `architecture.test.ts`: el motor solo sale de `engine/` hacia `../../types` (nunca al contenido) y el contenido solo importa tipos del core. |

Siguiente según el plan: coordenadas tipadas e índice espacial (#10), después bucle/reloj/cámara (#7) y chunks (#6). La zona de aparición, si vuelve, debería ser un sistema de juego que elige un punto válido del mundo, no un retoque del terreno.

## 2026-10-16 — Capas reordenadas (fase 3 parcial)

| # | Estado | Cambio |
|---|---|---|
| 9 | Corregido (parcial) | `Box` pasa de `entities` a `terrain/box.ts`; `buildFilledElevationLevels`/`fillElevations` de `projection` a `terrain/columns.ts`. `board` → `projection` (`projectBoxesToIsometric`) y el culling sale a `culling` (`isWithinViewport`). Eliminada la carpeta `board`. |
| 9 | Nuevo guardián | `engine/architecture.test.ts` fija el grafo de dependencias (acíclico: `constants`/`random` → `terrain` → `entities` → `world` → `scene`), exige importar por barrel, limita Pixi a `render`/`scene` y prohíbe `window`/`document`/`localStorage` en el motor. |

Queda de la fase 3: mover `ENTITY_CONFIG` (contenido) fuera del módulo `entities` a una carpeta de contenido. Siguen pendientes las fases 4 (chunks) y 5 (bucle y cámara).

## 2026-10-16 — Modelo World y core sin `window`

Aplicadas las fases 1 y 2 del plan, a petición del usuario.

| # | Estado | Cambio |
|---|---|---|
| 5 | Corregido | `engine/world`: `World` (seed, tamaño, `spawnPlateau`, columnas, superficies, entidades) es la fuente de verdad. `generateWorld()` genera; `createIsometricScene(app, world)` solo lee y renderiza. La meseta central de demo es ahora `applySpawnPlateau()`/`getSpawnArea()` en `terrain/spawn.ts`, opción `spawnPlateau` (por defecto activa). Eliminada la caché singleton `getOrCreateTerrain()`. |
| 5 | Corregido | Guardado: `serializeWorld()` → `WorldSnapshot` JSON versionado (terreno regenerado desde la semilla, entidades como datos) y `restoreWorld()` con `Entity.fromData()`. |
| 8 | Corregido | `WIDTH` es una constante estática (1300); el core no lee `window`. Eliminado el shim `tests/setup.ts`: si un módulo del core vuelve a leer `window`, la suite falla. |
| 11 | Corregido | `colorVariant` forma parte de `EntityData`: se elige al crear la entidad (flujo `"entity-color-variants"`) y se guarda. `getColorVariationCount`/`pickColorVariation` pasan de `render/svg` a `entities/variants`. |

Pendiente del plan en ese momento: fases 3 (capas), 4 (chunks) y 5 (bucle y cámara). Nota para la fase 4: los snapshots solo guardan entidades; cuando el terreno sea modificable habrá que guardar sus deltas y subir `WORLD_SNAPSHOT_VERSION`.

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
| 9 | Media (corregido) | **Responsabilidades cruzadas.** `Box` (terreno) vive en `entities`; `projection.ts` importa `Box` y hace relleno de columnas + culling, mientras la proyección real está en `board`. Contenido (`ENTITY_CONFIG`) dentro del módulo de motor `entities`. | `entities/entities.ts`, `projection/`, `board/`, `entities/config.ts` |
| 10 | Media (corregido) | **Índice espacial por strings.** Claves `` `${x}:${y}` `` dispersas y `Map`/`Set` globales para todo el mapa. Sirve a 32×32; no escala a consultas de vecindad, colisión ni pathfinding en mundos grandes. | `entities.ts`, `surfaces.ts`, `scene.ts` |
| 11 | Media (corregido) | **La variación de color no forma parte del estado de la entidad.** Se reproduce desde la semilla, pero si una entidad se crea o se mueve en partida no conserva su variante al guardar. | `scene.ts` → debería pasar a `EntityData` |
| 12 | Baja (corregido) | `renderBlock()` con 12 parámetros posicionales; difícil de extender (animación, selección, sombras). | `render/render.ts` |

### Plan propuesto (no aplicado, pendiente de tu confirmación)

1. **World como modelo de dominio** (#5, #11): `engine/world/` con `generateWorld(seed, options) → World` (columnas, superficies, entidades con variante) y serialización `{ version, seed, deltas }`. La escena pasa a `renderWorld(app, world)`. La meseta central se convierte en una opción explícita de generación (zona de aparición) o se elimina.
2. **Vista y constantes** (#8): `ViewConfig` (ancho, alto, tamaño de tile) creado en `page.tsx` y pasado a escena/render; las constantes del core quedan sin `window`.
3. **Capas** (#9): mover `Box` a `terrain`, `fillElevations` a `terrain`, renombrar `board` → `projection` y la actual `projection` → `culling`; mover `ENTITY_CONFIG` a una carpeta de contenido (`src/isometric/content/`).
4. **Chunks** (#6, #10): coordenadas tipadas (mundo/chunk/local), `ChunkKey` numérica, generación de terreno y entidades por chunk con `deriveSeed(seed, "chunk:x:y")`, índice espacial por chunk.
5. **Bucle y cámara** (#7): `GameClock` con paso fijo + acumulador, sistemas registrados que actúan sobre el `World`, cámara con carga/descarga de chunks y culling por frame.

Orden recomendado: 1 → 2 → 3 → 4 → 5. Cada fase es un cambio revisable con cobertura al 100%.
