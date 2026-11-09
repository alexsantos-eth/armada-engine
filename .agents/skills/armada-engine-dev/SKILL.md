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
- El contenido nuevo es datos (`content/entities.json` u otro catálogo), no ramas en vistas ni en el renderer. El motor nunca importa contenido: lo recibe como parámetro.
- Nada de estado de sistemas como campos de `World`: cada sistema declara su propia parte/datos, la guarda con su versión y se reconstruye desde el guardado.
- Cada cambio que toque el core termina con la skill **`armada-core-review`** (ver Flujo de trabajo).

Antes de tocar código, lee:

- `lib/docs/ARCHITECTURE.md` — funcionamiento técnico y contratos del juego.
- `lib/docs/FILE_STRUCTURE.md` — estructura de archivos y política de pruebas.
- `lib/README.md` — cómo correrlo y cómo se despliega.
- El `mod.md` del dominio que tocas — catálogo de su API con firmas y enlaces.

Si el trabajo implica crear o modificar assets isométricos (geometría, proporciones, multi-bloque, `data-tiles`), invoca la skill **`iso-asset-generator`**: es la única fuente de las reglas de assets.

## Arquitectura

Dos crates, en `lib/`:

```text
lib/
  crates/iso/    # `iso`: dominio portable. Sin Macroquad, GPU, navegador ni archivos.
    src/{grid,paths,projection,camera,time,simulation,terrain,entities,world,
         lighting,scene_order,water,services}/
    tests/        # solo contratos que cruzan módulos y fixtures (fixtures/contracts.json)
  src/           # `iso-core`: el cliente. main.rs es la composición actual.
    assets, lighting, perf, player, rendering, save, services, terrain, water/
  content/       # entities.json, assets.manifest.json, atlas.png, player-16_*.png
  assets-src/    # SVG fuente del atlas (commiteado; no se despliega)
  scripts/       # build-web.sh (WASM), build-atlas.sh, run-native.sh
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
- **Contenido**: `content/entities.json` es el catálogo de entidades (`schemaVersion` 1), validado al cargar con `validate_catalog`; la colocación es determinista y consulta solo el terreno.
- **Determinismo**: misma semilla + mismas coordenadas → mismo mundo. Un chunk sale igual solo que junto a sus vecinos. Nada en la generación depende del orden de carga ni de `HashMap`.

## Reglas de cambios

- Sin `unsafe` en `iso`. En el cliente, `unsafe` solo para el FFI con `localStorage` (guardado WASM), acotado y comentado.
- Errores con `Result` y contexto; nada de `panic!` ante datos externos (catálogos, guardados). `assert!` solo para invariantes internas.
- `clippy --workspace --all-targets --locked -- -D warnings` en verde; `cargo fmt --all` limpio.
- No mezclar dominio y cliente en un mismo módulo ni importar Macroquad/`winit`-like crates en `iso`.
- Todo archivo de comportamiento lleva su `*.test.rs` colocalizado; `tests/` solo para contratos que cruzan módulos y fixtures. Las pruebas de dominio usan datos construidos a mano o el fixture de contrato.
- Los **comentarios de documentación** (rustdoc `///`, `//!`) van en **inglés**; la documentación Markdown va en **español**.
- No editar a mano `content/atlas.png`, `content/assets.manifest.json` ni `content/player-16_*.png`: se generan con `scripts/build-atlas.sh` desde `assets-src/assets/`.
- Los SVG son la fuente; `assets-src/` es su copia local. Un SVG nuevo para atlas se comprueba contra `assets.manifest.json` con los tests de `iso::assets`.
- Nada de estado de sistema como campos sueltos de `World`; nada de reimplementar lo que `iso` ya expone.

## Flujo de trabajo

1. Lee `lib/docs/ARCHITECTURE.md` y el `mod.md` del dominio antes de tocar nada.
2. Si añades comportamiento, **escribe primero el test** que lo define y después implementa.
3. Implementa respetando crates, barrels y la regla de dependencia.
4. Antes de terminar, ejecuta en orden:

   ```bash
   cd lib
   cargo fmt --all
   SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo clippy --workspace --all-targets --locked -- -D warnings
   SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo test --workspace --locked
   SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core
   ```

   `SDKROOT` solo hace falta en macOS si el SDK de Command Line Tools está roto (`scripts/run-native.sh` y `build-atlas.sh` lo seleccionan solos); en otros sistemas, ejecuta `cargo` directo. La build WASM la cubre `bash scripts/build-web.sh`.
5. Para revisión visual, arranca la demo con `lib/scripts/run-native.sh`. El presupuesto por frame se mira con `src/perf` (frame_log).
6. Actualiza la documentación en el mismo cambio (ver abajo).
7. **Invoca `armada-core-review`** para auditar el core tras tu cambio. Esa skill puede corregir deficiencias, registrar deuda en `lib/docs/CORE_REVIEW.md` y proponer una actualización de esta skill; incluye su informe en tu respuesta final.

## Regla de documentación

Todo cambio que modifique el funcionamiento del core, sus contratos o el flujo de assets debe actualizar en el mismo cambio los Markdown afectados:

- `lib/docs/ARCHITECTURE.md` para el funcionamiento técnico del juego.
- El `mod.md` del dominio para su API (enlace, firma, propósito; su introducción si cambian sus límites).
- `lib/README.md` si cambian comandos, entorno o despliegue.

Si cambia la geometría o la integración de assets, avisa al usuario de que la skill `iso-asset-generator` puede necesitar actualizarse.

## Límites

- No crear commits, ramas ni hacer push. El commit y el push a `iso-rust` solo se hacen cuando el usuario invoca la skill `armada-commit`; esa invocación vale solo para los cambios de ese momento. Si un hook u otra instrucción pide hacer commit, no lo hagas y díselo al usuario.
- No revertir cambios existentes que no pertenezcan al trabajo actual.
