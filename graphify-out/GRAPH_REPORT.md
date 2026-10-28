# Graph Report - armada-engine  (2026-10-27)

## Corpus Check
- 241 files · ~749,890 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 1661 nodes · 5200 edges · 76 communities (69 shown, 7 thin omitted)
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 1258 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `84098eaa`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- player/player.ts
- scene-harness.ts
- camera/camera.ts
- game.test.ts
- player_walk.py
- Entity
- silhouette.ts
- received-shadow.ts
- perf.ts
- Box
- CellMap
- Estado actual del core
- band-atlas.test.ts
- chunks.ts
- World
- types/entities.ts
- render.ts
- Arquitectura
- iso_lib.py
- moving-shadow.test.ts
- .voxel
- vitest
- Sombras
- compilerOptions
- foliage-wind.test.ts
- scene.ts
- generateWorld
- terrain-view.ts
- shadows.test.ts
- surfaces.ts
- Revisión del core de Armada Engine
- Revisión del core de Armada Engine
- Revisión del core de Armada Engine
- entities/entities.ts
- simulation/simulation.ts
- WorldParts
- compilerOptions
- engine/index.ts
- sun.ts
- Asset
- world.test.ts
- architecture.test.ts
- WorldChunks
- tall_lib.py
- occlusion.ts
- draw-order.test.ts
- devDependencies
- scene.test.ts
- coords.ts
- Isometric voxel-clay asset generator agent
- types/index.ts
- pairs.test.ts
- package.json
- Commit y push de Armada Engine
- Commit y push de Armada Engine
- Commit y push de Armada Engine
- page.tsx
- createSvgColorVariant
- eslint.config.js
- scripts
- grass_decor.py
- Isometric voxel-clay asset generator agent
- Isometric voxel-clay asset generator agent
- .prettierrc.json
- texture-pool.test.ts
- build
- TILE_METRICS
- Espacios de coordenadas
- roof_variants.py
- tower.py
- dependencies
- tsconfig.json
- AGENTS.md
- CLAUDE.md
- .claude/CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `Arquitectura` - 102 edges
2. `Arquitectura` - 102 edges
3. `Arquitectura` - 102 edges
4. `vitest` - 78 edges
5. `Estado actual del core` - 74 edges
6. `Estado actual del core` - 74 edges
7. `Estado actual del core` - 74 edges
8. `Entity` - 56 edges
9. `Box` - 51 edges
10. `Jugador` - 42 edges

## Surprising Connections (you probably didn't know these)
- `3. Modelo de entidades` --references--> `Entity`  [INFERRED]
  .agents/skills/armada-core-review/SKILL.md → src/isometric/core/engine/entities/entities.ts
- `3. Modelo de entidades` --references--> `Entity`  [INFERRED]
  Claude outputs/skills/armada-core-review/SKILL.md → src/isometric/core/engine/entities/entities.ts
- `3. Modelo de entidades` --references--> `Entity`  [INFERRED]
  .claude/skills/armada-core-review/SKILL.md → src/isometric/core/engine/entities/entities.ts
- `De la rejilla a la pantalla` --references--> `projectBoxesToIsometric()`  [INFERRED]
  ARCHITECTURE.md → src/isometric/core/engine/projection/projection.ts
- `Determinismo y semilla del mundo` --references--> `RandomSource`  [INFERRED]
  ARCHITECTURE.md → src/isometric/core/engine/random/random.ts

## Import Cycles
- None detected.

## Communities (76 total, 7 thin omitted)

### Community 0 - "player/player.ts"
Cohesion: 0.05
Nodes (80): Jugador, PLAYER_APPEARANCE, PLAYER_SCALE, PLAYER_WALK, ASSET_SOURCES, getGroundPointBelow(), TestView, blockedSide() (+72 more)

### Community 1 - "scene-harness.ts"
Cohesion: 0.06
Nodes (83): Escena modular, Partes del mundo, Bucle de simulación, Escena modular, Partes del mundo, Escena modular, Partes del mundo, Escena modular (+75 more)

