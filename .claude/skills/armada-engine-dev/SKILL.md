---
name: "armada-engine-dev"
description: "Úsala al modificar, extender o revisar código del motor isométrico Armada Engine (Rust: crate `iso` sin gráficos + cliente Macroquad `iso-core`): dominio, entidades, terreno, proyección, render o assets."
---

# Desarrollo en Armada Engine

Armada Engine es un motor isométrico en **Rust**: el crate `iso` (dominio portable, sin Macroquad ni GPU) y el binario `iso-core` (el cliente Macroquad, nativo y WASM) en el workspace `lib/`. Todo cambio debe conservar la separación **dominio → cliente → dibujo** descrita en `lib/docs/ARCHITECTURE.md`.

## Visión del juego

El motor sostiene un **RPG isométrico muy completo, procedural y de supervivencia**: mundo generado por semilla y por chunks, simulación determinista y persistente (tiempo, clima, necesidades), sistemas RPG data-driven y guardado/carga del mundo completo. Cada cambio debe acercar el core a esa visión, o como mínimo no alejarlo:

- No introducir aleatoriedad no reproducible en el dominio o la generación: las fuentes son explícitas (`terrain::noise`, `derive_seed`, FNV-1a) y se muestrean en coordenadas absolutas. Nada de azar global ni de `std::time`.
- El estado del juego son datos serializables en un `World` (`iso::world`); el cliente solo lo representa. La lógica de juego actúa sobre `World`, nunca dentro de la escena ni sobre objetos de Macroquad.
- El tiempo de juego son ticks enteros (`time::clock`, `TICKS_PER_SECOND` = 20, `TICKS_PER_DAY` = 24 000, `WORLD_START_TICK` = 08:00). Solo el paso fijo avanza el reloj (`simulation::FixedStepper`); nunca el delta de un frame. La hora y la luz se derivan del tick.
- El core (`crates/iso`) no lee archivos, red, audio ni APIs del navegador: solo tipos, cálculos y reglas en `f64`/`i32`. Lo que toca plataforma vive en el cliente como adapters o en traits de `iso::services`.
- El contenido nuevo es datos (`content/json/entities.json` u otro catálogo), no ramas en vistas ni en el renderer. El motor nunca importa contenido: lo recibe como parámetro.
- Nada de estado de sistemas como campos de `World`: cada sistema declara su propia parte/datos, la guarda con su versión y se reconstruye desde el guardado.
- Cada cambio que toque el core termina con la skill **`armada-core-review`** (ver Flujo de trabajo).

Antes de tocar código, lee:

- `lib/docs/ARCHITECTURE.md` — funcionamiento técnico y contratos del juego.
- `lib/docs/FILE_STRUCTURE.md` — estructura de archivos y política de pruebas.
- `lib/README.md` — cómo correrlo y cómo se despliega.
- El `mod.md` del dominio que tocas — catálogo de su API con firmas y enlaces.

Si el trabajo implica crear o modificar assets isométricos (geometría, proporciones, multi-bloque, `data-tiles`), invoca la skill **`armada-voxel-assets`**: es la fuente oficial de las reglas de assets. (Los sprites aún sin migrar a la ruta voxel son fijos; para ellos no se crean SVG nuevos.)

Si el cambio se juzga **mirando** (terreno, colocación de entidades, sombras, reflejos, fases del día, animación del jugador, cámara, polvo), invoca la skill **`armada-visual-check`**: corre el juego desde un `scene.json` y devuelve capturas PNG y un informe, sin pedirle nada al usuario y sin pantalla en Linux. Un test verde no demuestra que algo se vea bien.

## Arquitectura

Dos crates, en `lib/`:

