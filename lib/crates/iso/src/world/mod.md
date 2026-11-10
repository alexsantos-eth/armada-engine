# World

Este dominio gestiona los chunks materializados, el streaming, el terreno descubierto y la persistencia del estado del mundo. Coordina los datos de larga vida del mapa mediante tipos que pueden ser guardados, cargados y consultados por simulación.

Los cambios de estado deben preservar los invariantes de chunk y separar claramente el estado persistente del derivado. El streaming se expresa como decisiones y solicitudes de dominio, sin imponer cómo se obtienen los datos.

No accede al sistema de archivos, a red ni a una base de datos. Los adaptadores de guardado y carga implementan esos detalles fuera de este dominio.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `chunk_manager.rs`

#### Funciones y métodos

- [`normalized`](chunk_manager.rs#L37) — Acota los radios para que sigan creciendo hacia fuera, pida lo que pida quien llama: un radio de retención
  - Firma: `pub fn normalized(self) -> Self {`

- [`new`](chunk_manager.rs#L64) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(generator: TerrainGenerator, catalog: EntityCatalog) -> Self {`

- [`with_radii`](chunk_manager.rs#L69) — Igual que [`Self::new`] con los radios de streaming que elija el cliente.
  - Firma: `pub fn with_radii( generator: TerrainGenerator, catalog: EntityCatalog, radii: ChunkRadii, ) -> Self {`

- [`radii`](chunk_manager.rs#L89) — Los radios que está usando este streamer, ya normalizados.
  - Firma: `pub fn radii(&self) -> ChunkRadii {`

- [`set_biomes`](chunk_manager.rs#L97) — Entrega al manager los biomas del mundo. Se llama una vez en el arranque, antes del primer descubrimiento; las entidades de los chunks ya colocadas conservan los suyos hasta que se descargan.
  - Firma: `pub fn set_biomes(&mut self, biomes: WorldBiomes) {`

- [`set_focus`](chunk_manager.rs#L102) — Establece los chunks de foco (normalmente alrededor de la cámara/jugador). El streamer conserva los chunks
  - Firma: `pub fn set_focus(&mut self, focus: Vec<ChunkCoord>) {`

- [`set_single_focus`](chunk_manager.rs#L112) — Establece un único foco sin asignar un nuevo vector en cada frame renderizado.
  - Firma: `pub fn set_single_focus(&mut self, focus: ChunkCoord) {`

- [`tick`](chunk_manager.rs#L123) — Avanza un frame: carga, muestra y oculta chunks respetando los presupuestos por frame.
  - Firma: `pub fn tick(&mut self) -> Vec<ChunkCoord> {`

- [`terrain_chunk`](chunk_manager.rs#L181) — Columnas de terreno de un chunk descubierto, o `None` cuando nunca fue descubierto.
  - Firma: `pub fn terrain_chunk(&self, coord: ChunkCoord) -> Option<&[crate::terrain::TerrainColumn]> {`

- [`column_at`](chunk_manager.rs#L186) — Columna de terreno en una coordenada absoluta del mundo, o `None` cuando su chunk nunca fue
  - Firma: `pub fn column_at(&self, x: i32, y: i32) -> Option<crate::terrain::TerrainColumn> {`

- [`is_discovered`](chunk_manager.rs#L195) — Si un chunk ha sido descubierto.
  - Firma: `pub fn is_discovered(&self, coord: ChunkCoord) -> bool {`

- [`entities_chunk`](chunk_manager.rs#L200) — Entidades colocadas de un chunk descubierto, o `None` cuando nunca fue descubierto.
  - Firma: `pub fn entities_chunk(&self, coord: ChunkCoord) -> Option<&[Entity]> {`

- [`is_visible`](chunk_manager.rs#L205) — Si un chunk forma parte del flujo que el cliente está mostrando actualmente.
  - Firma: `pub fn is_visible(&self, coord: ChunkCoord) -> bool {`

- [`save_chunk`](chunk_manager.rs#L210) — Convierte un chunk descubierto a su forma guardada, almacenando terreno y entidades.
  - Firma: `pub fn save_chunk(&self, coord: ChunkCoord) -> Option<crate::world::save::SavedChunk> {`

- [`save_all`](chunk_manager.rs#L242) — Convierte cada chunk descubierto a su forma guardada.
  - Firma: `pub fn save_all(&self) -> Vec<crate::world::save::SavedChunk> {`

- [`load_from_save`](chunk_manager.rs#L254) — Restaura chunks desde un guardado hacia este manager, sin pasar por la generación.
  - Firma: `pub fn load_from_save(&mut self, save: &crate::world::save::WorldSave) -> Vec<String> {`

- [`visible_chunks`](chunk_manager.rs#L304) — Coordenadas de los chunks visibles en orden estable.
  - Firma: `pub fn visible_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_count`](chunk_manager.rs#L309) — Número de chunks descubiertos (visibles o no).
  - Firma: `pub fn discovered_count(&self) -> usize {`

- [`focus`](chunk_manager.rs#L314) — Chunks de foco en orden estable.
  - Firma: `pub fn focus(&self) -> &[ChunkCoord] {`

- [`unload_candidates`](chunk_manager.rs#L346) — Chunks descubiertos más lejos que `CHUNK_KEEP_RADIUS` de cada foco, de los más cercanos primero.
  - Firma: `pub fn unload_candidates(&self) -> Vec<ChunkCoord> {`

- [`next_unload_candidate`](chunk_manager.rs#L366) — El único chunk que [`Self::unload_candidates`] devolvería primero, sin construir la
  - Firma: `pub fn next_unload_candidate(&self) -> Option<ChunkCoord> {`

- [`unload_chunk`](chunk_manager.rs#L387) — Calcula o recupera «unload chunk» según los parámetros de la firma.
  - Firma: `pub fn unload_chunk(&mut self, coord: ChunkCoord) -> Option<crate::world::save::SavedChunk> {`

### `save.rs`

#### Funciones y métodos

- [`terrain_column_to_saved`](save.rs#L101) — Convierte una columna de terreno materializada a su forma guardada.
  - Firma: `pub fn terrain_column_to_saved(column: &crate::terrain::TerrainColumn) -> SavedColumn {`

- [`saved_to_terrain_column`](save.rs#L114) — Reconstruye una columna de terreno desde su forma guardada, usando el bloque superior como superficie.
  - Firma: `pub fn saved_to_terrain_column(saved: &SavedColumn) -> crate::terrain::TerrainColumn {`

- [`new`](save.rs#L138) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`put`](save.rs#L143) — Almacena una copia profunda de `chunk`, indexada por sus coordenadas.
  - Firma: `pub fn put(&mut self, chunk: SavedChunk) {`

- [`get`](save.rs#L153) — Devuelve una copia del chunk en `(cx, cy)`, o `None` cuando nunca fue descubierto.
  - Firma: `pub fn get(&self, cx: i32, cy: i32) -> Option<SavedChunk> {`

- [`get_or_generate`](save.rs#L159) — Devuelve el chunk descubierto, o lo genera y almacena una vez cuando falta.
  - Firma: `pub fn get_or_generate<F>(&mut self, cx: i32, cy: i32, generate: F) -> Result<SavedChunk, SaveError> where F: FnOnce(i32, i32) -> SavedChunk, {`

- [`snapshot`](save.rs#L182) — Construye un guardado, ordenando los chunks para un orden JSON estable.
  - Firma: `pub fn snapshot(&self, player: serde_json::Value, systems: serde_json::Value) -> WorldSave {`

- [`chunks`](save.rs#L195) — Itera sobre cada chunk descubierto en orden estable.
  - Firma: `pub fn chunks(&self) -> impl Iterator<Item = &SavedChunk> {`

- [`restore`](save.rs#L202) — Restaura un archivo desde un guardado analizado.
  - Firma: `pub fn restore(save: &WorldSave) -> Self {`

- [`parse_world_save`](save.rs#L212) — Comprueba la versión y la estructura en la frontera del archivo de guardado; los snapshots V1 se rechazan.
  - Firma: `pub fn parse_world_save(value: serde_json::Value) -> Result<WorldSave, SaveError> {`

#### Constantes

- [`SAVE_FORMAT`](save.rs#L59) — Valor mágico del formato de guardado.
  - Declaración: `pub const SAVE_FORMAT: &str = "iso-engine-2";`

- [`SAVE_SCHEMA_VERSION`](save.rs#L61) — Versión actual del esquema de guardado.
  - Declaración: `pub const SAVE_SCHEMA_VERSION: u32 = 1;`

### `terrain_world.rs`

#### Funciones y métodos

- [`new`](terrain_world.rs#L23) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(generator: TerrainGenerator) -> Self {`

- [`load_chunk`](terrain_world.rs#L32) — Inyecta el terreno de un chunk guardado previamente, sin pasar por la generación. Se usa al restaurar
  - Firma: `pub fn load_chunk(&mut self, coord: ChunkCoord, columns: Vec<TerrainColumn>) -> bool {`

- [`unload_chunk`](terrain_world.rs#L39) — Descarta el terreno de un chunk de la memoria, para que una sesión larga no crezca sin límite.
  - Firma: `pub fn unload_chunk(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>> {`

- [`discover_chunk`](terrain_world.rs#L45) — Materializa un chunk como mucho una vez, sin mostrarlo. Devuelve true solo para el primer
  - Firma: `pub fn discover_chunk(&mut self, coord: ChunkCoord) -> bool {`

- [`show_chunk`](terrain_world.rs#L55) — Materializa un chunk como mucho una vez y lo muestra. Devuelve true solo para el primer descubrimiento.
  - Firma: `pub fn show_chunk(&mut self, coord: ChunkCoord) -> bool {`

- [`hide_chunk`](terrain_world.rs#L62) — Elimina la visibilidad de presentación sin descartar el terreno descubierto.
  - Firma: `pub fn hide_chunk(&mut self, coord: ChunkCoord) {`

- [`chunk`](terrain_world.rs#L66) — Calcula o recupera «chunk» según los parámetros de la firma.
  - Firma: `pub fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]> {`

- [`column_at`](terrain_world.rs#L70) — Calcula o recupera «column at» según los parámetros de la firma.
  - Firma: `pub fn column_at(&self, coord: WorldCoord) -> Option<&TerrainColumn> {`

- [`is_discovered`](terrain_world.rs#L79) — Si un chunk ha sido descubierto (materializado al menos una vez).
  - Firma: `pub fn is_discovered(&self, coord: ChunkCoord) -> bool {`

- [`is_visible`](terrain_world.rs#L84) — Si un chunk es visible actualmente.
  - Firma: `pub fn is_visible(&self, coord: ChunkCoord) -> bool {`

- [`edit_column`](terrain_world.rs#L89) — Edita una columna descubierta; la transitabilidad sigue a su material de superficie.
  - Firma: `pub fn edit_column( &mut self, coord: WorldCoord, elevation: i32, surface: TerrainMaterial, ) -> Result<(), EditError> {`

- [`discovered_count`](terrain_world.rs#L114) — Calcula o recupera «discovered count» según los parámetros de la firma.
  - Firma: `pub fn discovered_count(&self) -> usize {`

- [`visible_count`](terrain_world.rs#L118) — Calcula o recupera «visible count» según los parámetros de la firma.
  - Firma: `pub fn visible_count(&self) -> usize {`

- [`visible_chunks`](terrain_world.rs#L123) — Coordenadas de los chunks visibles en un orden estable, independientemente del orden de descubrimiento.
  - Firma: `pub fn visible_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_chunks`](terrain_world.rs#L130) — Todas las coordenadas de chunks descubiertos en un orden estable.
  - Firma: `pub fn discovered_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_chunks_unordered`](terrain_world.rs#L137) — Chunks descubiertos sin un orden concreto, para quienes solo los recorren.
  - Firma: `pub fn discovered_chunks_unordered(&self) -> impl Iterator<Item = ChunkCoord> + '_ {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `chunk_manager.rs`

#### Funciones internas

- [`default`](chunk_manager.rs#L27) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`chunks_within`](chunk_manager.rs#L301) — Todos los chunks dentro de `radius` de cualquier foco, sin duplicados y ordenados de los más cercanos primero.
  - Firma: `fn chunks_within(&self, radius: i32) -> Vec<ChunkCoord> {`

- [`is_within_keep`](chunk_manager.rs#L321) — Evalúa si se cumple la condición «within keep» para el estado recibido.
  - Firma: `fn is_within_keep(&self, coord: ChunkCoord) -> bool {`

- [`saved_entity_state`](chunk_manager.rs#L374) — El estado por instancia que un guardado debe llevar: todo lo que `Entity::restore` no puede reconstruir a partir de
  - Firma: `fn saved_entity_state(entity: &Entity) -> serde_json::Value {`

- [`distance`](chunk_manager.rs#L386) — Distancia de Chebyshev entre dos coordenadas de chunk.
  - Firma: `fn distance(a: ChunkCoord, b: ChunkCoord) -> i32 {`

- [`default`](chunk_manager.rs#L391) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

### `save.rs`

#### Funciones internas

- [`fmt`](save.rs#L76) — Calcula o recupera «fmt» según los parámetros de la firma.
  - Firma: `fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {`

- [`parse_chunk`](save.rs#L291) — Calcula o recupera «parse chunk» según los parámetros de la firma.
  - Firma: `fn parse_chunk(value: &serde_json::Value, index: usize) -> Result<SavedChunk, SaveError> {`

- [`parse_columns`](save.rs#L332) — Calcula o recupera «parse columns» según los parámetros de la firma.
  - Firma: `fn parse_columns( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, ) -> Result<Vec<SavedColumn>, SaveError> {`

- [`parse_column`](save.rs#L352) — Calcula o recupera «parse column» según los parámetros de la firma.
  - Firma: `fn parse_column( value: &serde_json::Value, cx: i32, cy: i32, index: usize, ) -> Result<SavedColumn, SaveError> {`

- [`parse_blocks`](save.rs#L405) — Calcula o recupera «parse blocks» según los parámetros de la firma.
  - Firma: `fn parse_blocks( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, column_index: usize, ) -> Result<Vec<SavedBlock>, SaveError> {`

- [`parse_block`](save.rs#L426) — Calcula o recupera «parse block» según los parámetros de la firma.
  - Firma: `fn parse_block( value: &serde_json::Value, cx: i32, cy: i32, column_index: usize, block_index: usize, ) -> Result<SavedBlock, SaveError> {`

- [`parse_entities`](save.rs#L478) — Calcula o recupera «parse entities» según los parámetros de la firma.
  - Firma: `fn parse_entities( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, ) -> Result<Vec<SavedEntity>, SaveError> {`

- [`parse_entity`](save.rs#L498) — Calcula o recupera «parse entity» según los parámetros de la firma.
  - Firma: `fn parse_entity( value: &serde_json::Value, cx: i32, cy: i32, index: usize, ) -> Result<SavedEntity, SaveError> {`
