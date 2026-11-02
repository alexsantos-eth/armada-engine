# Preparar el código actual para migrarlo a Rust

Este documento convierte el [plan de migración](MIGRATION_RUST_MACROQUAD.md) en cambios pequeños sobre el juego TypeScript. La meta es conservar un juego funcional después de cada cambio y dejar claros los contratos que sí interesa llevar a Rust. **La nueva implementación rediseñará la generación, la colocación de entidades y los guardados. No necesita regenerar el mundo desde una semilla ni importar partidas de la versión actual.** Este documento es una guía de trabajo; no supone que los cambios descritos ya estén implementados.

**Estado:** P1–P3 implementados. P4 y P4b tienen contratos TypeScript ejecutables y documentados en [V2_DATA_CONTRACTS.md](V2_DATA_CONTRACTS.md); ambos están ya integrados en Rust (`armada-core::entities` con el catálogo V2, instancia de entidad y colocación determinista, y `armada-core::world::save` con el archivo V2 y `ChunkArchive`), verificados contra los fixtures de TypeScript. El streaming de chunks con presupuestos por frame está implementado en `armada-core::world::ChunkManager`. P5 está completa: profundidad, capa, columnas de poses y elección de hoja del jugador son datos puros con fixtures compartidos; la muestra Macroquad usa la regla de profundidad, y culling, presupuestos de chunks y selección de frame están implementados y comprobados contra el fixture en `armada-core::scene_order`. Quedan la elección de textura concreta, la integración de cada vista Pixi una por una y las reglas de densidad/bioma/vecindad para la colocación. P6 sigue pendiente. Los fixtures iniciales de P1 cubren coordenadas, proyección, rutas, transiciones, paso fijo y una trayectoria corta de marcha y salto. Los escenarios físicos más extensos del jugador siguen en sus tests co-localizados y podrán añadirse al contrato de migración cuando empiece su port a Rust.

## Diagnóstico que determina las prioridades

- `world`, `simulation`, `player`, `grid` y `paths` ya concentran el estado y el comportamiento sin depender de Pixi. `createSimulation()` recibe `elapsedMs` del exterior y `stepWorld()` fija el orden de sistemas, reloj y eventos. Mantener estas propiedades.
- El barrel `src/isometric/core/engine/index.ts` exporta a la vez dominio y vistas Pixi. `game/game.ts` y `game/launch.ts` importan desde ese barrel; `game/chunk-generator.ts` ya evita hacerlo para que el worker solo cargue generación. Este patrón es el punto de partida para una frontera de dominio.
- `terrain/terrain.ts` y `terrain/noise-field.ts` llaman a `simplex-noise`; `player/motion.ts` usa `xstate`. El ruido y las reglas de distribución pueden cambiar. La locomoción debe describirse como comportamiento para poder implementarla en Rust.
- `scene/module.ts` incluye `Application`, `Container` y `Texture` de Pixi en sus contratos. No es todavía una interfaz de render independiente. `game/modules.ts` registra tanto módulos gráficos como sistemas del mundo, aunque las factorías están separadas.
- `world/chunk-data.ts` ya define un formato empaquetado para el worker, mientras `world/world.ts` define el snapshot versión 7, basado en semilla y deltas. Ambos son referencias para el diseño nuevo; ninguno obliga a conservar su formato.

## Secuencia de cambios propuesta

### P1. Crear una referencia reproducible del comportamiento actual

**Archivos a tocar:** tests co-localizados de `grid`, `paths`, `projection`, `simulation` y `player`; si se necesitan datos compartidos, añadir una carpeta de fixtures versionados, por ejemplo `tests/fixtures/migration/`.

