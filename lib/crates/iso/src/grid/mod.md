# Grid

Este dominio proporciona las coordenadas tipadas, claves y estructuras espaciales que representan el mundo discreto por celdas y chunks. Es la base común para terreno, entidades, navegación, iluminación y streaming.

Las conversiones entre coordenadas deben vivir aquí cuando preserven la semántica de la rejilla. Los tipos nuevos deben evitar enteros sin contexto y expresar claramente si representan una celda, una columna, una posición local o un chunk.

No decide contenido del mundo ni conoce su representación en pantalla. Sólo define organización espacial y consultas asociadas.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `cell_map.rs`

#### Funciones y métodos

- [`new`](cell_map.rs#L36) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`len`](cell_map.rs#L40) — Devuelve cuántos elementos contiene actualmente la colección o el estado consultado.
  - Firma: `pub fn len(&self) -> usize {`

- [`is_empty`](cell_map.rs#L44) — Indica si la colección o el estado consultado no contiene elementos.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`get`](cell_map.rs#L55) — Devuelve una referencia al valor en `(x, y)`, o `None` si la celda está vacía. La coordenada se valida.
  - Firma: `pub fn get(&self, coord: WorldCoord) -> Result<Option<&T>, GridCoordOutOfRange> {`

- [`get_mut`](cell_map.rs#L63) — Devuelve una referencia mutable al valor en `(x, y)`, o `None` si la celda está vacía.
  - Firma: `pub fn get_mut(&mut self, coord: WorldCoord) -> Result<Option<&mut T>, GridCoordOutOfRange> {`

- [`contains`](cell_map.rs#L71) — Si hay un valor almacenado en `(x, y)`.
  - Firma: `pub fn contains(&self, coord: WorldCoord) -> Result<bool, GridCoordOutOfRange> {`

- [`insert`](cell_map.rs#L76) — Devuelve el valor anterior, si lo hay. Un valor puede ser a su vez un `Option<T>`.
  - Firma: `pub fn insert( &mut self, coord: WorldCoord, value: T, ) -> Result<Option<T>, GridCoordOutOfRange> {`

- [`remove`](cell_map.rs#L104) — Extrae y devuelve el valor en `(x, y)`, o `None` si no había ninguno; el cubo de su chunk se compacta si queda vacío.
  - Firma: `pub fn remove(&mut self, coord: WorldCoord) -> Result<Option<T>, GridCoordOutOfRange> {`

- [`entries`](cell_map.rs#L127) — Itera `(coord, valor)` en orden estable: por chunk (orden de primera inserción) y, dentro de cada chunk, por celda en su orden de inserción.
  - Firma: `pub fn entries(&self) -> impl Iterator<Item = (WorldCoord, &T)> {`

- [`values`](cell_map.rs#L139) — Itera los valores en el mismo orden que `entries`.
  - Firma: `pub fn values(&self) -> impl Iterator<Item = &T> {`

### `coords.rs`

#### Funciones y métodos

- [`assert_grid_coord`](coords.rs#L67) — Comprueba que `coord` está dentro del rango `±MAX_GRID_COORD`; devuelve `GridCoordOutOfRange` en caso contrario.
  - Firma: `pub fn assert_grid_coord(coord: WorldCoord) -> Result<(), GridCoordOutOfRange> {`

- [`cell_key`](coords.rs#L93) — Empaqueta `coord` en una `CellKey` de 64 bits; error si está fuera de rango.
  - Firma: `pub fn cell_key(coord: WorldCoord) -> Result<CellKey, GridCoordOutOfRange> {`

- [`cell_from_key`](coords.rs#L97) — Desempaqueta una `CellKey` de vuelta a `WorldCoord`.
  - Firma: `pub fn cell_from_key(key: CellKey) -> WorldCoord {`

- [`chunk_key`](coords.rs#L101) — Empaqueta `coord` en una `ChunkKey` de 64 bits; error si está fuera de rango.
  - Firma: `pub fn chunk_key(coord: ChunkCoord) -> Result<ChunkKey, GridCoordOutOfRange> {`

- [`chunk_from_key`](coords.rs#L109) — Desempaqueta una `ChunkKey` de vuelta a `ChunkCoord`.
  - Firma: `pub fn chunk_from_key(key: ChunkKey) -> ChunkCoord {`

- [`to_chunk_coord`](coords.rs#L117) — Chunk que contiene a `coord` usando división euclídea, válida también para coordenadas negativas.
  - Firma: `pub fn to_chunk_coord(coord: WorldCoord) -> ChunkCoord {`

- [`to_local_coord`](coords.rs#L124) — Coordenada local de `coord` dentro de su chunk (módulo euclídeo, siempre en `0..CHUNK_SIZE`).
  - Firma: `pub fn to_local_coord(coord: WorldCoord) -> LocalCoord {`

- [`to_world_coord`](coords.rs#L131) — Coordenada de mundo de `local` dentro de `chunk`.
  - Firma: `pub fn to_world_coord(chunk: ChunkCoord, local: LocalCoord) -> WorldCoord {`

- [`chunk_rect`](coords.rs#L138) — Rectángulo de columnas de mundo (cerrado en ambos extremos) que cubre `chunk`.
  - Firma: `pub fn chunk_rect(chunk: ChunkCoord) -> WorldRect {`

- [`chunks_around`](coords.rs#L147) — Todos los chunks del cuadrado de radio `radius` centrado en `centre`, en orden creciente de `c_y` y después de `c_x`.
  - Firma: `pub fn chunks_around(centre: ChunkCoord, radius: i32) -> Vec<ChunkCoord> {`

- [`chunks_in_rect`](coords.rs#L160) — Los chunks que tocan `rect`, en orden creciente de `c_y` y `c_x`; vacío si el rectángulo es inválido (`max` < `min`).
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

- [`contains`](spatial_index.rs#L81) — Si hay un valor almacenado en `(x, y)`.
  - Firma: `pub fn contains(&self, item: &T) -> bool {`

- [`insert`](spatial_index.rs#L94) — Inserta un elemento, ignorando las casillas repetidas en su huella.
  - Firma: `pub fn insert(&mut self, item: T, cells: &[WorldCoord]) -> Result<(), SpatialIndexError> {`

- [`remove`](spatial_index.rs#L119) — Extrae y devuelve el valor en `(x, y)`, o `None` si no había ninguno; el cubo de su chunk se compacta si queda vacío.
  - Firma: `pub fn remove(&mut self, item: &T) -> bool {`

- [`move_item`](spatial_index.rs#L172) — Mueve un elemento existente o inserta uno que falta. Las coordenadas inválidas dejan el índice intacto.
  - Firma: `pub fn move_item(&mut self, item: T, cells: &[WorldCoord]) -> Result<(), SpatialIndexError> {`

- [`at`](spatial_index.rs#L181) — Elementos que ocupan `cell`, en orden de inserción.
  - Firma: `pub fn at(&self, cell: WorldCoord) -> impl Iterator<Item = &T> {`

- [`is_occupied`](spatial_index.rs#L190) — Si al menos un item vivo tiene `cell` en su huella.
  - Firma: `pub fn is_occupied(&self, cell: WorldCoord) -> bool {`

- [`cells_of`](spatial_index.rs#L194) — La huella (casillas) de `item`, o un corte vacío si no está indexado.
  - Firma: `pub fn cells_of(&self, item: &T) -> &[WorldCoord] {`

- [`items`](spatial_index.rs#L200) — Itera los items vivos en orden de inserción.
  - Firma: `pub fn items(&self) -> impl Iterator<Item = &T> {`

- [`query_rect`](spatial_index.rs#L204) — Los items vivos cuya huella toca `rect`, en orden de inserción y sin repetidos.
  - Firma: `pub fn query_rect(&self, rect: WorldRect) -> Vec<&T> {`

- [`query_rect_where`](spatial_index.rs#L208) — Como `query_rect` pero solo los items que pasan `filter`.
  - Firma: `pub fn query_rect_where(&self, rect: WorldRect, mut filter: impl FnMut(&T) -> bool) -> Vec<&T> {`

- [`any_in_rect`](spatial_index.rs#L226) — Si algún item vivo pasa `filter` y toca `rect`; elige la vía más barata entre recorrer el rect o los items.
  - Firma: `pub fn any_in_rect(&self, rect: WorldRect, mut filter: impl FnMut(&T) -> bool) -> bool {`

- [`query_radius`](spatial_index.rs#L254) — Consulta por radio de Chebyshev, incluidas las casillas diagonales.
  - Firma: `pub fn query_radius(&self, centre: WorldCoord, radius: i32) -> Vec<&T> {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `cell_map.rs`

#### Funciones internas

- [`default`](cell_map.rs#L26) — Implementación de `Default`: el contenedor vacío.
  - Firma: `fn default() -> Self {`

- [`location`](cell_map.rs#L48) — Resuelve `(chunk, índice local)` de una coordenada, validando el rango.
  - Firma: `fn location(coord: WorldCoord) -> Result<(ChunkCoord, i32), GridCoordOutOfRange> {`

### `coords.rs`

#### Funciones internas

- [`fmt`](coords.rs#L60) — Formato del error para `std::fmt::Display`.
  - Firma: `fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {`

- [`pack_key`](coords.rs#L79) — Empaqueta una coordenada ya validada en `u64` (`x * SPAN + y`).
  - Firma: `fn pack_key(coord: WorldCoord) -> Result<u64, GridCoordOutOfRange> {`

- [`unpack_key`](coords.rs#L86) — Inversa de `pack_key`.
  - Firma: `fn unpack_key(key: u64) -> WorldCoord {`

#### Constantes internas

- [`SPAN`](coords.rs#L7) — Capacidad de cada eje en la clave empaquetada: `2 * MAX_GRID_COORD + 1`.
  - Declaración: `const SPAN: u64 = (2 * MAX_GRID_COORD + 1) as u64;`

### `spatial_index.rs`

#### Funciones internas

- [`default`](spatial_index.rs#L25) — Implementación de `Default`: el contenedor vacío.
  - Firma: `fn default() -> Self {`

- [`hash_of`](spatial_index.rs#L36) — Hash por defecto (`DefaultHasher`) de un item.
  - Firma: `fn hash_of<T: Hash>(item: &T) -> u64 {`

- [`fmt`](spatial_index.rs#L49) — Formato del error para `std::fmt::Display`.
  - Firma: `fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {`

- [`slot_of`](spatial_index.rs#L73) — Slot que contiene `item`, encontrado por hash y confirmado por igualdad.
  - Firma: `fn slot_of(&self, item: &T) -> Option<usize> {`

- [`live`](spatial_index.rs#L86) — Elementos vivos con su slot, en orden de inserción.
  - Firma: `fn live(&self) -> impl Iterator<Item = (usize, &T)> {`

- [`compact_if_sparse`](spatial_index.rs#L145) — Recupera los slots eliminados cuando superan en número a los elementos vivos, de modo que un índice que se mueve
  - Firma: `fn compact_if_sparse(&mut self) {`
