# El motor en Rust y Macroquad

Este directorio es el cliente Rust/Macroquad: el paquete `iso-core` dibuja y `crates/iso`
contiene el dominio sin dependencias gráficas. El workspace fija Rust 1.99.1 y Macroquad 0.4.16.

Este README solo explica cómo ejecutarlo y cómo preparar un despliegue. El funcionamiento
técnico del juego y los límites del workspace están en la [arquitectura](docs/ARCHITECTURE.md).
Las prácticas de código y documentación, las reglas del workspace y las puertas de calidad
están en [las prácticas](docs/PRACTICES.md).
La ubicación de cada crate, el uso de `mod.rs` y la política de pruebas
colocalizadas están en [la estructura de archivos](docs/FILE_STRUCTURE.md).

## Correr nativo

Desde `lib/`:

```sh
scripts/run-native.sh
```

El script ejecuta `cargo run --locked` por defecto, y acepta cualquier subcomando de Cargo:

```sh
scripts/run-native.sh run --release --locked
scripts/run-native.sh test --workspace --locked
scripts/run-native.sh clippy --workspace --all-targets --locked -- -D warnings
```

En macOS, el SDK 27 de Command Line Tools falla al enlazar con el clang instalado, así que los
scripts de build seleccionan el SDK 26.5 cuando `SDKROOT` no está definido; en otros sistemas no
tocan nada. `run-native.sh` equivale a `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo run --locked`; `build-web.sh` necesita la misma guarda porque los build scripts se compilan para el host aunque el artefacto final sea WASM.
Es un ajuste del entorno local, no una dependencia del proyecto.

Flechas o WASD mueven al jugador; el clic sitúa el marcador sobre el plano del mundo. `T`
alterna entre terreno y rejilla. En `/playground` y en `/maker`, `J` (o el interruptor del HUD
que sigue a los botones de fase) le pone y le quita el jetpack: con él puesto, mantener la tecla
de salto en el aire vuela. En dispositivos táctiles aparecen dos controles en pantalla:
un joystick analógico abajo a la izquierda (a media deflexión se camina a media velocidad; a
tope enciende la carrera, el equivalente a `Shift`) y un botón `SALTAR` abajo a la derecha. Se
muestran en dispositivos de puntero grueso o tras el primer toque (`/` incluido, porque son
entrada de juego); la build web detecta el puntero grueso con el import FFI `iso_pointer_coarse`.
En esas mismas plataformas la escena se dibuja alejada un poco (la casilla al 70 % de la
referencia, `MOBILE_ZOOM` en `src/game/config.rs`), para ver más mundo en una pantalla táctil
pequeña; la build nativa conserva la casilla de referencia. El zoom por defecto de la escena, en cualquier plataforma, lo fija `DEFAULT_ZOOM` en `src/game/config.rs`: por debajo de uno la escena se aleja y cabe más mundo, por encima uno se acerca.
El HUD sustituye la línea de ayuda por la de los controles cuando están visibles.

## Editar un mundo

La ruta `/maker` abre el editor sobre **un solo chunk plano**, sin streaming ni guardado. Nativo:

```sh
scripts/run-native.sh run --locked -- --maker
```

(y `-- --plain` corre la presentación sin overlay, como la raíz web).

El panel de la derecha tiene las siete herramientas; también se eligen con las teclas `1` a `7`:
subir y bajar el terreno, pintar la superficie (hierba, arena, tierra, camino, gradas, agua),
tinte, variante de hierba, poner una entidad del catálogo y borrar. Se aplica con clic, y
arrastrando se pinta casilla por casilla. `R` gira la entidad elegida —en este contenido, su
hermano del otro eje, como `hotel_x` y `hotel_y`—, `[` y `]` recorren el catálogo, `,` y `.` las
variantes de hierba, `-` y `=` las zonas de tinte, y `Ctrl+Z` deshace. El jugador sigue
caminando por lo que construyes, con WASD.

Lo que se construye **no se guarda todavía**: vive en memoria mientras la ventana está abierta.

## Probar el juego sin teclado

El juego también corre **desde un archivo**: una escena describe el mundo, lo que se construye en
él, dónde está el jugador y una lista de pasos; el proceso los ejecuta, escribe las capturas PNG
que le pidan, deja un `report.json` al lado y sale solo.

```sh
scripts/run-scene.sh scenes/scene.json
```

