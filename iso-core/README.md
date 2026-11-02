# Armada Engine en Rust y Macroquad

Este directorio contiene la nueva implementación. `iso-core` es el cliente Macroquad; `crates/armada-core` contiene el dominio sin dependencias gráficas. El workspace fija Rust 1.99.1 y Macroquad 0.4.16. La demo actual verifica la proyección isométrica, teclado, ratón, escalado con la ventana y arranque web. Todavía no dibuja el juego.

La [arquitectura por módulo](ARCHITECTURE.md) documenta los contratos del dominio y del cliente, el flujo de un fotograma y las prácticas de código, pruebas y calidad.

El dominio conserva la organización por carpetas de responsabilidad del motor TypeScript: `grid/`, `paths/`, `projection/` y `camera/` ya están separados; los módulos de terreno, mundo, entidades y simulación seguirán el mismo patrón. `mod.rs` define la entrada de cada carpeta y `lib.rs` expone solo los módulos del dominio.

Las pruebas unitarias también están colocalizadas: `grid/coords.rs` se prueba en `grid/coords.test.rs`, y el mismo patrón se aplica a los demás módulos y a `main.rs`. Rust las incluye con `#[cfg(test)]` y `#[path = "..."]`; `crates/armada-core/tests/` conserva los contratos que atraviesan módulos o comparan el fixture de migración.

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

Abrir `http://127.0.0.1:8765/web/`. El servidor debe iniciarse en `iso-core/` para que la página encuentre `target/wasm32-unknown-unknown/release/iso-core.wasm`. No abrir el HTML con `file://`. La página carga el puente JavaScript oficial de Macroquad desde `not-fl3.github.io`; antes de publicar, incluir una copia versionada junto a los assets del juego y fijar sus cabeceras de caché. El artefacto WASM de esta demo ocupa aproximadamente 614 KiB antes de compresión.

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

La fase 1 ya incluye `grid`, `paths`, `projection`, `camera`, `time` y el acumulador de `simulation` en carpetas de `crates/armada-core/src/`. El primer corte de terreno añade `terrain/columns.rs`, `noise.rs` y `generation.rs`: bloques con alturas distintas y superficies de agua, arena, suelo e hierba; muestreo absoluto y clasificación coherente entre chunks. Los tests Rust leen el fixture JSON de TypeScript para coordenadas, proyección, rutas y paso fijo; la generación nueva tiene pruebas propias de propiedades, sin exigir igualdad con TypeScript. `WorldCoord` usa `i32`; las claves se validan dentro de ±1 048 575 y se empaquetan en `u64` sin perder precisión al compararlas con los enteros seguros de JavaScript. La proyección usa `f64` para conservar el redondeo observable del contrato. La demo aún muestra la rejilla y el marcador, no el terreno.

## Referencia visual y de rendimiento

`reference/pixi-seed-1337-hour-8.png` es una captura del build PixiJS en reposo con `?seed=1337&hour=8&timeScale=0&perf`. `reference/pixi-perf-seed-1337-hour-8.txt` contiene cinco informes de la misma sesión. `reference/macroquad-phase0-wasm.png` muestra la demo inicial y `reference/macroquad-grid-wasm.png` la rejilla proyectada por el dominio Rust. En la vista PixiJS capturada había un chunk, 60 fps, 28 llamadas de dibujo de media y 155.9 MB de texturas; son observaciones de esa ventana y hardware, no umbrales para Macroquad. Sirven para comparar experiencia, composición y orden visual, sin exigir las mismas posiciones del mundo.

## Estado de la fase 0

- Workspace, versiones y target WASM fijados; Cargo comprueba ambos crates.
- Demo compilada nativamente y para WASM. La ventana nativa arrancó y el navegador mostró la demo WASM; teclado y ratón están conectados al marcador.
- Página de carga, instrucciones y referencia PixiJS registradas.
- Fase 1 en curso: coordenadas, mapa e índice espacial, rutas, proyección, geometría y visibilidad de cámara, reloj y paso fijo portados. El modelo y generador inicial de terreno ya están en el dominio. Siguen las funciones puras de ambiente y la integración de terreno, mundo, escena y sistemas de simulación.
