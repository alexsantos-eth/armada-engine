# Gui

Este dominio de cliente pinta el overlay sobre la escena: el título y la ayuda de controles, la lectura del mundo en pantalla, el panel de rendimiento y los mensajes transitorios. Todo es de solo lectura sobre el estado del juego más la pasada de overlay de macroquad: el HUD no toca el mundo ni la cámara.

El overlay está **condicionado por la ruta** en la build web: `/` no pinta nada (ni borde ni HUD), y `/playground` pinta el overlay completo de siempre. La build nativa no tiene ruta y siempre lo pinta. La regla vive en `route.rs` y se consulta una vez por proceso, antes de que arranque el bucle.

La división es deliberada: `push_hud_update` publica lo que el jugador está haciendo mediante el servicio de UI (`UiEvent::HudUpdate`), y `draw_hud` renderiza lo que ese servicio retiene, incluidos los mensajes efímeros, que se vacían al pintarlos.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`draw_hud`](mod.rs#L9) — Pinta el overlay completo: título, ayuda, lectura del mundo, panel de rendimiento y mensajes.
  - Firma: `pub(crate) use hud::{draw_hud, push_hud_update};`
- [`push_hud_update`](mod.rs#L9) — Publica la lectura de este fotograma (posición, elevación, movimiento, chunks) al servicio de UI.
  - Firma: `pub(crate) use hud::{draw_hud, push_hud_update};`
- [`overlay_enabled`](mod.rs#L10) — Indica si esta ruta pinta el overlay: en WASM solo `/playground` (con barra final opcional); nativo siempre.
  - Firma: `pub(crate) use route::overlay_enabled;`

### `route.rs`

#### Funciones y métodos

- [`overlay_enabled`](route.rs#L39) — En WASM consulta `window.location.pathname` mediante el import `iso_route_path` del bundle y aplica la regla de `overlay_for_path`; fuera de WASM devuelve siempre `true`.
  - Firma: `pub(crate) fn overlay_enabled() -> bool {`

### `hud.rs`

#### Funciones y métodos

- [`push_hud_update`](hud.rs#L42) — Encola `UiEvent::HudUpdate` con la posición, la elevación, el movimiento y los chunks descubiertos.
  - Firma: `pub(crate) fn push_hud_update(ui: &mut MacroquadUi, player: &PlayerState, animation: &PlayerAnimation, elevation: i32, chunks: usize) {`
- [`draw_hud`](hud.rs#L59) — Dibuja el título y la ayuda, el estado del mundo con `ui.hud`, el panel de rendimiento (fps, p95 y máximo de frame y CPU, peor fotograma) y los mensajes, vaciándolos al pintarlos.
  - Firma: `pub(crate) fn draw_hud(ui: &mut MacroquadUi, perf: &PerfLog, dust_live: usize, frame_ms: f64) {`

## Detalles de implementación

### `route.rs`

#### Funciones internas

- [`browser_path`](route.rs#L17) — Lee `window.location.pathname` en WASM mediante el import `iso_route_path` (mismo patrón FFI acotado que `save::persistence`); devuelve `None` si el host falla.
  - Firma: `fn browser_path() -> Option<String> {`
- [`overlay_for_path`](route.rs#L34) — La regla pura: el overlay solo se pinta en `/playground`, con barra final opcional. Se prueba en `route.test.rs`.
  - Firma: `fn overlay_for_path(path: &str) -> bool {`

### `hud.rs`

#### Funciones internas

- [`world_readout_line`](hud.rs#L16) — La línea de lectura del mundo: posición, elevación, movimiento, chunks y coste del fotograma.
  - Firma: `fn world_readout_line(x: f64, y: f64, elevation: i32, motion: &str, chunks: usize, fps: i32, frame_ms: f64) -> String {`
- [`readout_colour`](hud.rs#L31) — Colour del readout: `LIME` hasta 20 ms, `ORANGE` hasta 33.4 ms, `RED` por encima.
  - Firma: `fn readout_colour(frame_max: f64) -> Color {`
