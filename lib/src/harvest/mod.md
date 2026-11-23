# Harvest (cliente)

La vista de la recolección: los montones de items en el suelo, lanzados desde lo derribado y flotando sobre su sombra (`drop_view.rs`), la sacudida de lo golpeado y las ráfagas de astillas (`impact.rs`), la barra de slots del inventario abajo en el centro, el aviso de lo que hay al alcance encima (`Manten E: Madera`, `Necesitas pico nivel 3`, ), la barra de progreso mientras se trabaja y la nota de lo ganado (`+3 Madera`) durante `GAIN_NOTE_MS`.

Las reglas viven en `iso::harvest`, `iso::inventory` e `iso::items`; el paso fijo que las corre es `Game::step_harvest` (`src/game/frame.rs`) y el guardado de lo que lleva el jugador es `save::snapshot_of`. Esta carpeta solo traduce el estado a pantalla. Es entrada de juego, no overlay: se pinta en todas las rutas que juegan el mundo (también `/` y las corridas guionizadas, antes de escribir las capturas) y no en `/maker`. Los textos van sin tildes porque la fuente por defecto de Macroquad no las dibuja.

En la build web con el kit de UI (`web/ui/`, ver [`docs/UI-KIT.md`](../../docs/UI-KIT.md)) la hotbar, el aviso, la nota y las ganancias se pintan en HTML: `web_hud.rs` traduce el mismo estado a lo que manda `gui::web_ui`, y `draw_hotbar` queda para la build nativa, las corridas guionizadas y una página sin el kit.

`draw_hotbar` solo pinta con Macroquad y no tiene test: se comprueba con `scenes/pr-harvest.json` (excepción de GPU de `FILE_STRUCTURE.md`); la geometría, las etiquetas y el aviso son puros y se prueban en `hotbar.test.rs`.

## Catálogo de API pública

### `hotbar.rs`

#### Funciones y métodos

