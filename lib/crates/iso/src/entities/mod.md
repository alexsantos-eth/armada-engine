# Entities

Este dominio define blueprints, instancias de entidades, sus reglas de validación y la colocación determinista sobre el terreno. Reúne los invariantes que permiten que una entidad sea válida antes de que un cliente la represente.

Los blueprints son contratos de datos persistentes y deben conservar compatibilidad de serialización. Las validaciones se concentran aquí para que importadores, generación y edición compartan las mismas reglas.

No contiene sprites, nodos de escena ni efectos visuales. La apariencia y el renderizado se resuelven en los dominios de assets y de cliente.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

`EntityPlacement` incluye `road_access` (serializado como `roadAccess`): cuando es `true`, la instancia solicita una entrada a la red de caminos materializada por `world` tras el pase de colocación. Si falta, vale `false` y mantiene la compatibilidad del catálogo. También incluye `additional_surfaces` (serializado como `additionalSurfaces`): las superficies sobre las que la casilla ancla puede estar, además de `surfaces[0]`; el resto de la huella conserva sus superficies exigidas. Es cómo un blueprint alcanza los bloques que el pase de colocación nunca ve (los caminos se materializan después; el pase `decor`, tras las carreteras, esquila los `additionalSurfaces` de los blueprints sin colisión —las piedras— sobre el chunk recién tallado). Si falta, vale lista vacía y mantiene la compatibilidad del catálogo.

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