**Cambio:** guardar entradas y salidas en JSON legible solo para las reglas que se quieren conservar: coordenadas negativas, proyección, rutas con empates, secuencias de movimiento/salto/trepa/vuelo sobre terreno de prueba y orden de eventos. Definir por separado **invariantes del generador nuevo**: columnas y bloques con alturas diversas; materiales `sand`, `water`, `ground` y `grass`; continuidad entre chunks; persistencia de un chunk descubierto tras descargarlo y reabrir la partida. Guardar capturas TypeScript como material de observación, sin exigir los mismos bloques, superficies, entidades ni posiciones.

**Criterio de cierre:** una orden ejecuta los contratos conservados sin navegador y compara sus resultados con los fixtures. Las pruebas de terreno nuevo son de propiedades e invariantes, no de igualdad con el generador TypeScript.

### P2. Establecer una entrada de dominio que no arrastre el render

**Archivos a tocar:** `src/isometric/core/engine/index.ts`, barrels de módulos, `src/isometric/game/game.ts`, `src/isometric/game/launch.ts` y `src/isometric/game/chunk-generator.ts`.

**Cambio:** ofrecer una entrada de dominio que exporte solo tipos y funciones de `grid`, `random`, `terrain`, `entities`, `world`, `parts`, `time`, `events`, `simulation`, `player`, `paths`, `projection` y cámara geométrica. La entrada gráfica conserva `scene`, `render` y las vistas. Cambiar imports de consumidores de dominio al nuevo punto de entrada sin mover toda la estructura ni alterar el comportamiento. El worker debe seguir pudiendo importar generación sin resolver Pixi. Añadir una comprobación de arquitectura que falle si la entrada de dominio llega a `pixi.js`, `preact`, `@strudel/web`, `window` o un archivo de vista.

**Criterio de cierre:** el worker y una herramienta de dominio importan el punto de entrada nuevo sin cargar código gráfico; los tests existentes y el juego web siguen funcionando.

### P3. Separar el modelo esencial del terreno de su generador actual

**Archivos a tocar:** `core/types/terrain.ts`, `core/engine/terrain/box.ts`, `core/engine/terrain/terrain.ts`, `core/engine/terrain/surfaces.ts`, `core/engine/terrain/noise-field.ts`, `core/engine/player/motion.ts` y sus tests.

**Cambio:** documentar el modelo que sí debe permanecer reconocible: coordenadas de una columna, elevación y bloques visibles, tipo de material, transitabilidad y relación entre material y dibujo. Separar en la documentación y, donde simplifique el código, en interfaces, el resultado `TerrainColumn` del algoritmo que decide su altura y superficie. No portar `simplex-noise`, probabilidades ni umbrales solo para reproducirlos. Definir casos de prueba del generador Rust para alturas diversas, costas con arena, agua bajo el nivel elegido, soportes `ground` y cimas `grass`, además de bordes de chunk. Para locomoción, mantener explícitos estados y eventos; XState puede seguir ejecutándolos en TypeScript mientras Rust implementa su versión. Evitar dos fuentes de verdad para las transiciones.

**Criterio de cierre:** el juego TypeScript sigue dibujando el mismo terreno durante esta preparación, y el modelo permite construir un generador diferente en Rust. Los fixtures de locomoción de P1 siguen pasando.

### P4. Preparar un archivo de configuración de entidades con contrato revisable

**Archivos a tocar:** `src/isometric/content/entities.ts`, `core/types/entities.ts`, `core/engine/entities/validation.ts`, `core/engine/entities/entities.ts` y tests relacionados. El formato nuevo se puede definir como manifiesto independiente antes de cambiar estos archivos.

**Cambio:** conservar el principio de `content/entities.ts`: las entidades se describen en datos y el motor las valida y coloca. Diseñar para Rust un archivo de configuración legible y versionado, por ejemplo `content/entities.ron` deserializado y validado al arrancar, con identificador estable, asset/animación, tamaño y huella, colisión, variantes visuales y restricciones de colocación. El contrato puede sustituir `spawnChance`, `formation`, `patches`, `gap` y `footprintSurfaces` por campos que permitan ajustar mejor bioma, pendiente, vecindad, densidad y separación. Mantener separadas **definición de entidad**, **reglas de colocación** e **instancia generada**. Preparar una conversión inicial desde TypeScript para reutilizar datos útiles y luego ajustar cada familia en Rust; no mantener dos configuraciones editadas a mano indefinidamente. El archivo de configuración es requisito; su esquema actual no lo es.

