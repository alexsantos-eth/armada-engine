# Maker (cliente)

Este dominio de cliente es la **superficie del editor de mundo**: el panel que se pinta a la derecha, la casilla resaltada bajo el puntero y la sesión que convierte puntero, teclas y clics en una regla de `iso::maker`. Ninguna decisión de edición vive aquí; todas están en el dominio `maker` del crate `iso`, probadas sin ventana.

Solo existe en la ruta `/maker` (web) o con el argumento `--maker` (nativo): `gui::Route` lo decide una vez por proceso y `game::state` crea la sesión únicamente en ese caso. El resto del frame es el de siempre — el jugador camina, el reloj avanza y las sombras se hornean —, con una diferencia: en el editor **no hay streaming ni guardado**, así que el único chunk cargado es el que se edita (`MAKER_CHUNK`).

El reparto es deliberado:

- `panel.rs` calcula el **diseño** del panel como función pura del pincel y del contenido (`panel_buttons`), de modo que el frame puede consultar qué se pulsó antes de pintarlo y pintarlo después con los mismos botones. Solo `draw_panel` toca Macroquad.
- `session.rs` guarda el pincel, el historial y la casilla bajo el puntero. Un clic sobre el panel nunca llega al mundo; un arrastre aplica un trazo por casilla. Devuelve el chunk cuyo horneado de luz hay que repetir cuando el trazo cambió terreno o entidades.

Las elecciones que ofrece el panel (zonas de tinte, variantes de hierba) se leen de `TerrainLook` en el centro del chunk editado, así que son las paletas con las que ese chunk se pinta de verdad.

Un clic sobre el panel nunca llega al mundo, y mientras el puntero está sobre el panel no se pinta nada detrás, por mucho que se mantenga pulsado el botón (`panel_contains`).

