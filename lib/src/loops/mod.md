# Loops

Este dominio de cliente contiene el bucle de fotograma y nada más: el orden de un frame — `update` → escena → dibujo → overlay — y la contabilidad de rendimiento. Ninguna regla de juego vive aquí; cada paso delega en su dominio (`game::frame` actualiza, `game::scene` ensambla los sprites, `assets::sprites::draw_sorted` ordena y dibuja, `gui` pinta el overlay). El overlay (borde, HUD y mensajes) solo se pinta cuando la ruta lo permite (`gui::current().shows_overlay()`): en la build web, en `/playground` y en `/maker`; en `/` el bucle salta esa pasada y vacía los mensajes para que no se acumulen. El panel del editor (`maker`) se pinta después del overlay, cuando hay sesión de edición, y los controles táctiles (`touch`) no pasan por ningún filtro: son entrada de juego y se pintan siempre encima.

El dominio también es dueño del **reloj del frame** (`clock.rs`): cuánto cuenta que duró el fotograma anterior. En la build web ese dato no sale del reloj de pared, sino del instante que el navegador le pasa a su callback de `requestAnimationFrame` (import `iso_frame_timestamp`, mismo patrón FFI que `touch::platform`); en nativo sigue saliendo de la medición de la ventana (`get_frame_time`). Encima de eso el reloj **marca el paso**: aprende la cadencia que el navegador entrega de verdad (mediana de las últimas 11 mediciones), redondea a esa cadencia lo que cae lo bastante cerca de un múltiplo entero suyo, y un fotograma que el navegador aplazó no se le entrega entero a la simulación: se reparte entre los siguientes.