```text
lib/
  crates/iso/    # `iso`: dominio portable. Sin Macroquad, GPU, navegador ni archivos.
    src/{grid,paths,projection,camera,time,simulation,terrain,biomes,entities,settlements,
         npc,world,lighting,scene_order,water,wind,services}/
    tests/        # solo contratos que cruzan módulos y el fixture (contracts.json)
  src/           # `iso-core`: el cliente. `main.rs` es solo entrada: declara los dominios y entra por `app::run`.
    app, assets, effects, game, gui, lighting, loops, npc, perf, player, rendering, save, services, terrain, touch, water/
  content/       # json/ (entities, biomes, wfc, settlements, assets.manifest), images/ (atlas, cloud-shadow, player-16_*), sounds/ (WAVs)
  assets/        # sprites del atlas: terreno, jugador, ruta voxel y los dos fijos (nubes y sombra) (commiteado; no se despliega)
  painted/       # las hojas pre-renderizadas del jugador desde el modelo 3D
  packaging/     # icono del bundle macOS: icon-player.png + game.icns (commiteado; no se despliega)
  scripts/       # build-web.sh (WASM), build-atlas.sh, run-native.sh, build-macos.sh, build-icon.sh
```

- La dependencia es `iso-core → iso`, nunca al revés. El dominio no conoce sprites, texturas ni Macroquad; si una regla necesita pruebas sin GPU, vive en `iso`.
- `mod.rs` y `lib.rs` son barrels: declaran módulos y reexportan la API; nada de lógica. Los consumidores usan el barrel (`iso::terrain`).
- Cada carpeta con API pública mantiene un `mod.md` en **español** con sus funciones, métodos y constantes. Al añadir, renombrar, mover o eliminar algo público, se actualiza su enlace, firma y propósito en el mismo cambio.
- La pose exacta (constantes, firmas, enlaces) vive en el `mod.md` del dominio: no la dupliques aquí ni la cites de memoria.

Contratos clave (el detalle está en el `mod.md` correspondiente):

