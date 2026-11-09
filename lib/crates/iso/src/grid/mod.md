# Grid

Este dominio proporciona las coordenadas tipadas, claves y estructuras espaciales que representan el mundo discreto por celdas y chunks. Es la base común para terreno, entidades, navegación, iluminación y streaming.

Las conversiones entre coordenadas deben vivir aquí cuando preserven la semántica de la rejilla. Los tipos nuevos deben evitar enteros sin contexto y expresar claramente si representan una celda, una columna, una posición local o un chunk.

No decide contenido del mundo ni conoce su representación en pantalla. Sólo define organización espacial y consultas asociadas.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `cell_map.rs`

#### Funciones y métodos

- [`new`](cell_map.rs#L34) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`len`](cell_map.rs#L38) — Devuelve cuántos elementos contiene actualmente la colección o el estado consultado.
  - Firma: `pub fn len(&self) -> usize {`

- [`is_empty`](cell_map.rs#L42) — Indica si la colección o el estado consultado no contiene elementos.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`get`](cell_map.rs#L53) — Calcula o recupera «get» según los parámetros de la firma.
  - Firma: `pub fn get(&self, coord: WorldCoord) -> Result<Option<&T>, GridCoordOutOfRange> {`

- [`get_mut`](cell_map.rs#L61) — Obtiene «mut» sin modificar el estado consultado.
  - Firma: `pub fn get_mut(&mut self, coord: WorldCoord) -> Result<Option<&mut T>, GridCoordOutOfRange> {`

- [`contains`](cell_map.rs#L69) — Calcula o recupera «contains» según los parámetros de la firma.
  - Firma: `pub fn contains(&self, coord: WorldCoord) -> Result<bool, GridCoordOutOfRange> {`

- [`insert`](cell_map.rs#L74) — Returns the previous value, if any. A value can itself be an `Option<T>`.
  - Firma: `pub fn insert( &mut self, coord: WorldCoord, value: T, ) -> Result<Option<T>, GridCoordOutOfRange> {`

- [`remove`](cell_map.rs#L102) — Elimina «remove» del estado o colección administrada.
  - Firma: `pub fn remove(&mut self, coord: WorldCoord) -> Result<Option<T>, GridCoordOutOfRange> {`

- [`entries`](cell_map.rs#L125) — Calcula o recupera «entries» según los parámetros de la firma.
  - Firma: `pub fn entries(&self) -> impl Iterator<Item = (WorldCoord, &T)> {`

- [`values`](cell_map.rs#L137) — Calcula o recupera «values» según los parámetros de la firma.
  - Firma: `pub fn values(&self) -> impl Iterator<Item = &T> {`

### `coords.rs`

#### Funciones y métodos

- [`assert_grid_coord`](coords.rs#L67) — Calcula o recupera «assert grid coord» según los parámetros de la firma.
  - Firma: `pub fn assert_grid_coord(coord: WorldCoord) -> Result<(), GridCoordOutOfRange> {`

- [`cell_key`](coords.rs#L93) — Calcula o recupera «cell key» según los parámetros de la firma.
  - Firma: `pub fn cell_key(coord: WorldCoord) -> Result<CellKey, GridCoordOutOfRange> {`

- [`cell_from_key`](coords.rs#L97) — Calcula o recupera «cell from key» según los parámetros de la firma.
  - Firma: `pub fn cell_from_key(key: CellKey) -> WorldCoord {`

- [`chunk_key`](coords.rs#L101) — Calcula o recupera «chunk key» según los parámetros de la firma.
  - Firma: `pub fn chunk_key(coord: ChunkCoord) -> Result<ChunkKey, GridCoordOutOfRange> {`

- [`chunk_from_key`](coords.rs#L109) — Calcula o recupera «chunk from key» según los parámetros de la firma.
  - Firma: `pub fn chunk_from_key(key: ChunkKey) -> ChunkCoord {`

- [`to_chunk_coord`](coords.rs#L117) — Convierte el valor de entrada a «chunk coord» conservando la semántica del tipo de salida.
  - Firma: `pub fn to_chunk_coord(coord: WorldCoord) -> ChunkCoord {`

- [`to_local_coord`](coords.rs#L124) — Convierte el valor de entrada a «local coord» conservando la semántica del tipo de salida.
  - Firma: `pub fn to_local_coord(coord: WorldCoord) -> LocalCoord {`

- [`to_world_coord`](coords.rs#L131) — Convierte el valor de entrada a «world coord» conservando la semántica del tipo de salida.
  - Firma: `pub fn to_world_coord(chunk: ChunkCoord, local: LocalCoord) -> WorldCoord {`

- [`chunk_rect`](coords.rs#L138) — Calcula o recupera «chunk rect» según los parámetros de la firma.
  - Firma: `pub fn chunk_rect(chunk: ChunkCoord) -> WorldRect {`

- [`chunks_around`](coords.rs#L147) — Calcula o recupera «chunks around» según los parámetros de la firma.
  - Firma: `pub fn chunks_around(centre: ChunkCoord, radius: i32) -> Vec<ChunkCoord> {`

- [`chunks_in_rect`](coords.rs#L160) — Calcula o recupera «chunks in rect» según los parámetros de la firma.
  - Firma: `pub fn chunks_in_rect(rect: WorldRect) -> Vec<ChunkCoord> {`

- [`as_u64`](coords.rs#L39) — Devuelve la representación numérica estable de una clave de celda.
  - Firma: `pub const fn as_u64(self) -> u64 {`

- [`as_u64`](coords.rs#L48) — Devuelve la representación numérica estable de una clave de chunk.
  - Firma: `pub const fn as_u64(self) -> u64 {`

#### Constantes

- [`CHUNK_SIZE`](coords.rs#L5) — Define el número de celdas de cada eje que contiene un chunk.
  - Declaración: `pub const CHUNK_SIZE: i32 = 32;`

- [`MAX_GRID_COORD`](coords.rs#L6) — Define el valor absoluto máximo admitido para cada coordenada de rejilla.
  - Declaración: `pub const MAX_GRID_COORD: i32 = (1 << 20) - 1;`

### `spatial_index.rs`

#### Funciones y métodos

- [`new`](spatial_index.rs#L60) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`len`](spatial_index.rs#L64) — Devuelve cuántos elementos contiene actualmente la colección o el estado consultado.
  - Firma: `pub fn len(&self) -> usize {`

- [`is_empty`](spatial_index.rs#L68) — Indica si la colección o el estado consultado no contiene elementos.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`contains`](spatial_index.rs#L81) — Calcula o recupera «contains» según los parámetros de la firma.
  - Firma: `pub fn contains(&self, item: &T) -> bool {`

- [`insert`](spatial_index.rs#L94) — Insert an item, ignoring repeated cells in its footprint.
  - Firma: `pub fn insert(&mut self, item: T, cells: &[WorldCoord]) -> Result<(), SpatialIndexError> {`

- [`remove`](spatial_index.rs#L119) — Elimina «remove» del estado o colección administrada.
  - Firma: `pub fn remove(&mut self, item: &T) -> bool {`

- [`move_item`](spatial_index.rs#L172) — Move an existing item or insert a missing one. Invalid coordinates leave the index intact.
  - Firma: `pub fn move_item(&mut self, item: T, cells: &[WorldCoord]) -> Result<(), SpatialIndexError> {`

- [`at`](spatial_index.rs#L181) — Items occupying `cell`, in insertion order.
  - Firma: `pub fn at(&self, cell: WorldCoord) -> impl Iterator<Item = &T> {`

- [`is_occupied`](spatial_index.rs#L190) — Evalúa si se cumple la condición «occupied» para el estado recibido.
  - Firma: `pub fn is_occupied(&self, cell: WorldCoord) -> bool {`

- [`cells_of`](spatial_index.rs#L194) — Calcula o recupera «cells of» según los parámetros de la firma.
  - Firma: `pub fn cells_of(&self, item: &T) -> &[WorldCoord] {`

- [`items`](spatial_index.rs#L200) — Calcula o recupera «items» según los parámetros de la firma.
  - Firma: `pub fn items(&self) -> impl Iterator<Item = &T> {`

- [`query_rect`](spatial_index.rs#L204) — Calcula o recupera «query rect» según los parámetros de la firma.
  - Firma: `pub fn query_rect(&self, rect: WorldRect) -> Vec<&T> {`

- [`query_rect_where`](spatial_index.rs#L208) — Calcula o recupera «query rect where» según los parámetros de la firma.
  - Firma: `pub fn query_rect_where(&self, rect: WorldRect, mut filter: impl FnMut(&T) -> bool) -> Vec<&T> {`

- [`any_in_rect`](spatial_index.rs#L226) — Calcula o recupera «any in rect» según los parámetros de la firma.
  - Firma: `pub fn any_in_rect(&self, rect: WorldRect, mut filter: impl FnMut(&T) -> bool) -> bool {`

- [`query_radius`](spatial_index.rs#L254) — Chebyshev-radius query, including diagonal cells.
  - Firma: `pub fn query_radius(&self, centre: WorldCoord, radius: i32) -> Vec<&T> {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `cell_map.rs`

#### Funciones internas

- [`default`](cell_map.rs#L24) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`location`](cell_map.rs#L46) — Calcula o recupera «location» según los parámetros de la firma.
  - Firma: `fn location(coord: WorldCoord) -> Result<(ChunkCoord, i32), GridCoordOutOfRange> {`

### `coords.rs`

#### Funciones internas

- [`fmt`](coords.rs#L60) — Calcula o recupera «fmt» según los parámetros de la firma.
  - Firma: `fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {`

- [`pack_key`](coords.rs#L79) — Calcula o recupera «pack key» según los parámetros de la firma.
  - Firma: `fn pack_key(coord: WorldCoord) -> Result<u64, GridCoordOutOfRange> {`

- [`unpack_key`](coords.rs#L86) — Calcula o recupera «unpack key» según los parámetros de la firma.
  - Firma: `fn unpack_key(key: u64) -> WorldCoord {`

#### Constantes internas

- [`SPAN`](coords.rs#L7) — Define el parámetro interno «SPAN» empleado por este módulo.
  - Declaración: `const SPAN: u64 = (2 * MAX_GRID_COORD + 1) as u64;`

### `spatial_index.rs`

#### Funciones internas

- [`default`](spatial_index.rs#L25) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`hash_of`](spatial_index.rs#L36) — Calcula o recupera «hash of» según los parámetros de la firma.
  - Firma: `fn hash_of<T: Hash>(item: &T) -> u64 {`

- [`fmt`](spatial_index.rs#L49) — Calcula o recupera «fmt» según los parámetros de la firma.
  - Firma: `fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {`

- [`slot_of`](spatial_index.rs#L73) — Slot holding `item`, found by hash and confirmed by equality.
  - Firma: `fn slot_of(&self, item: &T) -> Option<usize> {`

- [`live`](spatial_index.rs#L86) — Live items with their slot, in insertion order.
  - Firma: `fn live(&self) -> impl Iterator<Item = (usize, &T)> {`

- [`compact_if_sparse`](spatial_index.rs#L145) — Reclaims removed slots once they outnumber the live items, so an index that is moved
  - Firma: `fn compact_if_sparse(&mut self) {`
