# Entities

Este dominio define blueprints, instancias de entidades, sus reglas de validación y la colocación determinista sobre el terreno. Reúne los invariantes que permiten que una entidad sea válida antes de que un cliente la represente.

Los blueprints son contratos de datos persistentes y deben conservar compatibilidad de serialización. Las validaciones se concentran aquí para que importadores, generación y edición compartan las mismas reglas.

No contiene sprites, nodos de escena ni efectos visuales. La apariencia y el renderizado se resuelven en los dominios de assets y de cliente.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

`EntityPlacement` incluye `road_access` (serializado como `roadAccess`): cuando es `true`, la instancia solicita una entrada a la red de caminos materializada por `world` tras el pase de colocación. Si falta, vale `false` y mantiene la compatibilidad del catálogo.

### `entity.rs`

#### Funciones y métodos

- [`create_entity_id`](entity.rs#L57) — Construye el id por defecto de una entidad generada con su ancla en `(x, y)`.
  - Firma: `pub fn create_entity_id(type_: &str, x: i32, y: i32) -> String {`

- [`new`](entity.rs#L83) — Crea una entidad erguida anclada en `(x, y)` sobre `elevation`, a partir de un blueprint validado.
  - Firma: `pub fn new(x: i32, y: i32, blueprint: &EntityBlueprint, elevation: i32) -> Self {`

- [`from_data`](entity.rs#L112) — Restaura una entidad a partir de datos producidos previamente (p. ej. desde un guardado).
  - Firma: `pub fn from_data(x: i32, y: i32, data: EntityData) -> Self {`

- [`restore`](entity.rs#L117) — Restaura una instancia guardada de `blueprint`.
  - Firma: `pub fn restore( x: i32, y: i32, blueprint: &EntityBlueprint, elevation: i32, id: String, color_variant: Option<u32>, metadata: serde_json::Value, ) -> Self {`

- [`x`](entity.rs#L133) — Calcula o recupera «x» según los parámetros de la firma.
  - Firma: `pub fn x(&self) -> i32 {`

- [`y`](entity.rs#L136) — Calcula o recupera «y» según los parámetros de la firma.
  - Firma: `pub fn y(&self) -> i32 {`

- [`id`](entity.rs#L139) — Calcula o recupera «id» según los parámetros de la firma.
  - Firma: `pub fn id(&self) -> &str {`

- [`type_`](entity.rs#L142) — Calcula o recupera «type » según los parámetros de la firma.
  - Firma: `pub fn type_(&self) -> &str {`

- [`walkable`](entity.rs#L145) — Calcula o recupera «walkable» según los parámetros de la firma.
  - Firma: `pub fn walkable(&self) -> bool {`

- [`elevation`](entity.rs#L148) — Calcula o recupera «elevation» según los parámetros de la firma.
  - Firma: `pub fn elevation(&self) -> i32 {`

- [`height`](entity.rs#L151) — Calcula o recupera «height» según los parámetros de la firma.
  - Firma: `pub fn height(&self) -> i32 {`

- [`length`](entity.rs#L154) — Calcula o recupera «length» según los parámetros de la firma.
  - Firma: `pub fn length(&self) -> i32 {`

- [`length_axis`](entity.rs#L157) — Calcula o recupera «length axis» según los parámetros de la firma.
  - Firma: `pub fn length_axis(&self) -> Option<EntityLengthAxis> {`

- [`gap`](entity.rs#L160) — Calcula o recupera «gap» según los parámetros de la firma.
  - Firma: `pub fn gap(&self) -> Option<i32> {`
- [`road_access`](entity.rs) — Indica si la instancia necesita una entrada conectada a la red de caminos.
  - Firma: `pub fn road_access(&self) -> bool {`

- [`texture_source`](entity.rs#L167) — Calcula o recupera «texture source» según los parámetros de la firma.
  - Firma: `pub fn texture_source(&self) -> &str {`

- [`debug`](entity.rs#L170) — Calcula o recupera «debug» según los parámetros de la firma.
  - Firma: `pub fn debug(&self) -> Option<bool> {`

- [`color_replacements`](entity.rs#L173) — Calcula o recupera «color replacements» según los parámetros de la firma.
  - Firma: `pub fn color_replacements(&self) -> Option<&serde_json::Value> {`

- [`color_variant`](entity.rs#L176) — Calcula o recupera «color variant» según los parámetros de la firma.
  - Firma: `pub fn color_variant(&self) -> Option<u32> {`

- [`sway`](entity.rs#L179) — Calcula o recupera «sway» según los parámetros de la firma.
  - Firma: `pub fn sway(&self) -> Option<&EntitySway> {`

- [`collision`](entity.rs#L182) — Calcula o recupera «collision» según los parámetros de la firma.
  - Firma: `pub fn collision(&self) -> Option<&EntityCollision> {`

- [`contact_shadow`](entity.rs#L185) — Calcula o recupera «contact shadow» según los parámetros de la firma.
  - Firma: `pub fn contact_shadow(&self) -> Option<bool> {`

- [`reflection_source`](entity.rs#L188) — Calcula o recupera «reflection source» según los parámetros de la firma.
  - Firma: `pub fn reflection_source(&self) -> Option<&str> {`

- [`metadata`](entity.rs#L191) — Calcula o recupera «metadata» según los parámetros de la firma.
  - Firma: `pub fn metadata(&self) -> &serde_json::Value {`

- [`collision_at`](entity.rs#L196) — Lado del cuadrado, centrado en la columna `(x, y)`, en el que la entidad bloquea el movimiento, como un
  - Firma: `pub fn collision_at(&self, x: i32, y: i32) -> f64 {`

- [`get_data`](entity.rs#L215) — Devuelve un clon de los datos de la entidad.
  - Firma: `pub fn get_data(&self) -> EntityData {`

- [`get_entity_footprint`](entity.rs#L224) — Columnas cubiertas por una huella de `length` bloques anclada en `anchor`, a lo largo de `lengthAxis`
  - Firma: `pub fn get_entity_footprint( anchor: WorldCoord, length: i32, axis: EntityLengthAxis, ) -> Vec<WorldCoord> {`

- [`get_entity_footprint_for`](entity.rs#L248) — Columnas cubiertas por una entidad.
  - Firma: `pub fn get_entity_footprint_for(entity: &Entity) -> Vec<WorldCoord> {`

- [`index_entities`](entity.rs#L260) — Construye el índice espacial de `entities` sobre sus huellas completas: lo que ocupa cada
  - Firma: `pub fn index_entities(entities: &[Entity]) -> SpatialIndex<Entity> {`

### `placement.rs`

#### Funciones y métodos

- [`new`](placement.rs#L54) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(columns: &'a CellMap<TerrainColumn>, placed: &'a mut SpatialIndex<Entity>) -> Self {`

- [`column`](placement.rs#L58) — Calcula o recupera «column» según los parámetros de la firma.
  - Firma: `pub fn column(&self, x: i32, y: i32) -> Option<&TerrainColumn> {`

- [`is_taken`](placement.rs#L62) — Evalúa si se cumple la condición «taken» para el estado recibido.
  - Firma: `pub fn is_taken(&self, x: i32, y: i32) -> bool {`

- [`place_entities`](placement.rs#L93) — Coloca entidades sobre `columns` con las reglas por defecto.
  - Firma: `pub fn place_entities(columns: &[TerrainColumn], catalog: &EntityCatalog) -> PlacementResult {`

- [`place_entities_with`](placement.rs#L98) — Coloca entidades sobre `columns`, una instancia por cada columna ancla válida que permite la densidad
  - Firma: `pub fn place_entities_with( columns: &[TerrainColumn], catalog: &EntityCatalog, rules: PlacementRules, ) -> PlacementResult {`

- [`PlacementContent`](placement.rs#L108) — El contenido de colocación del pase: los biomas del mundo, el catálogo wfc del resto y la semilla de sus tiradas.
  - Declaración: `pub struct PlacementContent<'a> { pub biomes: Option<&'a WorldBiomes>, pub wfc: Option<&'a WfcCatalog>, pub seed: u64, }`

- [`place_entities_with_biomes`](placement.rs#L123) — Coloca entidades sobre `columns`, confinando las especies que los biomas reclaman a sus propias regiones: un blueprint que algún bioma lista solo brota donde el bioma cubre la columna y su picker de bosquete devuelve esa especie, así que los bosquetes son monospecíficos y las reglas de densidad y hueco se aplican como siempre. `None` restaura el comportamiento sin biomas. Es un atajo al camino sin wfc.
  - Firma: `pub fn place_entities_with_biomes( columns: &[TerrainColumn], catalog: &EntityCatalog, rules: PlacementRules, biomes: Option<&WorldBiomes>, ) -> PlacementResult {`

- [`place_entities_with_content`](placement.rs#L147) — Coloca entidades sobre `columns`: el pase de biomas primero, el solver wfc después para todo lo que ningún bioma reclama, ambos sobre el mismo índice espacial para que nada se solape. Sin catálogo wfc, el comportamiento es el mismo que [`place_entities_with_biomes`].
  - Firma: `pub fn place_entities_with_content( columns: &[TerrainColumn], catalog: &EntityCatalog, rules: PlacementRules, content: PlacementContent<'_>, ) -> PlacementResult {`

### `wfc.rs`

#### Funciones y métodos

- [`weight_of`](wfc.rs#L178) — El peso de `blueprint`, o `0.0` cuando el contenido no lo lista (nunca crece).
  - Firma: `pub fn weight_of(&self, blueprint: &str) -> f64 {`

- [`parse_wfc`](wfc.rs#L185) — Parsea y valida el contenido wfc contra el catálogo de entidades que referencia, y contra los biomas (cuando se pasan) para exigir un peso a cada blueprint que ningún bioma reclama.
  - Firma: `pub fn parse_wfc( json: &str, entities: &EntityCatalog, biomes: Option<&crate::biomes::catalog::BiomeCatalog>, ) -> Result<WfcCatalog, WfcError> {`

- [`claimed_by_biomes`](wfc.rs#L347) — Qué blueprints ya reclaman los biomas, en orden de catálogo; el solver omite esos del mosaico.
  - Firma: `pub fn claimed_by_biomes( entities: &EntityCatalog, biomes: Option<&crate::biomes::field::WorldBiomes>, ) -> Vec<bool> {`

- [`solve_chunk`](wfc.rs#L602) — Resuelve el chunk y devuelve las entidades que crece, en orden de columna. El solver es por chunk y no consulta a los vecinos: cada posibilidad se comprueba contra el terreno, así que un chunk sale igual que junto a sus vecinos; la vacancia siempre es posible, de modo que el mosaico nunca entra en contradicción. Al llegar al techo de `maxPerChunk` para un blueprint o familia, sus posibilidades dejan de crecer en el resto del chunk.
  - Firma: `pub fn solve_chunk( columns: &[TerrainColumn], catalog: &EntityCatalog, wfc: &WfcCatalog, claimed: &[bool], placed: &mut SpatialIndex<Entity>, seed: u64, ) -> Vec<Entity> {`

#### Constantes

- [`WFC_SCHEMA_VERSION`](wfc.rs#L15) — El esquema de contenido wfc que este validador acepta; la 2 añade `families` y `maxPerChunk`.
  - Declaración: `pub const WFC_SCHEMA_VERSION: u32 = 2;`

#### Tipos

- [`WfcCatalog`](wfc.rs#L163) — El contenido wfc validado: `emptyWeight` (cuánto pesa «aquí no crece nada» frente a un blueprint), los pesos por blueprint, `families` (grupos que comparten techo: `office` junta `office_x`/`office_y`) y `maxPerChunk` (techo por chunk, indexado por id de familia o de blueprint). Los blueprints que ningún bioma reclama deben aparecer en `weights`, o el mundo se quedaría en silencio.
  - Declaración: `pub struct WfcCatalog { pub schema_version: u32, pub empty_weight: f64, pub weights: HashMap<String, f64>, pub families: HashMap<String, Vec<String>>, pub max_per_chunk: HashMap<String, f64>, }`

- [`WfcError`](wfc.rs#L22) — Todo lo que el contenido wfc puede declarar mal: esquema no soportado, JSON ilegible, `emptyWeight` o pesos no positivos, `blueprint` que el catálogo de entidades no tiene, un blueprint sin reclamar que nadie pesa; claves de techo ajenas a todo, techos inferiores a 1, familias vacías con blueprints repetidos entre familias o que chocan con un blueprint.
  - Declaración: `pub enum WfcError { ... }`

### `validation.rs`

#### Funciones y métodos

- [`validate_catalog`](validation.rs#L48) — Valida un catálogo completo: versión de esquema, ids únicos y cada blueprint (incl. `sway`: solo en entidades de una casilla, `cut` en `(0, 1)`, `amplitude` y `period` finitos y no negativos).
  - Firma: `pub fn validate_catalog(catalog: &EntityCatalog) -> Result<(), CatalogError> {`

#### Constantes

- [`CATALOG_SCHEMA_VERSION`](validation.rs#L8) — El esquema de catálogo que este validador acepta.
  - Declaración: `pub const CATALOG_SCHEMA_VERSION: u32 = 1;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `entity.rs`

#### Funciones internas

- [`eq`](entity.rs#L70) — Calcula o recupera «eq» según los parámetros de la firma.
  - Firma: `fn eq(&self, other: &Self) -> bool {`

- [`hash`](entity.rs#L76) — Calcula o recupera «hash» según los parámetros de la firma.
  - Firma: `fn hash<H: std::hash::Hasher>(&self, state: &mut H) {`

### `placement.rs`

#### Funciones internas

- [`placement_roll`](placement.rs#L26) — Roll determinista para un blueprint en una columna, usado como su probabilidad de aparición.
  - Firma: `fn placement_roll(id: &str, x: i32, y: i32) -> u64 {`

- [`default`](placement.rs#L84) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`find_placement`](placement.rs#L262) — Valida una instancia de `blueprint` anclada en `column`.
  - Firma: `fn find_placement( anchor: WorldCoord, blueprint: &EntityBlueprint, context: &mut PlacementContext, gap: i32, ) -> Option<Placement> {`

#### Constantes internas

- [`DEFAULT_GAP`](placement.rs#L20) — Bloques libres mínimos entre instancias de la misma entidad cuando el catálogo no indica
  - Declaración: `const DEFAULT_GAP: i32 = 1;`

- [`DEFAULT_DENSITY`](placement.rs#L23) — Columnas por instancia de un blueprint, de media.
  - Declaración: `const DEFAULT_DENSITY: u64 = 400;`

- [`OFFSET`](placement.rs#L27) — Define el parámetro interno «OFFSET» empleado por este módulo.
  - Declaración: `const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;`

- [`PRIME`](placement.rs#L28) — Define el parámetro interno «PRIME» empleado por este módulo.
  - Declaración: `const PRIME: u64 = 0x1000_0000_01b3;`

### `wfc.rs`

#### Funciones y métodos

- [`weight_of`](wfc.rs#L178) — El peso de `blueprint`, o `0.0` cuando el contenido no lo lista (nunca crece).
  - Firma: `pub fn weight_of(&self, blueprint: &str) -> f64 {`

- [`parse_wfc`](wfc.rs#L185) — Parsea y valida el contenido wfc contra el catálogo de entidades que referencia, y contra los biomas (cuando se pasan) para exigir un peso a cada blueprint que ningún bioma reclama.
  - Firma: `pub fn parse_wfc( json: &str, entities: &EntityCatalog, biomes: Option<&crate::biomes::catalog::BiomeCatalog>, ) -> Result<WfcCatalog, WfcError> {`

- [`claimed_by_biomes`](wfc.rs#L347) — Qué blueprints ya reclaman los biomas, en orden de catálogo; el solver omite esos del mosaico.
  - Firma: `pub fn claimed_by_biomes( entities: &EntityCatalog, biomes: Option<&crate::biomes::field::WorldBiomes>, ) -> Vec<bool> {`

- [`solve_chunk`](wfc.rs#L602) — Resuelve el chunk y devuelve las entidades que crece, en orden de columna. El solver es por chunk y no consulta a los vecinos: cada posibilidad se comprueba contra el terreno, así que un chunk sale igual que junto a sus vecinos; la vacancia siempre es posible, de modo que el mosaico nunca entra en contradicción. Al llegar al techo de `maxPerChunk` para un blueprint o familia, sus posibilidades dejan de crecer en el resto del chunk.
  - Firma: `pub fn solve_chunk( columns: &[TerrainColumn], catalog: &EntityCatalog, wfc: &WfcCatalog, claimed: &[bool], placed: &mut SpatialIndex<Entity>, seed: u64, ) -> Vec<Entity> {`

#### Constantes

- [`WFC_SCHEMA_VERSION`](wfc.rs#L15) — El esquema de contenido wfc que este validador acepta; la 2 añade `families` y `maxPerChunk`.
  - Declaración: `pub const WFC_SCHEMA_VERSION: u32 = 2;`

#### Tipos

- [`WfcCatalog`](wfc.rs#L163) — El contenido wfc validado: `emptyWeight` (cuánto pesa «aquí no crece nada» frente a un blueprint), los pesos por blueprint, `families` (grupos que comparten techo: `office` junta `office_x`/`office_y`) y `maxPerChunk` (techo por chunk, indexado por id de familia o de blueprint). Los blueprints que ningún bioma reclama deben aparecer en `weights`, o el mundo se quedaría en silencio.
  - Declaración: `pub struct WfcCatalog { pub schema_version: u32, pub empty_weight: f64, pub weights: HashMap<String, f64>, pub families: HashMap<String, Vec<String>>, pub max_per_chunk: HashMap<String, f64>, }`

- [`WfcError`](wfc.rs#L22) — Todo lo que el contenido wfc puede declarar mal: esquema no soportado, JSON ilegible, `emptyWeight` o pesos no positivos, `blueprint` que el catálogo de entidades no tiene, un blueprint sin reclamar que nadie pesa; claves de techo ajenas a todo, techos inferiores a 1, familias vacías con blueprints repetidos entre familias o que chocan con un blueprint.
  - Declaración: `pub enum WfcError { ... }`

### `validation.rs`

#### Funciones internas

- [`fmt`](validation.rs#L22) — Calcula o recupera «fmt» según los parámetros de la firma.
  - Firma: `fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {`

- [`validate_blueprint`](validation.rs#L71) — Valida un único blueprint.
  - Firma: `fn validate_blueprint(blueprint: &EntityBlueprint) -> Result<(), CatalogError> {`
