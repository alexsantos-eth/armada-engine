# Harvest (cliente)

La vista de la recolección: la barra de slots del inventario abajo en el centro, el aviso de lo que hay al alcance encima (`Manten E: Madera`, `Necesitas pico nivel 3`, `Inventario lleno`), la barra de progreso mientras se trabaja y la nota de lo ganado (`+3 Madera`) durante `GAIN_NOTE_MS`.

Las reglas viven en `iso::harvest`, `iso::inventory` e `iso::items`; el paso fijo que las corre es `Game::step_harvest` (`src/game/frame.rs`) y el guardado de lo que lleva el jugador es `save::snapshot_of`. Esta carpeta solo traduce el estado a pantalla. Es entrada de juego, no overlay: se pinta en todas las rutas que juegan el mundo (también `/` y las corridas guionizadas, antes de escribir las capturas) y no en `/maker`. Los textos van sin tildes porque la fuente por defecto de Macroquad no las dibuja.

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
- [`gain_text`](hotbar.rs#L111) — La nota de lo que dio una recolección, una entrada por rendimiento.
  - Firma: `pub(crate) fn gain_text(yields: &[HarvestYield], items: &ItemCatalog) -> String {`
- [`draw_hotbar`](hotbar.rs#L137) — Pinta los slots, el aviso con su barra de progreso y la nota.
  - Firma: `pub(crate) fn draw_hotbar( carried: &Carried, items: &ItemCatalog, prompt: Option<&Prompt>, note: Option<&str>, ) {`

#### Constantes

- [`SLOT_SIZE`](hotbar.rs#L13) — Lado máximo de un slot en píxeles. `pub(crate) const SLOT_SIZE: f32 = 54.0;`
- [`SLOT_GAP`](hotbar.rs#L15) — Separación entre slots. `pub(crate) const SLOT_GAP: f32 = 6.0;`
- [`SLOT_MARGIN`](hotbar.rs#L17) — Margen entre la barra y los bordes de la pantalla. `pub(crate) const SLOT_MARGIN: f32 = 24.0;`
- [`GAIN_NOTE_MS`](hotbar.rs#L19) — Cuánto dura la nota de una recolección. `pub(crate) const GAIN_NOTE_MS: f64 = 1600.0;`

#### Tipos

- [`SlotRect`](hotbar.rs#L23) — El cuadrado de un slot en pantalla.
- [`Prompt`](hotbar.rs#L31) — El aviso: texto y, mientras se trabaja, la fracción hecha.
