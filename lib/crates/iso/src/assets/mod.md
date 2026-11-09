# Assets

Este dominio describe los datos que componen un atlas: manifiestos versionados, marcos, hojas de poses y su geometría medida. Es la fuente de verdad para identificar sprites y sus límites sin acoplarse a un formato de imagen ni a una biblioteca gráfica.

Los módulos deben mantener datos serializables, validables y estables entre versiones. Las rutas o identificadores incluidos aquí son contratos de contenido; los cambios incompatibles requieren una migración explícita del manifiesto.

No carga archivos, no administra cachés y no dibuja texturas. Esas responsabilidades pertenecen al cliente de presentación.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `ink.rs`

#### Funciones y métodos

- [`elevation_step`](ink.rs#L19) — How far one elevation step rises on screen, for artwork drawn to this template.
  - Firma: `pub fn elevation_step(tile_width: f64) -> f64 {`

- [`rounded`](ink.rs#L34) — The box rounded to six decimals of a tile width, for writing into the manifest.
  - Firma: `pub fn rounded(self) -> Self {`

- [`scaled`](ink.rs#L45) — The same drawing scaled about the ground it stands on, so that it stays on its spot.
  - Firma: `pub fn scaled(self, by: f64) -> Self {`

- [`asset_ink`](ink.rs#L57) — Measures the artwork in `svg`, or `None` if it is not one asset drawn in the template.
  - Firma: `pub fn asset_ink(svg: &str) -> Option<InkBox> {`

- [`data_tiles`](ink.rs#L100) — The asset's declared footprint and height, `"3x1x5"`, if it has one.
  - Firma: `pub fn data_tiles(svg: &str) -> Option<&str> {`

- [`attribute`](ink.rs#L145) — The value of `name="..."` in `text`, matching the whole attribute name.
  - Firma: `pub(super) fn attribute<'a>(text: &'a str, name: &str) -> Option<&'a str> {`

#### Constantes

- [`SVG_TILE_WIDTH`](ink.rs#L4) — Width of one tile in the SVG's own units.
  - Declaración: `pub const SVG_TILE_WIDTH: f64 = 1024.0;`

- [`SVG_ANCHOR`](ink.rs#L7) — Screen position of the anchor cell's ground centre in the SVG's own units.
  - Declaración: `pub const SVG_ANCHOR: (f64, f64) = (512.0, 256.0);`

- [`SVG_BLOCK_HEIGHT`](ink.rs#L10) — Height of one block's body in the SVG's own units: how far one elevation step rises.
  - Declaración: `pub const SVG_BLOCK_HEIGHT: f64 = 341.0;`

### `layout.rs`

#### Funciones y métodos

- [`ink_layout`](layout.rs#L18) — Places an asset's artwork so that it lands where it was drawn, relative to `ground`: the
  - Firma: `pub fn ink_layout(ground: ScreenPoint, ink: InkBox, tile_width: f64) -> SpriteLayout {`

- [`corners`](layout.rs#L35) — Calcula o recupera «corners» según los parámetros de la firma.
  - Firma: `pub fn corners(&self) -> &[(f64, f64)] {`

- [`footprint_band`](layout.rs#L41) — The band of a multi-cell sprite that stands on the `index`-th cell of its footprint.
  - Firma: `pub fn footprint_band( layout: SpriteLayout, centre: ScreenPoint, step: (f64, f64), index: i32, cells: i32, bleed: f64, ) -> Option<SpriteBand> {`

### `manifest.rs`

#### Funciones y métodos

- [`primary_frame`](manifest.rs#L89) — Returns the first available frame (single or first of multiple).
  - Firma: `pub fn primary_frame(&self) -> Option<SpriteFrame> {`

- [`sheet_frame`](manifest.rs#L94) — The frame of the pose in `column` of `facing`'s row, for a sheet entry.
  - Firma: `pub fn sheet_frame(&self, facing: usize, column: usize) -> Option<SpriteFrame> {`

- [`texture_size`](manifest.rs#L104) — The size of the texture this entry's frames are cut from, which is the atlas unless the
  - Firma: `pub fn texture_size(&self, atlas: SpriteFrame) -> SpriteFrame {`

- [`frame_count`](manifest.rs#L109) — Number of animation frames.
  - Firma: `pub fn frame_count(&self) -> usize {`

- [`validate_manifest`](manifest.rs#L159) — Validates a manifest: schema version, unique ids, frames inside the atlas.
  - Firma: `pub fn validate_manifest(manifest: &AssetManifest) -> Result<(), ManifestError> {`

#### Constantes

- [`MANIFEST_SCHEMA_VERSION`](manifest.rs#L126) — Manifest schema version this crate understands.
  - Declaración: `pub const MANIFEST_SCHEMA_VERSION: u32 = 2;`

### `sheet.rs`

#### Funciones y métodos

- [`rows`](sheet.rs#L29) — Rows of the sheet: one per facing.
  - Firma: `pub fn rows(&self) -> usize {`

- [`cell_id`](sheet.rs#L34) — The id of the group holding the pose in `column` of `facing`'s row, as the artwork names
  - Firma: `pub fn cell_id(&self, facing: usize, column: usize) -> Option<String> {`

- [`ink`](sheet.rs#L44) — Where the artwork of every cell belongs over the ground the player stands on, in tile
  - Firma: `pub fn ink(&self) -> InkBox {`

- [`parse_sheet`](sheet.rs#L55) — Reads the grid out of a sheet's SVG, or `None` if it is not one (no `data-frames`).
  - Firma: `pub fn parse_sheet(svg: &str) -> Option<SheetGrid<'_>> {`

#### Constantes

- [`SVG_CANVAS_TOP`](sheet.rs#L6) — Top of the character template's canvas in the SVG's own units.
  - Declaración: `pub const SVG_CANVAS_TOP: f64 = -SVG_BLOCK_HEIGHT;`

### `terrain_sprites.rs`

#### Funciones y métodos

- [`terrain_sprite_source`](terrain_sprites.rs#L6) — Source path of the block asset that draws `material`.
  - Firma: `pub fn terrain_sprite_source(material: TerrainMaterial) -> &'static str {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `ink.rs`

#### Funciones internas

- [`footprint`](ink.rs#L105) — How far the footprint runs from its anchor and along which of the *drawing's* axes, out of
  - Firma: `fn footprint(svg: &str) -> (i32, bool) {`

- [`visible_elements`](ink.rs#L123) — The text of every element that draws something: outside those containers, and not one of the
  - Firma: `fn visible_elements(svg: &str) -> impl Iterator<Item = &str> {`

- [`points`](ink.rs#L164) — Every `x,y` pair in a path or polygon's geometry.
  - Firma: `fn points(geometry: &str) -> impl Iterator<Item = (f64, f64)> + '_ {`

#### Constantes internas

- [`ROW`](ink.rs#L13) — How far one cell along either axis moves *down* the screen, in tile widths: half a tile
  - Declaración: `const ROW: f64 = 0.25;`

- [`HALF_TILE`](ink.rs#L16) — How far one cell along either axis moves *across* the screen, in tile widths.
  - Declaración: `const HALF_TILE: f64 = 0.5;`

- [`SKIPPED`](ink.rs#L120) — Containers whose contents describe nothing that is drawn: filters and gradients, and the
  - Declaración: `const SKIPPED: [&str; 2] = ["defs", "metadata"];`

### `layout.rs`

#### Funciones internas

- [`clip`](layout.rs#L78) — Sutherland–Hodgman: the part of a convex polygon where `inside` is not negative.
  - Firma: `fn clip(band: SpriteBand, inside: impl Fn((f64, f64)) -> f64) -> Option<SpriteBand> {`

- [`push`](layout.rs#L99) — Añade el valor recibido a la colección o secuencia administrada.
  - Firma: `fn push(&mut self, corner: (f64, f64)) {`

### `manifest.rs`

#### Funciones internas

- [`fmt`](manifest.rs#L140) — Calcula o recupera «fmt» según los parámetros de la firma.
  - Firma: `fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {`