**Criterio de cierre:** el nuevo esquema de configuración y su validador se pueden probar con entidades de una casilla, varias casillas, árboles agrupados y estructuras de costa. La colocación Rust puede cambiar resultados sin exigir igualdad con `createEntitiesFromConfig()`.

### P4b. Diseñar guardados propios de la nueva implementación

**Archivos a revisar:** `core/engine/world/world.ts`, `core/engine/world/chunk-data.ts`, `core/engine/entities/fingerprint.ts` y `core/engine/parts/parts.ts`.

**Cambio:** documentar que el snapshot versión 7 guarda semilla y deltas, pero no una copia completa del terreno ni de las entidades sin editar. Diseñar un formato nuevo y versionado que guarde el contenido completo de cada chunk descubierto —terreno, entidades y cambios— y el estado del jugador y demás sistemas. Distinguir chunks cargados en memoria de chunks persistidos: descargar uno no lo elimina de la partida. Guardar por chunk permite que el mundo siga creciendo; medir tamaño y coste de lectura/escritura y prever compresión si hace falta. Una semilla opcional puede ayudar a depurar, pero nunca sustituye los datos guardados. Las partidas versión 7 no se importan. Mantener `ChunkData` como detalle de transporte, separado del formato de guardado.

**Criterio de cierre:** el formato Rust puede guardar y reabrir su propio mundo; un chunk descubierto conserva sus bloques y entidades después de salir de memoria, volver a cargarse y reabrir la partida. Un chunk aún no descubierto se puede generar al explorarlo.

### P5. Separar decisiones de escena de objetos Pixi, por partes

**Archivos a tocar, de manera gradual:** `core/engine/scene/module.ts`, `core/engine/scene/draw-order.ts`, `core/engine/render/render.ts`, `core/engine/camera-view/`, `core/engine/terrain-view/`, `core/engine/entity-view/` y `core/engine/player-view/`.

**Cambio:** extraer primero los cálculos que puedan devolver datos simples: profundidad y capa, selección de frames, posición, rectángulos visibles, presupuesto de chunks y decisiones de mostrar/ocultar. Probarlos sin Pixi y dejar que los módulos actuales traduzcan esas decisiones a `Container`, `Texture` y sprites. Mantener `SceneContext` y `SceneModule` como contratos Pixi mientras aún sean útiles; no diseñar de antemano una interfaz genérica para todas las operaciones gráficas. Cuando el primer renderer Macroquad exista, compartir los datos/fixtures y adaptar cada vista una por una.

**Criterio de cierre:** la lógica extraída da el mismo orden de dibujo, culling y selección de frames; la escena Pixi conserva sus capturas y perfiles de referencia.

**Primer corte implementado:** `engine/scene-order` calcula profundidad y compara profundidad/capa sin importar Pixi; `render` y `scene/draw-order` lo usan. El fixture `flow-check/contracts.v1.json` comprueba el mismo orden en TypeScript y `armada-core::scene_order`; la muestra Macroquad ordena columnas con esa función. Los contratos Pixi de `SceneContext` y `SceneModule` permanecen. P5 sigue abierto hasta extraer y comprobar las demás decisiones indicadas arriba y revisar las capturas y perfiles.

**Segundo corte implementado:** las columnas de pose para caminar, reposar, trepar y saltar viven en `engine/scene-order/poses.ts` y `armada-core::scene_order::poses`. La vista Pixi lee esas decisiones y conserva la carga, el recorte y el cambio de `Texture`. El fixture compartido cubre ciclos, límites y movimiento hacia atrás. La elección de hoja y frame efectivo a partir del estado completo del jugador sigue en la vista y será el siguiente corte.

