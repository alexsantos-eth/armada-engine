# Asentamientos

Este dominio decide **dónde hay un poblado, cómo se corta en manzanas y calles, y qué significa cada columna dentro de él**. Es la capa entre el terreno y el WFC: sin ella el solver repartiría edificios por todo el mundo con un peso global.

El campo es una función pura de la semilla y las coordenadas absolutas: no se guarda en disco, se recomputa al cargar, y un chunk sale igual solo que junto a sus vecinos, porque nada de lo que decide depende del orden de descubrimiento. Por eso una calle cruza de un chunk a otro sin cortes.

Los sitios candidatos están en una rejilla de `spacing` columnas; cada uno hospeda un poblado con probabilidad `chance`. El poblado es una **cuadrícula** de `cols × rows` manzanas cuadradas (`layout.blocks`, de lado `layout.block`) separadas por calles de `layout.street` columnas, desplazada dentro de su celda sin salirse de ella: el contenido exige `spacing` mayor que el poblado más ancho con sus márgenes (`LayoutRules::max_extent`), así que cada columna solo pregunta al sitio de su propia celda.

Cada zona juega un **rol** (`ZoneRole`): la manzana del medio es `Center`; el resto se reparte entre las zonas `Residential` y `Park` según su `share`, pero las manzanas del lado de la cámara (fila o columna 0, `x`/`y` bajas) son parque con probabilidad `frontPark`; cada esquina de una rejilla de 3×3 o más se recorta con probabilidad `trim` y pasa a `Edge`. Las calles (`Street`) rodean toda manzana en pie, una franja `Edge` de `layout.edge` columnas rodea la rejilla, y cada lado abre una calle interior que sigue `layout.exit` columnas hacia el campo. Así el poblado se visita de frente y nunca encierra al jugador.

No todas las manzanas son cuadradas: `layout.shapes` reparte manzanas con una esquina de medio lado recortada (`BlockShape::Notched`), con una fila de un lado recortada (`Shrunk`) unidas con su vecina de `+x` o `+y` tragándose la calle entre ambas (`MergedX`, `MergedY`; la vecina toma su zona y queda cuadrada) o partidas por un callejón que une las calles de ambos lados (`Split`). Lo recortado pasa a calle y la plaza central siempre es cuadrada.

Con una zona de rol `Verge` (opcional y única), toda casilla de manzana cuyo vecino `+x` o `+y` es calle pasa a esa zona: es lo que la cámara ve delante de la calle, y el contenido solo deja crecer ahí decoración baja, de modo que nada alto tapa a quien camina por la calle.

Un parque lleva un lote en cada casilla de su zona de un color del damero, para salir tupido. Cada una de las demás manzanas, plaza incluida, lleva entre `layout.lots.min` y `layout.lots.max` **lotes**, repartidos por las casillas de su contorno que tocan una calle y caen en un mismo color de un damero sobre todo el mundo (barajadas por manzana; `LayoutRules::slots` es el máximo de una manzana cuadrada): cada lote toca una calle y ninguno toca a otro, de modo que los huecos quedan para los árboles. Con `layout.innerLots`, una manzana de barrio sigue llenando hacia dentro cuando se le acaban las casillas junto a la calle: las casillas interiores del mismo color del damero son una segunda fila de lotes, detrás de la primera, y la plaza y los demás roles se quedan solo con el contorno. Los pesos `lots` de cada zona dicen qué levanta cada lote (en un parque, bosquetes y decoración); una zona `uniform` elige un solo tipo por manzana, así que hay manzanas que son un mercado entero o una hilera de talleres. Los `weights` siguen multiplicando el peso wfc de lo que el solver rellena alrededor.

La zona también dice **cuánta vegetación de poblado** crece en ella (`greens`): dentro de un poblado el bioma no planta ningún árbol, y la vegetación la siembra el pase de `iso::entities::greenery` con las reglas de `greens` del contenido.

Con `on_ground` el campo se tiende sobre el terreno del mundo: una manzana sin tierra firme bajo sus esquinas o su centro se recorta, y un sitio cuya manzana central no es tierra firme no hospeda poblado.

Este dominio no coloca nada ni modifica el terreno (solo lo consulta): responde qué zona cubre una columna, qué columnas son calle y dónde están los lotes. Quien pavimenta es `iso::paths::pave` (con `streets_over`), quien levanta las casas es `iso::entities::lots::raise_lots` (con `lots_in`), el solver wfc lee `profile_of` y el pase de vegetación lee `greens_of` y `greens_spacing`.


## Catálogo de API pública

### `catalog.rs`

#### Funciones y métodos

