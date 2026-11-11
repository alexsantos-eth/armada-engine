# Water

Este dominio calcula cómo las superficies de agua reciben, delimitan y recortan reflejos como geometría pura. Proporciona datos espaciales para que distintas presentaciones representen el agua de manera coherente.

Las operaciones deben mantenerse independientes de texturas y render targets, y usar las convenciones de coordenadas compartidas por grid y projection. Los resultados no deben mutar el mundo.

No crea efectos de shader ni vistas de reflejo. El cliente convierte las geometrías calculadas en recursos visuales.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `reflection.rs`

#### Funciones y métodos

- [`waterline`](reflection.rs#L13) — `y` en pantalla de la superficie del agua bajo algo que está de pie en `feet_y`, en píxeles.
  - Firma: `pub fn waterline(feet_y: f64, elevation: f64, level: f64, box_height: f64) -> f64 {`

- [`mirror_sprite`](reflection.rs#L29) — El reflejo del sprite dibujado en `layout`: el mismo dibujo boca abajo sobre
  - Firma: `pub fn mirror_sprite( layout: SpriteLayout, waterline: f64, turn_at: Option<f64>, ) -> ReflectedSprite {`

- [`lay_on_water`](reflection.rs#L49) — Un sprite ya dibujado tal como lo muestra el agua: colocado donde se puso, sin voltear.
  - Firma: `pub fn lay_on_water(layout: SpriteLayout) -> ReflectedSprite {`

- [`cell_top`](reflection.rs#L58) — Las cuatro esquinas de la cara superior de una casilla en pantalla, desde la esquina hacia la cámara.
  - Firma: `pub fn cell_top(cell: (i32, i32), level: f64, projection: ProjectionConfig) -> [(f64, f64); 4] {`

- [`reflection_cells`](reflection.rs#L73) — Las casillas sobre cuya cara superior podría caer un reflejo, como rango `((min_x, min_y), (max_x,
  - Firma: `pub fn reflection_cells( sprite: &ReflectedSprite, level: f64, projection: ProjectionConfig, ) -> Option<((i32, i32), (i32, i32))> {`

- [`reflection_piece`](reflection.rs#L124) — La parte de `sprite` que cae sobre la cara superior de la casilla `cell`, o `None` cuando no cae ninguna.
  - Firma: `pub fn reflection_piece( sprite: &ReflectedSprite, cell: &[(f64, f64); 4], ) -> Option<ReflectionPiece> {`


#### Constantes

- [`MAX_REFLECTION_CELLS`](reflection.rs#L7) — Cuántas casillas desde la primera se sigue un reflejo, a lo largo de cada eje.
  - Declaración: `pub const MAX_REFLECTION_CELLS: i32 = 24;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `reflection.rs`

#### Funciones internas

- [`clip`](reflection.rs#L165) — Recorta `polygon` al lado interior de la arista de `from` a `to`, in situ.
  - Firma: `fn clip(polygon: &mut Vec<(f64, f64)>, from: (f64, f64), to: (f64, f64), turn: f64) {`

- [`area`](reflection.rs#L192) — El área con signo de un polígono, positiva cuando está orientada en un sentido y negativa en el otro.
  - Firma: `fn area(polygon: &[(f64, f64)]) -> f64 {`

#### Constantes internas

- [`MIN_PIECE_AREA`](reflection.rs#L10) — Área en pantalla, en píxeles, por debajo de la cual una pieza se descarta en lugar de dibujarse.
  - Declaración: `const MIN_PIECE_AREA: f64 = 0.01;`
