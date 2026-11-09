# World

Este dominio gestiona los chunks materializados, el streaming, el terreno descubierto y la persistencia del estado del mundo. Coordina los datos de larga vida del mapa mediante tipos que pueden ser guardados, cargados y consultados por simulación.

Los cambios de estado deben preservar los invariantes de chunk y separar claramente el estado persistente del derivado. El streaming se expresa como decisiones y solicitudes de dominio, sin imponer cómo se obtienen los datos.

No accede al sistema de archivos, a red ni a una base de datos. Los adaptadores de guardado y carga implementan esos detalles fuera de este dominio.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `chunk_manager.rs`

#### Funciones y métodos

- [`normalized`](chunk_manager.rs#L38) — Clamps the radii so they still grow outwards, whatever a caller asked for: a keep radius
  - Firma: `pub fn normalized(self) -> Self {`

- [`new`](chunk_manager.rs#L64) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(generator: TerrainGenerator, catalog: EntityCatalogV2) -> Self {`

- [`with_radii`](chunk_manager.rs#L69) — Same as [`Self::new`] with streaming radii of the client's choosing.
  - Firma: `pub fn with_radii( generator: TerrainGenerator, catalog: EntityCatalogV2, radii: ChunkRadii, ) -> Self {`

- [`radii`](chunk_manager.rs#L87) — The radii this streamer is using, already normalized.
  - Firma: `pub fn radii(&self) -> ChunkRadii {`

- [`set_focus`](chunk_manager.rs#L92) — Sets the focus chunks (typically around the camera/player). The streamer keeps chunks
  - Firma: `pub fn set_focus(&mut self, focus: Vec<ChunkCoord>) {`

- [`set_single_focus`](chunk_manager.rs#L102) — Sets a single focus without allocating a new vector every rendered frame.
  - Firma: `pub fn set_single_focus(&mut self, focus: ChunkCoord) {`

- [`tick`](chunk_manager.rs#L113) — Advances one frame: loads, shows and hides chunks respecting per-frame budgets.
  - Firma: `pub fn tick(&mut self) -> Vec<ChunkCoord> {`

- [`terrain_chunk`](chunk_manager.rs#L166) — Terrain columns of a discovered chunk, or `None` when it was never discovered.
  - Firma: `pub fn terrain_chunk(&self, coord: ChunkCoord) -> Option<&[crate::terrain::TerrainColumn]> {`

- [`column_at`](chunk_manager.rs#L171) — Terrain column at an absolute world coordinate, or `None` when its chunk was never
  - Firma: `pub fn column_at(&self, x: i32, y: i32) -> Option<crate::terrain::TerrainColumn> {`

- [`is_discovered`](chunk_manager.rs#L180) — Whether a chunk has been discovered.
  - Firma: `pub fn is_discovered(&self, coord: ChunkCoord) -> bool {`

- [`entities_chunk`](chunk_manager.rs#L185) — Placed entities of a discovered chunk, or `None` when it was never discovered.
  - Firma: `pub fn entities_chunk(&self, coord: ChunkCoord) -> Option<&[Entity]> {`

- [`is_visible`](chunk_manager.rs#L190) — Whether a chunk is part of the stream currently shown by the client.
  - Firma: `pub fn is_visible(&self, coord: ChunkCoord) -> bool {`

- [`save_chunk`](chunk_manager.rs#L195) — Converts a discovered chunk into its saved form, storing terrain and entities.
  - Firma: `pub fn save_chunk(&self, coord: ChunkCoord) -> Option<crate::world::save::SavedChunk> {`

- [`save_all`](chunk_manager.rs#L227) — Converts every discovered chunk into saved form.
  - Firma: `pub fn save_all(&self) -> Vec<crate::world::save::SavedChunk> {`

- [`load_from_save`](chunk_manager.rs#L239) — Restores chunks from a save into this manager, bypassing generation.
  - Firma: `pub fn load_from_save(&mut self, save: &crate::world::save::WorldSave) -> Vec<String> {`

- [`visible_chunks`](chunk_manager.rs#L286) — Visible chunk coordinates in stable order.
  - Firma: `pub fn visible_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_count`](chunk_manager.rs#L291) — Discovered chunk count (visible or not).
  - Firma: `pub fn discovered_count(&self) -> usize {`

- [`focus`](chunk_manager.rs#L296) — Focus chunks in stable order.
  - Firma: `pub fn focus(&self) -> &[ChunkCoord] {`

- [`unload_candidates`](chunk_manager.rs#L328) — Discovered chunks further than `CHUNK_KEEP_RADIUS` from every focus, nearest first.
  - Firma: `pub fn unload_candidates(&self) -> Vec<ChunkCoord> {`

- [`next_unload_candidate`](chunk_manager.rs#L348) — The one chunk [`Self::unload_candidates`] would hand back first, without building the
  - Firma: `pub fn next_unload_candidate(&self) -> Option<ChunkCoord> {`

- [`unload_chunk`](chunk_manager.rs#L365) — Calcula o recupera «unload chunk» según los parámetros de la firma.
  - Firma: `pub fn unload_chunk(&mut self, coord: ChunkCoord) -> Option<crate::world::save::SavedChunk> {`

### `save.rs`

#### Funciones y métodos

- [`terrain_column_to_saved`](save.rs#L98) — Converts a materialized terrain column into its saved form.
  - Firma: `pub fn terrain_column_to_saved(column: &crate::terrain::TerrainColumn) -> SavedColumn {`

- [`saved_to_terrain_column`](save.rs#L111) — Reconstructs a terrain column from its saved form, using the top block as the surface.
  - Firma: `pub fn saved_to_terrain_column(saved: &SavedColumn) -> crate::terrain::TerrainColumn {`

- [`new`](save.rs#L132) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`put`](save.rs#L137) — Stores a deep copy of `chunk`, keyed by its coordinates.
  - Firma: `pub fn put(&mut self, chunk: SavedChunk) {`

- [`get`](save.rs#L147) — Returns a copy of the chunk at `(cx, cy)`, or `None` when it was never discovered.
  - Firma: `pub fn get(&self, cx: i32, cy: i32) -> Option<SavedChunk> {`

- [`get_or_generate`](save.rs#L153) — Returns the discovered chunk, or generates and stores it once when absent.
  - Firma: `pub fn get_or_generate<F>(&mut self, cx: i32, cy: i32, generate: F) -> Result<SavedChunk, SaveError> where F: FnOnce(i32, i32) -> SavedChunk, {`

- [`snapshot`](save.rs#L171) — Builds a save, sorting chunks for a stable JSON order.
  - Firma: `pub fn snapshot(&self, player: serde_json::Value, systems: serde_json::Value) -> WorldSave {`

- [`chunks`](save.rs#L184) — Iterates over every discovered chunk in stable order.
  - Firma: `pub fn chunks(&self) -> impl Iterator<Item = &SavedChunk> {`

- [`restore`](save.rs#L191) — Restores an archive from a parsed save.
  - Firma: `pub fn restore(save: &WorldSave) -> Self {`

- [`parse_world_save`](save.rs#L201) — Checks the version and structure at the save-file boundary; V1 snapshots are rejected.
  - Firma: `pub fn parse_world_save(value: serde_json::Value) -> Result<WorldSave, SaveError> {`

#### Constantes

- [`SAVE_FORMAT`](save.rs#L59) — Save format magic value.
  - Declaración: `pub const SAVE_FORMAT: &str = "armada-engine-2";`

- [`SAVE_SCHEMA_VERSION`](save.rs#L61) — Current save schema version.
  - Declaración: `pub const SAVE_SCHEMA_VERSION: u32 = 1;`

### `terrain_world.rs`

#### Funciones y métodos

- [`new`](terrain_world.rs#L23) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(generator: TerrainGenerator) -> Self {`

- [`load_chunk`](terrain_world.rs#L32) — Injects a previously saved chunk's terrain, bypassing generation. Used when restoring
  - Firma: `pub fn load_chunk(&mut self, coord: ChunkCoord, columns: Vec<TerrainColumn>) -> bool {`

- [`unload_chunk`](terrain_world.rs#L39) — Drops a chunk's terrain from memory, so a long session does not grow without bound.
  - Firma: `pub fn unload_chunk(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>> {`

- [`discover_chunk`](terrain_world.rs#L45) — Materializes a chunk at most once, without showing it. Returns true only for first
  - Firma: `pub fn discover_chunk(&mut self, coord: ChunkCoord) -> bool {`

- [`show_chunk`](terrain_world.rs#L55) — Materializes a chunk at most once and shows it. Returns true only for first discovery.
  - Firma: `pub fn show_chunk(&mut self, coord: ChunkCoord) -> bool {`

- [`hide_chunk`](terrain_world.rs#L62) — Removes presentation visibility without discarding discovered terrain.
  - Firma: `pub fn hide_chunk(&mut self, coord: ChunkCoord) {`

- [`chunk`](terrain_world.rs#L66) — Calcula o recupera «chunk» según los parámetros de la firma.
  - Firma: `pub fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]> {`

- [`column_at`](terrain_world.rs#L70) — Calcula o recupera «column at» según los parámetros de la firma.
  - Firma: `pub fn column_at(&self, coord: WorldCoord) -> Option<&TerrainColumn> {`

- [`is_discovered`](terrain_world.rs#L79) — Whether a chunk has been discovered (materialized at least once).
  - Firma: `pub fn is_discovered(&self, coord: ChunkCoord) -> bool {`

- [`is_visible`](terrain_world.rs#L84) — Whether a chunk is currently visible.
  - Firma: `pub fn is_visible(&self, coord: ChunkCoord) -> bool {`

- [`edit_column`](terrain_world.rs#L89) — Edits a discovered column; passability follows its surface material.
  - Firma: `pub fn edit_column( &mut self, coord: WorldCoord, elevation: i32, surface: TerrainMaterial, ) -> Result<(), EditError> {`

- [`discovered_count`](terrain_world.rs#L114) — Calcula o recupera «discovered count» según los parámetros de la firma.
  - Firma: `pub fn discovered_count(&self) -> usize {`

- [`visible_count`](terrain_world.rs#L118) — Calcula o recupera «visible count» según los parámetros de la firma.
  - Firma: `pub fn visible_count(&self) -> usize {`

- [`visible_chunks`](terrain_world.rs#L123) — Visible chunk coordinates in a stable order, regardless of discovery order.
  - Firma: `pub fn visible_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_chunks`](terrain_world.rs#L130) — All discovered chunk coordinates in a stable order.
  - Firma: `pub fn discovered_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_chunks_unordered`](terrain_world.rs#L137) — Discovered chunks in no particular order, for callers that only scan them.
  - Firma: `pub fn discovered_chunks_unordered(&self) -> impl Iterator<Item = ChunkCoord> + '_ {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `chunk_manager.rs`

#### Funciones internas

- [`default`](chunk_manager.rs#L27) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`chunks_within`](chunk_manager.rs#L301) — Every chunk within `radius` of any focus, deduplicated and sorted nearest first.
  - Firma: `fn chunks_within(&self, radius: i32) -> Vec<ChunkCoord> {`

- [`is_within_keep`](chunk_manager.rs#L321) — Evalúa si se cumple la condición «within keep» para el estado recibido.
  - Firma: `fn is_within_keep(&self, coord: ChunkCoord) -> bool {`

- [`saved_entity_state`](chunk_manager.rs#L374) — The per-instance state a save has to carry: everything `Entity::restore` cannot rebuild from
  - Firma: `fn saved_entity_state(entity: &Entity) -> serde_json::Value {`

- [`distance`](chunk_manager.rs#L386) — Chebyshev distance between two chunk coordinates.
  - Firma: `fn distance(a: ChunkCoord, b: ChunkCoord) -> i32 {`

- [`default`](chunk_manager.rs#L391) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

### `save.rs`

#### Funciones internas

- [`fmt`](save.rs#L76) — Calcula o recupera «fmt» según los parámetros de la firma.
  - Firma: `fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {`

- [`parse_chunk`](save.rs#L277) — Calcula o recupera «parse chunk» según los parámetros de la firma.
  - Firma: `fn parse_chunk(value: &serde_json::Value, index: usize) -> Result<SavedChunk, SaveError> {`

- [`parse_columns`](save.rs#L316) — Calcula o recupera «parse columns» según los parámetros de la firma.
  - Firma: `fn parse_columns( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, ) -> Result<Vec<SavedColumn>, SaveError> {`

- [`parse_column`](save.rs#L336) — Calcula o recupera «parse column» según los parámetros de la firma.
  - Firma: `fn parse_column( value: &serde_json::Value, cx: i32, cy: i32, index: usize, ) -> Result<SavedColumn, SaveError> {`

- [`parse_blocks`](save.rs#L389) — Calcula o recupera «parse blocks» según los parámetros de la firma.
  - Firma: `fn parse_blocks( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, column_index: usize, ) -> Result<Vec<SavedBlock>, SaveError> {`

- [`parse_block`](save.rs#L412) — Calcula o recupera «parse block» según los parámetros de la firma.
  - Firma: `fn parse_block( value: &serde_json::Value, cx: i32, cy: i32, column_index: usize, block_index: usize, ) -> Result<SavedBlock, SaveError> {`

- [`parse_entities`](save.rs#L461) — Calcula o recupera «parse entities» según los parámetros de la firma.
  - Firma: `fn parse_entities( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, ) -> Result<Vec<SavedEntity>, SaveError> {`

- [`parse_entity`](save.rs#L481) — Calcula o recupera «parse entity» según los parámetros de la firma.
  - Firma: `fn parse_entity( value: &serde_json::Value, cx: i32, cy: i32, index: usize, ) -> Result<SavedEntity, SaveError> {`
