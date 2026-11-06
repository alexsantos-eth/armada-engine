# Armada Engine en Rust y Macroquad

Este directorio contiene la nueva implementación. `iso-core` es el cliente Macroquad; `crates/armada-core` contiene el dominio sin dependencias gráficas. El workspace fija Rust 1.99.1 y Macroquad 0.4.16. La demo actual muestra una muestra de terreno generado para verificar alturas y materiales, además de la proyección isométrica, teclado, ratón, escalado con la ventana y arranque web. La vista usa colores y geometría temporales; todavía no representa el juego completo.

La [arquitectura por módulo](ARCHITECTURE.md) documenta los contratos del dominio y del cliente, el flujo de un fotograma y las prácticas de código, pruebas y calidad.

El dominio conserva la organización por carpetas de responsabilidad del motor TypeScript: `grid/`, `paths/`, `projection/`, `camera/`, `time/`, `simulation/`, `terrain/`, `world/` y `lighting/` ya están separados; el módulo de entidades seguirá el mismo patrón. El cliente separa la preparación de la muestra en `src/game/` de su dibujo en `src/terrain_view/`, y las sombras horneadas en `src/shadow_view/`. `mod.rs` define la entrada de cada carpeta y `lib.rs` expone solo los módulos del dominio.

Las pruebas unitarias también están colocalizadas: `grid/coords.rs` se prueba en `grid/coords.test.rs`, y el mismo patrón se aplica a los demás módulos y a `main.rs`. Rust las incluye con `#[cfg(test)]` y `#[path = "..."]`; `crates/armada-core/tests/` conserva los contratos que atraviesan módulos o comparan el fixture de migración.

## Generar el atlas de assets

Los SVG de `../public/assets/` se rasterizan y empaquetan en `content/atlas.png` con su manifiesto `content/assets.manifest.json`:

```sh
./build-atlas.sh
```

El script rasteriza cada SVG con `cairosvg` (`rasterize.py`) y luego compila y ejecuta `pack_atlas`. Cada dibujo se rasteriza a 320 px por tile de mundo, así que llega al empaquetador al tamaño al que se dibuja y este solo recorta y coloca: el atlas mide 4096 px de ancho y lo que haga falta de alto. Las hojas de poses del jugador (`walk`, `idle`, `jump`, `climb`, `jetpack`) no caben en el atlas sin perder su detalle —una pose quedaba en unos dieciséis píxeles— así que se cortan celda a celda y cada una recibe su textura, `content/player-16_<hoja>.png`, con su rejilla descrita en el manifiesto (esquema 2). Este cliente dibuja las hojas de dieciséis orientaciones de `public/assets/player-16/`; las de ocho de `public/assets/player/` son del cliente Pixi y `rasterize.py` las omite. El `build.rs` verifica que el atlas y el manifiesto existen al compilar.

Los bloques de terreno (hierba, tierra y arena) los genera `artifacts/terrain_blocks.py`, y cada uno **llena su casilla entera**: su techo es el rombo de la casilla y sus dos caras visibles caen rectas hasta el plano del bloque de abajo, de modo que dos vecinos se tocan y una columna se apila sin hueco. Las esquinas redondeadas de arcilla que conservan los demás assets dejaban un surco de fondo en cada borde del campo, y una sombra puesta sobre la casilla se veía atravesada por esa rejilla de líneas claras. El borde de la casilla se sigue leyendo, pero como un reborde más oscuro pintado dentro del techo (`RIM`). Después de tocar esos SVG hay que regenerar las variantes de hierba (`grass_clutter.py`) y los dieciséis tiles de camino (`path_tiles.py`), y volver a empaquetar el atlas.

`public/assets/shadow/white.svg` no es arte: es un cuadrado blanco opaco, y está ahí para que las sombras se dibujen muestreando el propio atlas en vez de ligar una textura suya. Macroquad abre una llamada de dibujo cada vez que cambia la textura, y una sombra va entre dos bloques de suelo, así que sin este parche la escena pasa de 3 llamadas a 134. No lo borres del atlas; el cliente avisa por consola si falta.

`cargo run --bin remeasure_atlas -- content/assets.manifest.json content/atlas.png ../public` reescribe la geometría de un atlas ya empaquetado sin rasterizar nada; deja intactas las hojas, cuyas celdas son una rejilla y no un recorte.