- [`parse_settlements`](catalog.rs#L656) — Parsea y valida el contenido de asentamientos contra el catálogo de entidades que coloca y el catálogo wfc cuyas familias y pesos reescriben sus zonas. Una clave que no nombra ni un blueprint ni una familia es un error de carga, no una regla que nunca se aplica.
  - Firma: `pub fn parse_settlements( json: &str, entities: &EntityCatalog, wfc: &WfcCatalog, ) -> Result<SettlementCatalog, SettlementError> {`

- [`multiplier`](catalog.rs#L24) — El multiplicador wfc del blueprint que ocupa `index` en el catálogo de entidades. `0` prohíbe; `1` deja el mundo como estaba.
  - Firma: `pub fn multiplier(&self, index: usize) -> f64 {`

- [`lot`](catalog.rs#L29) — El peso con el que los lotes de la zona levantan el blueprint que ocupa `index`; `0` nunca lo levanta.
  - Firma: `pub fn lot(&self, index: usize) -> f64 {`

- [`pitch`](catalog.rs#L135) — Columnas de una manzana a la siguiente: la manzana y la calle que la sigue.
  - Firma: `pub fn pitch(&self) -> i32 {`

- [`margin`](catalog.rs#L140) — Columnas que el poblado alcanza más allá de sus calles exteriores: la mayor entre la franja `edge` y las salidas `exit`.
  - Firma: `pub fn margin(&self) -> i32 {`

- [`max_extent`](catalog.rs#L157) — Columnas que abarca el poblado más ancho en un eje, márgenes incluidos; `spacing` debe superarlas.
  - Firma: `pub fn max_extent(&self) -> i32 {`

- [`slots`](catalog.rs#L146) — Las casillas de una manzana que pueden llevar un lote, como desplazamientos desde su esquina baja: una de cada dos casillas del borde, en damero, la delantera primero.
  - Firma: `pub fn slots(&self) -> Vec<(i32, i32)> {`

- [`verge`](catalog.rs#L216) — El índice de la zona verge, si el contenido la declara.
  - Firma: `pub fn verge(&self) -> Option<usize> {`

- [`zone_of`](catalog.rs#L223) — El índice de la primera zona que juega `role`; la validación garantiza que todo rol tiene una.
  - Firma: `pub fn zone_of(&self, role: ZoneRole) -> usize {`

#### Constantes

- [`SETTLEMENTS_SCHEMA_VERSION`](catalog.rs#L9) — El esquema de contenido de asentamientos que este validador acepta.
  - Declaración: `pub const SETTLEMENTS_SCHEMA_VERSION: u32 = 2;`

- [`ZoneRole::ALL`](catalog.rs#L56) — Todos los roles, en el orden en que la validación los comprueba.
  - Declaración: `pub const ALL: [ZoneRole; 5]`

#### Tipos

- [`SettlementCatalog`](catalog.rs#L197) — El contenido validado: `spacing`, `chance`, las reglas de la cuadrícula, el perfil del yermo, las reglas de vegetación y las zonas en orden de archivo.
  - Declaración: `pub struct SettlementCatalog { pub schema_version: u32, pub spacing: i32, pub chance: f64, pub layout: LayoutRules, pub wilderness: ZoneProfile, pub greens: GreensRules, pub zones: Vec<SettlementZone>, }`

- [`LayoutRules`](catalog.rs#L92) — Cómo se corta un poblado: banda de manzanas por eje, lado de manzana, ancho de calle, franja de borde, largo de las salidas, proporción de esquinas recortadas, proporción de manzanas delanteras que son parque y banda de lotes por manzana (nunca más que `slots`).
  - Declaración: `pub struct LayoutRules { pub blocks_min: i32, pub blocks_max: i32, pub block: i32, pub street: i32, pub edge: i32, pub exit: i32, pub trim: f64, pub front_park: f64, pub lots_min: u32, pub lots_max: u32, pub shapes: ShapeShares, }`

- [`ShapeShares`](catalog.rs#L120) — Qué proporción de manzanas pierde una esquina (`notch`), una fila (`shrink`), se une con su vecina (`merge`) o se parte con un callejón (`split`); cada una en `[0, 1]` y juntas no más de uno. Opcional: sin `shapes` todas las manzanas son cuadradas.
  - Declaración: `pub struct ShapeShares { pub notch: f64, pub shrink: f64, pub merge: f64, pub split: f64, }`

- [`ZoneRole`](catalog.rs#L37) — La parte de la cuadrícula que cubre una zona: `Center`, `Residential`, `Park`, `Edge`, `Street` o `Verge` (opcional). Centro, borde, calle y verge son únicos; barrio y parque admiten varias zonas que se reparten las manzanas por `share`.
  - Declaración: `pub enum ZoneRole { Center, Residential, Park, Edge, Street, Verge }`

- [`SettlementZone`](catalog.rs#L76) — Una zona semántica: su id, su rol, su `share` frente a las demás zonas de barrio y parque, si es `uniform` (un solo tipo de edificio por manzana) y lo que hace crecer.
  - Declaración: `pub struct SettlementZone { pub id: String, pub role: ZoneRole, pub share: f64, pub uniform: bool, pub profile: ZoneProfile, }`

- [`ZoneProfile`](catalog.rs#L14) — Lo que una zona hace crecer: un multiplicador por blueprint sobre su peso wfc, el peso de cada edificio en sus lotes (ambos resueltos en el parseo; una clave de familia se expande a sus miembros y una de blueprint gana sobre su familia) y `greens`.
  - Declaración: `pub struct ZoneProfile { pub greens: f64, multipliers: Vec<f64>, lots: Vec<f64>, }`

- [`GreensRules`](catalog.rs#L164) — Cómo se agrupa la vegetación de un poblado alrededor de lo que ya está en pie: `spacing`, `tight`, la banda `near`–`far`, `front` y el `patio` de cada edificio.
  - Declaración: `pub struct GreensRules { pub spacing: f64, pub tight: f64, pub near: f64, pub far: f64, pub front: i32, pub patio: PatioRules, }`

- [`PatioRules`](catalog.rs#L181) — El grupo que cada edificio cuelga de su parte trasera: `chance`, `min`–`max` plantas, `reach` y `grove_chance`.
  - Declaración: `pub struct PatioRules { pub chance: f64, pub min: u32, pub max: u32, pub reach: i32, pub grove_chance: f64, }`

- [`SettlementError`](catalog.rs#L233) — Todo lo que el contenido puede declarar mal: esquema no soportado, JSON ilegible (un rol desconocido incluido), catálogo sin zonas, ids vacíos o repetidos, un rol sin zona o un rol único repetido, `spacing` no positivo, `chance` fuera de `(0, 1]`, una cuadrícula imposible (manzanas de menos de tres columnas, formas con proporciones fuera de `[0, 1]` o que suman más de uno, calles vacías, bandas dadas la vuelta, proporciones fuera de `[0, 1]`, más lotes que casillas de borde), `spacing` que dejaría solaparse dos poblados, `share`, `greens`, `default` o pesos no finitos o negativos, reglas de vegetación o de patio incoherentes y claves que no nombran ni blueprint ni familia.
  - Declaración: `pub enum SettlementError { ... }`

### `field.rs`

#### Funciones y métodos

- [`new`](field.rs#L314) — Construye el campo de asentamientos para `catalog` en el mundo de `seed`, derivando una corriente por decisión (sitio, desplazamiento, tamaño, recorte, parque delantero, reparto, lotes y salidas).
  - Firma: `pub fn new(seed: u64, catalog: &SettlementCatalog) -> Self {`

- [`on_ground`](field.rs#L334) — El mismo campo tendido sobre el terreno que levanta `generator`: una manzana cuyas esquinas o centro no son tierra firme (hierba o tierra) se recorta, y un sitio cuya manzana central no lo es no hospeda poblado. Solo quita; nunca mueve un poblado que conserva.
  - Firma: `pub fn on_ground(mut self, generator: TerrainGenerator) -> Self {`

- [`catalog`](field.rs#L340) — El contenido con el que se construyó el campo.
  - Firma: `pub fn catalog(&self) -> &SettlementCatalog {`

- [`settlement_at`](field.rs#L346) — El poblado que cubre la columna `(x, y)`, o `None` en campo abierto. Cada poblado queda dentro de su celda, así que solo se pregunta al sitio de la columna.
  - Firma: `pub fn settlement_at(&self, x: i32, y: i32) -> Option<Settlement> {`

- [`zone_at`](field.rs#L352) — El índice de la zona que posee la columna `(x, y)` en el campo, o `None` en campo abierto.
  - Firma: `pub fn zone_at(&self, x: i32, y: i32) -> Option<usize> {`

- [`zone_id_at`](field.rs#L375) — El id de la zona que posee la columna `(x, y)`, o `None` en campo abierto.
  - Firma: `pub fn zone_id_at(&self, x: i32, y: i32) -> Option<&str> {`

- [`zones_over`](field.rs#L383) — La zona de cada columna de `coords`, en el mismo orden, resolviendo cada sitio una vez; la respuesta es la de `zone_at` columna a columna.
  - Firma: `pub fn zones_over(&self, coords: &[WorldCoord]) -> Vec<Option<usize>> {`

- [`streets_over`](field.rs#L401) — Si cada columna de `coords` es calle o salida: lo que el pase de caminos pavimenta antes de colocar nada.
  - Firma: `pub fn streets_over(&self, coords: &[WorldCoord]) -> Vec<bool> {`

- [`blocks_over`](field.rs#L411) — Si cada columna de `coords` cae en una manzana en pie (plaza, barrio, parque o su verge): la tierra desnuda que el pase de colocación convierte en hierba antes de levantar los lotes.
  - Firma: `pub fn blocks_over(&self, coords: &[WorldCoord]) -> Vec<bool> {`

- [`lots_in`](field.rs#L426) — Todos los lotes cuyo ancla cae en `area`, poblado a poblado en orden de sitio.
  - Firma: `pub fn lots_in(&self, area: WorldRect) -> Vec<Lot> {`

- [`profile_at`](field.rs#L446) — Lo que crece en la columna `(x, y)`: el perfil de su zona, o el del yermo fuera de todo poblado.
  - Firma: `pub fn profile_at(&self, x: i32, y: i32) -> &ZoneProfile {`

- [`profile_of`](field.rs#L451) — Lo que hace crecer una zona ya resuelta; `None` es el yermo.
  - Firma: `pub fn profile_of(&self, zone: Option<usize>) -> &ZoneProfile {`

- [`greens_of`](field.rs#L460) — Cuánta vegetación de poblado crece en una zona ya resuelta; el yermo no planta la suya.
  - Firma: `pub fn greens_of(&self, zone: Option<usize>) -> f64 {`

- [`greens_spacing`](field.rs#L470) — El hueco que guarda la vegetación de `zone` a `distance` columnas del edificio más cercano, interpolado entre `tight` y `spacing` y dividido por la densidad de la zona; `None` cuando la zona no planta nada.
  - Firma: `pub fn greens_spacing(&self, zone: Option<usize>, distance: f64) -> Option<f64> {`

- [`cols`](field.rs#L108) / [`rows`](field.rs#L113) — Manzanas del poblado a lo largo de `x` y de `y`.
  - Firma: `pub fn cols(&self) -> i32 {` / `pub fn rows(&self) -> i32 {`

- [`bounds`](field.rs#L118) — La cuadrícula con sus calles exteriores, sin la franja de borde ni las salidas.
  - Firma: `pub fn bounds(&self) -> WorldRect {`

- [`block_rect`](field.rs#L130) — Las columnas de la manzana `(i, j)`, sin calles.
  - Firma: `pub fn block_rect(&self, i: i32, j: i32) -> WorldRect {`

- [`block_zone`](field.rs#L143) — La zona repartida a la manzana `(i, j)`, o `None` si se recortó o cae fuera de la cuadrícula.
  - Firma: `pub fn block_zone(&self, i: i32, j: i32) -> Option<usize> {`

- [`block_shape`](field.rs#L151) — El contorno de la manzana `(i, j)`; una manzana fuera de la cuadrícula o recortada es cuadrada.
  - Firma: `pub fn block_shape(&self, i: i32, j: i32) -> BlockShape {`

- [`lots`](field.rs#L179) — Los lotes del poblado, manzana a manzana.
  - Firma: `pub fn lots(&self) -> &[Lot] {`

- [`Settlement::zone_at`](field.rs#L187) — La zona de la columna dentro de este poblado: la manzana (o su verge, si da a una calle por `+x` o `+y`), la calle que la rodea, la salida o la franja de borde; `None` fuera.
  - Firma: `pub fn zone_at(&self, x: i32, y: i32) -> Option<usize> {`

#### Tipos

- [`WorldSettlements`](field.rs#L297) — Los asentamientos de un mundo: el campo que los coloca y la cuadrícula de cada uno. Compartido, inmutable y reconstruido desde la semilla.
  - Declaración: `pub struct WorldSettlements { catalog: SettlementCatalog, site: u64, ... }`

- [`Settlement`](field.rs#L90) — Un poblado: su columna central, su cuadrícula, la zona de cada manzana, sus lotes y sus salidas.
  - Declaración: `pub struct Settlement { pub center: WorldCoord, origin: WorldCoord, cols: i32, rows: i32, ... }`

- [`BlockShape`](field.rs#L46) — El contorno de una manzana: `Square`, `Notched { high_x, high_y }`, `Shrunk { along_x, high }`, `MergedX`, `MergedY` o `Split { along_x }`.
  - Declaración: `pub enum BlockShape { Square, Notched { high_x: bool, high_y: bool }, Shrunk { along_x: bool, high: bool }, MergedX, MergedY, Split { along_x: bool } }`

- [`Lot`](field.rs#L35) — Un lote: la columna donde se levanta el edificio, la zona cuyos pesos lo eligen y la esquina baja de su manzana, con la que una zona `uniform` hace una sola elección por manzana.
  - Declaración: `pub struct Lot { pub anchor: WorldCoord, pub zone: usize, pub block: WorldCoord, }`
