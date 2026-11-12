# Gui

Este dominio de cliente pinta el overlay sobre la escena: el título y la ayuda de controles, los botones de fase de sombras (solo cuando hay una escena de sombras), la lectura del mundo en pantalla (posición, movimiento, chunks y la hora `HH:MM` del reloj del mundo), el panel de rendimiento y los mensajes transitorios. El HUD no toca el mundo ni la cámara: devuelve una fase elegida para que el bucle la aplique a la vista de sombras. En la raíz web (`/`) la fase sigue siempre al reloj; en `/playground` los botones fijan un override manual (volver a pulsar el activo devuelve el control al ciclo).

El overlay está **condicionado por la ruta** en la build web: `/` no pinta nada (ni borde ni HUD), y `/playground` pinta el overlay completo de siempre. La build nativa no tiene ruta y siempre lo pinta. La regla vive en `route.rs` y se consulta una vez por proceso, antes de que arranque el bucle.

La división es deliberada: `push_hud_update` publica lo que el jugador está haciendo mediante el servicio de UI (`UiEvent::HudUpdate`), y `draw_hud` renderiza lo que ese servicio retiene, incluidos los mensajes efímeros, que se vacían al pintarlos.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`draw_hud`](mod.rs#L9) — Pinta el overlay completo y devuelve la fase de sombras pulsada, si hubo una.
  - Firma: `pub(crate) use hud::{PerfCounts, draw_hud, push_hud_update};`
- [`push_hud_update`](mod.rs#L9) — Publica la lectura de este fotograma (posición, elevación, movimiento, chunks) al servicio de UI.
  - Firma: `pub(crate) use hud::{draw_hud, push_hud_update};`
- [`overlay_enabled`](mod.rs#L10) — Indica si esta ruta pinta el overlay: en WASM solo `/playground` (con barra final opcional); nativo siempre.
  - Firma: `pub(crate) use route::overlay_enabled;`

### `route.rs`

#### Funciones y métodos

- [`overlay_enabled`](route.rs#L38) — En WASM consulta `window.location.pathname` mediante el import `iso_route_path` del bundle y aplica la regla de `overlay_for_path`; fuera de WASM devuelve siempre `true`.
  - Firma: `pub(crate) fn overlay_enabled() -> bool {`

### `hud.rs`

#### Funciones y métodos

- [`push_hud_update`](hud.rs#L126) — Encola `UiEvent::HudUpdate` con la posición, la elevación, el movimiento y los chunks descubiertos.
  - Firma: `pub(crate) fn push_hud_update(ui: &mut MacroquadUi, player: &PlayerState, animation: &PlayerAnimation, elevation: i32, chunks: usize) {`
- [`draw_hud`](hud.rs#L165) — Dibuja el título, la ayuda y, cuando hay una fase seleccionable, los botones de fase (con la activa resaltada), el estado del mundo con `ui.hud` (incluida la hora `HH:MM` del reloj del mundo, como `clock`), el panel de rendimiento y los mensajes; devuelve la fase pulsada y vacía los mensajes.
  - Firma: `pub(crate) fn draw_hud(ui: &mut MacroquadUi, perf: &PerfLog, counts: PerfCounts, frame_ms: f64, touch_visible: bool, phase: Option<BakePhase>, clock: &str) -> Option<BakePhase> {`

## Detalles de implementación

### `route.rs`

#### Funciones internas

- [`browser_path`](route.rs#L18) — Lee `window.location.pathname` en WASM mediante el import `iso_route_path` (mismo patrón FFI acotado que `save::persistence`); devuelve `None` si el host falla.
  - Firma: `fn browser_path() -> Option<String> {`
- [`overlay_for_path`](route.rs#L33) — La regla pura: el overlay solo se pinta en `/playground`, con barra final opcional. Se prueba en `route.test.rs`.
  - Firma: `fn overlay_for_path(path: &str) -> bool {`

### `hud.rs`

#### Funciones internas

- [`Readout`](hud.rs#L79) — Los datos de la línea de lectura del mundo, con la hora del reloj como `HH:MM` ya formateada. El `fps` es el de la ventana de rendimiento (`PerfLog::fps`), no el recíproco instantáneo de macroquad, que un tirón desboca.
  - Declaración: `struct Readout<'a> { x: f64, y: f64, elevation: i32, motion: &'a str, chunks: usize, clock: &'a str, fps: f64, frame_ms: f64, }`

- [`world_readout_line`](hud.rs#L90) — La línea de lectura del mundo: posición, elevación, movimiento, chunks, hora del reloj del mundo y coste del fotograma. Se prueba en `hud.test.rs`.
  - Firma: `fn world_readout_line(readout: &Readout<'_>) -> String {`
- [`readout_colour`](hud.rs#L105) — Colour del readout: `LIME` hasta 20 ms, `ORANGE` hasta 33.4 ms, `RED` por encima.
  - Firma: `fn readout_colour(frame_max: f64) -> Color {`
- [`help_line`](hud.rs#L117) — La línea de controles del título: los atajos de teclado, o los del táctil (joystick y SALTAR) cuando los controles están visibles. Se prueba en `hud.test.rs`.
  - Firma: `fn help_line(touch_visible: bool) -> &'static str {`
- [`phase_button_hit`](hud.rs#L29) — Devuelve la fase del botón que contiene el punto de pantalla dado; se prueba en `hud.test.rs`.
  - Firma: `fn phase_button_hit(x: f32, y: f32) -> Option<BakePhase> {`