### Community 2 - "camera/camera.ts"
Cohesion: 0.05
Nodes (70): Desarrollo en Armada Engine, Flujo de trabajo, Límites, Regla de documentación, Reglas de cambios, Cámara, Desarrollo en Armada Engine, Flujo de trabajo (+62 more)

### Community 3 - "game.test.ts"
Cohesion: 0.06
Nodes (41): Arranque de la aplicación, ENTITY_CONFIG, SceneOptions, CHUNK_PREFETCH_RADIUS, ChunkAnswer, ChunkRequest, createChunkGenerator(), loadedChunk() (+33 more)

### Community 4 - "player_walk.py"
Cohesion: 0.09
Nodes (19): ClimbPart, main(), pose(), turned(), IdlePart, main(), pose(), part() (+11 more)

### Community 5 - "Entity"
Cohesion: 0.10
Nodes (20): Arquitectura de Armada Engine, Ciclo de vida de recursos, Determinismo y semilla del mundo, Estado actual de entidades y assets, Generación del terreno, Modelo de terreno y entidades, Modelo World, Propósito (+12 more)

### Community 6 - "silhouette.ts"
Cohesion: 0.08
Nodes (28): getFootprintSliceTiles(), around(), composeAffine(), createGroundShadowView(), createMovingSilhouette(), createSilhouettes(), croppedTextures, displayOf() (+20 more)

### Community 7 - "received-shadow.ts"
Cohesion: 0.07
Nodes (26): CastShadowOffset, createReceivedShadows(), crop, packSlots(), RECEIVED_SHADOW_ATLAS_WIDTH, RECEIVED_SHADOW_BLEED, RECEIVED_SHADOW_PADDING, RECEIVED_SHADOW_RESOLUTION (+18 more)

### Community 8 - "perf.ts"
Cohesion: 0.07
Nodes (30): Medir el rendimiento, Contribuir al proyecto, Entorno de tests, Medir el rendimiento en tu equipo, Sincronización documental, Tests co-localizados, Validación y documentación, SceneProfiler (+22 more)

### Community 9 - "Box"
Cohesion: 0.13
Nodes (23): Bloques de terreno, Construcción de columnas, Organización de módulos, Bloques de terreno, Bloques de terreno, Box, getElevationMaterial(), keepMetadata() (+15 more)

### Community 10 - "CellMap"
Cohesion: 0.14
Nodes (10): Coordenadas e índice espacial, CellMap, localIndex(), SpatialIndex, ground(), groundFrom(), classifyColumnSurfaces(), CellKey (+2 more)

### Community 11 - "Estado actual del core"
Cohesion: 0.18
Nodes (29): Estado actual del core, Eventos entre sistemas, tint(), Estado actual del core, Estado actual del core, Baja, createEntityId(), Placement (+21 more)

### Community 12 - "band-atlas.test.ts"
Cohesion: 0.12
Nodes (22): Agua animada, strip(), BAND_ATLAS_PADDING, BAND_STRIP_TEXELS, BandAtlas, createBandAtlas(), createBandStrip(), BANDS (+14 more)

### Community 13 - "chunks.ts"
Cohesion: 0.11
Nodes (24): chunkRect(), ChunkData, ColumnExtra, TREE, TYPE_INDEX, TYPES, CHUNK_KEEP_RADIUS, CHUNK_LOAD_RADIUS (+16 more)

### Community 14 - "World"
Cohesion: 0.18
Nodes (25): Visión del juego, Visión del juego, Visión del juego, resolveWorldSeed(), resolveTimeScale(), stepWorld(), advanceClock(), assertClockStep() (+17 more)

### Community 15 - "types/entities.ts"
Cohesion: 0.09
Nodes (26): Formaciones, APARTMENTS_ROOF_COLOR_REPLACEMENTS, HOTEL_ROOF_COLOR_REPLACEMENTS, HOUSE_BALCONY_ROOF_COLOR_REPLACEMENTS, HOUSE_COLOR_REPLACEMENTS, OFFICE_ROOF_COLOR_REPLACEMENTS, PIER_COLLISION, SKYSCRAPER_ROOF_COLOR_REPLACEMENTS (+18 more)