- **Tiempo**: 50 ms por tick fijo; `WORLD_START_TICK` 08:00; el reloj avanza solo en el paso fijo.
- **Rejilla**: chunk de 32 × 32 (`CHUNK_SIZE`); división euclídea para negativos; claves numéricas (`cellKey`), nunca `"x:y"`.
- **Orden de dibujo**: `scene_order` asigna a cada elemento profundidad + capa (`PLAYER_BEHIND_LAYER` < `ENTITY_LAYER` < `PLAYER_FRONT_LAYER`). Terreno, entidades y jugador comparten **una** clave (`sprites::scene_key`), alimentada con el centro de la casilla.
- **Simulación**: `simulation::FixedStepper` con acumulador y `alpha` de interpolación; un tick no se puede saltar ni duplicar aunque caiga a 1 fps.
- **Sombras**: `iso::lighting` es geometría pura (sin GPU). El cliente **hornea** una fase (`DAWN`) en CPU por chunk (mapa de 36 px/tile, máquina de estados `GroundBake` con presupuesto de 3 ms por frame). No hornear entidades ni el jugador.
- **El mundo**: `TerrainWorld` conserva los chunks descubiertos; `ChunkManager` calcula carga/prefetch/conservación (1/2/3) **solo al cambiar el chunk de foco**; `save` persiste chunks y estado (`SAVE_FORMAT`, `SAVE_SCHEMA_VERSION`) y el guardado es la autoridad al reabrir.
- **Contenido**: `content/json/entities.json` es el catálogo de entidades (`schemaVersion` 1), validado al cargar con `validate_catalog`; la colocación es determinista y consulta solo el terreno. `content/json/biomes.json` (`schemaVersion` 1) clasifica los árboles por bioma y valida sus blueprints contra el catálogo con `iso::biomes::parse_biomes`; el bioma es una función pura de la semilla (no se guarda) y decide paleta de suelo, bosquetes monospecíficos y `windStrength` (multiplicador del mece con `sway` del viento en su suelo; `iso::wind` da el desplazamiento, el cliente dibuja la copa sesgada alrededor del corte del sprite). `content/json/wfc.json` (`schemaVersion` 2) da pesos de colocación al resto de blueprints y techos por chunk por blueprint o familia (`families`/`maxPerChunk`), y exige un peso para cada blueprint no reclamado con `iso::entities::wfc::parse_wfc`; el solver `iso::entities::wfc::solve_chunk` coloca por chunk con vacancia siempre posible, hueco 1 entre mismos tipos y autocontención frente a vecinos (orden de descubrimiento irrelevante). `content/json/settlements.json` (`schemaVersion` 2) declara los poblados como una **cuadrícula de manzanas** (`layout`: tamaño de rejilla, lado de manzana, calles, franja `edge`, salidas `exit`, recorte de esquinas `trim`, parques delanteros `frontPark`, lotes por manzana y `shapes`, la proporción de manzanas con muesca, recortadas, unidas con su vecina o partidas por un callejón) y sus zonas por rol (`center`, `residential`, `park`, `edge`, `street` y el `verge` opcional: la franja de manzana que la cámara ve delante de una calle, solo con decoración baja para que nada tape al jugador), y lo valida `iso::settlements::parse_settlements` contra el catálogo de entidades y las familias de `wfc.json`; el campo `iso::settlements::WorldSettlements` es la capa previa al WFC (función pura de la semilla; cada poblado queda dentro de su celda de `spacing`; el cliente lo tiende sobre el terreno con `on_ground`, que recorta las manzanas sin tierra firme y descarta el sitio cuya plaza no la tiene), da la zona de cada columna, las calles (`streets_over`, que `iso::paths::pave` pavimenta antes de colocar nada) y la tierra desnuda de las manzanas, que pasa a hierba (`blocks_over`), los lotes (`lots_in`, donde `iso::entities::lots::raise_lots` levanta un edificio o decoración por lote tras el pase de biomas y antes del WFC; los lotes ocupan las casillas del contorno que tocan la calle, en un damero sobre todo el mundo para que nunca se toquen, y una zona `uniform` levanta un solo tipo por manzana), multiplica el peso wfc por zona y fija su `greens`, y se entrega al streamer con `ChunkManager::set_settlements`. Dentro de un poblado el bioma no planta: el pase de biomas se salta toda columna cubierta por un asentamiento y la vegetación la siembra `iso::entities::greenery::plant_greens` **después** del WFC, con el patio que cada edificio cuelga de su parte trasera (`+x`, `+y`: la fachada mira a la diagonal decreciente) y el esparcido azul de `iso::grid::PoissonScatter`, cuyo radio se aprieta junto a las paredes y rechaza el despeje delantero.
- **Personajes (NPC)**: `iso::npc` — qué entidad es NPC lo dice `"npc": "<lógica>"` en `entities.json` (sin la clave no hay comportamiento NPC); nacen con su chunk (función de semilla + chunk + suelo) según la regla de su `NpcLogic` (`ai`; hoy solo `basic`: animales sencillos que caminan de lado y nacen en arena), caminan, toman gradas por su eje, escalan un bloque y caen de uno (`plan_npc_step`; nunca saltan, nadan ni corren), avanzan en el paso fijo y no se guardan. El cliente (`src/npc`) los dibuja con las hojas `walk`/`idle`/`climb`/`jump` del jugador.
- **Determinismo**: misma semilla + mismas coordenadas → mismo mundo. Un chunk sale igual solo que junto a sus vecinos. Nada en la generación depende del orden de carga ni de `HashMap`.
- **Rutas**: una sola decisión por proceso (`gui::Route`, regla pura en `route.rs`). En WASM la da el camino de la página — `/` no pinta nada (ni borde, ni HUD, ni mensajes), `/playground` pinta el overlay completo y `/maker` abre el editor sobre un chunk plano. En nativo la dan los argumentos: `--plain`, `--maker`, `--scene <archivo>` (corrida guionizada, ver `armada-visual-check`) y, sin argumentos, el playground. `Route::keeps_the_save` decide quién toca la partida: el editor y una corrida guionizada trabajan sobre un mundo propio y no la tocan. El sitio se sirve desde la raíz del dominio; `build-web.sh` publica también `dist/playground/` y `dist/maker/`.
- **Corridas guionizadas**: `iso::testbed` (reglas puras: esquema de `scene.json`, máquina de pasos, edición vía `iso::maker::apply_brush`, informe) y `src/testbed` (archivo, ventana y disco). El jugador se conduce por `iso::services::InputService`, nunca inyectando eventos en el canvas. Detalle en `lib/docs/TESTBED.md`.
- **macOS**: `scripts/build-macos.sh` compila el cliente en release y ensambla `dist/<Título>.app` (binario en `Contents/MacOS`, `content/` en `Contents/Resources`, icono `packaging/game.icns`, `Info.plist`, firma ad-hoc); sin Xcode, solo Command Line Tools. El nombre del juego tiene una única fuente: `GAME_TITLE` en `src/game/config.rs` (título de ventana, nombre del `.app` y carpeta de guardado derivan de ella — renombrar el juego es editar esa constante y reempaquetar). Dentro del `.app` el cliente resuelve assets en `Contents/Resources` y el guardado en `~/Library/Application Support/<GAME_TITLE>/saves/iso_save.json`; fuera, el comportamiento es el de siempre. El icono del bundle se regenera con `scripts/build-icon.sh` (sips + iconutil sobre `packaging/icon-player.png`).

