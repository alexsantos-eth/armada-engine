# Armada Engine en Rust y Macroquad

Este directorio contiene la nueva implementación. `iso-core` es el cliente Macroquad; `crates/armada-core` alojará el dominio sin dependencias gráficas. El workspace fija Rust 1.99.1 y Macroquad 0.4.16. La demo actual verifica dibujo, teclado, ratón, escalado con la ventana y arranque web. Todavía no dibuja el juego.

## Ejecutar

Desde `iso-core/`:

```sh
cargo test --workspace --locked
cargo run --locked
cargo build --release --target wasm32-unknown-unknown --locked
python3 -m http.server 8765 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8765/web/`. El servidor debe iniciarse en `iso-core/` para que la página encuentre `target/wasm32-unknown-unknown/release/iso-core.wasm`. No abrir el HTML con `file://`. La página carga el puente JavaScript oficial de Macroquad desde `not-fl3.github.io`; antes de publicar, incluir una copia versionada junto a los assets del juego y fijar sus cabeceras de caché. El artefacto WASM de esta demo ocupa aproximadamente 614 KiB antes de compresión.

En esta máquina, el SDK de Command Line Tools macOS 27 falla al enlazar con el clang instalado. Los comandos Cargo funcionan con `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk` delante. Es un ajuste del entorno local, no una dependencia del proyecto.

## Referencia para el port

El contrato ejecutable del juego actual está en `../src/isometric/core/engine/flow-check/contracts.v1.json`. Comprobarlo con `pnpm test:migration` desde la raíz. Los casos que conservará el dominio Rust son:

- Coordenadas de chunks y celdas locales, incluidas posiciones negativas y bordes de 32 × 32.
- Proyección isométrica y elevación, con el origen y ejes documentados en `../ARCHITECTURE.md`.
- Orden de desempate de rutas en un escenario controlado.
- Transiciones representativas de locomoción, incluido un evento que no cambia el estado.
- Paso fijo de 50 ms, acumulación e interpolación.
- Trayectoria breve de marcha y salto sobre suelo controlado.

La generación de terreno, distribución de entidades y resultados de una semilla pueden cambiar. Los nuevos guardados almacenarán el contenido descubierto, sin depender de regenerarlo.

## Referencia visual y de rendimiento

`reference/pixi-seed-1337-hour-8.png` es una captura del build PixiJS en reposo con `?seed=1337&hour=8&timeScale=0&perf`. `reference/pixi-perf-seed-1337-hour-8.txt` contiene cinco informes de la misma sesión. `reference/macroquad-phase0-wasm.png` muestra la demo WASM en el navegador. En la vista PixiJS capturada había un chunk, 60 fps, 28 llamadas de dibujo de media y 155.9 MB de texturas; son observaciones de esa ventana y hardware, no umbrales para Macroquad. Sirven para comparar experiencia, composición y orden visual, sin exigir las mismas posiciones del mundo.

## Estado de la fase 0

- Workspace, versiones y target WASM fijados; Cargo comprueba ambos crates.
- Demo compilada nativamente y para WASM. La ventana nativa arrancó y el navegador mostró la demo WASM; teclado y ratón están conectados al marcador.
- Página de carga, instrucciones y referencia PixiJS registradas.
- Siguiente corte: portar `grid` y proyección al crate de dominio y comparar sus pruebas con el fixture JSON.