Existe para que la forma del frame se pueda leer de un vistazo y para que añadir una etapa nueva sea editar un solo archivo.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`run`](mod.rs#L8) — El bucle principal: corre el juego hasta que el jugador pide salir.
  - Firma: `pub(crate) use frame_loop::run;`

### `frame_loop.rs`

#### Funciones y métodos

- [`run`](frame_loop.rs#L52) — El bucle: mide el frame, deja actualizar el mundo o salir, limpia el fondo, ensambla la escena, dibuja ordenada, pinta nubes, (si la ruta lo permite) el overlay, los controles táctiles y alimenta el `PerfLog`.
  - Firma: `pub(crate) async fn run(mut game: Game) {`

### `clock.rs`

#### Constantes

- [`DEFAULT_FRAME_MS`](clock.rs#L16) — Lo que dura un fotograma a sesenta: lo que el reloj reporta cuando la medición que recibe no es una duración.
  - Firma: `pub(crate) const DEFAULT_FRAME_MS: f64 = 1000.0 / 60.0;`
- [`MAX_FRAME_MS`](clock.rs#L18) — El fotograma más largo que el reloj reporta; más allá la página no estaba corriendo.
  - Firma: `pub(crate) const MAX_FRAME_MS: f64 = 250.0;`

#### Funciones y métodos

- [`frame_timestamp_seconds`](clock.rs#L37) — El instante que el navegador dio a esta actualización de render, en segundos, cuando la plataforma tiene uno; en nativo, `None`. Único `unsafe` del dominio: el import `iso_frame_timestamp` de la página (declarado en `web/adapter.js`).
  - Firma: `pub(crate) fn frame_timestamp_seconds() -> Option<f64> {`
- [`FrameClock::new`](clock.rs#L86) — Un reloj que todavía no ha visto ningún fotograma.
  - Firma: `pub(crate) fn new() -> Self {`
- [`FrameClock::tick`](clock.rs#L99) — Cuánto cuenta que duró este fotograma, en milisegundos: parte del timestamp del navegador cuando lo hay y de la medición de la ventana cuando no, y le aplica el marcado de paso.
  - Firma: `pub(crate) fn tick(&mut self, timestamp_seconds: Option<f64>, fallback_ms: f64) -> f64 {`

#### Tipos

- [`FrameClock`](clock.rs#L76) — El reloj del fotograma: el instante anterior, la ventana de mediciones de la que sale la cadencia y el tiempo que un fotograma aplazado todavía debe.
  - Firma: `pub(crate) struct FrameClock { last_seconds: Option<f64>, history: [f64; HISTORY_LEN], samples: usize, cursor: usize, debt_ms: f64 }`

## Detalles de implementación

### `clock.rs`

#### Constantes y funciones internas

- [`HISTORY_LEN`](clock.rs#L20) — De cuántas mediciones es mediana la cadencia (11).
- [`SNAP_TOLERANCE`](clock.rs#L22) — Cuánto puede alejarse una medición de un múltiplo entero de la cadencia y aun así redondearse a él (0,2 cadencias).
- [`MAX_SNAP_MULTIPLE`](clock.rs#L24) — El múltiplo de cadencia más grande al que se redondea (4).
- [`CATCH_UP_SHARE`](clock.rs#L26) — La fracción de cadencia que un fotograma puede durar de más o de menos mientras se devuelve el tiempo de un fotograma aplazado (0,25).
- [`MAX_DEBT_MULTIPLE`](clock.rs#L28) — Cuánto tiempo, en cadencias, llega a deber el reloj antes de dar el resto por perdido (2).
- [`sanitised_ms`](clock.rs#L50) — Una medición como duración: lo que no lo es pasa a `DEFAULT_FRAME_MS`, y lo que pasa de un cuarto de segundo se recorta a `MAX_FRAME_MS`.
  - Firma: `fn sanitised_ms(value: f64) -> f64 {`
- [`snap_to_cadence`](clock.rs#L58) — La medición redondeada al múltiplo entero de cadencia más cercano, cuando está lo bastante cerca de uno.
  - Firma: `fn snap_to_cadence(raw_ms: f64, cadence_ms: f64) -> f64 {`
- [`FrameClock::measure_ms`](clock.rs#L110) — El hueco entre esta actualización de render y la anterior, con la medición de la ventana como respaldo.
  - Firma: `fn measure_ms(&mut self, timestamp_seconds: Option<f64>, fallback_ms: f64) -> f64 {`
- [`FrameClock::record`](clock.rs#L125) — Guarda la medición en la ventana rodante de la que sale la cadencia.
  - Firma: `fn record(&mut self, raw_ms: f64) {`
- [`FrameClock::cadence_ms`](clock.rs#L133) — La cadencia que el navegador entrega de verdad, una vez llena la ventana: la mediana de sus mediciones, para que un fotograma aplazado no la mueva.
  - Firma: `fn cadence_ms(&self) -> Option<f64> {`
- [`FrameClock::paced_ms`](clock.rs#L145) — La medición tal como la ve la simulación: un fotograma que duró de más entrega como mucho un cuarto de cadencia extra y queda a deber el resto; los siguientes lo devuelven a un cuarto de cadencia por fotograma.
  - Firma: `fn paced_ms(&mut self, raw_ms: f64, cadence_ms: f64) -> f64 {`

### `frame_loop.rs`

#### Tipos y funciones internas

- [`FrameMarks`](frame_loop.rs#L20) — Los instantes que el bucle toma en un frame (arranque, fin de simulación, fin de recogida, fin de dibujo), en segundos de macroquad.
  - Firma: `struct FrameMarks { frame_start: f64, after_simulation: f64, after_collect: f64, after_draw: f64 }`
- [`frame_sample`](frame_loop.rs#L29) — La muestra del frame para el perf log: cada sección cuesta el hueco entre dos marcas, en milisegundos; lleva aparte los milisegundos de lifecycle de chunks (`stream_ms`) y de horneado de sombras (`bake_ms`) que `FrameView` midió.
  - Firma: `fn frame_sample( frame_ms: f64, marks: FrameMarks, stream_ms: f64, bake_ms: f64, sprites: usize, chunks: usize, chunks_alive: usize, ) -> FrameSample {`