## Reglas de cambios

- Sin `unsafe` en `iso`. En el cliente, `unsafe` solo para los FFI con la página (`localStorage` para el guardado WASM, `location.pathname` para la ruta web), acotados y documentados en el `mod.md` de su dominio.
- Errores con `Result` y contexto; nada de `panic!` ante datos externos (catálogos, guardados). `assert!` solo para invariantes internas.
- `clippy --workspace --all-targets --locked -- -D warnings` en verde; `cargo fmt --all` limpio. **Nada de `#[allow(clippy::…)]` ni `#![allow(clippy::…)]`**: un lint de clippy no se silencia, se corrige o se reagrupa (parámetros relacionados → struct de dominio); si un lint es genuinamente inaplicable, la excepción la decide el usuario, nunca el código.
- No mezclar dominio y cliente en un mismo módulo ni importar Macroquad/`winit`-like crates en `iso`.
- Todo archivo de comportamiento lleva su `*.test.rs` colocalizado, escrito **antes** que la implementación (test first). El test define el comportamiento; el código lo pasa después. Si el comportamiento puro está mezclado con GPU/ventana/IO, se extrae primero la lógica pura y se prueba; la parte no aislable queda documentada en el propio archivo con su comprobación manual. Las pruebas de dominio usan datos construidos a mano o el fixture de contrato.
- Los **comentarios de documentación** (rustdoc `///`, `//!`) van en **inglés**; la documentación Markdown va en **español**.
- **Nada de comentarios dentro del código** (`//` explicativos, bloques narrativos entre líneas). Solo rustdoc `///`, `//!` al inicio del módulo, función, tipo o constante; una nota superviviente se reduce a una única línea muy resumida. Los detalles y las decisiones viven en el `mod.md` del dominio, no junto al código.
- No editar a mano `content/images/atlas.png`, `content/json/assets.manifest.json` ni `content/images/player-16_*.png`: se generan con `scripts/build-atlas.sh` desde `assets/`.
- El modelo `.vox` es la fuente; `artifacts/vox/clay/vox_models.py` y `artifacts/vox/clay/grass_clay.py` regeneran los sprites que entran al atlas desde `assets/`. Para los sprites fijos (terreno, gradas, nubes, sombra), el PNG manda. Un sprite nuevo para atlas se comprueba contra `assets.manifest.json` con los tests de `iso::assets`.
- Nada de estado de sistema como campos sueltos de `World`; nada de reimplementar lo que `iso` ya expone.

## Versionado

- La única fuente de la versión del juego es `lib/Cargo.toml` (`[package].version`); `Cargo.lock` la acompaña siempre — si la subes, sincroniza antes el lockfile (`cargo check`) para que el gate `--locked` pase. `scripts/build-macos.sh` la lee como `CFBundleShortVersionString`.
- `CFBundleVersion` (número de build) no se anota a mano: `scripts/build-macos.sh` lo deriva de `git rev-list --count HEAD` (o 1 fuera de un repositorio).
- **Toda entrega incrementa la versión, en el mismo cambio**: PATCH para correcciones y mantenimiento, MINOR para funcionalidad (un dominio nuevo, un empaquetado, un contrato visible). Nunca se entrega un cambio sin subirla.
- **Los skills se actualizan en el mismo cambio**: si un cambio mueve estructura, contratos, scripts, la política de versionado o un flujo de build, el skill afectado (este, `armada-core-review`, `armada-visual-check` o `armada-voxel-assets`) se actualiza en ese mismo cambio — nunca «en la próxima revisión».

## Flujo de trabajo