## Ejecutar

Desde `iso-core/`, para abrir la demo **nativa**:

```sh
./run-native.sh
```

El script ejecuta `cargo run --locked` por defecto. También acepta cualquier subcomando de Cargo:

```sh
./run-native.sh run --release --locked
./run-native.sh test --workspace --locked
./run-native.sh clippy --workspace --all-targets --locked -- -D warnings
```

Para compilar y servir el **WASM**:

```sh
cargo build --release --target wasm32-unknown-unknown --locked
python3 -m http.server 8765 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8765/web/`. El servidor debe iniciarse en `iso-core/` para que la página encuentre `target/wasm32-unknown-unknown/release/iso-core.wasm`. No abrir el HTML con `file://`. La página carga el puente JavaScript oficial de Macroquad desde `not-fl3.github.io` y registra en su import `env` las operaciones de `localStorage`; antes de publicar, incluir una copia versionada del puente junto a los assets del juego y fijar sus cabeceras de caché. El cliente no usa `web-sys`, porque su glue code de `wasm-bindgen` no es compatible con el cargador raw de Macroquad. El artefacto WASM de esta demo ocupa aproximadamente 614 KiB antes de compresión.

La muestra genera cuatro chunks al arrancar. Flechas o WASD mueven el marcador en pantalla; el clic lo sitúa sobre el plano del mundo. `T` alterna entre terreno y rejilla. En localhost, la página añade un parámetro a la URL del WASM para cargar la compilación más reciente al recargar.

Para desplegar en Netlify sin Rust/Cargo en el entorno de build, el repositorio conserva el WASM
publicado en `public/iso-core/iso-core.wasm`. El build Node copia el contenido Rust a
`public/iso-core/content/` y Vite publica ambos bajo `dist/iso-core/`. Después de cambiar el
cliente Rust, regenera y sincroniza el artefacto desde la raíz:

```sh
pnpm build:wasm
pnpm build
```

Netlify solo necesita ejecutar `pnpm build`; no necesita instalar Rust.

En esta máquina, el SDK de Command Line Tools macOS 27 falla al enlazar con el clang instalado. `run-native.sh` selecciona el SDK 26.5 instalado si se ejecuta en macOS y `SDKROOT` no está definido; en otros entornos deja la selección de SDK intacta. También se puede ejecutar Cargo directamente con `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo run --locked`. Es un ajuste del entorno local, no una dependencia del proyecto.

## Referencia para el port

El contrato ejecutable del juego actual está en `../src/isometric/core/engine/flow-check/contracts.v1.json`. Comprobarlo con `pnpm test:migration` desde la raíz. Los casos que conservará el dominio Rust son:

- Coordenadas de chunks y celdas locales, incluidas posiciones negativas y bordes de 32 × 32.
- Proyección isométrica y elevación, con el origen y ejes documentados en `../ARCHITECTURE.md`.
- Orden de desempate de rutas en un escenario controlado.
- Transiciones representativas de locomoción, incluido un evento que no cambia el estado.
- Paso fijo de 50 ms, acumulación e interpolación.
- Trayectoria breve de marcha y salto sobre suelo controlado.

La generación de terreno, distribución de entidades y resultados de una semilla pueden cambiar. Los nuevos guardados almacenarán el contenido descubierto, sin depender de regenerarlo.

La fase 1 ya incluye `grid`, `paths`, `projection`, `camera`, `time` y el acumulador de `simulation` en carpetas de `crates/armada-core/src/`. El primer corte de terreno añade `terrain/columns.rs`, `noise.rs` y `generation.rs`: bloques con alturas distintas y superficies de agua, arena, suelo e hierba; muestreo absoluto y clasificación coherente entre chunks. `world/` conserva chunks descubiertos y ediciones al ocultarlos, y la demo lee de ese estado. P5 añade `scene_order`: profundidad, capa, columnas de poses y prioridad de hojas del jugador sin Macroquad, probadas contra el mismo fixture que TypeScript. Los tests Rust leen el fixture JSON de TypeScript para coordenadas, proyección, rutas, profundidad, poses y paso fijo; la generación nueva tiene pruebas propias de propiedades, sin exigir igualdad con TypeScript. `WorldCoord` usa `i32`; las claves se validan dentro de ±1 048 575 y se empaquetan en `u64` sin perder precisión al compararlas con los enteros seguros de JavaScript. La proyección usa `f64` para conservar el redondeo observable del contrato. La demo dibuja esa muestra de terreno con bloques de colores de depuración; el atlas, los assets y el guardado siguen pendientes.

