# World

Este dominio gestiona los chunks materializados, el streaming, el terreno descubierto y la persistencia del estado del mundo. Coordina los datos de larga vida del mapa mediante tipos que pueden ser guardados, cargados y consultados por simulación.

Los cambios de estado deben preservar los invariantes de chunk y separar claramente el estado persistente del derivado. El streaming se expresa como decisiones y solicitudes de dominio, sin imponer cómo se obtienen los datos.

No accede al sistema de archivos, a red ni a una base de datos. Los adaptadores de guardado y carga implementan esos detalles fuera de este dominio.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `chunk_manager.rs`

#### Funciones y métodos

- [`normalized`](chunk_manager.rs#L40) — Acota los radios para que sigan creciendo hacia fuera, pida lo que pida quien llama: un radio de retención
  - Firma: `pub fn normalized(self) -> Self {`

- [`new`](chunk_manager.rs#L71) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(generator: TerrainGenerator, catalog: EntityCatalog) -> Self {`

- [`with_radii`](chunk_manager.rs#L76) — Igual que [`Self::new`] con los radios de streaming que elija el cliente.
  - Firma: `pub fn with_radii( generator: TerrainGenerator, catalog: EntityCatalog, radii: ChunkRadii, ) -> Self {`

- [`radii`](chunk_manager.rs#L97) — Los radios que está usando este streamer, ya normalizados.
  - Firma: `pub fn radii(&self) -> ChunkRadii {`

- [`set_biomes`](chunk_manager.rs#L103) — Entrega al manager los biomas del mundo. Se llama una vez en el arranque, antes del primer descubrimiento; las entidades de los chunks ya colocadas conservan los suyos hasta que se descargan.
  - Firma: `pub fn set_biomes(&mut self, biomes: WorldBiomes) {`

- [`set_wfc`](chunk_manager.rs#L109) — Entrega al manager el catálogo wfc del resto de entidades. Se llama una vez en el arranque, antes del primer descubrimiento; los chunks ya colocados conservan las suyas hasta que se descargan.
  - Firma: `pub fn set_wfc(&mut self, wfc: WfcCatalog) {`

- [`biomes`](chunk_manager.rs#L115) — Los biomas del mundo, cuando el contenido los trajo: las vistas los leen para vestir o mover lo que crece ahí (paleta de suelo, fuerza de mece) sin quedarse con su propia copia.
  - Firma: `pub fn biomes(&self) -> Option<&WorldBiomes> {`

- [`set_focus`](chunk_manager.rs#L120) — Establece los chunks de foco (normalmente alrededor de la cámara/jugador). El streamer conserva los chunks
  - Firma: `pub fn set_focus(&mut self, focus: Vec<ChunkCoord>) {`

- [`set_single_focus`](chunk_manager.rs#L130) — Establece un único foco sin asignar un nuevo vector en cada frame renderizado.
  - Firma: `pub fn set_single_focus(&mut self, focus: ChunkCoord) {`

- [`tick`](chunk_manager.rs#L141) — Avanza un frame: aplica los resultados del hilo de colocación, descubre, muestra y oculta chunks. El terreno se inserta síncronamente; la colocación de entidades es un trabajo en hilo (inline en `wasm32`) que aterriza unos frames después.
  - Firma: `pub fn tick(&mut self) -> Vec<ChunkCoord> {`

- [`settle`](chunk_manager.rs#L225) — Espera a que todos los trabajos de colocación en vuelo terminen y los aplica en el orden en que se crearon. La usan [`Self::save_all`] y [`Self::unload_chunk`] para que el guardado transporte las entidades recién colocadas; se conserva aquí pública por si algún camino del cliente necesita garantizarlo.
  - Firma: `pub fn settle(&mut self) {`

- [`terrain_chunk`](chunk_manager.rs#L270) — Columnas de terreno de un chunk descubierto, o `None` cuando nunca fue descubierto.
  - Firma: `pub fn terrain_chunk(&self, coord: ChunkCoord) -> Option<&[crate::terrain::TerrainColumn]> {`

- [`column_at`](chunk_manager.rs#L275) — Columna de terreno en una coordenada absoluta del mundo, o `None` cuando su chunk nunca fue
  - Firma: `pub fn column_at(&self, x: i32, y: i32) -> Option<crate::terrain::TerrainColumn> {`

- [`is_discovered`](chunk_manager.rs#L284) — Si un chunk ha sido descubierto.
  - Firma: `pub fn is_discovered(&self, coord: ChunkCoord) -> bool {`

- [`entities_chunk`](chunk_manager.rs#L289) — Entidades colocadas de un chunk descubierto, o `None` cuando nunca fue descubierto.
  - Firma: `pub fn entities_chunk(&self, coord: ChunkCoord) -> Option<&[Entity]> {`

- [`is_visible`](chunk_manager.rs#L294) — Si un chunk forma parte del flujo que el cliente está mostrando actualmente.
  - Firma: `pub fn is_visible(&self, coord: ChunkCoord) -> bool {`

- [`save_chunk`](chunk_manager.rs#L299) — Convierte un chunk descubierto a su forma guardada, almacenando terreno y entidades.
  - Firma: `pub fn save_chunk(&self, coord: ChunkCoord) -> Option<crate::world::save::SavedChunk> {`

- [`save_all`](chunk_manager.rs#L331) — Convierte cada chunk descubierto a su forma guardada.
  - Firma: `pub fn save_all(&self) -> Vec<crate::world::save::SavedChunk> {`

- [`load_from_save`](chunk_manager.rs#L344) — Restaura chunks desde un guardado hacia este manager, sin pasar por la generación.
  - Firma: `pub fn load_from_save(&mut self, save: &crate::world::save::WorldSave) -> Vec<String> {`

- [`visible_chunks`](chunk_manager.rs#L394) — Coordenadas de los chunks visibles en orden estable.
  - Firma: `pub fn visible_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_count`](chunk_manager.rs#L399) — Número de chunks descubiertos (visibles o no).
  - Firma: `pub fn discovered_count(&self) -> usize {`

- [`focus`](chunk_manager.rs#L404) — Chunks de foco en orden estable.
  - Firma: `pub fn focus(&self) -> &[ChunkCoord] {`

- [`unload_candidates`](chunk_manager.rs#L436) — Chunks descubiertos más lejos que `CHUNK_KEEP_RADIUS` de cada foco, de los más cercanos primero.
  - Firma: `pub fn unload_candidates(&self) -> Vec<ChunkCoord> {`

- [`next_unload_candidate`](chunk_manager.rs#L456) — El único chunk que [`Self::unload_candidates`] devolvería primero, sin construir la
  - Firma: `pub fn next_unload_candidate(&self) -> Option<ChunkCoord> {`

- [`catalog`](chunk_manager.rs#L476) — El catálogo desde el que coloca este manager: lo que un editor ofrece para poner a mano.
  - Firma: `pub fn catalog(&self) -> &EntityCatalog {`

- [`load_columns`](chunk_manager.rs#L482) — Inyecta el terreno de un chunk sin pasar por la generación y sin entidades: el suelo del que parte un editor. Reemplaza lo que el chunk tuviera.
  - Firma: `pub fn load_columns(&mut self, coord: ChunkCoord, columns: Vec<crate::terrain::TerrainColumn>) {`

- [`edit_column`](chunk_manager.rs#L489) — Edita una columna materializada, igual que [`TerrainWorld::edit_column`].
  - Firma: `pub fn edit_column( &mut self, coord: crate::grid::WorldCoord, elevation: i32, surface: crate::terrain::TerrainMaterial, ) -> Result<(), crate::world::EditError> {`

- [`put_entity`](chunk_manager.rs#L499) — Pone una entidad en su propio chunk e indica si ese chunk estaba cargado para recibirla.
  - Firma: `pub fn put_entity(&mut self, entity: Entity) -> bool {`

- [`set_entities`](chunk_manager.rs#L512) — Reemplaza las entidades de un chunk descubierto e indica si ese chunk estaba cargado.
  - Firma: `pub fn set_entities(&mut self, coord: ChunkCoord, entities: Vec<Entity>) -> bool {`

- [`remove_entity_at`](chunk_manager.rs#L521) — Quita la entidad cuya huella cubre una casilla, si alguna la cubre.
  - Firma: `pub fn remove_entity_at(&mut self, x: i32, y: i32) -> Option<Entity> {`

- [`unload_chunk`](chunk_manager.rs#L534) — Descubre o devuelve la forma guardada del chunk; `None` si no estaba descubierto.
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

- [`new`](terrain_world.rs#L25) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(generator: TerrainGenerator) -> Self {`

- [`load_chunk`](terrain_world.rs#L34) — Inyecta el terreno de un chunk guardado previamente, sin pasar por la generación. Se usa al restaurar
  - Firma: `pub fn load_chunk(&mut self, coord: ChunkCoord, columns: Vec<TerrainColumn>) -> bool {`

- [`unload_chunk`](terrain_world.rs#L41) — Descarta el terreno de un chunk de la memoria, para que una sesión larga no crezca sin límite.
  - Firma: `pub fn unload_chunk(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>> {`

- [`discover_chunk`](terrain_world.rs#L47) — Materializa un chunk como mucho una vez, sin mostrarlo. Devuelve true solo para el primer
  - Firma: `pub fn discover_chunk(&mut self, coord: ChunkCoord) -> bool {`

- [`show_chunk`](terrain_world.rs#L57) — Materializa un chunk como mucho una vez y lo muestra. Devuelve true solo para el primer descubrimiento.
  - Firma: `pub fn show_chunk(&mut self, coord: ChunkCoord) -> bool {`

- [`hide_chunk`](terrain_world.rs#L64) — Elimina la visibilidad de presentación sin descartar el terreno descubierto.
  - Firma: `pub fn hide_chunk(&mut self, coord: ChunkCoord) {`

- [`chunk`](terrain_world.rs#L68) — Las columnas de `coord` si está descubierto; `None` si no.
  - Firma: `pub fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]> {`

- [`column_at`](terrain_world.rs#L72) — La columna de mundo en `(x, y)`; `None` si el chunk no está descubierto.
  - Firma: `pub fn column_at(&self, coord: WorldCoord) -> Option<&TerrainColumn> {`

- [`is_discovered`](terrain_world.rs#L81) — Si un chunk ha sido descubierto (materializado al menos una vez).
  - Firma: `pub fn is_discovered(&self, coord: ChunkCoord) -> bool {`

- [`is_visible`](terrain_world.rs#L86) — Si un chunk es visible actualmente.
  - Firma: `pub fn is_visible(&self, coord: ChunkCoord) -> bool {`

- [`edit_column`](terrain_world.rs#L91) — Edita una columna descubierta; la transitabilidad sigue a su material de superficie.
  - Firma: `pub fn edit_column( &mut self, coord: WorldCoord, elevation: i32, surface: TerrainMaterial, ) -> Result<(), EditError> {`
- [`connect_roads`](terrain_world.rs#L116) — Materializa caminos entre las entidades con acceso vial de un chunk descubierto, sin tocar sus huellas.
  - Firma: `pub fn connect_roads(&mut self, coord: ChunkCoord, entities: &[Entity]) -> usize {`

- [`discovered_count`](terrain_world.rs#L139) — Chunks descubiertos en memoria.
  - Firma: `pub fn discovered_count(&self) -> usize {`

- [`visible_count`](terrain_world.rs#L143) — Chunks actualmente visibles.
  - Firma: `pub fn visible_count(&self) -> usize {`

- [`visible_chunks`](terrain_world.rs#L148) — Coordenadas de los chunks visibles en un orden estable, independientemente del orden de descubrimiento.
  - Firma: `pub fn visible_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_chunks`](terrain_world.rs#L155) — Todas las coordenadas de chunks descubiertos en un orden estable.
  - Firma: `pub fn discovered_chunks(&self) -> Vec<ChunkCoord> {`

- [`discovered_chunks_unordered`](terrain_world.rs#L162) — Chunks descubiertos sin un orden concreto, para quienes solo los recorren.
  - Firma: `pub fn discovered_chunks_unordered(&self) -> impl Iterator<Item = ChunkCoord> + '_ {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `chunk_manager.rs`

#### Funciones internas

- [`default`](chunk_manager.rs#L29) — Implementación de `Default`: los radios por defecto (`load`/`prefetch`/`keep`).
  - Firma: `fn default() -> Self {`

- [`poll_jobs`](chunk_manager.rs#L206) — Aplica los trabajos que ya están listos, en el orden en que se crearon; un trabajo cuyo chunk está gobernado por un guardado o que ya no está descubierto se descarta en silencio.
  - Firma: `fn poll_jobs(&mut self) {`

- [`drain_job`](chunk_manager.rs#L236) — Espera al trabajo de `coord` antes de descargar el chunk, para que el guardado lleve las entidades recién colocadas.
  - Firma: `fn drain_job(&mut self, coord: ChunkCoord) {`

- [`apply_outcome`](chunk_manager.rs#L252) — Escribe el resultado de un trabajo: sustituye las columnas por las que trae con los caminos materializados e inserta las entidades; todo ello solo si el chunk sigue descubierto y ningún guardado lo gobierna.
  - Firma: `fn apply_outcome( &mut self, coord: ChunkCoord, outcome: super::placement_job::PlacementOutcome, ) {`

- [`chunks_within`](chunk_manager.rs#L409) — Todos los chunks dentro de `radius` de cualquier foco, sin duplicados y ordenados de los más cercanos primero.
  - Firma: `fn chunks_within(&self, radius: i32) -> Vec<ChunkCoord> {`

- [`is_within_keep`](chunk_manager.rs#L429) — Si `coord` está dentro del radio `keep` de algún foco.
  - Firma: `fn is_within_keep(&self, coord: ChunkCoord) -> bool {`

- [`saved_entity_state`](chunk_manager.rs#L544) — El estado por instancia que un guardado debe llevar: todo lo que `Entity::restore` no puede reconstruir a partir de
  - Firma: `fn saved_entity_state(entity: &Entity) -> serde_json::Value {`

- [`distance`](chunk_manager.rs#L556) — Distancia de Chebyshev entre dos coordenadas de chunk.
  - Firma: `fn distance(a: ChunkCoord, b: ChunkCoord) -> i32 {`

- [`default`](chunk_manager.rs#L29) — Implementación de `Default`: los radios por defecto (`load`/`prefetch`/`keep`).
  - Firma: `fn default() -> Self {`

### `terrain_world.rs`

#### Funciones internas

- [`replace_columns`](terrain_world.rs#L125) — Sustituye las columnas de un chunk descubierto conservando su visibilidad; el trabajo de colocación la usa para intercambiar las columnas con los caminos ya materializados.
  - Firma: `pub(crate) fn replace_columns( &mut self, coord: ChunkCoord, columns: Vec<TerrainColumn>, ) -> bool {`

- [`connect_roads_into`](terrain_world.rs#L170) — Materializa los caminos de un chunk sobre sus columnas dada la lista de entidades; la usan `connect_roads` y el trabajo de colocación, con la misma lógica en ambos.
  - Firma: `pub(crate) fn connect_roads_into(columns: &mut [TerrainColumn], entities: &[Entity]) -> usize {`

### `placement_job.rs`

#### Funciones internas

- [`place`](placement_job.rs#L29) — Coloca entidades sobre las columnas y materializa sus caminos, inline; el hilo de colocación la ejecuta.
  - Firma: `fn place( mut columns: Vec<TerrainColumn>, catalog: &EntityCatalog, biomes: Option<&WorldBiomes>, wfc: Option<&WfcCatalog>, ) -> PlacementOutcome {`

- [`spawn`](placement_job.rs#L71) — Lanza el trabajo de colocación en un hilo; en `wasm32` lo calcula directamente en el frame.
  - Firma: `pub(crate) fn spawn( coord: ChunkCoord, columns: Vec<TerrainColumn>, catalog: EntityCatalog, biomes: Option<WorldBiomes>, wfc: Option<WfcCatalog>, ) -> Self {`

- [`is_finished`](placement_job.rs#L107) — Si el trabajo está listo para recogerse, con o sin hilo.
  - Firma: `pub(crate) fn is_finished(&self) -> bool {`

- [`take_outcome`](placement_job.rs#L119) — Recoge el resultado si está listo (o espera a que lo esté si `wait`); un hilo que hace panic registra y deja el chunk sin entidades.
  - Firma: `pub(crate) fn take_outcome(&mut self, wait: bool) -> Option<PlacementOutcome> {`

#### Tipos internos

- [`PlacementJob`](placement_job.rs#L53) — El trabajo de colocación de un chunk: desde que se crea hasta que se recoge, o se descarta porque el chunk ya no está descubierto o un guardado lo gobierna.
  - Declaración: `pub(crate) struct PlacementJob { pub(crate) coord: ChunkCoord, state: State }`

- [`PlacementOutcome`](placement_job.rs#L23) — El resultado de una colocación: las columnas con los caminos ya materializados, y las entidades del chunk en orden de columna.
  - Declaración: `pub(crate) struct PlacementOutcome { pub(crate) columns: Vec<TerrainColumn>, pub(crate) entities: Vec<Entity> }`

### `save.rs`

#### Funciones internas

- [`fmt`](save.rs#L76) — Formato legible del error de guardado (`Display`).
  - Firma: `fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {`

- [`parse_chunk`](save.rs#L291) — Parsea un chunk del JSON; `index` entra en los mensajes de error.
  - Firma: `fn parse_chunk(value: &serde_json::Value, index: usize) -> Result<SavedChunk, SaveError> {`

- [`parse_columns`](save.rs#L332) — Parsea la lista de columnas del chunk guardado.
  - Firma: `fn parse_columns( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, ) -> Result<Vec<SavedColumn>, SaveError> {`

- [`parse_column`](save.rs#L352) — Parsea una columna individual del guardado.
  - Firma: `fn parse_column( value: &serde_json::Value, cx: i32, cy: i32, index: usize, ) -> Result<SavedColumn, SaveError> {`

- [`parse_blocks`](save.rs#L405) — Parsea la lista de bloques del chunk guardado.
  - Firma: `fn parse_blocks( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, column_index: usize, ) -> Result<Vec<SavedBlock>, SaveError> {`

- [`parse_block`](save.rs#L426) — Parsea un bloque de una columna guardada.
  - Firma: `fn parse_block( value: &serde_json::Value, cx: i32, cy: i32, column_index: usize, block_index: usize, ) -> Result<SavedBlock, SaveError> {`

- [`parse_entities`](save.rs#L479) — Parsea la lista de entidades del chunk guardado.
  - Firma: `fn parse_entities( obj: &serde_json::Map<String, serde_json::Value>, key: &str, cx: i32, cy: i32, ) -> Result<Vec<SavedEntity>, SaveError> {`

- [`parse_entity`](save.rs#L499) — Parsea una entidad guardada.
  - Firma: `fn parse_entity( value: &serde_json::Value, cx: i32, cy: i32, index: usize, ) -> Result<SavedEntity, SaveError> {`