1. Lee `lib/docs/ARCHITECTURE.md` y el `mod.md` del dominio antes de tocar nada.
2. **Test first, sin excepciones silenciosas:** antes de escribir o mover un comportamiento, escribe el test colocalizado que lo define (`<nombre>.test.rs`, cargado con `#[path]` bajo `#[cfg(test)]`). Después implementa hasta que el test pasa. Un cambio que añade o cambia comportamiento sin su `*.test.rs` en el mismo cambio está incompleto, igual que uno sin `cargo clippy -D warnings` en verde. Las únicas excepciones son: barrels, entradas (`main.rs`), datos puros y código GPU/ventana/IO no aislable aún — y en ese último caso la excepción se documenta en el propio archivo y se anota la comprobación manual; nunca se omite en silencio. Si una tarea no deja un test nuevo donde antes no había, justifícalo en la respuesta.
3. Implementa respetando crates, barrels y la regla de dependencia.
4. Antes de terminar, ejecuta en orden:

   ```bash
   cd lib
   cargo fmt --all
   SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo clippy --workspace --all-targets --locked -- -D warnings
   SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo test --workspace --locked
   SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core
   ```

   `SDKROOT` solo hace falta en macOS si el SDK de Command Line Tools está roto (`scripts/run-native.sh`, `build-atlas.sh` y `build-web.sh` lo seleccionan solos); en otros sistemas, ejecuta `cargo` directo. La build WASM la cubre `bash scripts/build-web.sh`. Si el cambio incrementa la versión (ver Versionado), sincroniza antes el lockfile con `cargo check`; si no, el `--locked` fallará por el desfase de `iso-core`.
5. Para revisión visual, invoca **`armada-visual-check`**: escribe un `scene.json`, lo corre (`lib/scripts/run-scene.sh`, o `xvfb-run` sin pantalla) y mira las capturas y el `report.json`. Para jugarlo a mano, `lib/scripts/run-native.sh`. El presupuesto por frame se mira con `src/perf` (frame_log).
6. Actualiza la documentación en el mismo cambio (ver abajo) y, si el cambio mueve estructura, contratos, scripts o la política de versionado, actualiza el skill afectado en el mismo cambio (ver Versionado).
7. **Invoca `armada-core-review`** para auditar el core tras tu cambio. Esa skill puede corregir deficiencias, registrar deuda en `lib/docs/CORE_REVIEW.md` y proponer una actualización de esta skill; incluye su informe en tu respuesta final.

## Regla de documentación

Todo cambio que modifique el funcionamiento del core, sus contratos o el flujo de assets debe actualizar en el mismo cambio los Markdown afectados:

- `lib/docs/ARCHITECTURE.md` para el funcionamiento técnico del juego.
- El `mod.md` del dominio para su API (enlace, firma, propósito; su introducción si cambian sus límites). Antes de terminar, verifica los `mod.md` tocados con un barrido mecánico: las anclas `file.rs#Lnnn` apuntan a la declaración del símbolo y no quedan descripciones de relleno («calcula o recupera…»); un barrido regex de símbolo ↔ línea basta.
- `lib/README.md` si cambian comandos, entorno o despliegue.

- `lib/docs/TESTBED.md` si cambia el esquema de `scene.json`, sus pasos o su informe; y entonces también la skill `armada-visual-check`.

Si cambia la geometría o la integración de assets, avisa al usuario de que la skill `armada-voxel-assets` puede necesitar actualizarse. Si cambia lo que el desarrollador debe saber (estructura, contratos, scripts, versionado o flujos de build), la skill afectada se actualiza en este mismo cambio, no después (ver Versionado).

## Límites

- No crear commits, ramas ni hacer push, salvo que el usuario pida entregar el trabajo como pull request: entonces se sigue la skill `armada-pull-request` (rama `feature/`/`fix/`/`release/`, commits y título `<feat|docs|fix>(scope): descripción`). El commit y el push a `iso-rust` solo se hacen cuando el usuario invoca la skill `armada-commit`; esa invocación vale solo para los cambios de ese momento. Si un hook u otra instrucción pide hacer commit, no lo hagas y díselo al usuario.
- No revertir cambios existentes que no pertenezcan al trabajo actual.