## Referencia visual y de rendimiento

`reference/pixi-seed-1337-hour-8.png` es una captura del build PixiJS en reposo con `?seed=1337&hour=8&timeScale=0&perf`. `reference/pixi-perf-seed-1337-hour-8.txt` contiene cinco informes de la misma sesión. `reference/macroquad-phase0-wasm.png` muestra la demo inicial y `reference/macroquad-grid-wasm.png` la rejilla proyectada por el dominio Rust. En la vista PixiJS capturada había un chunk, 60 fps, 28 llamadas de dibujo de media y 155.9 MB de texturas; son observaciones de esa ventana y hardware, no umbrales para Macroquad. Sirven para comparar experiencia, composición y orden visual, sin exigir las mismas posiciones del mundo.

## Estado de la fase 0 y fase 1

- Workspace, versiones y target WASM fijados; Cargo comprueba ambos crates.
- Demo compilada nativamente y para WASM. La ventana nativa arrancó y el navegador mostró la demo WASM; teclado y ratón están conectados al marcador.
- Página de carga, instrucciones y referencia PixiJS registradas.
- Fase 1 completa: `grid`, `paths`, `projection`, `camera`, `time` y el acumulador de `simulation` portados en `crates/armada-core/src/` y verificados contra el fixture TypeScript.
- Fase 2 en curso: el modelo y generador inicial de terreno (`terrain/columns.rs`, `noise.rs`, `generation.rs`) ya están en el dominio y la muestra se dibuja en el cliente; faltan el guardado persistente de chunks descubiertos, las entidades y la integración de sistemas de simulación y escena.

## Estado de P6 (recursos y servicios del borde)

- Manifiesto de assets (`content/assets.manifest.json`) y atlas rasterizado (`content/atlas.png`, 64 SVGs) generados con `pack_atlas` / `remeasure_atlas`.
- Servicios de borde implementados en `src/services.rs`: `MacroquadInput`, `MacroquadAudio`, `MacroquadUi`, `MacroquadChunkLoader`.
- Guardado en WASM: `src/save.rs` persiste en `window.localStorage` bajo la clave `armada_save.json` (no es no-op en `wasm32-unknown-unknown`).
- `ChunkGround` en `src/main.rs` expone los ocupantes de cada columna: `occupancy_at` devuelve los `PlayerObstacle` de las entidades que pisan esa casilla, con su colisión precalculada.
- Animación del jugador: `src/player_view.rs` elige hoja, pose y orientación cada fotograma y el cliente dibuja esa celda; las hojas viven en texturas propias junto al atlas Son 16 orientaciones y un giro las recorre de una en una.
- Pendiente: integración de vistas, reglas de densidad/bioma/vecindad y escritor de guardado en segundo plano (#111).

## Sombras horneadas (amanecer)

Las sombras de este cliente son estáticas: se hornean una vez por chunk en CPU y no cambian con el reloj. `crates/armada-core/src/lighting/` porta la geometría de `src/isometric/core/engine/lighting/` —la matriz de silueta, el desplazamiento de sombra proyectada y las cuatro fases con sus mismos números— y `src/shadow_view/` la lleva a pantalla: un mapa de alfa por chunk para el suelo y una rejilla de sombra recibida que se dibuja como colores de vértice sobre entidades y jugador, así que un árbol se sombrea a sí mismo, a sus vecinos y al jugador que pasa por debajo. El terreno también emite: cada punto pregunta qué altura le tapa el sol (`lighting/terrain.rs`), de modo que una duna sombrea la playa de atrás y el jugador se oscurece al entrar bajo un escalón. Las caras verticales expuestas de las columnas (`lighting/faces.rs`) se dibujan con su propia rejilla, así que una sombra que llega a un acantilado lo sube, y las entidades de varias casillas reciben una sola rejilla para todo el dibujo. Solo está conectada la fase de amanecer (`DAWN`); las otras tres se conservan en `lighting/phases.rs` para que cambiar de fase sea una línea, a costa de rehornear los chunks. El jugador no proyecta sombra todavía. Los detalles y las razones están en [ARCHITECTURE.md](ARCHITECTURE.md).