- [`slot_rects`](hotbar.rs#L38) — Los cuadrados de `capacity` slots en una fila centrada abajo, encogidos si la fila no cabe entre los márgenes.
  - Firma: `pub(crate) fn slot_rects(width: f32, height: f32, capacity: usize) -> Vec<SlotRect> {`
- [`slot_label`](hotbar.rs#L57) — Nombre y cantidad de una pila tal como los escribe el slot.
  - Firma: `pub(crate) fn slot_label(stack: &ItemStack, items: &ItemCatalog) -> (String, String) {`
- [`prompt`](hotbar.rs#L83) — Lo que dice el aviso para un `HarvestStatus`; nada si no hay nada al alcance.
  - Firma: `pub(crate) fn prompt(status: &HarvestStatus, items: &ItemCatalog) -> Option<Prompt> {`
- [`gain_text`](hotbar.rs#L112) — La nota de lo que dio una recolección, una entrada por rendimiento.
  - Firma: `pub(crate) fn gain_text(yields: &[HarvestYield], items: &ItemCatalog) -> String {`
- [`draw_hotbar`](hotbar.rs#L138) — Pinta los slots, el aviso con su barra de progreso y la nota.
  - Firma: `pub(crate) fn draw_hotbar( carried: &Carried, items: &ItemCatalog, prompt: Option<&Prompt>, note: Option<&str>, ) {`

#### Constantes

- [`SLOT_SIZE`](hotbar.rs#L13) — Lado máximo de un slot en píxeles. `pub(crate) const SLOT_SIZE: f32 = 54.0;`
- [`SLOT_GAP`](hotbar.rs#L15) — Separación entre slots. `pub(crate) const SLOT_GAP: f32 = 6.0;`
- [`SLOT_MARGIN`](hotbar.rs#L17) — Margen entre la barra y los bordes de la pantalla. `pub(crate) const SLOT_MARGIN: f32 = 24.0;`
- [`FULL_NOTE`](hotbar.rs#L109) — La nota que deja una recogida cuando algo al alcance no cupo: «Inventario lleno».
- [`GAIN_NOTE_MS`](hotbar.rs#L19) — Cuánto dura la nota de una recolección. `pub(crate) const GAIN_NOTE_MS: f64 = 1600.0;`

#### Tipos

- [`SlotRect`](hotbar.rs#L23) — El cuadrado de un slot en pantalla.
- [`Prompt`](hotbar.rs#L31) — El aviso: texto y, mientras se trabaja, la fracción hecha.

### `web_hud.rs`

Lo que el HUD en HTML sabe de la recolección. Puro; se prueba en `web_hud.test.rs`.

- [`hud_frame`](web_hud.rs#L65) — El fotograma del HUD: cada slot con id, nombre y cantidad; el aviso del `HarvestStatus` con su verbo y herramienta (`Talar`/`axe`, `Picar`/`pickaxe`, `Atrapar`/`net`, `Recoger`/`hand`, según la regla), el progreso en centésimas mientras se trabaja y `blocked` cuando falta herramienta (con el texto de `hotbar::prompt`); de la nota solo pasa «Inventario lleno», porque las ganancias van aparte.
  - Firma: `pub(crate) fn hud_frame( carried: &Carried, items: &ItemCatalog, status: &HarvestStatus, note: Option<&str>, touch: bool, ) -> UiFrame {`
- [`gains`](web_hud.rs#L95) — Una ganancia por rendimiento recogido, con id, nombre, cantidad y el punto de salida.
  - Firma: `pub(crate) fn gains(yields: &[HarvestYield], items: &ItemCatalog, at: (f32, f32)) -> Vec<UiGain> {`
- [`screen_share`](web_hud.rs#L110) — Un punto de pantalla como fracción del ancho y el alto, recortado a la pantalla; el centro si la pantalla no tiene tamaño.
  - Firma: `pub(crate) fn screen_share(x: f64, y: f64, width: f32, height: f32) -> (f32, f32) {`

### `impact.rs`

Lo que un golpe hace a la vista. `Game::step_harvest` le pasa a `Impacts::notice` la cuenta de golpes del recolector, lo golpeado, lo derribado en ese paso y el color del item que da; un golpe nuevo sacude la entidad (`SHAKE_MS`, `SHAKE_AMPLITUDE` del ancho de la casilla, `SHAKE_SWINGS` vaivenes que se apagan) y deja una ráfaga pendiente; un derribo deja una ráfaga grande. `notice` devuelve el `Blow` que notó y `step_harvest` lo hace sonar (`HarvestHit` o `HarvestFell`). La escena corre el ancla de la entidad con `shake_of` al colocarla y entrega las ráfagas al polvo (`DustPuffs::chip`). Todo es puro y se prueba en `impact.test.rs`.

- [`shake_offset`](impact.rs#L48) — Desplazamiento lateral de un sprite que se sacude, en partes del ancho de la casilla: un seno que empieza y acaba quieto y se apaga.
  - Firma: `pub(crate) fn shake_offset(left_ms: f64) -> f64 {`
- [`Impacts::notice`](impact.rs#L58) — Nota un golpe o un derribo nuevos: sacude el objetivo y deja la ráfaga pendiente.
  - Firma: `pub(crate) fn notice( &mut self, strikes: u64, struck: Option<&HarvestTarget>, felled: Option<&HarvestTarget>, color: Option<u32>, ) -> Option<Blow> {`
- [`Impacts::advance`](impact.rs#L91) — Envejece la sacudida.
  - Firma: `pub(crate) fn advance(&mut self, elapsed_ms: f64) {`
- [`Impacts::shake_of`](impact.rs#L101) — El desplazamiento de una entidad mientras se sacude.
  - Firma: `pub(crate) fn shake_of(&self, id: &str) -> Option<f64> {`
- [`Impacts::take_bursts`](impact.rs#L109) — Las ráfagas pendientes, vaciadas.
  - Firma: `pub(crate) fn take_bursts(&mut self) -> Vec<Burst> {`
- [`SHAKE_MS`](impact.rs#L12), [`SHAKE_AMPLITUDE`](impact.rs#L14), [`SHAKE_SWINGS`](impact.rs#L16) — Duración, amplitud y vaivenes de la sacudida.
- [`Burst`](impact.rs#L20) — Una ráfaga pendiente: ancla, bloque, color y si es un derribo.
- [`Blow`](impact.rs#L31) — Lo que hizo el golpe de un paso, para su sonido: `Strike` o `Felled`.
- [`Impacts`](impact.rs#L40) — Sacudida y ráfagas en vuelo.

### `drop_view.rs`

Cómo se ve un montón en el suelo. Al aparecer vuela en arco desde lo que lo soltó hasta donde cae (`TOSS_MS`, `TOSS_HEIGHT`) y luego sube y baja un poco (`BOB_LIFT`, `BOB_MS`, con una fase por id para que no floten todos a la vez). `DropViews` lleva cuánto lleva cada uno en el suelo; los que ya estaban al abrir la partida no vuelan (`DropViews::landed`). `Game::collect_drops` (`src/game/scene.rs`) dibuja cada montón con el sprite de su item (`sprite` en `items.json`) sobre una sombra pequeña (`DROP_SHADOW_SCALE` de la del jugador), ordenado con las figuras. Las reglas de movimiento son puras y se prueban en `drop_view.test.rs`.

- [`toss`](drop_view.rs#L29) — Dónde se dibuja un montón y a qué altura, `age_ms` después de caer.
  - Firma: `pub(crate) fn toss(age_ms: f64, drop: &Drop) -> DropPose {`
- [`DropViews::landed`](drop_view.rs#L56) — Vistas de montones que ya estaban en el suelo: ninguno vuela.
  - Firma: `pub(crate) fn landed(drops: &[Drop]) -> Self {`
- [`DropViews::advance`](drop_view.rs#L65) — Envejece los montones; uno nuevo empieza a volar y uno que ya no está se olvida. Devuelve cuántos terminaron su vuelo en esa llamada, y `collect_drops` hace sonar `ItemDrop` si fue alguno.
  - Firma: `pub(crate) fn advance(&mut self, elapsed_ms: f64, drops: &[Drop]) -> usize {`
- [`DropViews::age`](drop_view.rs#L73) — Cuánto lleva un montón en el suelo.
  - Firma: `pub(crate) fn age(&self, id: u64) -> f64 {`
- [`TOSS_MS`](drop_view.rs#L13), [`TOSS_HEIGHT`](drop_view.rs#L15), [`BOB_LIFT`](drop_view.rs#L17), [`BOB_MS`](drop_view.rs#L19) — Duración y altura del lanzamiento, y altura y periodo del vaivén.
- [`DropPose`](drop_view.rs#L23) — Dónde se dibuja un montón: su punto en el suelo y su altura.
- [`DropViews`](drop_view.rs#L50) — Cuánto lleva cada montón en el suelo.