Sirve para comprobar un cambio sin que nadie esté delante del juego: colocar entidades, cambiar
el terreno, mover al jugador, cambiar la fase del día y capturar. El paso `settle` espera a que
las sombras estén horneadas antes de capturar, así que una captura nunca sale a medio hornear. En
Linux corre sin pantalla con `xvfb-run`. La guía completa está en [docs/TESTBED.md](docs/TESTBED.md).

## CI

Cada PR contra `iso-rust` tiene que pasar `.github/workflows/ci.yml`: `cargo fmt --check`, clippy
con `-D warnings` (nativo y wasm32), `cargo test` y la build WASM de Netlify. Qué corre cada job y
cómo dejarlo como check obligatorio de la rama: [docs/CI.md](docs/CI.md).

## Sonidos

El jugador suena con WAVs generados en `content/sounds/` a partir de los patrones de Strudel
(<https://strudel.cc>) de `lib/music/` (la fuente única de verdad). Macroquad los reproduce con
su feature `audio` (WAV/OGG vía quad-snd) y un archivo que falte hace que ese evento suene en silencio,
sin romper el juego.

Para regenerarlos tras editar un `.strudel`:

```sh
cd ../tools/sound-export
npm ci
npm run render
```

Un sonido por evento: los de un solo disparo suenan al saltar (más alto en el aire),
aterrizar (más alto cuanto más fuerte el impacto), patinar y trepar; y los bucles de andar,
correr y volar con el jetpack siguen al estado de movimiento. En web, el audio arranca con el
primer gesto del usuario (política de autoplay del navegador), como en la versión anterior.

## Empaquetar para macOS

`scripts/build-macos.sh [--clean-save] [directorio]` (por defecto `dist/`, ignorado por git) compila el cliente en
release y ensambla `dist/<Título>.app`: el binario renombrado en `Contents/MacOS`, `content/` en
`Contents/Resources`, el icono `packaging/game.icns` (commitado; se regenera con
`scripts/build-icon.sh` desde `packaging/icon-player.png`), el `Info.plist` y una firma ad-hoc.
No hace falta Xcode completo: se apoya en las Command Line Tools (`codesign`, `plutil`; `sips` e
`iconutil` solo en `scripts/build-icon.sh`).

El título del juego tiene una única fuente: `GAME_TITLE` en `src/game/config.rs` (hoy «Yorch
Adventure»). El script lo lee de ahí, así que cambiar el nombre es editar esa constante y volver a
empaquetar: el título de la ventana, el nombre del `.app`, el `Info.plist` y el directorio de
guardado per-user se actualizan solos. El identificador del bundle
(`com.armada-io.yorch-adventure`) es independiente del título a propósito —debe permanecer
estable— y se cambia con la variable de entorno `BUNDLE_ID`; el icono por defecto se sustituye con
`ICON_ICNS`. La versión del bundle sale de `Cargo.toml`.

Al lanzar desde el `.app` (Finder) el proceso arranca con `/` como directorio de trabajo: el cliente
localiza los assets en `Contents/Resources` (la ruta tal cual si existe junto al CWD, para desarrollo;
ver `src/app/bundle.rs`) y guarda en
`~/Library/Application Support/<GAME_TITLE>/saves/iso_save.json`. Fuera del bundle el guardado sigue
en `saves/iso_save.json` junto al CWD, como siempre. Para probarlo: `open "dist/Yorch Adventure.app"`.
Con `--clean-save` el script borra ese `iso_save.json` de Application Support antes de compilar (solo ese
archivo), útil para probar el arranque en limpio.

## Correr web

Compila a WebAssembly y sirve el resultado:

```sh
scripts/build-web.sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

El sitio tiene tres rutas servidas desde la raíz del dominio:

- `http://127.0.0.1:8765/` — la presentación: el mundo del juego **sin ninguna GUI en pantalla** (ni borde, ni HUD).
- `http://127.0.0.1:8765/playground` — la superficie de desarrollo: el mismo juego con el overlay de siempre (título y ayuda, lectura del mundo, panel de rendimiento y mensajes).
- `http://127.0.0.1:8765/maker` — el editor de mundo: un chunk plano y un panel de herramientas para construirlo (ver [Editar un mundo](#editar-un-mundo)).

`build-web.sh` publica las tres: la página `web/index.html` en `dist/index.html` y copias idénticas en `dist/playground/index.html` y `dist/maker/index.html` (con barra final funciona igual). La página usa `<base href="/">`, así que las tres rutas cargan el mismo `.wasm` y el mismo `content/` desde la raíz; por eso el sitio tiene que servirse desde la raíz del dominio —como hace Netlify— y no desde un subdirectorio. La ruta la lee el cliente en WASM mediante el import `iso_route_path` (mismo patrón FFI que el almacenamiento local); la build nativa no tiene ruta y la toma de sus argumentos (`--maker`, `--plain`; sin ellos, el overlay del playground). El servidor tiene que servir `dist/` desde la raíz, porque la página carga `iso-core.wasm`, `adapter.js` y
`content/` desde la raíz del sitio; no abras el HTML con `file://`. En localhost la página añade
un parámetro a la URL del WASM para que una recarga traiga siempre la última compilación.

**PWA instalable.** La página declara `manifest.json` (nombre «Yorch Adventure», modo `standalone`, colores `#122034`) con los iconos de `web/icons/` (192, 512, maskable 512 y `apple-touch-icon` 180), generados desde `packaging/icon-player.png` con Pillow. El `sw.js` mínimo no cachea nada: solo hace que el sitio sea instalable, y cada carga va a la red como siempre. Jugar sin conexión necesitaría una estrategia de caché y subir la versión de caché en cada despliegue, y no está hecho.

`scripts/build-web.sh [directorio]` (por defecto `dist/`, ignorado por git) instala el toolchain
que fija `rust-toolchain.toml` con su target `wasm32-unknown-unknown`, compila
`cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core`, y copia al
directorio de salida la página `web/index.html` (también como `playground/index.html` y `maker/index.html`), su
`adapter.js` (los imports FFI y el arranque del `.wasm`), el `content/` y el `.wasm`. Solo compila el binario del cliente: `pack_atlas` y `remeasure_atlas`
son herramientas nativas. La página va con un `viewport` que desactiva el zoom de pellizco y `touch-action: none` en el canvas: en iOS Safari eso evita que WebKit haga reconocimiento de gestos por toque —una pausa del hilo principal por toque que se leía como frames perdidos—.

La página carga el puente JavaScript oficial de Macroquad desde `not-fl3.github.io` y registra en
su import `env` las operaciones de `localStorage`, la lectura de la ruta (`iso_route_path`) y la
detección de puntero grueso (`iso_pointer_coarse`). Conviene servir una copia versionada propia del
puente, con sus cabeceras de caché, en vez de depender de ese dominio. El cliente no usa
`web-sys`, porque su glue code de `wasm-bindgen` no es compatible con el cargador raw de
Macroquad. La copia local `web/mq_js_bundle.js` lleva parches propios: los listeners de
`touchstart`/`touchmove`/`touchend`/`touchcancel` son `{passive: true}` y no llaman a
`preventDefault()` (la página no puede hacer scroll ni zoom), para que iOS Safari no aplace el
`requestAnimationFrame` durante los toques — sin el parche, cada toque producía un fotograma
perdido de ~47 ms con el CPU en 0. Si algún día se reemplaza el puente por uno actualizado,
hay que re-aplicar el parche. La página referencia esos dos scripts con una `?v=` manual (ver
`web/index.html`): sin ese prefijo, la caché heurística de Safari servía el puente viejo durante
días sin volver a pedirlo, y los arreglos del puente no llegaban al móvil. Al tocar el puente o
el adaptador, sube el número. Aun con los listeners pasivos, iOS Safari aplaza el
`requestAnimationFrame` mientras hay un toque en vuelo: en el móvil «caídos» sube ~1 por toque
con el CPU en cero. Eso no se puede evitar desde la página, pero sí se puede evitar que se vea
como un tirón, y de eso se encargan las dos piezas que `adapter.js` añade al bucle:

- **El reloj del fotograma.** El adaptador envuelve `requestAnimationFrame` para quedarse con el
  instante que el navegador le pasa al callback y lo publica en el import `iso_frame_timestamp`,
  que el cliente lee en `loops::clock`. Antes, el `delta` salía del reloj de pared que Macroquad
  muestrea al entrar en el cuerpo del fotograma (`Date.now()`, con resolución de 1 ms): ese
  instante se mueve con el reparto de eventos, así que un toque convertía una cadencia uniforme
  en una desigual aunque los fotogramas se presentaran igual de espaciados. El timestamp de la
  actualización de render no se mueve con los eventos y tiene resolución de microsegundos. Encima,
  el reloj aprende la cadencia real (mediana de 11 mediciones), redondea a ella el ruido y reparte
  el fotograma aplazado entre los siguientes en vez de entregárselo entero a la simulación.
- **El marcado de paso (`?fps=`).** Por defecto el adaptador entrega como mucho 60 fotogramas por
  segundo, saltándose las llamadas de `requestAnimationFrame` que lleguen antes de tiempo, y solo
  lo hace si la pantalla va claramente más rápida que ese objetivo (si no, entrega todo lo que
  llega). Así, con la flag de WebKit «Prefer Page Rendering Updates near 60fps» **desactivada** en
  un iPhone ProMotion, el juego se queda en 60 estables en vez de caer al divisor de 30 que elige
  Safari cuando no llega a 120. `?fps=120` sube el objetivo y `?fps=0` lo quita.
- **Un mundo nuevo (`?fresh`).** En la build web, añadir `?fresh` a la URL borra
  `saves/iso_save.json` de `localStorage` antes de que arranque el cliente y deja en
  `saves/iso_fresh_seed` una semilla aleatoria (`crypto.getRandomValues`) que el cliente lee una
  vez y borra: el juego arranca sin partida y con un mundo distinto cada vez. La partida guarda su
  semilla (`systems.world`), así que al recargar sin el parámetro se reabre el mismo mundo; cada
  recarga con `?fresh` tira otro. La ruta del editor (`/maker`) no se toca. En nativo, el
  argumento `--fresh` hace lo mismo: borra `saves/iso_save.json` junto al CWD (o en la carpeta
  `Application Support` de un `.app`) y tira la semilla del reloj. Una partida anterior a la
  semilla guardada se reabre con la semilla por defecto.

## Preparar despliegue

El `netlify.toml` de la raíz es el único sitio que se publica, y es el de este cliente:
`base = "lib"`, `command = "bash scripts/build-web.sh dist"` y `publish = "dist"`. No necesita
Node —la imagen de build de Netlify trae rustup y cargo preinstalados, el toolchain lo instala
`rust-toolchain.toml` en la primera ejecución de cargo, y `lib/` no tiene `package.json` ni
lockfile, así que no se instala ninguna dependencia JS. Quedan en caché el toolchain,
`~/.cargo/registry` y `lib/target`. El cliente es autocontenido: no lee ni escribe nada fuera de
`lib/`; los sprites fuente viven en `assets/` y el fixture de contrato en `crates/iso/tests/`.

Netlify **no** regenera el atlas: eso necesita el empaquetado nativo de `pack_atlas`, así que
`content/` está commiteado y `build-web.sh` solo lo copia. Si cambiaste algún sprite de `assets/`, regenera el atlas y commitéalo antes de desplegar:

```sh
scripts/build-atlas.sh
```

El script solo necesita un Python con Pillow (el `.venv/` de `lib/` ya lo trae; `PYTHON=/ruta/a/python` sirve para elegir otro intérprete).
No hay SVGs: todas las fuentes son PNG.

El script reescala los PNG a 320 px por tile de mundo (`scripts/rasterize.py`) y
después compila y ejecuta `pack_atlas`, que empaqueta `content/images/atlas.png` (4096 px de ancho) con
su `content/json/assets.manifest.json`. Las hojas de poses del jugador no caben en el atlas sin perder
detalle, así que se cortan celda a celda y cada hoja recibe su textura,
`content/images/player-16_<hoja>.png`, con su rejilla descrita en el manifiesto (esquema 2); se usan las
de dieciséis orientaciones de `assets/player-16/`, no las de ocho.
El patrón de sombras de nubes no se empaqueta —el empaquetador recorta el borde transparente de
cada sprite y un patrón recortado deja de repetir—, así que `content/images/cloud-shadow.png` se commitea horneado tal cual y `build-atlas.sh` solo lo copia. Los assets que ya están migrados a la ruta voxel se rehacen con su generador
(`../artifacts/vox/clay/vox_models.py`, `../artifacts/vox/clay/grass_clay.py`) y se vuelven a empaquetar; los que
heredamos del generador SVG anterior (terreno, gradas, tiles de camino, edificios) son sprites
fijos: cambiarlos es reemplazar el PNG en `assets/` y volver a empaquetar.
`build.rs` comprueba al compilar que el atlas y
el manifiesto existen, y el cliente avisa por consola si falta
`assets/shadow/white.png`, el cuadrado blanco del que se dibujan las sombras sin
cambiar de textura.

`cargo run --bin remeasure_atlas -- content/json/assets.manifest.json content/images/atlas.png .`
reescribe la geometría de un atlas ya empaquetado sin rasterizar nada.
