# Terrain

Este dominio de cliente construye las vistas, apariencias y bloques visibles del terreno a partir de `iso::terrain`. Traduce columnas, materiales y apariencia lógica a composiciones de sprites y órdenes de dibujo.

Debe reutilizar las convenciones de proyección, assets y orden de escena compartidas. La invalidación de vistas y la reutilización de recursos visuales se mantienen aquí, separadas de la generación del terreno.

No modifica la topología ni la semilla del mundo. El crate `iso` sigue siendo autoridad sobre los datos de terreno.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `terrain_view.rs`

#### Constantes

- [`MATERIALS`](terrain_view.rs#L6) — Todos los materiales de terreno, en el orden en que los indexan los arrays de la vista.
  - Declaración: `pub const MATERIALS: [TerrainMaterial; 6] = [ TerrainMaterial::Water, TerrainMaterial::Sand, TerrainMaterial::Ground, TerrainMaterial::Grass, TerrainMaterial::Path, TerrainMaterial::Stairs, ];`

- [`MATERIAL_SLOTS`](terrain_view.rs#L16) — Cuántos slots necesita un array indexado por material.
  - Declaración: `pub const MATERIAL_SLOTS: usize = MATERIALS.len();`

#### Funciones y métodos

- [`slot`](terrain_view.rs#L19) — Devuelve la posición de `material` dentro de los arrays indexados por material.
  - Firma: `pub const fn slot(material: TerrainMaterial) -> usize {`

### `terrain_view_appearance.rs`

#### Funciones y métodos

- [`new`](terrain_view_appearance.rs#L70) — Resuelve el catálogo, pidiendo a `artwork` el frame y la medida de la cara superior de cada cara superior que una columna puede hacer crecer; cuando recibe los biomas del mundo, cada bioma pinta su propia hierba y tierra, si no, el mundo entero guarda la paleta global.
  - Firma: `pub fn new( seed: u64, artwork: impl Fn(&str) -> Option<(SpriteFrame, InkBox)>, biomes: Option<&WorldBiomes>, ) -> (Self, Vec<&'static str>) {`

- [`tint`](terrain_view_appearance.rs#L116) — Por lo que se multiplica un bloque de `material` apoyado en la columna `(x, y)`; con biomas, el tinte sale de la paleta del bioma que cubre la columna, sin biomas sale de la paleta global.
  - Firma: `pub fn tint(&self, material: TerrainMaterial, x: i32, y: i32) -> Color {`

- [`top`](terrain_view_appearance.rs#L134) — El artwork de la cara superior que la columna `(x, y)` hace crecer, si su material hace crecer algo ahí.
  - Firma: `pub fn top(&self, material: TerrainMaterial, x: i32, y: i32) -> Option<(SpriteFrame, InkBox)> {`

### `terrain_view_blocks.rs`

#### Funciones y métodos

- [`new`](terrain_view_blocks.rs#L36) — Resuelve cada material contra el atlas: su bloque y su sprite de reflejo, y los dieciséis bloques de camino contra la máscara de conexión (bit `1` +x, `2` +y, `4` −x, `8` −y). Devuelve, por ese orden, los materiales de los que no hay bloque, los de los que no hay sprite de reflejo y las máscaras de los bloques de camino de los que no hay variante.
  - Firma: `pub fn new( atlas: &SpriteAtlas, ) -> (Self, Vec<TerrainMaterial>, Vec<TerrainMaterial>, Vec<u8>) {`

- [`frame`](terrain_view_blocks.rs#L88) — El frame de bloque de `material`, ya resuelto contra el atlas.
  - Firma: `pub fn frame(&self, material: TerrainMaterial) -> Option<(SpriteFrame, InkBox)> {`

- [`path`](terrain_view_blocks.rs#L93) — El bloque de camino cuyas bandas unen las caras de la máscara de conexión `mask` (solo los cuatro bits bajos).
  - Firma: `pub fn path(&self, mask: u8) -> Option<(SpriteFrame, InkBox)> {`

- [`stairs`](terrain_view_blocks.rs) — El bloque de gradas cuya subida va hacia `direction`, la que devuelve `iso::terrain::stairs_direction` para esa columna.
  - Firma: `pub fn stairs(&self, direction: WorldCoord) -> Option<(SpriteFrame, InkBox)> {`

- [`reflection`](terrain_view_blocks.rs#L106) — El sprite de reflejo de `material` (las caras laterales dibujadas como las muestra el agua), ya resuelto contra el atlas.
  - Firma: `pub fn reflection(&self, material: TerrainMaterial) -> Option<(SpriteFrame, InkBox)> {`

- [`collect_terrain_sprites`](terrain_view_blocks.rs#L158) — Encola los sprites de `columns`, que el llamante ordena y dibuja con todo lo demás. El bloque de superficie `Path` dibuja la variante cuyo mask de conexión (`iso::terrain::connection_mask` sobre las superficies de `surface_at`) corresponde; una variante ausente cae al bloque de camino plano. Cada bloque por encima del agua también encola el sprite de reflejo de su material, colgando de la línea de agua con una banda por bloque (`Reflected::AsDrawn`, cortada a las casillas de agua que cubre); las columnas de agua no se reflejan. Los reflejos se dirigen a una cola aparte y se vacían de atrás hacia delante (`coord.x + coord.y` descendente) al final de la pasada, para que en una casilla compartida por dos bloques el bloque de delante pinte sobre el sliver del bloque de atrás. Una columna retranqueada entre dos vecinos de delante de la misma altura o mayor no refleja: las alas tapan la cuña de agua donde caería su reflejo y su banda asomaría entre ellas como un triángulo suelto en el vértice interior. `surroundings` es cómo contesta el mundo por las casillas alrededor de una columna, y `screen` es el tamaño de ventana contra el que se comprueba la visibilidad de cada bloque.
  - Firma: `pub fn collect_terrain_sprites<H, W, S>( columns: &[TerrainColumn], projection: ProjectionConfig, frames: &TerrainFrames, look: &TerrainLook, surroundings: Surroundings<H, W, S>, screen: (f64, f64), out: &mut Vec<SpriteDraw>, ) where H: Fn(WorldCoord) -> Option<i32>, W: Fn(i32, i32) -> Option<WaterCell>, S: Fn(WorldCoord) -> Option<TerrainMaterial> {`

#### Tipos

- [`Surroundings`](terrain_view_blocks.rs#L140) — Cómo contesta el mundo por las casillas alrededor de una columna: su altura de streaming, el agua, si la hay, que yace sobre ellas, y la superficie de cada una, que el bloque de superficie de camino lee para elegir su máscara de conexión.
  - Declaración: `pub struct Surroundings<H, W, S> where H: Fn(WorldCoord) -> Option<i32>, W: Fn(i32, i32) -> Option<WaterCell>, S: Fn(WorldCoord) -> Option<TerrainMaterial> { pub height_at: H, pub water_at: W, pub surface_at: S, }`

#### Constantes

- [`TERRAIN_LAYER`](terrain_view_blocks.rs#L17) — El terreno se dibuja por debajo de todo lo que se apoya en él.
  - Declaración: `pub const TERRAIN_LAYER: i32 = 0;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `terrain_view_appearance.rs`

#### Constantes internas

- [`GRASS_TINTS`](terrain_view_appearance.rs#L11) — Zonas de hierba globales, del ruido más bajo al más alto: frondosa y más oscura, ligeramente más oscura, llana,
  - Declaración: `const GRASS_TINTS: (f64, &[u32]) = (10.0, &[0xbfd5bd, 0xdde9d4, 0xffffff, 0xfff0c0, 0xffe49c]);`

- [`LAND_TINTS`](terrain_view_appearance.rs#L14) — Suelo desnudo y los tonos de tierra globales: mucho más sutiles que la hierba, porque la tierra no tiene
  - Declaración: `const LAND_TINTS: (f64, &[u32]) = (11.0, &[0xffffff, 0xfffbea, 0xf4f9df, 0xf2f5d6]);`

- [`GRASS_TINT_SCALE`](terrain_view_appearance.rs#L17) — Ancho de un borrón de zona de hierba o camino, en columnas.
  - Declaración: `const GRASS_TINT_SCALE: f64 = 10.0;`

- [`GROUND_TINT_SCALE`](terrain_view_appearance.rs#L19) — Ancho de un borrón de zona de tierra, en columnas.
  - Declaración: `const GROUND_TINT_SCALE: f64 = 11.0;`

- [`GRASS_TOPS`](terrain_view_appearance.rs#L22) — Las caras superiores extra que una columna de hierba puede hacer crecer, y la proporción de toda la hierba que cada una debería cubrir.
  - Declaración: `const GRASS_TOPS: &[(&str, f64)] = &[ ("/assets/grass/block_flowers.svg", 0.05), ("/assets/grass/block_flowers_2.svg", 0.04), ("/assets/grass/block_wildflowers_red.svg", 0.025), ("/assets/grass/block_wildflowers_white.svg", 0.025), ("/assets/grass/block_sprouts.svg", 0.07), ("/assets/grass/block_leaves.svg", 0.04), ("/assets/grass/block_pebbles.svg", 0.035), ("/assets/grass/block_mushrooms.svg", 0.015), ("/assets/grass/block_bushes.svg", 0.02), ];`

### `terrain_view_blocks.rs`

#### Funciones internas

- [`reach`](terrain_view_blocks.rs#L111) — Hasta dónde llega el artwork de cualquiera de estos materiales por encima y por debajo del suelo que
  - Firma: `fn reach(&self, tile_width: f64) -> (f64, f64) {`

- [`ReflectionJob`](terrain_view_blocks.rs#L127) — Trabajo de reflejo encolado durante la pasada principal y vaciado al final, de atrás hacia delante (`coord.x + coord.y` descendente), para que en una casilla compartida el bloque de delante pinte sobre el sliver del bloque de atrás.
  - Declaración: `struct ReflectionJob { depth: i32, frame: SpriteFrame, layout: SpriteLayout, feet: ScreenPoint, level: f64, }`

- [`exposed_floor`](terrain_view_blocks.rs#L323) — El bloque más bajo de una columna que aún debe dibujarse: tan abajo como el más bajo de las
  - Firma: `fn exposed_floor(elevation: i32, in_front: impl IntoIterator<Item = Option<i32>>) -> i32 {`

#### Constantes internas

- [`MAX_EXPOSED_BLOCKS`](terrain_view_blocks.rs#L20) — Hasta qué punto por debajo de su superficie se apila alguna vez una columna. Una columna junto a una fosa marina profunda
  - Declaración: `const MAX_EXPOSED_BLOCKS: i32 = 10;`
