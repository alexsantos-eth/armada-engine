# Maker

Este dominio contiene las **reglas del editor de mundo**: el pincel que el editor tiene en la mano, qué cambia un trazo, qué columna hay bajo el puntero y cómo se deshace lo último. No pinta nada ni lee el teclado: el cliente (`src/maker/`) traduce puntero, teclas y clics del panel a estas reglas, de modo que cada decisión del editor se prueba sin ventana ni GPU.

El editor trabaja sobre **un solo chunk**, el que carga la ruta `/maker` (`MAKER_CHUNK` en `src/game/config.rs`): el cliente lo materializa plano con `terrain::flat_chunk` y lo inyecta con `ChunkManager::load_columns`, sin pasar por la generación ni por el streaming.

Tres clases de cambio, deliberadamente separadas:

- **Terreno**: el trazo escribe por `ChunkManager::edit_column`. El contrato de la columna manda — agua solo por debajo de la orilla —, así que bajar una columna al nivel −1 la convierte en agua y subirla de vuelta a 0 la deja en arena.
- **Vestido** (`Dressing`): los tintes y las variantes de hierba no viven en la columna, sino en un mapa de excepciones por casilla —el `CellMap` del propio dominio, agrupado por chunk, que es lo que recorrerá el guardado de un chunk editado— y responde **antes** que el ruido. Un mundo jugado lleva ese mapa vacío y todo lo decide el ruido, como siempre; `TerrainLook` consulta el mapa solo cuando no está vacío.
- **Entidades**: el trazo valida con `entities::placement_by_hand` (superficies, un único nivel bajo la huella y la ocupación; sin la regla de separación entre iguales, que es de la colocación generada) y la pone con `ChunkManager::put_entity`.

El **giro** de una entidad no es una rotación del sprite: el contenido trae pares por eje (`hotel_x` / `hotel_y`, `pier_x_reverse` / `pier_y_reverse`), así que girar es moverse al hermano del catálogo (`turned_blueprint`). Un blueprint sin eje en el nombre no gira.

Los nombres de las herramientas y de los materiales en pantalla **no viven aquí**: el idioma del overlay es del cliente (`src/maker/panel.rs`), y este dominio solo expone las herramientas y su orden.

El historial guarda una copia del chunk (columnas, entidades y vestido) antes de cada trazo; deshacer la vuelve a escribir. El cliente avisa a las sombras horneadas (`ShadowScene::forget`) cuando un trazo cambió el terreno o las entidades.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `brush.rs`

#### Tipos y constantes

