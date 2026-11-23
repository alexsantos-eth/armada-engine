# Gui

Este dominio de cliente pinta el overlay sobre la escena: el título y la ayuda de controles, los botones de fase de sombras (solo cuando hay una escena de sombras), la lectura del mundo en pantalla (posición, movimiento, chunks y la hora `HH:MM` del reloj del mundo), el panel de rendimiento y los mensajes transitorios. El HUD no toca el mundo ni la cámara: devuelve una fase elegida para que el bucle la aplique a la vista de sombras. En la raíz web (`/`) la fase sigue siempre al reloj; en `/playground` los botones fijan un override manual (volver a pulsar el activo devuelve el control al ciclo).

El overlay está **condicionado por la ruta** en la build web: `/` no pinta nada (ni borde ni HUD), y `/playground` y `/maker` pintan el overlay completo de siempre. La ruta decide además **qué se arranca**: `/maker` carga un único chunk plano y abre el editor de mundo (ver [`src/maker/`](../maker/mod.md)) en vez de transmitir el mundo procedural. La build nativa no tiene ruta y la toma de sus argumentos: `--maker` abre el editor, `--playground` arranca con el overlay visible (sin argumentos corre el juego tal como se presenta, sin overlay; la tecla `H` lo muestra u oculta en `Plain` y `Playground`), y `--scene <archivo>` corre una escena guionizada (ver [`src/testbed/`](../testbed/mod.md)), que tampoco pinta overlay ni toca la partida guardada. La regla vive en `route.rs` y se consulta una vez por proceso, antes de que arranque el bucle.

El **jetpack** vale en cualquier ruta. Se alterna con la tecla `J` o, con el overlay visible, con el botón que sigue a los de fase, y el estado vive en `game::state::Game` (`jetpack`), que el bucle pasa al HUD y `game::frame` baja al jugador con `iso::player::set_player_jetpack`. Llevarlo puesto no vuela por sí solo: volar es mantener la tecla de salto en el aire.

La división es deliberada: `push_hud_update` publica lo que el jugador está haciendo mediante el servicio de UI (`UiEvent::HudUpdate`), y `draw_hud` renderiza lo que ese servicio retiene, incluidos los mensajes efímeros, que se vacían al pintarlos.

