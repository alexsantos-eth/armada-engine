# Entities

Este dominio define blueprints, instancias de entidades, sus reglas de validación y la colocación determinista sobre el terreno. Reúne los invariantes que permiten que una entidad sea válida antes de que un cliente la represente.

Los blueprints son contratos de datos persistentes y deben conservar compatibilidad de serialización. Las validaciones se concentran aquí para que importadores, generación y edición compartan las mismas reglas.

No contiene sprites, nodos de escena ni efectos visuales. La apariencia y el renderizado se resuelven en los dominios de assets y de cliente.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `entity.rs`

#### Funciones y métodos

- [`create_entity_id`](entity.rs#L55) — Construye el id por defecto de una entidad generada con su ancla en `(x, y)`.
  - Firma: `pub fn create_entity_id(type_: &str, x: i32, y: i32) -> String {`

- [`new`](entity.rs#L81) — Crea una entidad erguida anclada en `(x, y)` sobre `elevation`, a partir de un blueprint validado.
  - Firma: `pub fn new(x: i32, y: i32, blueprint: &EntityBlueprint, elevation: i32) -> Self {`

- [`from_data`](entity.rs#L109) — Restaura una entidad a partir de datos producidos previamente (p. ej. desde un guardado).
  - Firma: `pub fn from_data(x: i32, y: i32, data: EntityData) -> Self {`

- [`restore`](entity.rs#L114) — Restaura una instancia guardada de `blueprint`.
  - Firma: `pub fn restore( x: i32, y: i32, blueprint: &EntityBlueprint, elevation: i32, id: String, color_variant: Option<u32>, metadata: serde_json::Value, ) -> Self {`

- [`x`](entity.rs#L130) — Calcula o recupera «x» según los parámetros de la firma.
  - Firma: `pub fn x(&self) -> i32 {`

- [`y`](entity.rs#L133) — Calcula o recupera «y» según los parámetros de la firma.
  - Firma: `pub fn y(&self) -> i32 {`

- [`id`](entity.rs#L136) — Calcula o recupera «id» según los parámetros de la firma.
  - Firma: `pub fn id(&self) -> &str {`

- [`type_`](entity.rs#L139) — Calcula o recupera «type » según los parámetros de la firma.
  - Firma: `pub fn type_(&self) -> &str {`

- [`walkable`](entity.rs#L142) — Calcula o recupera «walkable» según los parámetros de la firma.
  - Firma: `pub fn walkable(&self) -> bool {`

- [`elevation`](entity.rs#L145) — Calcula o recupera «elevation» según los parámetros de la firma.
  - Firma: `pub fn elevation(&self) -> i32 {`

- [`height`](entity.rs#L148) — Calcula o recupera «height» según los parámetros de la firma.
  - Firma: `pub fn height(&self) -> i32 {`

- [`length`](entity.rs#L151) — Calcula o recupera «length» según los parámetros de la firma.
  - Firma: `pub fn length(&self) -> i32 {`

- [`length_axis`](entity.rs#L154) — Calcula o recupera «length axis» según los parámetros de la firma.
  - Firma: `pub fn length_axis(&self) -> Option<EntityLengthAxis> {`

- [`gap`](entity.rs#L157) — Calcula o recupera «gap» según los parámetros de la firma.
  - Firma: `pub fn gap(&self) -> Option<i32> {`

- [`texture_source`](entity.rs#L160) — Calcula o recupera «texture source» según los parámetros de la firma.
  - Firma: `pub fn texture_source(&self) -> &str {`

- [`debug`](entity.rs#L163) — Calcula o recupera «debug» según los parámetros de la firma.
  - Firma: `pub fn debug(&self) -> Option<bool> {`

- [`color_replacements`](entity.rs#L166) — Calcula o recupera «color replacements» según los parámetros de la firma.
  - Firma: `pub fn color_replacements(&self) -> Option<&serde_json::Value> {`

- [`color_variant`](entity.rs#L169) — Calcula o recupera «color variant» según los parámetros de la firma.
  - Firma: `pub fn color_variant(&self) -> Option<u32> {`

- [`sway`](entity.rs#L172) — Calcula o recupera «sway» según los parámetros de la firma.
  - Firma: `pub fn sway(&self) -> Option<&EntitySway> {`

- [`collision`](entity.rs#L175) — Calcula o recupera «collision» según los parámetros de la firma.
  - Firma: `pub fn collision(&self) -> Option<&EntityCollision> {`

- [`contact_shadow`](entity.rs#L178) — Calcula o recupera «contact shadow» según los parámetros de la firma.
  - Firma: `pub fn contact_shadow(&self) -> Option<bool> {`

- [`reflection_source`](entity.rs#L181) — Calcula o recupera «reflection source» según los parámetros de la firma.
  - Firma: `pub fn reflection_source(&self) -> Option<&str> {`

- [`metadata`](entity.rs#L184) — Calcula o recupera «metadata» según los parámetros de la firma.
  - Firma: `pub fn metadata(&self) -> &serde_json::Value {`

- [`collision_at`](entity.rs#L189) — Lado del cuadrado, centrado en la columna `(x, y)`, en el que la entidad bloquea el movimiento, como un
  - Firma: `pub fn collision_at(&self, x: i32, y: i32) -> f64 {`

- [`get_data`](entity.rs#L208) — Devuelve un clon de los datos de la entidad.
  - Firma: `pub fn get_data(&self) -> EntityData {`

- [`get_entity_footprint`](entity.rs#L217) — Columnas cubiertas por una huella de `length` bloques anclada en `anchor`, a lo largo de `lengthAxis`
  - Firma: `pub fn get_entity_footprint( anchor: WorldCoord, length: i32, axis: EntityLengthAxis, ) -> Vec<WorldCoord> {`

- [`get_entity_footprint_for`](entity.rs#L241) — Columnas cubiertas por una entidad.
  - Firma: `pub fn get_entity_footprint_for(entity: &Entity) -> Vec<WorldCoord> {`

- [`index_entities`](entity.rs#L253) — Construye el índice espacial de `entities` sobre sus huellas completas: lo que ocupa cada
  - Firma: `pub fn index_entities(entities: &[Entity]) -> SpatialIndex<Entity> {`

### `placement.rs`

#### Funciones y métodos

- [`new`](placement.rs#L55) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(columns: &'a CellMap<TerrainColumn>, placed: &'a mut SpatialIndex<Entity>) -> Self {`

- [`column`](placement.rs#L59) — Calcula o recupera «column» según los parámetros de la firma.
  - Firma: `pub fn column(&self, x: i32, y: i32) -> Option<&TerrainColumn> {`

- [`is_taken`](placement.rs#L66) — Evalúa si se cumple la condición «taken» para el estado recibido.
  - Firma: `pub fn is_taken(&self, x: i32, y: i32) -> bool {`

- [`place_entities`](placement.rs#L97) — Coloca entidades sobre `columns` con las reglas por defecto.
  - Firma: `pub fn place_entities(columns: &[TerrainColumn], catalog: &EntityCatalog) -> PlacementResult {`

- [`place_entities_with`](placement.rs#L102) — Coloca entidades sobre `columns`, una instancia por cada columna ancla válida que permite la densidad
  - Firma: `pub fn place_entities_with( columns: &[TerrainColumn], catalog: &EntityCatalog, rules: PlacementRules, ) -> PlacementResult {`

### `validation.rs`

#### Funciones y métodos

- [`validate_catalog`](validation.rs#L45) — Valida un catálogo completo: versión de esquema, ids únicos y cada blueprint.
  - Firma: `pub fn validate_catalog(catalog: &EntityCatalog) -> Result<(), CatalogError> {`

#### Constantes

- [`CATALOG_SCHEMA_VERSION`](validation.rs#L8) — El esquema de catálogo que este validador acepta.
  - Declaración: `pub const CATALOG_SCHEMA_VERSION: u32 = 1;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `entity.rs`

#### Funciones internas

- [`eq`](entity.rs#L68) — Calcula o recupera «eq» según los parámetros de la firma.
  - Firma: `fn eq(&self, other: &Self) -> bool {`

- [`hash`](entity.rs#L74) — Calcula o recupera «hash» según los parámetros de la firma.
  - Firma: `fn hash<H: std::hash::Hasher>(&self, state: &mut H) {`

### `placement.rs`

#### Funciones internas

- [`placement_roll`](placement.rs#L27) — Roll determinista para un blueprint en una columna, usado como su probabilidad de aparición.
  - Firma: `fn placement_roll(id: &str, x: i32, y: i32) -> u64 {`

- [`default`](placement.rs#L88) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`find_placement`](placement.rs#L163) — Valida una instancia de `blueprint` anclada en `column`.
  - Firma: `fn find_placement( anchor: WorldCoord, blueprint: &EntityBlueprint, context: &mut PlacementContext, gap: i32, ) -> Option<Placement> {`

#### Constantes internas

- [`DEFAULT_GAP`](placement.rs#L21) — Bloques libres mínimos entre instancias de la misma entidad cuando el catálogo no indica
  - Declaración: `const DEFAULT_GAP: i32 = 1;`

- [`DEFAULT_DENSITY`](placement.rs#L24) — Columnas por instancia de un blueprint, de media.
  - Declaración: `const DEFAULT_DENSITY: u64 = 400;`

- [`OFFSET`](placement.rs#L28) — Define el parámetro interno «OFFSET» empleado por este módulo.
  - Declaración: `const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;`

- [`PRIME`](placement.rs#L29) — Define el parámetro interno «PRIME» empleado por este módulo.
  - Declaración: `const PRIME: u64 = 0x1000_0000_01b3;`

### `validation.rs`

#### Funciones internas

- [`fmt`](validation.rs#L22) — Calcula o recupera «fmt» según los parámetros de la firma.
  - Firma: `fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {`

- [`validate_blueprint`](validation.rs#L68) — Valida un único blueprint.
  - Firma: `fn validate_blueprint(blueprint: &EntityBlueprint) -> Result<(), CatalogError> {`
