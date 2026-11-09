# Water

Este dominio calcula cómo las superficies de agua reciben, delimitan y recortan reflejos como geometría pura. Proporciona datos espaciales para que distintas presentaciones representen el agua de manera coherente.

Las operaciones deben mantenerse independientes de texturas y render targets, y usar las convenciones de coordenadas compartidas por grid y projection. Los resultados no deben mutar el mundo.

No crea efectos de shader ni vistas de reflejo. El cliente convierte las geometrías calculadas en recursos visuales.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `reflection.rs`

#### Funciones y métodos

- [`waterline`](reflection.rs#L13) — Screen `y` of the water's surface under something standing on `feet_y`, in pixels.
  - Firma: `pub fn waterline(feet_y: f64, elevation: f64, level: f64, box_height: f64) -> f64 {`

- [`mirror_sprite`](reflection.rs#L29) — The reflection of the sprite drawn into `layout`: the same drawing upside down about
  - Firma: `pub fn mirror_sprite( layout: SpriteLayout, waterline: f64, turn_at: Option<f64>, ) -> ReflectedSprite {`

- [`lay_on_water`](reflection.rs#L49) — A sprite that is already drawn as the water shows it: laid where it was placed, unflipped.
  - Firma: `pub fn lay_on_water(layout: SpriteLayout) -> ReflectedSprite {`

- [`cell_top`](reflection.rs#L58) — The four corners of a cell's top face on screen, from the corner towards the camera.
  - Firma: `pub fn cell_top(cell: (i32, i32), level: f64, projection: ProjectionConfig) -> [(f64, f64); 4] {`

- [`reflection_cells`](reflection.rs#L73) — The cells whose tops a reflection could fall on, as inclusive `((min_x, min_y), (max_x,
  - Firma: `pub fn reflection_cells( sprite: &ReflectedSprite, level: f64, projection: ProjectionConfig, ) -> Option<((i32, i32), (i32, i32))> {`

- [`reflection_piece`](reflection.rs#L127) — The part of `sprite` that falls on the cell top `cell`, or `None` when none of it does.
  - Firma: `pub fn reflection_piece( sprite: &ReflectedSprite, cell: &[(f64, f64); 4], ) -> Option<ReflectionPiece> {`

#### Constantes

- [`MAX_REFLECTION_CELLS`](reflection.rs#L7) — How many cells from the first a reflection is followed, along either axis.
  - Declaración: `pub const MAX_REFLECTION_CELLS: i32 = 24;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `reflection.rs`

#### Funciones internas

- [`clip`](reflection.rs#L168) — Cuts `polygon` down to the inner side of the edge from `from` to `to`, in place.
  - Firma: `fn clip(polygon: &mut Vec<(f64, f64)>, from: (f64, f64), to: (f64, f64), turn: f64) {`

- [`area`](reflection.rs#L195) — The signed area of a polygon, positive when it is wound one way and negative the other.
  - Firma: `fn area(polygon: &[(f64, f64)]) -> f64 {`

#### Constantes internas

- [`MIN_PIECE_AREA`](reflection.rs#L10) — Screen area, in pixels, below which a piece is dropped rather than drawn.
  - Declaración: `const MIN_PIECE_AREA: f64 = 0.01;`
