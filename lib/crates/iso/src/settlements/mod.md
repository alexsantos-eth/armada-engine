# Asentamientos

Este dominio decide **dónde hay un poblado y qué significa cada columna dentro de él**. Es la capa que falta entre el terreno y el WFC: antes, el solver repartía edificios por todo el mundo con un peso global, de modo que una casa, un templo y un mead hall podían brotar en mitad de un bosque. Ahora el mundo se divide en asentamientos y cada asentamiento en zonas semánticas (`center`, `residential`, `green`, `edge`), y la zona multiplica el peso de cada blueprint y la cobertura de árboles del bioma que hay debajo.

El campo es una función pura de la semilla y las coordenadas absolutas: no se guarda en disco, se recomputa al cargar, y un chunk sale igual solo que junto a sus vecinos, porque nada de lo que decide depende del orden de descubrimiento.

Los sitios candidatos están en una rejilla de `spacing` columnas; cada uno hospeda un poblado con probabilidad `chance`, desplazado dentro de su celda por una tirada y con un radio entre `radius.min` y `radius.max`. El contenido exige `spacing > 2 · radius.max`, así que dos poblados nunca se solapan y una columna pertenece como mucho a uno.

Dentro del radio, la zona la decide un **Voronoi aditivo pesado**: cada zona suelta sus semillas en una banda del radio (`ring`) y gana la columna la semilla cuya distancia menos su `pull · radio` es menor. El `pull` ensancha o estrecha la celda de una zona, de modo que las fronteras salen irregulares en vez de anillos concéntricos: es lo que da el aspecto orgánico de un poblado crecido, no trazado.

La zona también dice **cuánta vegetación de poblado** crece en ella (`greens`): dentro de un poblado el bioma no planta ningún árbol, y la vegetación la siembra el pase de `iso::entities::greenery` con las reglas de `greens` del contenido (hueco abierto, hueco pegado a una pared, la banda de distancias entre ambos, el despeje delante de cada fachada y el patio que cada edificio cuelga por detrás).

Este dominio no coloca nada ni toca el terreno: solo responde qué zona cubre una columna, qué multiplica esa zona y con qué hueco crece su vegetación. Quien coloca es `iso::entities` (el solver wfc lee `profile_of`, el pase de vegetación lee `greens_of` y `greens_spacing`), y los caminos los sigue trazando `iso::paths` sobre lo que haya quedado en pie.


## Catálogo de API pública

### `catalog.rs`

#### Funciones y métodos