El dominio tiene además el **puente con el HUD en HTML** de la build web (`web_ui.rs`): el kit de UI (`web/ui/armada-ui.js`, ver [`docs/UI-KIT.md`](../../docs/UI-KIT.md)) que `web/adapter.js` monta sobre el canvas. Es el tercer FFI acotado con la página, con el mismo patrón que `iso_route_path` y el guardado: `iso_ui_active` (si la página trae el kit), `iso_ui_push` (un JSON con el fotograma del HUD y las ganancias) e `iso_ui_gather_held` (si el botón de acción está pulsado). Fuera de WASM no hay página: `active` y `gather_held` devuelven `false` y nada se envía. Qué se manda lo arma `harvest::web_hud`. En nativo (y en la web sin el kit) el mismo fotograma lo dibuja con Macroquad el subdominio [`clay/`](clay/mod.md), desde las piezas del kit exportadas a `content/ui/`.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`draw_hud`](hud.rs#L201) — Pinta el overlay completo y devuelve la fase de sombras pulsada, si hubo una.
  - Firma: `pub(crate) use hud::{PerfCounts, draw_hud, push_hud_update};`
- [`push_hud_update`](hud.rs#L165) — Publica la lectura de este fotograma (posición, elevación, movimiento, chunks) al servicio de UI.
  - Firma: `pub(crate) use hud::{draw_hud, push_hud_update};`
- [`Route`](route.rs#L11) — Lo que corre este proceso: `Plain`, `Playground`, `Maker` o `Script`.
  - Firma: `pub(crate) use route::{Route, current};`
- [`current`](route.rs#L113) — La ruta de este proceso: el camino de la página en web, los argumentos en nativo.
  - Firma: `pub(crate) use route::{Route, current};`

### `web_ui.rs`

#### Tipos

- [`UiStack`](web_ui.rs#L10) — Una pila en un slot: id del item, nombre y cantidad.
- [`UiPrompt`](web_ui.rs#L19) — El aviso: texto, verbo y herramienta del botón de acción, progreso (0–1) mientras se trabaja y si una herramienta que falta lo bloquea.
- [`UiFrame`](web_ui.rs#L29) — Lo que muestra el HUD este fotograma: visible, controles táctiles en pantalla, slots, aviso y nota.
- [`UiGain`](web_ui.rs#L39) — Una recogida: item, nombre, cantidad y de dónde sale volando, como fracción de la pantalla.
- [`WebUi`](web_ui.rs#L56) — Recuerda el último fotograma enviado para no repetirlo.

#### Funciones y métodos

- [`WebUi::message`](web_ui.rs#L63) — El JSON de este fotograma: `frame` solo si cambió desde el último mensaje, y todas las ganancias; `None` si no hay nada nuevo. Se prueba en `web_ui.test.rs`.
  - Firma: `pub(crate) fn message(&mut self, frame: &UiFrame, gains: &[UiGain]) -> Option<String> {`
- [`WebUi::send`](web_ui.rs#L79) — Manda a la página el mensaje de este fotograma, si lo hay (`iso_ui_push`).
  - Firma: `pub(crate) fn send(&mut self, frame: &UiFrame, gains: &[UiGain]) {`
- [`active`](web_ui.rs#L96) — Si la página trae el HUD en HTML (`iso_ui_active`); siempre `false` fuera del navegador.
  - Firma: `pub(crate) fn active() -> bool {`
- [`gather_held`](web_ui.rs#L102) — Si el botón de acción del HUD está pulsado (`iso_ui_gather_held`); siempre `false` fuera del navegador.
  - Firma: `pub(crate) fn gather_held() -> bool {`

### `route.rs`

#### Tipos

- [`Route`](route.rs#L11) — La ruta de este proceso: `Plain` (sin overlay), `Playground` (overlay), `Maker` (overlay y editor) o `Script` (corrida guionizada, solo nativa).
  - Declaración: `pub(crate) enum Route { Plain, Playground, Maker, Script }`

#### Funciones y métodos

- [`shows_overlay`](route.rs#L26) — Si esta ruta pinta el overlay: `Playground` y `Maker` sí, `Plain` no.
  - Firma: `pub(crate) fn shows_overlay(self) -> bool {`
- [`keeps_the_save`](route.rs#L32) — Si esta ruta carga y escribe la partida del jugador: `Plain` y `Playground` sí; el editor y una corrida guionizada trabajan sobre un mundo propio y no la tocan.
  - Firma: `pub(crate) fn keeps_the_save(self) -> bool {`
- [`edits_the_world`](route.rs#L43) — Si esta ruta edita un chunk a mano en vez de transmitir el mundo.
  - Firma: `pub(crate) fn edits_the_world(self) -> bool {`
- [`current`](route.rs#L113) — En WASM consulta `window.location.pathname` mediante el import `iso_route_path` del bundle y aplica `route_for_path`; fuera de WASM lee los argumentos del proceso con `native_route`.
  - Firma: `pub(crate) fn current() -> Route {`

### `hud.rs`

#### Funciones y métodos

- [`push_hud_update`](hud.rs#L165) — Encola `UiEvent::HudUpdate` con la posición, la elevación, el movimiento y los chunks descubiertos.
  - Firma: `pub(crate) fn push_hud_update(ui: &mut MacroquadUi, player: &PlayerState, animation: &PlayerAnimation, elevation: i32, chunks: usize) {`
- [`draw_hud`](hud.rs#L201) — Dibuja el título, la ayuda y, cuando hay una fase seleccionable, los botones de fase (con la activa resaltada), el interruptor del jetpack a continuación de ellos, el estado del mundo con `ui.hud` (incluida la hora `HH:MM` del reloj del mundo, como `clock`), el panel de rendimiento y los mensajes; devuelve lo pulsado y vacía los mensajes.
  - Firma: `pub(crate) fn draw_hud(ui: &mut MacroquadUi, perf: &PerfLog, counts: PerfCounts, frame_ms: f64, world: HudWorld<'_>) -> HudClicks {`

#### Tipos

- [`HudWorld`](hud.rs#L101) — Lo que el overlay cuenta del mundo este fotograma: si los controles táctiles están en pantalla, la fase seleccionable, si el jugador lleva jetpack y la hora del reloj.
  - Declaración: `pub(crate) struct HudWorld<'a> { pub touch_visible: bool, pub phase: Option<BakePhase>, pub jetpack: bool, pub clock: &'a str }`
- [`HudClicks`](hud.rs#L110) — Lo que se pulsó en el overlay: la fase elegida, si la hubo, y si se tocó el interruptor del jetpack.
  - Declaración: `pub(crate) struct HudClicks { pub phase: Option<BakePhase>, pub jetpack: bool }`

## Detalles de implementación

### `route.rs`

#### Funciones internas

- [`MAKER_FLAG`](route.rs#L50) — El argumento que abre el editor en una build nativa (`--maker`).
  - Firma: `const MAKER_FLAG: &str = "--maker";`
- [`PLAIN_FLAG`](route.rs#L53) — El argumento que corre una build nativa como se presenta el juego, sin overlay (`--plain`).
  - Firma: `const PLAIN_FLAG: &str = "--plain";`
- [`SCENE_FLAG`](route.rs#L56) — El argumento que corre un archivo de escena (`--scene`); la escena misma la lee `testbed::scene_path`.
  - Firma: `const SCENE_FLAG: &str = "--scene";`
- [`browser_path`](route.rs#L69) — Lee `window.location.pathname` en WASM mediante el import `iso_route_path` (mismo patrón FFI acotado que `save::persistence`); devuelve `None` si el host falla.
  - Firma: `fn browser_path() -> Option<String> {`
- [`route_for_path`](route.rs#L85) — La regla pura de la web: `/playground` es la superficie de desarrollo, `/maker` el editor, con barra final opcional; cualquier otra ruta es la presentación limpia. Se prueba en `route.test.rs`.
  - Firma: `fn route_for_path(path: &str) -> Route {`
- [`native_route`](route.rs#L96) — La regla pura de nativo: el playground salvo que los argumentos pidan otra cosa; el último argumento de ruta es el que cuenta. Se prueba en `route.test.rs`.
  - Firma: `fn native_route<'a>(arguments: impl Iterator<Item = &'a String>) -> Route {`

### `hud.rs`

#### Funciones internas

- [`Readout`](hud.rs#L118) — Los datos de la línea de lectura del mundo, con la hora del reloj como `HH:MM` ya formateada. El `fps` es el de la ventana de rendimiento (`PerfLog::fps`), no el recíproco instantáneo de macroquad, que un tirón desboca.
  - Declaración: `struct Readout<'a> { x: f64, y: f64, elevation: i32, motion: &'a str, chunks: usize, clock: &'a str, fps: f64, frame_ms: f64, }`

- [`world_readout_line`](hud.rs#L129) — La línea de lectura del mundo: posición, elevación, movimiento, chunks, hora del reloj del mundo y coste del fotograma. Se prueba en `hud.test.rs`.
  - Firma: `fn world_readout_line(readout: &Readout<'_>) -> String {`
- [`readout_colour`](hud.rs#L144) — Colour del readout: `LIME` hasta 20 ms, `ORANGE` hasta 33.4 ms, `RED` por encima.
  - Firma: `fn readout_colour(frame_max: f64) -> Color {`
- [`help_line`](hud.rs#L156) — La línea de controles del título: los atajos de teclado, o los del táctil (joystick y SALTAR) cuando los controles están visibles. Se prueba en `hud.test.rs`.
  - Firma: `fn help_line(touch_visible: bool) -> &'static str {`
- [`phase_button_hit`](hud.rs#L39) — Devuelve la fase del botón que contiene el punto de pantalla dado; se prueba en `hud.test.rs`.
  - Firma: `fn phase_button_hit(x: f32, y: f32) -> Option<BakePhase> {`