- [`MakerTool`](brush.rs#L8) — La herramienta de un trazo: `Raise`, `Lower`, `Surface`, `Tint`, `Top`, `Place`, `Erase`.
  - Declaración: `pub enum MakerTool { Raise, Lower, Surface, Tint, Top, Place, Erase }`
- [`MAKER_TOOLS`](brush.rs#L26) — Las herramientas en el orden en que el panel las lista.
  - Firma: `pub const MAKER_TOOLS: [MakerTool; 7]`
- [`MAKER_SURFACES`](brush.rs#L37) — Los materiales que puede pintar un trazo, en el orden del panel.
  - Firma: `pub const MAKER_SURFACES: [TerrainMaterial; 6]`
- [`MakerBrush`](brush.rs#L48) — La herramienta en la mano y sus elecciones: material, zona de tinte, variante de hierba e índice de blueprint.
  - Declaración: `pub struct MakerBrush { pub tool: MakerTool, pub surface: TerrainMaterial, pub tint: usize, pub top: Option<usize>, pub blueprint: usize }`

#### Funciones y métodos

- [`turn`](brush.rs#L75) — Mueve el blueprint en la mano a su hermano del otro eje; indica si el catálogo tenía uno.
  - Firma: `pub fn turn(&mut self, catalog: &EntityCatalog) -> bool {`
- [`turned_blueprint`](brush.rs#L97) — El nombre con su segmento de eje cambiado (`apartments_x` → `apartments_y`); `None` si no lleva eje.
  - Firma: `pub fn turned_blueprint(id: &str) -> Option<String> {`

### `dressing.rs`

#### Tipos

- [`Dressing`](dressing.rs#L13) — Las excepciones de vestido por casilla: zona de color y variante de hierba elegidas a mano.
  - Declaración: `pub struct Dressing { cells: CellMap<CellDressing> }`

#### Funciones y métodos

- [`is_empty`](dressing.rs#L22) — Si no se ha sobrescrito nada, de modo que todo lo decide el ruido.
  - Firma: `pub fn is_empty(&self) -> bool {`
- [`tint`](dressing.rs#L59) — La zona de color elegida para la casilla, o `None` si sigue mandando el ruido.
  - Firma: `pub fn tint(&self, cell: WorldCoord) -> Option<usize> {`
- [`set_tint`](dressing.rs#L64) — Elige la zona de color de la casilla; `None` la devuelve al ruido.
  - Firma: `pub fn set_tint(&mut self, cell: WorldCoord, zone: Option<usize>) {`
- [`top`](dressing.rs#L72) — Qué crece en la casilla: `None` lo decide el ruido, `Some(None)` es bloque plano, `Some(Some(top))` la variante elegida.
  - Firma: `pub fn top(&self, cell: WorldCoord) -> Option<Option<usize>> {`
- [`set_top`](dressing.rs#L77) — Elige qué crece en la casilla; `None` la devuelve al ruido.
  - Firma: `pub fn set_top(&mut self, cell: WorldCoord, top: Option<Option<usize>>) {`
- [`clear`](dressing.rs#L84) — Borra todas las excepciones de la casilla e indica si tenía alguna.
  - Firma: `pub fn clear(&mut self, cell: WorldCoord) -> bool {`

### `edit.rs`

#### Tipos y constantes

- [`MAKER_MIN_ELEVATION`](edit.rs#L15) — Nivel más bajo al que un trazo puede hundir una columna (−3).
  - Firma: `pub const MAKER_MIN_ELEVATION: i32 = -3;`
- [`MAKER_MAX_ELEVATION`](edit.rs#L17) — Nivel más alto al que un trazo puede subir una columna (8).
  - Firma: `pub const MAKER_MAX_ELEVATION: i32 = 8;`
- [`MakerStroke`](edit.rs#L21) — Qué cambió un trazo: `Nothing`, `Terrain`, `Dressing` o `Entities`.
  - Declaración: `pub enum MakerStroke { Nothing, Terrain, Dressing, Entities }`

#### Funciones y métodos

- [`apply_brush`](edit.rs#L43) — Aplica el pincel a una casilla y responde qué cambió; una casilla sin columna no cambia nada.
  - Firma: `pub fn apply_brush( manager: &mut ChunkManager, dressing: &mut Dressing, brush: &MakerBrush, at: WorldCoord, ) -> MakerStroke {`

### `history.rs`

#### Tipos

- [`ChunkSnapshot`](history.rs#L11) — Todo lo que guarda un chunk editado: columnas, entidades y vestido.
  - Declaración: `pub struct ChunkSnapshot { columns: Vec<TerrainColumn>, entities: Vec<Entity>, dressing: Dressing }`
- [`History`](history.rs#L47) — Los pasos dados, el más nuevo al final, hasta un límite.
  - Declaración: `pub struct History { steps: Vec<ChunkSnapshot>, limit: usize }`

#### Funciones y métodos

- [`snapshot`](history.rs#L18) — Lee el estado de un chunk, o `None` si el mundo nunca lo cargó.
  - Firma: `pub fn snapshot( manager: &ChunkManager, dressing: &Dressing, coord: ChunkCoord, ) -> Option<ChunkSnapshot> {`
- [`restore`](history.rs#L31) — Vuelve a escribir un paso sobre el chunk e indica si el mundo seguía teniéndolo.
  - Firma: `pub fn restore( manager: &mut ChunkManager, dressing: &mut Dressing, coord: ChunkCoord, step: ChunkSnapshot, ) -> bool {`
- [`new`](history.rs#L54) — Un historial que conserva como máximo `limit` pasos.
  - Firma: `pub fn new(limit: usize) -> Self {`
- [`record`](history.rs#L62) — Guarda un paso y olvida el más antiguo al llegar al límite.
  - Firma: `pub fn record(&mut self, step: ChunkSnapshot) {`
- [`undo`](history.rs#L73) — Saca el paso más nuevo, o `None` si no queda nada que deshacer.
  - Firma: `pub fn undo(&mut self) -> Option<ChunkSnapshot> {`
- [`len`](history.rs#L78) — Cuántos pasos se pueden deshacer todavía.
  - Firma: `pub fn len(&self) -> usize {`
- [`is_empty`](history.rs#L83) — Si no queda nada que deshacer.
  - Firma: `pub fn is_empty(&self) -> bool {`

### `picking.rs`

#### Funciones y métodos

- [`pick_column`](picking.rs#L14) — La columna bajo un punto de pantalla: busca del nivel más alto al más bajo, porque las cimas altas tapan el suelo que tienen detrás.
  - Firma: `pub fn pick_column( point: ScreenPoint, projection: ProjectionConfig, levels: RangeInclusive<i32>, at: impl Fn(WorldCoord) -> Option<i32>, ) -> Option<WorldCoord> {`

## Detalles de implementación

### `dressing.rs`

#### Tipos internos

- [`CellDressing`](dressing.rs#L13) — Con qué se vistió una casilla a mano: su zona de color y lo que crece; una entrada vacía se borra del mapa.
  - Declaración: `struct CellDressing { tint: Option<usize>, top: Option<Option<usize>> }`

### `edit.rs`

#### Funciones internas

- [`surface_at`](edit.rs#L34) — La superficie que admite una columna en un nivel: agua por debajo de la orilla, arena cuando se pide agua en seco, el material pedido en el resto.
  - Firma: `fn surface_at(elevation: i32, asked: TerrainMaterial) -> TerrainMaterial {`
