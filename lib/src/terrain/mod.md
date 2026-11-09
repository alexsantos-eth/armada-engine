# Terrain

Este dominio de cliente construye las vistas, apariencias y bloques visibles del terreno a partir de `iso::terrain`. Traduce columnas, materiales y apariencia lógica a composiciones de sprites y órdenes de dibujo.

Debe reutilizar las convenciones de proyección, assets y orden de escena compartidas. La invalidación de vistas y la reutilización de recursos visuales se mantienen aquí, separadas de la generación del terreno.

No modifica la topología ni la semilla del mundo. El crate `iso` sigue siendo autoridad sobre los datos de terreno.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `terrain_view.rs`

#### Constantes

- [`MATERIALS`](terrain_view.rs#L6) — Every terrain material, in the order the view's arrays index them.
  - Declaración: `pub const MATERIALS: [TerrainMaterial; 5] = [ TerrainMaterial::Water, TerrainMaterial::Sand, TerrainMaterial::Ground, TerrainMaterial::Grass, TerrainMaterial::Path, ];`

- [`MATERIAL_SLOTS`](terrain_view.rs#L15) — How many slots an array indexed by material needs.
  - Declaración: `pub const MATERIAL_SLOTS: usize = MATERIALS.len();`

#### Funciones y métodos

- [`slot`](terrain_view.rs#L18) — Devuelve la posición de `material` dentro de los arrays indexados por material.
  - Firma: `pub const fn slot(material: TerrainMaterial) -> usize {`

### `terrain_view_appearance.rs`

#### Funciones y métodos

- [`new`](terrain_view_appearance.rs#L38) — Resolves the catalogue, asking `artwork` for the frame and the measurement of each top's
  - Firma: `pub fn new( seed: u64, artwork: impl Fn(&str) -> Option<(SpriteFrame, InkBox)>, ) -> (Self, Vec<&'static str>) {`

- [`tint`](terrain_view_appearance.rs#L68) — What a block of `material` standing on column `(x, y)` is multiplied by.
  - Firma: `pub fn tint(&self, material: TerrainMaterial, x: i32, y: i32) -> Color {`

- [`top`](terrain_view_appearance.rs#L77) — The artwork of the top column `(x, y)` grows, if its material grows anything there.
  - Firma: `pub fn top(&self, material: TerrainMaterial, x: i32, y: i32) -> Option<(SpriteFrame, InkBox)> {`

### `terrain_view_blocks.rs`

#### Funciones y métodos

- [`new`](terrain_view_blocks.rs#L26) — Resolves every material against the atlas. Returns the materials the atlas has no
  - Firma: `pub fn new(atlas: &SpriteAtlas) -> (Self, Vec<TerrainMaterial>) {`

- [`frame`](terrain_view_blocks.rs#L41) — Calcula o recupera «frame» según los parámetros de la firma.
  - Firma: `pub fn frame(&self, material: TerrainMaterial) -> Option<(SpriteFrame, InkBox)> {`

- [`collect_terrain_sprites`](terrain_view_blocks.rs#L60) — Queues the sprites for `columns`, which the caller sorts and draws with everything else.
  - Firma: `pub fn collect_terrain_sprites( columns: &[TerrainColumn], projection: ProjectionConfig, frames: &TerrainFrames, look: &TerrainLook, height_at: impl Fn(WorldCoord) -> Option<i32>, out: &mut Vec<SpriteDraw>, ) {`

#### Constantes

- [`TERRAIN_LAYER`](terrain_view_blocks.rs#L14) — Terrain draws below everything that stands on it.
  - Declaración: `pub const TERRAIN_LAYER: i32 = 0;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `terrain_view_appearance.rs`

#### Constantes internas

- [`GRASS_TINTS`](terrain_view_appearance.rs#L10) — Grass zones, from the lowest noise to the highest: lush and darker, slightly darker, plain,
  - Declaración: `const GRASS_TINTS: (f64, &[u32]) = (10.0, &[0xbfd5bd, 0xdde9d4, 0xffffff, 0xfff0c0, 0xffe49c]);`

- [`LAND_TINTS`](terrain_view_appearance.rs#L13) — Bare ground and the broader land tones: much subtler than the grass, because dirt has no
  - Declaración: `const LAND_TINTS: (f64, &[u32]) = (11.0, &[0xffffff, 0xfffbea, 0xf4f9df, 0xf2f5d6]);`

- [`GRASS_TOPS`](terrain_view_appearance.rs#L16) — The extra tops a grass column can grow, and the share of all grass each should cover.
  - Declaración: `const GRASS_TOPS: &[(&str, f64)] = &[ ("/assets/grass/block_flowers.svg", 0.05), ("/assets/grass/block_flowers_2.svg", 0.04), ("/assets/grass/block_wildflowers_red.svg", 0.025), ("/assets/grass/block_wildflowers_white.svg", 0.025), ("/assets/grass/block_sprouts.svg", 0.07), ("/assets/grass/block_leaves.svg", 0.04), ("/assets/grass/block_pebbles.svg", 0.035), ("/assets/grass/block_mushrooms.svg", 0.015), ("/assets/grass/block_bushes.svg", 0.02), ];`

### `terrain_view_blocks.rs`

#### Funciones internas

- [`reach`](terrain_view_blocks.rs#L46) — How far the artwork of any of these materials reaches above and below the ground it
  - Firma: `fn reach(&self, tile_width: f64) -> (f64, f64) {`

- [`exposed_floor`](terrain_view_blocks.rs#L142) — The lowest block of a column that still has to be drawn: as far down as the lowest of the
  - Firma: `fn exposed_floor(elevation: i32, in_front: impl IntoIterator<Item = Option<i32>>) -> i32 {`

#### Constantes internas

- [`MAX_EXPOSED_BLOCKS`](terrain_view_blocks.rs#L17) — How far below its surface a column is ever stacked. A column beside a deep sea trench would
  - Declaración: `const MAX_EXPOSED_BLOCKS: i32 = 10;`
