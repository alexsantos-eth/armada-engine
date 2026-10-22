# Contribuir al proyecto

La explicación detallada del runtime está en [ARCHITECTURE.md](ARCHITECTURE.md); este documento se centra en el flujo práctico de cambios y validación.

## Estructura de módulos

El código del engine está organizado por responsabilidad dentro de `src/isometric/core/engine`. Cada carpeta expone su API mediante `index.ts`; los módulos consumidores deben importar desde el barrel de la carpeta.

Todo el motor usa los ejes de [Sistema de coordenadas](ARCHITECTURE.md#sistema-de-coordenadas): la columna `(0, 0)` es la más cercana a la cámara (abajo en pantalla), `+x` va arriba a la derecha (noreste), `+y` arriba a la izquierda (noroeste), `elevation` hacia arriba y el norte es la parte de arriba de la pantalla (`+x +y`). En pantalla, `y` crece hacia abajo (PixiJS). Los assets SVG usan otro convenio (`data-tiles`). No inventes direcciones ni signos nuevos: si un sistema necesita «arriba», «delante» o un punto cardinal, tradúcelo a esos ejes y documéntalo allí.

Para cualquier búsqueda por posición usa `engine/grid`: `CellMap` para un valor por columna y `SpatialIndex` para qué ocupa cada celda, con las coordenadas tipadas `WorldCoord`/`ChunkCoord`/`LocalCoord`. No uses claves de texto `"x:y"`: el test de arquitectura las rechaza.

Para el render, usa lo que PixiJS ya resuelve antes que código propio (tabla en la skill `armada-core-review` y guía en https://pixijs.com/8.x/guides/getting-started/intro). En particular: no filtres por viewport a mano (marca las vistas con `cullable = true` y llama a `Culler.shared.cull()` solo cuando cambie lo visible: al construir, al redimensionar y al mover la cámara; no registres el `CullerPlugin`, que recorre todo el mundo en cada frame), carga los SVG con la resolución de `getSvgResolution()` (nunca a su tamaño de lienzo de 1024 px) y no asignes `zIndex` a las vistas del mundo (usa `createBlockViews()` + `addInDepthOrder()`).

Las dependencias entre módulos están fijadas en `engine/architecture.test.ts` (tabla en `ARCHITECTURE.md`). Si un módulo nuevo necesita otra dependencia, añádela a esa tabla de forma explícita y justificada; un módulo nuevo debe aparecer en ella o el test falla.

Los tipos compartidos viven en `src/isometric/core/types` y se exportan desde `core/types/index.ts`. No se crean tests runtime para archivos que solo contienen tipos.

`Box` vive en `engine/terrain` y está reservado para bloques de terreno (`grass`, `ground`, `water` y `sand`). Las entidades de juego se declaran como datos en `src/isometric/content/entities.ts` (`ENTITY_CONFIG`, fuera del motor) y se crean con `createEntitiesFromConfig()`. No se deben añadir entidades concretas a `Box`, a `scene.ts` ni a las constantes de terreno.

Al generar el mundo, `validateEntityDefinitions()` comprueba ids únicos, rutas de textura, rangos numéricos (`height`, `length`, `spawnChance` entre 0 y 1, `gap`), superficies, ejes, `footprintSurfaces`, formaciones y `colorReplacements` (colores hex y listas de igual longitud), y lanza `EntityConfigError` con todos los problemas juntos. `content/entities.test.ts` ejecuta esa validación sobre `ENTITY_CONFIG`.

Las definiciones de entidad admiten `footprintSurfaces` para exigir una superficie por bloque de la huella (p. ej. `["grass", "sand", "sand"]` en los muelles), `surfaceElevation` para exigir una elevación exacta o una lista de elevaciones válidas (p. ej. `[0, 1]`); en cualquier caso, una huella multi-bloque solo se coloca sobre celdas a la misma elevación, `length` y `lengthAxis` (`"x"` por defecto) para huellas multi-bloque, `gap` para exigir una separación mínima en bloques (diagonales incluidas) entre instancias de la misma entidad, `formation` para agruparlas al colocarlas siguiendo un mapa de texto (`X` miembro, `.` vacío; p. ej. `{ map: ["XX", "X."], rotate: true }` para tríos en L girados al azar; `minMembers` fija cuántos deben caber, por defecto todos; el `gap` se mide entre grupos y la tirada de `spawnChance` es una por grupo, así que conviene dividirla por el tamaño del grupo para conservar la densidad), `colorReplacements` para variantes SVG (la variación se elige al crear cada instancia, se guarda en `colorVariant` y la textura se comparte por tipo y variación) y `debug` para dibujar su huella visual. La factory valida y reserva todas las celdas de la huella antes de crear la entidad, por lo que las definiciones posteriores no pueden solaparse con una entidad ya colocada.

## Tests co-localizados

Los tests viven junto al archivo que prueban:

```text
terrain/
  columns.ts
  columns.test.ts
```

## Determinismo

El mundo se genera a partir de una semilla. En lógica de dominio y generación está prohibido `Math.random()`, `Date.now()` como fuente de aleatoriedad o cualquier otra fuente no reproducible: recibe un `RandomSource` (`createSeededRandom(deriveSeed(seed, "<sistema>"))` de `engine/random`) y usa una etiqueta propia por sistema. Solo `page.tsx` elige una semilla nueva, mediante `resolveWorldSeed()`. Para reproducir un mundo, abre la app con `?seed=<número>`; la semilla de cada carga aparece en la consola.

El estado del juego vive en `World` (`engine/world`): genera con `generateWorld()`, guarda con `serializeWorld()`/`restoreWorld()` y renderiza con `createIsometricScene(app, world)`. La escena no genera ni modifica el mundo; la nueva lógica de juego actúa sobre `World`, nunca sobre objetos de Pixi. El core no debe leer `window` (los tests corren en Node sin shim); las medidas de la vista son constantes o llegan desde `page.tsx`.

El tiempo de juego también es estado del `World`: un contador entero (`world.clock.tick`) que solo avanza el paso fijo de simulación con `advanceClock()`, nunca el reloj del sistema ni el delta de un frame. La hora del día y la luz del sol se derivan del tick con `getTimeOfDay()` y `getSunState()` (`engine/time`); las decisiones de juego que dependan de la hora deben usar el tick entero. Si cambias la forma de `WorldSnapshot`, sube `WORLD_SNAPSHOT_VERSION` (ahora 3, que añadió `tick`). El bucle vive en `engine/simulation`: `page.tsx` pasa `ticker.elapsedMS` a `simulation.frame()` y el acumulador de paso fijo decide cuántos ticks ejecutar con `stepWorld()`. Un sistema de juego nuevo se ejecuta dentro de `stepWorld()`, nunca en un listener del ticker ni en la escena. Para revisar el ciclo del día, abre la app con `?timeScale=60` (un día en 20 s). La escena tiñe el mundo con `getSunState(tick).ambient` desde su propio listener del ticker (prioridad `NORMAL`, entre la simulación y el render) y solo lee el `World`: no asignes tintes de iluminación sprite a sprite, y para cambiar los colores del día ajusta la paleta de cielo. Las sombras son siluetas de los sprites tumbadas en el suelo (`getShadowProjection()` y `getSilhouetteMatrix()` en `engine/lighting`) que la escena dibuja en un mapa de sombras por elevación y muestra sobre la cima de cada columna; no dibujes sombras como sprites sueltos entre las vistas del mundo, porque las casillas de delante las cortarían. Para revisarlas, abre la app con `?hour=8&timeScale=0` (o cualquier hora). La oclusión ambiental (`getOcclusion()`/`buildOcclusionMap()` en `engine/lighting`) se calcula una vez y va al fondo de esos mapas: no añadas capas ni sprites por casilla para ella.

Las deudas conocidas del core y los planes de refactor están en [CORE_REVIEW.md](CORE_REVIEW.md); léelo antes de cambiar el core.

## Entorno de tests

El proyecto usa Vitest en entorno Node. La lógica de Pixi se prueba con mocks de `pixi.js`, mientras que los tests de proyección, terreno y entidades deben permanecer deterministas y libres de efectos visuales.

Comandos:

```bash
pnpm test             # suite rápida
pnpm test:coverage    # suite + coverage obligatorio
```

La configuración exige 100% de statements, branches, functions y lines. Cada nueva rama debe incluir un caso de test; si una rama es imposible por contrato, simplifica la implementación en vez de ignorarla en coverage.

## Validación y documentación

Antes de abrir un cambio ejecuta:

```bash
pnpm lint
pnpm test:coverage
pnpm build
```

`pnpm lint` ejecuta ESLint (`eslint.config.js`: reglas recomendadas de typescript-eslint con información de tipos, imports de tipo en línea y `eqeqeq`) y debe terminar sin errores; corrige el código en lugar de desactivar reglas. El formato lo decide Prettier (`.prettierrc.json`, `.prettierignore`): `pnpm format` reescribe todo el proyecto y `pnpm format:check` lo comprueba; ESLint incluye `eslint-config-prettier` al final para no chocar con él. Los commits y el push a la rama `iso` solo se hacen al invocar la skill `armada-commit`, que valida todo esto antes.

Las APIs públicas y los tipos deben tener comentarios TSDoc concisos.

Cuando un cambio modifica el funcionamiento del core, también deben actualizarse los Markdown afectados, como mínimo `ARCHITECTURE.md` para el runtime y este archivo para el flujo de contribución. Si afecta a la generación o geometría de assets, la skill `iso-asset-generator` puede necesitar actualizarse.

## Assets y render

Los materiales de bloque se cargan desde:

```text
public/assets/grass/block.svg
public/assets/ground/block.svg
public/assets/water/block.svg
public/assets/sand/block.svg
```

Cada bloque se renderiza con una textura única. Grass se usa en la cima de una columna, sand en la cima de columnas a elevación `0` en la orilla de tierra firme (una vecina directa de agua y alguna vecina de interior, diagonales incluidas; los islotes en medio del agua quedan como pasto) (su SVG mide medio bloque de alto para suavizar la orilla), ground en los soportes y water en niveles negativos, con oscurecimiento según profundidad. Las reglas viven en `engine/terrain/surfaces.ts` y se aplican una sola vez: `createTerrainColumns()` guarda la superficie de cada columna en su `type` y `fillElevations()` el material de cada nivel. La escena y la factory de entidades leen `box.type`; no vuelvas a clasificar el terreno en otro módulo (`surface: "sand"` permite entidades de playa; las de `grass` no aparecen sobre arena). Los cambios de colores o proporciones deben conservar la continuidad entre caras y probarse visualmente con el servidor de Vite.

Como recomendación de diseño, los assets SVG con altura lógica `1` deben usar `viewBox="0 0 1024 853"`, igual que los bloques de terreno. Si una entidad necesita conservar una proporción visual diferente, escala su contenido dentro de ese `viewBox` en lugar de cambiar el lienzo raíz; así se evita que el renderer deforme el asset al ajustarlo a `TILE_HEIGHT + BOX_HEIGHT`.

Las entidades multi-bloque deben reflejar el atributo SVG `data-tiles` en su configuración mediante `length` y `lengthAxis`. `lengthAxis` puede ser `"x"` o `"y"` y afecta a la reserva de celdas, al posicionamiento del sprite y a la huella de debug. Los assets de orientaciones distintas deben generarse como SVG separados; no se deben espejar en runtime. Un asset de varias casillas puede alargar su lienzo por debajo del suelo (como los pilotes de los muelles) sin cambiar `data-tiles`, porque el renderer lo posiciona desde el borde superior; en entidades de una sola casilla no, porque su alto se fija a `TILE_HEIGHT + BOX_HEIGHT * height`. Como los ejes del motor y del asset no coinciden en pantalla, `lengthAxis: "x"` corresponde a `data-tiles="1xN"` y `lengthAxis: "y"` a `data-tiles="Nx1"`; para assets de varios bloques de alto, `height` debe igualar el tercer valor de `data-tiles`. `content/entities.test.ts` falla si alguna entrada no lo cumple. También falla si un `colorReplacements` contiene un color de origen que no aparece en ninguno de los SVG que comparten ese mapa, o si sus listas de variantes tienen longitudes distintas. Para recolorear un material hay que mapear todos sus tonos de sombreado (caras, biseles y caída por altura); si un material comparte color con otra parte del asset, se debe regenerar el asset con un color base propio para ese material.

Los assets no llevan sombra proyectada en el suelo (el antiguo polígono translúcido `#1e2a10`): el motor dibuja una sombra dinámica por entidad que sigue al sol. Un asset nuevo no debe incluirla.

`colorReplacements` permite reemplazar colores `fill` y `stroke` por un valor o por una lista de variantes. La variación se elige al crear cada instancia (con la semilla del mundo), se guarda en `colorVariant` y la textura se crea una sola vez por (tipo, variación), no por instancia ni por frame. `debug: true` dibuja una huella isométrica fina para inspección visual.

## Sincronización documental

Cada cambio funcional del core debe actualizar los Markdown que describen ese comportamiento. Revisa `ARCHITECTURE.md` para el flujo runtime, este archivo para las reglas de contribución y la skill `iso-asset-generator` para cambios de assets. La documentación debe actualizarse antes de ejecutar la validación final.
