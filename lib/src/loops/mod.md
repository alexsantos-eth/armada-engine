# Loops

Este dominio de cliente contiene el bucle de fotograma y nada más: el orden de un frame — `update` → escena → dibujo → HUD — y la contabilidad de rendimiento. Ninguna regla de juego vive aquí; cada paso delega en su dominio (`game::frame` actualiza, `game::scene` ensambla los sprites, `assets::sprites::draw_sorted` ordena y dibuja, `gui` pinta el overlay).

Existe para que la forma del frame se pueda leer de un vistazo y para que añadir una etapa nueva sea editar un solo archivo.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`run`](mod.rs#L8) — El bucle principal: corre el juego hasta que el jugador pide salir.
  - Firma: `pub(crate) use frame_loop::run;`

### `frame_loop.rs`

#### Funciones y métodos

- [`run`](frame_loop.rs#L45) — El bucle: mide el frame, deja actualizar el mundo o salir, limpia el fondo, ensambla la escena, dibuja ordenada, pinta nubes y HUD, y alimenta el `PerfLog`.
  - Firma: `pub(crate) async fn run(mut game: Game) {`

## Detalles de implementación

### `frame_loop.rs`

#### Tipos y funciones internas

- [`FrameMarks`](frame_loop.rs#L17) — Los instantes que el bucle toma en un frame (arranque, fin de simulación, fin de recogida, fin de dibujo), en segundos de macroquad.
  - Firma: `struct FrameMarks { frame_start: f64, after_simulation: f64, after_collect: f64, after_draw: f64 }`
- [`frame_sample`](frame_loop.rs#L26) — La muestra del frame para el perf log: cada sección cuesta el hueco entre dos marcas, en milisegundos.
  - Firma: `fn frame_sample(frame_ms: f64, marks: FrameMarks, sprites: usize, chunks: usize, chunks_alive: usize) -> FrameSample {`