- [`parse_settlements`](catalog.rs#L421) — Parsea y valida el contenido de asentamientos contra el catálogo de entidades que coloca y el catálogo wfc cuyas familias y pesos reescriben sus zonas. Una clave que no nombra ni un blueprint ni una familia es un error de carga, no una regla que nunca se aplica.
  - Firma: `pub fn parse_settlements( json: &str, entities: &EntityCatalog, wfc: &WfcCatalog, ) -> Result<SettlementCatalog, SettlementError> {`

- [`multiplier`](catalog.rs#L23) — El multiplicador del blueprint que ocupa `index` en el catálogo de entidades con el que se parseó el perfil. `0` prohíbe; `1` deja el mundo como estaba.
  - Firma: `pub fn multiplier(&self, index: usize) -> f64 {`

#### Constantes

- [`SETTLEMENTS_SCHEMA_VERSION`](catalog.rs#L9) — El esquema de contenido de asentamientos que este validador acepta.
  - Declaración: `pub const SETTLEMENTS_SCHEMA_VERSION: u32 = 1;`

#### Tipos

- [`SettlementCatalog`](catalog.rs#L78) — El contenido validado: `spacing` (columnas entre sitios candidatos), `chance` (proporción de sitios que hospedan poblado), la banda de radios, el perfil del yermo, las reglas de vegetación y las zonas en orden de archivo.
  - Declaración: `pub struct SettlementCatalog { pub schema_version: u32, pub spacing: i32, pub chance: f64, pub radius_min: f64, pub radius_max: f64, pub wilderness: ZoneProfile, pub greens: GreensRules, pub zones: Vec<SettlementZone>, }`

- [`SettlementZone`](catalog.rs#L31) — Una zona semántica: cuántas semillas suelta (`seeds`), en qué banda del radio se sientan (`ring`, fracciones de near a far), cuánto ensancha su celda (`pull`, fracción del radio) y qué hace crecer (`profile`).
  - Declaración: `pub struct SettlementZone { pub id: String, pub seeds: u32, pub ring: (f64, f64), pub pull: f64, pub profile: ZoneProfile, }`

- [`GreensRules`](catalog.rs#L46) — Cómo se agrupa la vegetación de un poblado alrededor de lo que ya está en pie: `spacing` (hueco lejos de todo edificio), `tight` (hueco pegado a una pared), la banda `near`–`far` sobre la que se interpola, `front` (columnas despejadas delante de cada fachada) y el `patio` de cada edificio.
  - Declaración: `pub struct GreensRules { pub spacing: f64, pub tight: f64, pub near: f64, pub far: f64, pub front: i32, pub patio: PatioRules, }`

- [`PatioRules`](catalog.rs#L63) — El grupo que cada edificio cuelga de su parte trasera: `chance` (qué proporción de edificios lo tiene), `min`–`max` plantas, `reach` (columnas hacia atrás) y `grove_chance` (qué proporción de esas plantas es un bosquete en vez de un árbol suelto).
  - Declaración: `pub struct PatioRules { pub chance: f64, pub min: u32, pub max: u32, pub reach: i32, pub grove_chance: f64, }`

- [`ZoneProfile`](catalog.rs#L14) — Lo que una zona hace crecer: un multiplicador por blueprint sobre su peso wfc, resuelto en el parseo contra el orden del catálogo de entidades (una clave de familia se expande a sus miembros, y una clave de blueprint gana sobre la familia a la que pertenece), y `greens`, cuánto aprieta el hueco de la vegetación de poblado que crece en ella (`0` no planta ninguna, `1` conserva el hueco del contenido).
  - Declaración: `pub struct ZoneProfile { pub greens: f64, multipliers: Vec<f64>, }`

- [`SettlementError`](catalog.rs#L99) — Todo lo que el contenido puede declarar mal: esquema no soportado, JSON ilegible, catálogo sin zonas, ids vacíos o repetidos, `spacing` no positivo, `chance` fuera de `(0, 1]`, banda de radios no finita o descendente, `spacing` que dejaría solaparse dos poblados, una zona sin semillas, `ring` fuera de `[0, 1]` o dada la vuelta, `pull`, `greens`, `default` o multiplicadores no finitos o negativos, reglas de vegetación o de patio incoherentes (huecos no finitos o no positivos, banda `near`–`far` dada la vuelta, despeje negativo, `chance` o `groveChance` fuera de `[0, 1]`, `min` mayor que `max`), y claves que no nombran ni blueprint ni familia.
  - Declaración: `pub enum SettlementError { ... }`

### `field.rs`

#### Funciones y métodos

- [`new`](field.rs#L83) — Construye el campo de asentamientos para `catalog` en el mundo de `seed`, derivando una corriente por zona para las semillas y una para el sitio, el desplazamiento y el radio.
  - Firma: `pub fn new(seed: u64, catalog: &SettlementCatalog) -> Self {`

- [`catalog`](field.rs#L100) — El contenido con el que se construyó el campo.
  - Firma: `pub fn catalog(&self) -> &SettlementCatalog {`

- [`settlement_at`](field.rs#L106) — El asentamiento que cubre la columna `(x, y)`, o `None` en campo abierto. Mira los nueve sitios candidatos alrededor de la columna; como el contenido exige sitios más separados que dos radios, como mucho uno la cubre.
  - Firma: `pub fn settlement_at(&self, x: i32, y: i32) -> Option<Settlement> {`

- [`zone_at`](field.rs#L126) — El índice de la zona que posee la columna `(x, y)`, o `None` en campo abierto.
  - Firma: `pub fn zone_at(&self, x: i32, y: i32) -> Option<usize> {`

- [`zone_id_at`](field.rs#L132) — El id de la zona que posee la columna `(x, y)`, o `None` en campo abierto.
  - Firma: `pub fn zone_id_at(&self, x: i32, y: i32) -> Option<&str> {`

- [`zones_over`](field.rs#L140) — La zona de cada columna de `coords`, en el mismo orden. Resuelve cada sitio candidato una vez en lugar de una vez por columna, que es lo que quiere el pase de colocación de un chunk; la respuesta es la misma que daría `zone_at` columna a columna.
  - Firma: `pub fn zones_over(&self, coords: &[WorldCoord]) -> Vec<Option<usize>> {`

- [`profile_of`](field.rs#L174) — Lo que hace crecer una zona ya resuelta; `None` es el yermo de fuera de todo poblado.
  - Firma: `pub fn profile_of(&self, zone: Option<usize>) -> &ZoneProfile {`

- [`greens_of`](field.rs#L183) — Cuánta vegetación de poblado crece en una zona ya resuelta; `0` no planta ninguna, y el yermo de fuera de todo poblado no planta la suya (sus bosques son los del bioma).
  - Firma: `pub fn greens_of(&self, zone: Option<usize>) -> f64 {`

- [`greens_spacing`](field.rs#L193) — El hueco que guarda la vegetación de `zone` a `distance` columnas del edificio más cercano: apretado contra una pared, abierto en el claro, e interpolado entre `near` y `far`; la densidad de la zona divide el resultado y el mínimo es una columna. `None` cuando la zona no planta nada.
  - Firma: `pub fn greens_spacing(&self, zone: Option<usize>, distance: f64) -> Option<f64> {`


- [`profile_at`](field.rs#L169) — Lo que crece en la columna `(x, y)`: el perfil de su zona, o el del yermo fuera de todo poblado.
  - Firma: `pub fn profile_at(&self, x: i32, y: i32) -> &ZoneProfile {`


- [`zone_at`](field.rs#L51) — El índice de la zona que posee la columna dentro de un asentamiento concreto, o `None` cuando cae fuera del radio. El dueño es la semilla con menor distancia menos su alcance: un Voronoi aditivo pesado, que dobla las fronteras en algo orgánico en lugar de anillos concéntricos.
  - Firma: `pub fn zone_at(&self, x: i32, y: i32) -> Option<usize> {`

#### Tipos

- [`WorldSettlements`](field.rs#L72) — Los asentamientos de un mundo: el campo que los coloca y las zonas de cada uno. Compartido, inmutable y reconstruido desde la semilla, así que una partida reabierta vuelve a trazar los mismos poblados.
  - Declaración: `pub struct WorldSettlements { catalog: SettlementCatalog, site: u64, jitter_x: u64, jitter_y: u64, radius: u64, zone_streams: Vec<u64>, }`

- [`Settlement`](field.rs#L37) — Un poblado: su columna central, su radio en columnas y las semillas de zona sembradas a su alrededor.
  - Declaración: `pub struct Settlement { pub center: WorldCoord, pub radius: f64, seeds: Vec<ZoneSeed>, }`