Lo que no se puede probar sin ventana —leer el puntero y el teclado, pintar— es una pasada fina sobre reglas ya probadas (`session.test.rs` fija el mapeo de teclas, los ciclos de elección, los avisos y el subtítulo; `panel.test.rs` fija el diseño y el acierto de los clics). La comprobación visual es manual: `scripts/run-native.sh run --locked -- --maker`.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`MakerSession`](mod.rs#L9) — La sesión de edición sobre un chunk.
  - Firma: `pub(crate) use session::{MakerFrame, MakerSession};`
- [`MakerFrame`](mod.rs#L9) — Lo que un frame de edición necesita del juego: mundo, vestido y proyección.
  - Firma: `pub(crate) use session::{MakerFrame, MakerSession};`

### `session.rs`

#### Tipos y constantes

- [`MakerFrame`](session.rs#L94) — Los préstamos de un frame de edición: `ChunkManager`, `TerrainLook` y la proyección de la vista.
  - Declaración: `pub(crate) struct MakerFrame<'a> { pub(crate) manager: &'a mut ChunkManager, pub(crate) look: &'a mut TerrainLook, pub(crate) projection: ProjectionConfig }`
- [`MakerSession`](session.rs#L101) — El chunk editado, el pincel, el historial, los botones del panel y la casilla bajo el puntero.
  - Declaración: `pub(crate) struct MakerSession { pub(crate) chunk: ChunkCoord, brush: MakerBrush, history: iso::maker::History, buttons: Vec<PanelButton>, hovered: Option<WorldCoord>, painted: Option<WorldCoord>, note: &'static str }`

#### Funciones y métodos

- [`new`](session.rs#L115) — Una sesión con el pincel por defecto sobre un chunk.
  - Firma: `pub(crate) fn new(chunk: ChunkCoord) -> Self {`
- [`update`](session.rs#L141) — Dispone el panel, lee teclado y puntero y aplica como máximo un trazo; devuelve el chunk que hay que volver a hornear.
  - Firma: `pub(crate) fn update(&mut self, frame: MakerFrame<'_>) -> Option<ChunkCoord> {`
- [`draw`](session.rs#L269) — Pinta la casilla bajo el puntero y el panel sobre la escena ya compuesta.
  - Firma: `pub(crate) fn draw(&self, manager: &ChunkManager, projection: ProjectionConfig) {`

### `panel.rs`

#### Tipos y constantes

- [`PANEL_WIDTH`](panel.rs#L12) — Ancho del panel en píxeles de pantalla.
  - Firma: `pub(crate) const PANEL_WIDTH: f32 = 236.0;`
- [`MakerAction`](panel.rs#L24) — Lo que pide un clic en el panel: herramienta, material, zona de tinte, variante, blueprint, giro o deshacer.
  - Declaración: `pub(crate) enum MakerAction { Tool(MakerTool), Surface(TerrainMaterial), Tint(usize), Top(Option<usize>), Blueprint(usize), Turn, Undo }`
- [`PanelButton`](panel.rs#L43) — Un botón del panel: su rectángulo, su texto, su acción y si es la elección en la mano.
  - Declaración: `pub(crate) struct PanelButton { pub(crate) x: f32, pub(crate) y: f32, pub(crate) width: f32, pub(crate) height: f32, pub(crate) label: String, pub(crate) action: MakerAction, pub(crate) active: bool }`
- [`PanelCounts`](panel.rs#L56) — Cuántas elecciones ofrece el mundo ahora mismo: zonas de la paleta y variantes de hierba.
  - Declaración: `pub(crate) struct PanelCounts { pub(crate) tints: usize, pub(crate) tops: usize }`

#### Funciones y métodos

- [`tool_label`](panel.rs#L64) — El nombre corto de una herramienta en el panel.
  - Firma: `pub(crate) fn tool_label(tool: MakerTool) -> &'static str {`
- [`surface_label`](panel.rs#L77) — El nombre corto de un material en el panel.
  - Firma: `pub(crate) fn surface_label(material: TerrainMaterial) -> &'static str {`
- [`panel_buttons`](panel.rs#L146) — El diseño completo: las herramientas, los dos comandos y las elecciones de la herramienta en la mano, en el orden en que se dibujan.
  - Firma: `pub(crate) fn panel_buttons( brush: &MakerBrush, catalog: &EntityCatalog, counts: PanelCounts, width: f32, ) -> Vec<PanelButton> {`
- [`panel_contains`](panel.rs#L263) — Si el puntero está sobre el panel, botón o fondo: aquello a través de lo cual no se puede pintar el mundo, por mucho que se mantenga pulsado.
  - Firma: `pub(crate) fn panel_contains(buttons: &[PanelButton], x: f32, y: f32, width: f32) -> bool {`
- [`button_at`](panel.rs#L269) — El botón bajo un punto de pantalla, si el puntero está sobre alguno.
  - Firma: `pub(crate) fn button_at(buttons: &[PanelButton], x: f32, y: f32) -> Option<&PanelButton> {`
- [`draw_panel`](panel.rs#L278) — Pinta el fondo, el título, el pincel en la mano, los botones, el último aviso y la línea de controles.
  - Firma: `pub(crate) fn draw_panel(buttons: &[PanelButton], title: &str, note: &str, help: &str, width: f32) {`

## Detalles de implementación

### `session.rs`

#### Funciones internas

- [`HISTORY_STEPS`](session.rs#L26) — Cuántos trazos se pueden deshacer (40).
  - Firma: `const HISTORY_STEPS: usize = 40;`
- [`tool_for_key`](session.rs#L29) — Qué herramienta toma una tecla pulsada: las teclas 1 a 7, en el orden del panel. Se prueba en `session.test.rs`.
  - Firma: `fn tool_for_key(pressed: impl Fn(KeyCode) -> bool) -> Option<MakerTool> {`
- [`cycled`](session.rs#L44) — La siguiente de `len` elecciones, dando la vuelta; la misma si no hay ninguna.
  - Firma: `fn cycled(current: usize, len: usize, forward: bool) -> usize {`
- [`cycled_top`](session.rs#L57) — La siguiente variante de hierba, con el bloque plano como una elección más.
  - Firma: `fn cycled_top(current: Option<usize>, tops: usize, forward: bool) -> Option<usize> {`
- [`note_for`](session.rs#L67) — Qué decirle al editor tras un trazo: nada, salvo que se haya rechazado una colocación.
  - Firma: `fn note_for(stroke: MakerStroke, tool: MakerTool) -> &'static str {`
- [`brush_title`](session.rs#L75) — El pincel en la mano, escrito para el subtítulo del panel.
  - Firma: `fn brush_title(brush: &MakerBrush, catalog: &EntityCatalog) -> String {`
- [`centre`](session.rs#L129) — La casilla central del chunk editado, de donde el panel lee cuántas elecciones hay.
  - Firma: `fn centre(&self) -> WorldCoord {`
- [`take`](session.rs#L234) — Aplica un clic del panel sobre el pincel, o deshace.
  - Firma: `fn take( &mut self, action: MakerAction, manager: &mut ChunkManager, look: &mut TerrainLook, ) -> Option<ChunkCoord> {`
- [`undo`](session.rs#L259) — Deshace el último trazo e indica si hay que volver a hornear la luz.
  - Firma: `fn undo(&mut self, manager: &mut ChunkManager, look: &mut TerrainLook) -> Option<ChunkCoord> {`
- [`help_line`](session.rs#L312) — La línea de controles que el panel pinta en el borde inferior.
  - Firma: `fn help_line() -> &'static str {`

### `panel.rs`

#### Funciones internas

- [`Rows`](panel.rs#L89) — El cursor de diseño: coloca botones en filas de un número fijo de columnas dentro del panel.
  - Declaración: `struct Rows { left: f32, y: f32, column: usize, columns: usize }`
- [`panel_rect`](panel.rs#L247) — El rectángulo que cubre el panel en pantalla: su fondo, que llega más allá de sus botones.
  - Firma: `fn panel_rect(buttons: &[PanelButton], width: f32) -> (f32, f32, f32, f32) {`
- [`short`](panel.rs#L136) — Un nombre recortado a lo que cabe en un botón.
  - Firma: `fn short(label: &str) -> String {`