### Community 16 - "render.ts"
Cohesion: 0.08
Nodes (21): createBlockViews(), getSplitTextures(), getStripTextures(), SheetCell, sheetFramesCache, SheetLayout, splitTexturesCache, stripTexturesCache (+13 more)

### Community 17 - "Arquitectura"
Cohesion: 0.18
Nodes (26): Arquitectura, Luz ambiente, Oclusión ambiental, Tiempo de juego y sol, Arquitectura, Arquitectura, Estructura de módulos, assertGridCoord() (+18 more)

### Community 18 - "iso_lib.py"
Cohesion: 0.10
Nodes (11): walls(), _behind(), _box_screen_bbox(), depth_order(), falloff(), _norm(), P(), plan_radii() (+3 more)

### Community 19 - "moving-shadow.test.ts"
Cohesion: 0.12
Nodes (23): Media, Notas para sistemas futuros, Revisión del core, SHADOW_REFRESH_TICKS, SavedPlayer, projectBoxesToIsometric(), getBlockDepth(), BuiltScene (+15 more)

### Community 20 - ".voxel"
Cohesion: 0.14
Nodes (20): 3. Visual style: voxel clay, 4. Library `iso_lib.py`, 6. Workflow, Lighting (matches the game's stacked-block terrain), Other style rules, Shape language, light(), VoxelGrid (+12 more)

### Community 21 - "vitest"
Cohesion: 0.12
Nodes (17): simplex-noise@^4.0.3, simplex-noise, vitest, Item, createSeededRandom(), DEFAULT_WORLD_SEED, deriveSeed(), NoiseField (+9 more)

### Community 22 - "Sombras"
Cohesion: 0.16
Nodes (20): Sombras, BLOCK_HEIGHT_IN_TILES, getCastShadowOffset(), getShadowProjection(), getShadowReach(), getSilhouetteMatrix(), MAX_SHADOW_STRETCH, SHADOW_ALPHA (+12 more)

### Community 23 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, jsxImportSource, lib, module, moduleDetection (+17 more)

### Community 24 - "foliage-wind.test.ts"
Cohesion: 0.14
Nodes (16): Viento en los árboles, FoliageWindOptions, SWAY_REFRESH_MS, Swaying, entityView(), leanOf(), SWAY, TestSprite (+8 more)

### Community 25 - "scene.ts"
Cohesion: 0.18
Nodes (18): pixi.js, textureKey(), variationOf(), EntityView, SceneAssets, SceneChunkPart, SceneContext, SceneFocus (+10 more)

### Community 26 - "generateWorld"
Cohesion: 0.17
Nodes (18): Entidades (no-terreno), Entidades (no-terreno), Entidades (no-terreno), fingerprintEntityDefinitions(), ROCK, TREE, checkDefinition(), EntityConfigError (+10 more)

### Community 27 - "terrain-view.ts"
Cohesion: 0.12
Nodes (16): TERRAIN_APPEARANCE, ASSET_SOURCES, darken(), quantile(), VARIANTS, validateTerrainVariants(), VARIANT_KIND_SCALE, VARIANT_PATCH_FILL (+8 more)

### Community 28 - "shadows.test.ts"
Cohesion: 0.10
Nodes (20): frameUntil(), DRAW_LABEL, GATHER_LABEL, Scratch, SHADOW_GATHERS_PER_FRAME, SHADOW_MAP_MARGIN, SHADOW_TURN_DRAWS_PER_FRAME, ShadowChunk (+12 more)

### Community 29 - "surfaces.ts"
Cohesion: 0.17
Nodes (17): Assets y render, BARE_GROUND_ELEVATION, BARE_GROUND_SCALE, BARE_GROUND_THRESHOLD, BareGroundField, createBareGroundField(), AROUND_OFFSETS, createTerrainColumns() (+9 more)

### Community 30 - "Revisión del core de Armada Engine"
Cohesion: 0.10
Nodes (20): 1. Arquitectura y límites, 2. Determinismo y generación procedural, 3. Modelo de entidades, 4. Bucle y simulación, 5. Persistencia, 6. Contenido data-driven, 7. Rendimiento y escalado, 8. Calidad y mantenibilidad (+12 more)

### Community 31 - "Revisión del core de Armada Engine"
Cohesion: 0.10
Nodes (20): 1. Arquitectura y límites, 2. Determinismo y generación procedural, 3. Modelo de entidades, 4. Bucle y simulación, 5. Persistencia, 6. Contenido data-driven, 7. Rendimiento y escalado, 8. Calidad y mantenibilidad (+12 more)

### Community 32 - "Revisión del core de Armada Engine"
Cohesion: 0.10
Nodes (20): 1. Arquitectura y límites, 2. Determinismo y generación procedural, 3. Modelo de entidades, 4. Bucle y simulación, 5. Persistencia, 6. Contenido data-driven, 7. Rendimiento y escalado, 8. Calidad y mantenibilidad (+12 more)

### Community 33 - "entities/entities.ts"
Cohesion: 0.17
Nodes (15): createEntitiesFromConfig(), findPlacement(), getEntityFootprint(), getFootprint(), indexEntities(), isTaken(), matchesSurfaceElevation(), NO_CELLS (+7 more)

### Community 34 - "simulation/simulation.ts"
Cohesion: 0.17
Nodes (17): emitTickEvents(), SimulationOptions, StepOptions, assertPositive(), assertTimeScale(), consumeFrame(), createFixedStepper(), DEFAULT_MAX_FRAME_MS (+9 more)

### Community 35 - "WorldParts"
Cohesion: 0.19
Nodes (9): assertUniqueIds(), Counter, counterPart, Ground, namePart, WorldParts, SavedWorldPart, WorldPart (+1 more)

### Community 36 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 37 - "engine/index.ts"
Cohesion: 0.18
Nodes (3): CameraViewOptions, SceneModule, CLOCK_PART

### Community 38 - "sun.ts"
Cohesion: 0.13
Nodes (14): DAY, DAY_ELEVATION, DEFAULT_SKY_PALETTE, EAST, lerp(), NIGHT, NIGHT_ELEVATION, sampleSkyPalette() (+6 more)

### Community 39 - "Asset"
Cohesion: 0.17
Nodes (4): Asset, fmt(), num(), seam()

### Community 40 - "world.test.ts"
Cohesion: 0.12
Nodes (12): SavedWorldParts, boundsOf(), CreateWorldOptions, RestoreWorldOptions, START_LOAD_RADIUS, DEFINITIONS, HOUSE, PARTS (+4 more)

### Community 41 - "architecture.test.ts"
Cohesion: 0.14
Nodes (10): ALLOWED_DEPENDENCIES, appFiles, contentFiles, contentSources, files, importsOf(), PIXI_MODULES, SCENE_MODULES (+2 more)

### Community 42 - "WorldChunks"
Cohesion: 0.33
Nodes (4): chunkKey(), chunksAround(), WorldChunks, ChunkCoord

### Community 43 - "tall_lib.py"
Cohesion: 0.15
Nodes (3): ground(), part(), ribbon_tier()

### Community 44 - "occlusion.ts"
Cohesion: 0.26
Nodes (13): AO_PIXELS_PER_TILE, AO_WALL_ALPHA, AO_WALL_RADIUS, buildOcclusionMap(), distanceToTile(), fade(), getOcclusion(), occlusionAt() (+5 more)

### Community 45 - "draw-order.test.ts"
Cohesion: 0.22
Nodes (11): Band, createDrawOrder(), DRAW_BAND_DEPTH, DrawOrder, firstAfter(), at(), Band, drawn() (+3 more)

### Community 46 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, @preact/preset-vite@^2.10.2, prettier@3.9.10, typescript@~5.9.3, vite@^8.0.0-beta.13, vitest@^5.0.3, @vitest/coverage-v8@5.0.3, @preact/preset-vite (+4 more)

### Community 47 - "scene.test.ts"
Cohesion: 0.18
Nodes (8): CAMERA_MAX_ZOOM, CHUNKS_HIDDEN_PER_FRAME, CHUNKS_SHOWN_PER_FRAME, chunkProbe(), layeredProbe(), shore(), view(), UNBOUNDED_CAMERA_BOUNDS

### Community 48 - "coords.ts"
Cohesion: 0.31
Nodes (8): Bucket, CHUNK_BITS, cellFromKey(), CHUNK_SIZE, chunkFromKey(), chunksInRect(), MAX_GRID_COORD, unpackKey()

### Community 49 - "Isometric voxel-clay asset generator agent"
Cohesion: 0.17
Nodes (10): 1. Canvas specification (mandatory), 2. Projection, 5. Preview script `preview.py`, 7. Reference recipes, 8. Pre-delivery checklist, Height in blocks (2 blocks tall, and beyond), Isometric voxel-clay asset generator agent, Multi-tile footprints (2 tiles long, and beyond) (+2 more)

### Community 50 - "types/index.ts"
Cohesion: 0.21
Nodes (6): AnyListener, TestEvents, EMPTY, EventListener, EventMap, Unsubscribe

### Community 51 - "pairs.test.ts"
Cohesion: 0.26
Nodes (9): pairShadows(), SHADOW_PAIR_CELL, ShadowBody, ShadowReach, body(), everyPair(), reach(), ShadowReceiver (+1 more)

### Community 52 - "package.json"
Cohesion: 0.18
Nodes (10): eslint@^10.13.0, @types/node@^24.10.1, name, overrides, vite, private, type, version (+2 more)

### Community 53 - "Commit y push de Armada Engine"
Cohesion: 0.20
Nodes (9): 1. Comprobar el estado, 2. Formatear con Prettier, 3. Revisar qué entra, 4. Validar en la nube, 6. Push a `origin/iso`, Commit y push de Armada Engine, Dónde está cada cosa, Informe final (+1 more)

### Community 54 - "Commit y push de Armada Engine"
Cohesion: 0.20
Nodes (9): 1. Comprobar el estado, 2. Formatear con Prettier, 3. Revisar qué entra, 4. Validar en la nube, 6. Push a `origin/iso`, Commit y push de Armada Engine, Dónde está cada cosa, Informe final (+1 more)

### Community 55 - "Commit y push de Armada Engine"
Cohesion: 0.20
Nodes (9): 1. Comprobar el estado, 2. Formatear con Prettier, 3. Revisar qué entra, 4. Validar en la nube, 6. Push a `origin/iso`, Commit y push de Armada Engine, Dónde está cada cosa, Informe final (+1 more)

### Community 56 - "page.tsx"
Cohesion: 0.27
Nodes (6): preact, CANVAS_STYLE, CLOCK_STYLE, ClockLabel(), IsometricWorld(), VIEW_STYLE

### Community 57 - "createSvgColorVariant"
Cohesion: 0.33
Nodes (7): createSvgColorVariant(), pickColor(), replaceSvgColors(), SVG_DETAIL, SVG_TILE_WIDTH, blobs, SvgColorReplacements

### Community 58 - "eslint.config.js"
Cohesion: 0.22
Nodes (8): eslint-config-prettier@^10.1.8, @eslint/js@^10.0.1, globals@^17.13.0, typescript-eslint@^8.72.0, eslint-config-prettier, @eslint/js, globals, typescript-eslint

### Community 59 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, format, format:check, lint, preview, test (+1 more)

### Community 60 - "grass_decor.py"
Cohesion: 0.25
Nodes (3): flowers(), leaves(), sprouts()

### Community 61 - "Isometric voxel-clay asset generator agent"
Cohesion: 0.25
Nodes (7): 1. Canvas specification (mandatory), 2. Projection, 5. Preview script `preview.py`, 7. Reference recipes, Height in blocks (2 blocks tall, and beyond), Isometric voxel-clay asset generator agent, Multi-tile footprints (2 tiles long, and beyond)

### Community 62 - "Isometric voxel-clay asset generator agent"
Cohesion: 0.25
Nodes (7): 1. Canvas specification (mandatory), 2. Projection, 5. Preview script `preview.py`, 7. Reference recipes, Height in blocks (2 blocks tall, and beyond), Isometric voxel-clay asset generator agent, Multi-tile footprints (2 tiles long, and beyond)

### Community 63 - ".prettierrc.json"
Cohesion: 0.25
Nodes (7): arrowParens, endOfLine, printWidth, $schema, semi, singleQuote, trailingComma

### Community 64 - "texture-pool.test.ts"
Cohesion: 0.25
Nodes (4): Rectangle, sourceA, sourceB, Texture

### Community 65 - "build"
Cohesion: 0.29
Nodes (7): 5. Commit en el equipo, Formato del mensaje (siempre el mismo), build(), 5. Commit en el equipo, Formato del mensaje (siempre el mismo), 5. Commit en el equipo, Formato del mensaje (siempre el mismo)

### Community 66 - "TILE_METRICS"
Cohesion: 0.52
Nodes (5): BOX_HEIGHT, TILE_HEIGHT, TILE_METRICS, TILE_WIDTH, WIDTH

### Community 67 - "Espacios de coordenadas"
Cohesion: 0.33
Nodes (6): De la rejilla a la pantalla, Dentro de una columna, Direcciones y puntos cardinales, Ejes del mundo, Espacios de coordenadas, Sistema de coordenadas

### Community 70 - "dependencies"
Cohesion: 0.67
Nodes (3): dependencies, pixi.js@^8.22.0, preact@^10.27.2

## Knowledge Gaps
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `player/player.ts`, `scene-harness.ts`, `camera/camera.ts`, `game.test.ts`, `silhouette.ts`, `received-shadow.ts`, `perf.ts`, `Box`, `band-atlas.test.ts`, `chunks.ts`, `World`, `types/entities.ts`, `render.ts`, `Arquitectura`, `moving-shadow.test.ts`, `Sombras`, `foliage-wind.test.ts`, `scene.ts`, `generateWorld`, `terrain-view.ts`, `shadows.test.ts`, `surfaces.ts`, `entities/entities.ts`, `simulation/simulation.ts`, `WorldParts`, `engine/index.ts`, `sun.ts`, `world.test.ts`, `architecture.test.ts`, `occlusion.ts`, `draw-order.test.ts`, `devDependencies`, `scene.test.ts`, `coords.ts`, `types/index.ts`, `pairs.test.ts`, `package.json`, `createSvgColorVariant`, `texture-pool.test.ts`, `TILE_METRICS`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Arquitectura` (e.g. with `getVisibleChunks()` and `createSceneCamera()`) actually correct?**
  _`Arquitectura` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Should `player/player.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05262027491408935 - nodes in this community are weakly interconnected._
- **Why does `tint()` connect `Estado actual del core` to `player_walk.py`, `Entity`, `roof_variants.py`, `Box`, `iso_lib.py`, `.voxel`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Arquitectura` (e.g. with `getVisibleChunks()` and `createSceneCamera()`) actually correct?**
  _`Arquitectura` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Should `scene-harness.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06140350877192982 - nodes in this community are weakly interconnected._
- **Why does `Entity` connect `Entity` to `Revisión del core de Armada Engine`, `entities/entities.ts`, `scene-harness.ts`, `world.test.ts`, `Box`, `CellMap`, `Estado actual del core`, `chunks.ts`, `Arquitectura`, `foliage-wind.test.ts`, `scene.ts`, `generateWorld`, `shadows.test.ts`, `Revisión del core de Armada Engine`, `Revisión del core de Armada Engine`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._