- [`x`](entity.rs#L133) — Columna de mundo ancla de la instancia.
  - Firma: `pub fn x(&self) -> i32 {`

- [`y`](entity.rs#L136) — Fila de mundo ancla de la instancia.
  - Firma: `pub fn y(&self) -> i32 {`

- [`id`](entity.rs#L139) — Id estable de la instancia.
  - Firma: `pub fn id(&self) -> &str {`

- [`type_`](entity.rs#L142) — Id del blueprint del que brota.
  - Firma: `pub fn type_(&self) -> &str {`

- [`walkable`](entity.rs#L145) — Si el blueprint permite pisar su huella.
  - Firma: `pub fn walkable(&self) -> bool {`

- [`elevation`](entity.rs#L148) — Nivel del terreno sobre el que se asienta.
  - Firma: `pub fn elevation(&self) -> i32 {`

- [`height`](entity.rs#L151) — Altura de la instancia en bloques.
  - Firma: `pub fn height(&self) -> i32 {`

- [`length`](entity.rs#L154) — Longitud de la huella en bloques.
  - Firma: `pub fn length(&self) -> i32 {`

- [`length_axis`](entity.rs#L157) — Eje a lo largo del cual se mide `length` (`None` = una casilla).
  - Firma: `pub fn length_axis(&self) -> Option<EntityLengthAxis> {`

- [`gap`](entity.rs#L160) — Hueco extra que el blueprint pide con instancias del mismo tipo.
  - Firma: `pub fn gap(&self) -> Option<i32> {`
- [`road_access`](entity.rs) — Indica si la instancia necesita una entrada conectada a la red de caminos.
  - Firma: `pub fn road_access(&self) -> bool {`

- [`texture_source`](entity.rs#L167) — Sprite del atlas (ruta lógica) que la representa.
  - Firma: `pub fn texture_source(&self) -> &str {`

- [`debug`](entity.rs#L170) — Marca de depuración del blueprint (`None` = sin declarar).
  - Firma: `pub fn debug(&self) -> Option<bool> {`

- [`color_replacements`](entity.rs#L173) — Sustituciones de color del blueprint (`None` = sin declarar).
  - Firma: `pub fn color_replacements(&self) -> Option<&serde_json::Value> {`

- [`color_variant`](entity.rs#L176) — Tinte elegido para esta instancia (`None` = la del blueprint).
  - Firma: `pub fn color_variant(&self) -> Option<u32> {`

- [`sway`](entity.rs#L179) — Configuración de mece por viento del blueprint (`None` = rígida).
  - Firma: `pub fn sway(&self) -> Option<&EntitySway> {`

- [`collision`](entity.rs#L182) — Colisión del blueprint (`None` = bloque entero).
  - Firma: `pub fn collision(&self) -> Option<&EntityCollision> {`

- [`contact_shadow`](entity.rs#L185) — Si proyecta sombra propia horneada (`None` = hereda del blueprint).
  - Firma: `pub fn contact_shadow(&self) -> Option<bool> {`

- [`draw_under_player`](entity.rs#L192) — Si el sprite se dibuja en el pre-pase de props de suelo, siempre por debajo del jugador (las rocas pequeñas).
  - Firma: `pub fn draw_under_player(&self) -> bool {`

- [`reflection_source`](entity.rs#L188) — Sprite de reflejo propio (`None` = el derivado del sprite).
  - Firma: `pub fn reflection_source(&self) -> Option<&str> {`

- [`metadata`](entity.rs#L191) — Datos de juego de la instancia (opacos al motor).
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

### `decor.rs`

#### Funciones y métodos

- [`place_decor`](decor.rs#L43) — Coloca los blueprints sin colisión sobre sus `additionalSurfaces`, sobre las columnas tal como quedan tras tallar los caminos: salta cualquier columna ya ocupada y rueda desde su propio flujo determinista, de modo que las piedras se ponen sobre el camino sin repetir ni solaparse con lo ya en pie. Se aplica después de `connect_roads_into`, sobre las columnas ya talladas.
  - Firma: `pub fn place_decor( columns: &[TerrainColumn], catalog: &EntityCatalog, placed: &mut SpatialIndex<Entity>, ) -> Vec<Entity> {`

#### Constantes internas

- [`DECOR_DENSITY`](decor.rs#L16) — Columnas por instancia de un blueprint, de media, sobre las superficies adicionales.

### `greenery.rs`

#### Funciones y métodos

- [`plant_greens`](greenery.rs#L268) — Siembra la vegetación de las zonas de poblado que cubren `columns`: primero el patio de cada edificio, después el esparcido azul del suelo libre, y devuelve lo que creció en orden de plantado. Sin biomas no crece nada, porque las especies salen del bioma de debajo.
  - Firma: `pub fn plant_greens( columns: &[TerrainColumn], catalog: &EntityCatalog, standing: &[Entity], placed: &mut SpatialIndex<Entity>, content: GreensContent<'_>, ) -> Vec<Entity> {`

#### Tipos

- [`GreensContent`](greenery.rs#L26) — Lo que el pase lee aparte del terreno: los asentamientos cuyas zonas dicen dónde y cuánto crece, los biomas de los que salen las especies y la semilla de sus tiradas.
  - Declaración: `pub struct GreensContent<'a> { pub settlements: &'a WorldSettlements, pub biomes: Option<&'a WorldBiomes>, pub seed: u64, }`

### `placement.rs`

#### Funciones y métodos

- [`new`](placement.rs#L54) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(columns: &'a CellMap<TerrainColumn>, placed: &'a mut SpatialIndex<Entity>) -> Self {`

- [`column`](placement.rs#L58) — Referencia a la columna `(x, y)` de las `columns` originales, o `None` fuera del chunk.
  - Firma: `pub fn column(&self, x: i32, y: i32) -> Option<&TerrainColumn> {`

- [`is_taken`](placement.rs#L62) — Si `(x, y)` ya está reclamada por una huella colocada.
  - Firma: `pub fn is_taken(&self, x: i32, y: i32) -> bool {`

- [`place_entities`](placement.rs#L93) — Coloca entidades sobre `columns` con las reglas por defecto.
  - Firma: `pub fn place_entities(columns: &[TerrainColumn], catalog: &EntityCatalog) -> PlacementResult {`

- [`place_entities_with`](placement.rs#L98) — Coloca entidades sobre `columns`, una instancia por cada columna ancla válida que permite la densidad
  - Firma: `pub fn place_entities_with( columns: &[TerrainColumn], catalog: &EntityCatalog, rules: PlacementRules, ) -> PlacementResult {`

- [`PlacementContent`](placement.rs#L108) — El contenido de colocación del pase: los biomas del mundo, el catálogo wfc del resto, los asentamientos cuyas zonas semánticas reescriben qué crece en cada columna y la semilla de sus tiradas. Sin asentamientos, el mundo crece sin zonas y cada columna lee los pesos y la cobertura de árboles tal y como están escritos.
  - Declaración: `pub struct PlacementContent<'a> { pub biomes: Option<&'a WorldBiomes>, pub wfc: Option<&'a WfcCatalog>, pub settlements: Option<&'a WorldSettlements>, pub seed: u64, }`

- [`place_entities_with_biomes`](placement.rs#L126) — Coloca entidades sobre `columns`, confinando las especies que los biomas reclaman a sus propias regiones: un blueprint que algún bioma lista solo brota donde el bioma cubre la columna y su picker de bosquete devuelve esa especie, así que los bosquetes son monospecíficos y las reglas de densidad y hueco se aplican como siempre. `None` restaura el comportamiento sin biomas. Es un atajo al camino sin wfc.
  - Firma: `pub fn place_entities_with_biomes( columns: &[TerrainColumn], catalog: &EntityCatalog, rules: PlacementRules, biomes: Option<&WorldBiomes>, ) -> PlacementResult {`

- [`place_entities_with_content`](placement.rs#L151) — Coloca entidades sobre `columns`: el pase de biomas primero, el solver wfc después para todo lo que ningún bioma reclama, ambos sobre el mismo índice espacial para que nada se solape. Sin catálogo wfc, el comportamiento es el mismo que [`place_entities_with_biomes`].
  - Firma: `pub fn place_entities_with_content( columns: &[TerrainColumn], catalog: &EntityCatalog, rules: PlacementRules, content: PlacementContent<'_>, ) -> PlacementResult {`
  - Con asentamientos el orden es otro dentro del poblado: el pase de biomas se salta toda columna que cubra un asentamiento (sus bosques son del campo abierto), el solver wfc levanta los edificios con los multiplicadores de la zona, y al final `greenery::plant_greens` siembra la vegetación del poblado sobre lo que acaba de quedar en pie. Fuera de todo poblado nada cambia.

### `wfc.rs`

#### Funciones y métodos

- [`weight_of`](wfc.rs#L179) — El peso de `blueprint`, o `0.0` cuando el contenido no lo lista (nunca crece).
  - Firma: `pub fn weight_of(&self, blueprint: &str) -> f64 {`

- [`parse_wfc`](wfc.rs#L186) — Parsea y valida el contenido wfc contra el catálogo de entidades que referencia, y contra los biomas (cuando se pasan) para exigir un peso a cada blueprint que ningún bioma reclama.
  - Firma: `pub fn parse_wfc( json: &str, entities: &EntityCatalog, biomes: Option<&crate::biomes::catalog::BiomeCatalog>, ) -> Result<WfcCatalog, WfcError> {`

- [`claimed_by_biomes`](wfc.rs#L348) — Qué blueprints ya reclaman los biomas, en orden de catálogo; el solver omite esos del mosaico.
  - Firma: `pub fn claimed_by_biomes( entities: &EntityCatalog, biomes: Option<&crate::biomes::field::WorldBiomes>, ) -> Vec<bool> {`

- [`solve_chunk`](wfc.rs#L671) — Resuelve el chunk y devuelve las entidades que crece, en orden de columna. El solver es por chunk y no consulta a los vecinos: cada posibilidad se comprueba contra el terreno, así que un chunk sale igual que junto a sus vecinos; la vacancia siempre es posible, de modo que el mosaico nunca entra en contradicción. Al llegar al techo de `maxPerChunk` para un blueprint o familia, sus posibilidades dejan de crecer en el resto del chunk.
  - Firma: `pub fn solve_chunk( columns: &[TerrainColumn], catalog: &EntityCatalog, content: WfcContent<'_>, claimed: &[bool], placed: &mut SpatialIndex<Entity>, ) -> Vec<Entity> {`
  - El peso de un blueprint en una columna es el del catálogo por el multiplicador de la zona que la cubre: un `0` lo saca de las posibilidades de esa columna, de modo que los edificios solo crecen donde su zona los admite.

- [`WfcContent::new`](wfc.rs#L616) — El contenido de un mundo sin asentamientos: los pesos del catálogo, tal y como están escritos.
  - Firma: `pub fn new(wfc: &'a WfcCatalog, seed: u64) -> Self {`

- [`WfcContent::in_settlements`](wfc.rs#L625) — El mismo contenido, con el campo de asentamientos cuyas zonas reescriben los pesos.
  - Firma: `pub fn in_settlements(mut self, settlements: Option<&'a WorldSettlements>) -> Self {`

#### Constantes

- [`WFC_SCHEMA_VERSION`](wfc.rs#L16) — El esquema de contenido wfc que este validador acepta; la 2 añade `families` y `maxPerChunk`.
  - Declaración: `pub const WFC_SCHEMA_VERSION: u32 = 2;`

#### Tipos

- [`WfcContent`](wfc.rs#L605) — Lo que el solver lee además del terreno: los pesos, las zonas de asentamiento que los multiplican columna a columna y la semilla de sus tiradas.
  - Declaración: `pub struct WfcContent<'a> { pub wfc: &'a WfcCatalog, pub settlements: Option<&'a WorldSettlements>, pub seed: u64, }`

- [`WfcCatalog`](wfc.rs#L164) — El contenido wfc validado: `emptyWeight` (cuánto pesa «aquí no crece nada» frente a un blueprint), los pesos por blueprint, `families` (grupos que comparten techo: `office` junta `office_x`/`office_y`) y `maxPerChunk` (techo por chunk, indexado por id de familia o de blueprint). Los blueprints que ningún bioma reclama deben aparecer en `weights`, o el mundo se quedaría en silencio.
  - Declaración: `pub struct WfcCatalog { pub schema_version: u32, pub empty_weight: f64, pub weights: HashMap<String, f64>, pub families: HashMap<String, Vec<String>>, pub max_per_chunk: HashMap<String, f64>, }`

- [`WfcError`](wfc.rs#L23) — Todo lo que el contenido wfc puede declarar mal: esquema no soportado, JSON ilegible, `emptyWeight` o pesos no positivos, `blueprint` que el catálogo de entidades no tiene, un blueprint sin reclamar que nadie pesa; claves de techo ajenas a todo, techos inferiores a 1, familias vacías con blueprints repetidos entre familias o que chocan con un blueprint.
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

- [`eq`](entity.rs#L70) — Igualdad por `data.id` (la identidad de instancia).
  - Firma: `fn eq(&self, other: &Self) -> bool {`

- [`hash`](entity.rs#L76) — Hash por `data.id`, coherente con `eq`.
  - Firma: `fn hash<H: std::hash::Hasher>(&self, state: &mut H) {`

### `greenery.rs`

#### Funciones internas

- [`distance`](greenery.rs#L49) — Distancia a la celda de edificio más cercana, o infinito si no hay ninguna.
  - Firma: `fn distance(&self, at: WorldCoord) -> f64 {`

- [`is_blocked`](greenery.rs#L58) — Si la columna cae en el despeje que se guarda delante de una fachada.
  - Firma: `fn is_blocked(&self, at: WorldCoord) -> bool {`

- [`standing_of`](greenery.rs#L69) — Las celdas que ocupan los edificios del chunk y el despeje delante de cada fachada; como la altura en pantalla baja al crecer `x + y`, la fachada mira hacia las columnas de menor `x` y menor `y`.
  - Firma: `fn standing_of(entities: &[Entity], catalog: &EntityCatalog, front: i32) -> Standing {`

- [`blueprint_of`](greenery.rs#L103) — El blueprint de un id, o `None` si el catálogo no lo tiene.
  - Firma: `fn blueprint_of<'a>(catalog: &'a EntityCatalog, id: &str) -> Option<&'a EntityBlueprint> {`

- [`species_at`](greenery.rs#L108) — El árbol que el bioma de esa columna hace crecer ahí.
  - Firma: `fn species_at( biomes: &WorldBiomes, catalog: &EntityCatalog, streams: &Streams, at: WorldCoord, ) -> Option<String> {`

- [`plant`](greenery.rs#L134) — Planta un blueprint en una columna si cabe, y lo añade al índice espacial.
  - Firma: `fn plant( at: WorldCoord, blueprint: &EntityBlueprint, columns: &CellMap<TerrainColumn>, placed: &mut SpatialIndex<Entity>, ) -> Option<Entity> {`

- [`patio_spots`](greenery.rs#L149) — Las columnas detrás de un edificio, siguiendo su eje, donde puede colgar su patio.
  - Firma: `fn patio_spots(entity: &Entity, blueprint: &EntityBlueprint, reach: i32) -> Vec<WorldCoord> {`

- [`plant_patios`](greenery.rs#L189) — Recorre los edificios en pie en orden de columna y cuelga de cada uno su patio.
  - Firma: `fn plant_patios( entities: &[Entity], catalog: &EntityCatalog, columns: &CellMap<TerrainColumn>, placed: &mut SpatialIndex<Entity>, content: GreensContent<'_>, streams: &Streams, grown: &mut Vec<Entity>, ) {`

- [`grove_blueprint`](greenery.rs#L256) — El bosquete que corresponde a una columna, eligiendo su eje.
  - Firma: `fn grove_blueprint(catalog: &EntityCatalog, at: WorldCoord, streams: &Streams) -> Option<String> {`

- [`area_of`](greenery.rs#L338) — El rectángulo que cubren `columns`, o `None` si no hay ninguna.
  - Firma: `fn area_of(columns: &[TerrainColumn]) -> Option<WorldRect> {`

#### Constantes internas

- [`PATIO_LABEL`](greenery.rs#L18) — Corriente que tira el patio de cada edificio.
  - Declaración: `const PATIO_LABEL: &str = "greens-patio";`

- [`SPECIES_LABEL`](greenery.rs#L20) — Corriente que elige qué especie es cada planta.
  - Declaración: `const SPECIES_LABEL: &str = "greens-species";`

- [`SCATTER_LABEL`](greenery.rs#L22) — Corriente del esparcido azul del suelo libre.
  - Declaración: `const SCATTER_LABEL: &str = "greens-scatter";`

### `placement.rs`

#### Funciones internas

- [`placement_roll`](placement.rs#L26) — Roll determinista para un blueprint en una columna, usado como su probabilidad de aparición.
  - Firma: `fn placement_roll(id: &str, x: i32, y: i32) -> u64 {`

- [`default`](placement.rs#L84) — Implementación de `Default` para `PlacementRules`: `gap`/`density` por defecto.
  - Firma: `fn default() -> Self {`

- [`placement_by_hand`](placement.rs#L278) — Valida una instancia anclada en una casilla sobre unas columnas, con lo que ya está puesto: lo que pregunta un editor antes de poner una entidad a mano. Aplica superficies, nivel único bajo la huella y ocupación, pero **no** la separación entre instancias del mismo tipo, que es regla de la colocación generada.
  - Firma: `pub fn placement_by_hand( anchor: WorldCoord, blueprint: &EntityBlueprint, columns: &[TerrainColumn], placed: &[Entity], ) -> Option<Placement> {`

- [`find_placement`](placement.rs#L298) — Valida una instancia de `blueprint` anclada en `column`.
  - Firma: `fn find_placement( anchor: WorldCoord, blueprint: &EntityBlueprint, context: &mut PlacementContext, gap: i32, ) -> Option<Placement> {`

#### Constantes internas

- [`DEFAULT_GAP`](placement.rs#L20) — Bloques libres mínimos entre instancias de la misma entidad cuando el catálogo no indica
  - Declaración: `const DEFAULT_GAP: i32 = 1;`

- [`DEFAULT_DENSITY`](placement.rs#L23) — Columnas por instancia de un blueprint, de media.
  - Declaración: `const DEFAULT_DENSITY: u64 = 400;`

- [`OFFSET`](placement.rs#L27) — Semilla base (FNV-1a) del hash de la tirada de colocación.
  - Declaración: `const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;`

- [`PRIME`](placement.rs#L28) — Primo del hash FNV-1a.
  - Declaración: `const PRIME: u64 = 0x1000_0000_01b3;`

### `validation.rs`

#### Funciones internas

- [`fmt`](validation.rs#L22) — Formato del error para `std::fmt::Display`.
  - Firma: `fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {`

- [`validate_blueprint`](validation.rs#L71) — Valida un único blueprint.
  - Firma: `fn validate_blueprint(blueprint: &EntityBlueprint) -> Result<(), CatalogError> {`
