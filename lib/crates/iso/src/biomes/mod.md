# Biomes

Este dominio modela los biomas de naturaleza del mundo: qué árboles crecen en cada región, en qué proporción, con qué paleta de suelo y con qué fuerza de viento los mece. Los biomas no aparecen en los edificios ni en las estructuras: solo naturaleza. Agrupa el catálogo de contenido (`content/biomes.json`), su validación cruzada contra el catálogo de entidades, el campo que decide qué bioma cubre cada columna y los bosquetes monospecíficos que cada bioma hace crecer.

El bioma es una función pura de la semilla y las coordenadas: no se guarda en disco, se recomputa al cargar. El crate `iso` no conoce texturas ni sprites: el cliente decide cómo se pinta cada paleta.

No modifica la topología del terreno: agua, arena y elevación mandan sobre dónde puede crecer algo; el bioma decide qué crece y de qué color se dibuja la tierra.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `catalog.rs`

#### Funciones y métodos

- [`parse_biomes`](catalog.rs#L175) — Parsea y valida el contenido de biomas contra el catálogo de entidades que referencia. Una especie que el catálogo de entidades no tiene es un error de carga, no un árbol que nunca brota.
  - Firma: `pub fn parse_biomes(json: &str, entities: &EntityCatalog) -> Result<BiomeCatalog, BiomeError> {`

#### Constantes

- [`BIOMES_SCHEMA_VERSION`](catalog.rs#L8) — El esquema de contenido de biomas que este validador acepta.
  - Declaración: `pub const BIOMES_SCHEMA_VERSION: u32 = 1;`

#### Tipos

- [`BiomeCatalog`](catalog.rs#L38) — El contenido de biomas validado: la versión de esquema y los biomas en orden de archivo, estable para un catálogo cargado.
  - Declaración: `pub struct BiomeCatalog { pub schema_version: u32, pub biomes: Vec<Biome>, }`

- [`Biome`](catalog.rs#L21) — Un bioma: su `share` (peso relativo de cobertura mundial), su `tree_coverage` (proporción de columnas del mundo en las que brotan árboles, bosquetes incluidos), las especies elegibles con su peso, su `wind_strength` (multiplicador del sesgo con que el viento mece los sprites con `sway` en su suelo; `0` es aire quieto, `1` la amplitud de autor; opcional, por defecto `1`) y sus paletas de suelo (`grassTints` para hierba y camino, `groundTints` para tierra desnuda; multiplicadores `0xRRGGBB`, de oscuro a claro). Un bioma sin árboles es legal.
  - Declaración: `pub struct Biome { pub id: String, pub share: f64, pub tree_coverage: f64, pub trees: Vec<BiomeTree>, pub wind_strength: f64, pub grass_tints: Vec<u32>, pub ground_tints: Vec<u32>, }`

- [`BiomeTree`](catalog.rs#L12) — Una especie elegible en el bioma: el `blueprint` que la habilita y el `weight` relativo con que entra en los bosquetes.
  - Declaración: `pub struct BiomeTree { pub blueprint: String, pub weight: f64, }`

- [`BiomeError`](catalog.rs#L47) — Todo lo que el contenido de biomas puede declarar mal: esquema no soportado, JSON ilegible, catálogo vacío, ids vacíos o repetidos, `share` o `tree_coverage` no finitos o fuera de rango, pesos no positivos, `blueprint` que el catálogo de entidades no tiene, colores que no son seis dígitos hex, `windStrength` no finito o negativo.
  - Declaración: `pub enum BiomeError { ... }`

### `field.rs`

#### Funciones y métodos

- [`new`](field.rs#L26) — Construye el campo de biomas para `biomes`, calibrando los cortes entre zonas para que las `share` se respeten de media en la rejilla de medición.
  - Firma: `pub fn new(seed: u64, biomes: &[Biome]) -> Self {`

- [`at`](field.rs#L43) — El índice en el catálogo del bioma que cubre la columna `(x, y)`.
  - Firma: `pub fn at(&self, x: i32, y: i32) -> usize {`

- [`new`](field.rs#L63) — Construye las regiones y los bosquetes para `catalog` en el mundo de `seed`. Los bosquetes son un `VariantPicker` por bioma con el `tree_coverage` repartido entre especies según su peso: las manchas resultantes son monospecíficas.
  - Firma: `pub fn new(seed: u64, catalog: &BiomeCatalog) -> Self {`

- [`biome`](field.rs#L93) — El bioma que cubre la columna `(x, y)`.
  - Firma: `pub fn biome(&self, x: i32, y: i32) -> &Biome {`

- [`biomes`](field.rs#L98) — Los biomas del catálogo, en orden de catálogo; los índices de slots de tinte se corresponden con este orden.
  - Firma: `pub fn biomes(&self) -> &[Biome] {`

- [`biome_index`](field.rs#L103) — El índice en el catálogo del bioma que cubre la columna `(x, y)`.
  - Firma: `pub fn biome_index(&self, x: i32, y: i32) -> usize {`

- [`formation`](field.rs#L108) — El índice de especie que el bioma de la columna hace crecer ahí, o `None` para suelo abierto (fuera de bosquete).
  - Firma: `pub fn formation(&self, x: i32, y: i32) -> Option<usize> {`

- [`species_of`](field.rs#L115) — Todos los pares `(índice de bioma, índice de especie)` que declaran `blueprint` como especie elegible; vacío si ningún bioma la reclama.
  - Firma: `pub fn species_of(&self, blueprint: &str) -> Vec<(usize, usize)> {`

#### Constantes

- [`BIOME_FIELD_SCALE`](field.rs#L9) — Ancho de una región de bioma en columnas de mundo; las manchas abarcan varios chunks, así que una región se ve desde dentro de ella.
  - Declaración: `pub const BIOME_FIELD_SCALE: f64 = 200.0;`

#### Tipos

- [`WorldBiomes`](field.rs#L55) — Los biomas de un mundo: dónde cae cada uno (campo calibrado) y qué brota en sus bosquetes (un `VariantPicker` por bioma). Se clona barato y se reconstruye de la semilla, así que un guardado reabierto pinta las mismas regiones.
  - Declaración: `pub struct WorldBiomes { ... }`

- [`BiomeField`](field.rs#L18) — Qué bioma cubre una columna: un campo ancho cortado en tantos tramos como biomas declara el catálogo, calibrado por cuantiles para que las `share` se respeten de media.
  - Declaración: `pub struct BiomeField { ... }`