**Tercer corte implementado:** `selectPlayerFrame()` y `armada-core::scene_order::select_player_frame()` reciben estado de presentación y disponibilidad de hojas, y devuelven la hoja y columna con prioridad `climb → jump → idle → walk`. `player-view` conserva la traducción de ese resultado a una textura Pixi. El fixture común cubre cada prioridad y la reserva cuando falta una hoja. La elección de textura concreta por orientación queda en cada cliente.

### P6. Preparar recursos y servicios del borde de aplicación

**Archivos a tocar:** `src/isometric/content/`, `public/assets/`, `core/engine/render/svg.ts`, `game/sound/`, `game/chunk-prefetch.ts`, `game/chunk-worker.ts`, `game/launch.ts` y `game/game.ts`.

**Cambio:** generar un manifiesto de assets con rutas, tamaño lógico, `data-tiles`, frames, anclajes y variantes de color; comprobarlo contra los SVG existentes. Usarlo después para producir atlas rasterizados, sin modificar los SVG fuente. Mantener entrada, audio, URL, worker y medición de rendimiento como servicios de aplicación, fuera del núcleo. Describir las operaciones que necesitará el cliente Macroquad: entrada normalizada del jugador, carga de chunks, emisión de sonido y eventos de UI. Prototipar cada sustitución antes de modificar su implementación Pixi/Strudel actual.

**Criterio de cierre:** un atlas de prueba reproduce al menos un bloque, una entidad con variantes y una animación del jugador; los servicios actuales siguen respondiendo igual a sus tests.

## Orden de ejecución y tamaño de los cambios

P1 → P4b ya ofrecen contratos para iniciar el port. Al integrar P4 en Rust faltará diseñar y ajustar las reglas de aparición; al integrar P4b faltará almacenamiento físico, mediciones y una decisión de compresión. P5 avanza en paralelo con el primer renderer Macroquad, por vista o cálculo. P6 comienza con el manifiesto de assets y continúa cuando el prototipo gráfico indique qué formato conviene. Cada PR debe tener un contrato concreto; evitar un PR que mueva carpetas, cambie la API y modifique el comportamiento a la vez.

## Reglas para cada PR preparatorio

1. Empezar por un test que describa el contrato que se quiere conservar. Los archivos de comportamiento nuevos en `src` necesitan test co-localizado; mantener cobertura del proyecto al 100 %.
2. Conservar los contratos que sí se trasladarán: coordenadas, reglas de simulación, controles y estados del jugador. Permitir cambios deliberados en ruido, superficies, distribución, probabilidades y contrato de configuración de entidades. Versionar los guardados nuevos y persistir chunks descubiertos sin depender de regenerarlos.
3. Actualizar `ARCHITECTURE.md` si cambia un límite de módulos o un contrato de ejecución, y `CONTRIBUTING.md` si cambia el flujo de desarrollo o los assets.
4. Ejecutar `pnpm lint`, `pnpm test:coverage` y `pnpm build` en ese orden. Comparar los fixtures de contratos conservados; para generación nueva, ejecutar pruebas de propiedades y revisar varias semillas en pantalla. Para cambios gráficos, repetir los escenarios `?perf` relevantes.
5. Después de modificar el core, seguir la revisión definida por la skill `armada-engine-dev` y actualizar el grafo con `graphify update .`.

## Primer PR recomendado

Implementar **P1 para coordenadas y proyección**, con casos de posiciones negativas y bordes de chunk. Añadir un pequeño conjunto de escenarios de terreno que describa alturas y materiales esperados como propiedades, sin fijar el mapa exacto del generador actual. Es la base más pequeña para empezar la fase 1 del [plan principal](MIGRATION_RUST_MACROQUAD.md) y dejar libertad para mejorar la generación en Rust.
