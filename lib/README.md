# Armada Engine en Rust y Macroquad

Este directorio es el cliente Rust/Macroquad: el paquete `iso-core` dibuja y `crates/iso`
contiene el dominio sin dependencias gráficas. El workspace fija Rust 1.99.1 y Macroquad 0.4.16.

Este README solo explica cómo ejecutarlo y cómo preparar un despliegue. Los contratos del
dominio y del cliente, el flujo de un fotograma y las prácticas de código y pruebas están en la
[arquitectura por módulo](docs/ARCHITECTURE.md).
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

En macOS, el SDK 27 de Command Line Tools falla al enlazar con el clang instalado, así que el
script selecciona el SDK 26.5 cuando `SDKROOT` no está definido; en otros sistemas no toca nada.
Equivale a `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo run --locked`.
Es un ajuste del entorno local, no una dependencia del proyecto.

Flechas o WASD mueven al jugador; el clic sitúa el marcador sobre el plano del mundo. `T`
alterna entre terreno y rejilla.

## Correr web

Compila a WebAssembly y sirve el resultado:

```sh
scripts/build-web.sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Abre `http://127.0.0.1:8765/`. El servidor tiene que servir `dist/`, porque la página carga
`iso-core.wasm` y `content/` desde su propio directorio; no abras el HTML con `file://`. En
localhost la página añade un parámetro a la URL del WASM para que una recarga traiga siempre la
última compilación.

`scripts/build-web.sh [directorio]` (por defecto `dist/`, ignorado por git) instala el toolchain
que fija `rust-toolchain.toml` con su target `wasm32-unknown-unknown`, compila
`cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core`, y copia al
directorio de salida la página `web/index.html`, el `content/` y el `.wasm`. Solo compila el
binario del cliente: `pack_atlas` y `remeasure_atlas` son herramientas nativas.

La página carga el puente JavaScript oficial de Macroquad desde `not-fl3.github.io` y registra en
su import `env` las operaciones de `localStorage`. Conviene servir una copia versionada propia del
puente, con sus cabeceras de caché, en vez de depender de ese dominio. El cliente no usa
`web-sys`, porque su glue code de `wasm-bindgen` no es compatible con el cargador raw de
Macroquad.

## Preparar despliegue

El `netlify.toml` de la raíz es el único sitio que se publica, y es el de este cliente:
`base = "lib"`, `command = "bash scripts/build-web.sh dist"` y `publish = "dist"`. No necesita
Node —la imagen de build de Netlify trae rustup y cargo preinstalados, el toolchain lo instala
`rust-toolchain.toml` en la primera ejecución de cargo, y `lib/` no tiene `package.json` ni
lockfile, así que no se instala ninguna dependencia JS. Quedan en caché el toolchain,
`~/.cargo/registry` y `lib/target`. El cliente es autocontenido: no lee ni escribe nada fuera de
`lib/`; el arte fuente vive en `assets-src/` y los fixtures de contrato en `crates/iso/tests/fixtures/`.

Netlify **no** regenera el atlas: eso necesita `cairosvg` y el `pack_atlas` nativo, así que
`content/` está commiteado y `build-web.sh` solo lo copia. Si cambiaste algún SVG de
`assets-src/assets/`, regenera el atlas y commitéalo antes de desplegar:

```sh
scripts/build-atlas.sh
```

El script elige un Python que pueda importar `cairosvg`; si no hay ninguno, se monta su propio
entorno en `lib/.venv/` (ignorado por git) con `cairosvg`, NumPy y Pillow, y lo reutiliza después.
Con `PYTHON=/ruta/a/python3` eliges tú el intérprete base, y con `ATLAS_VENV` dónde va el entorno.
`cairosvg` necesita además la librería libcairo, que pip no instala: en macOS, `brew install
cairo`; en Debian o Ubuntu, `libcairo2`.

El script rasteriza cada SVG con `cairosvg` (`scripts/rasterize.py`) a 320 px por tile de mundo y
después compila y ejecuta `pack_atlas`, que empaqueta `content/atlas.png` (4096 px de ancho) con
su `content/assets.manifest.json`. Las hojas de poses del jugador no caben en el atlas sin perder
detalle, así que se cortan celda a celda y cada hoja recibe su textura,
`content/player-16_<hoja>.png`, con su rejilla descrita en el manifiesto (esquema 2); se usan las
de dieciséis orientaciones de `assets-src/assets/player-16/`, no las de ocho.
El patrón de sombras de nubes no se empaqueta —el empaquetador recorta el borde transparente de
cada sprite y un patrón recortado deja de repetir—, así que `../artifacts/cloud_pattern.py` lo
rasteriza entero aparte en `content/cloud-shadow.png` y le aplica ahí el desenfoque que cairosvg
ignora. Después de tocar los bloques de terreno (`../artifacts/terrain_blocks.py`) hay que
regenerar también las variantes de hierba (`grass_clutter.py`) y los dieciséis tiles de camino
(`path_tiles.py`) antes de volver a empaquetar. `build.rs` comprueba al compilar que el atlas y
el manifiesto existen, y el cliente avisa por consola si falta
`assets-src/assets/shadow/white.svg`, el cuadrado blanco del que se dibujan las sombras sin
cambiar de textura.

`cargo run --bin remeasure_atlas -- content/assets.manifest.json content/atlas.png assets-src`
reescribe la geometría de un atlas ya empaquetado sin rasterizar nada.
