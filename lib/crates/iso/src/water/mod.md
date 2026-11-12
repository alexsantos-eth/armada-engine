# Water

Este dominio calcula cómo las superficies de agua reciben, delimitan y recortan reflejos como geometría pura. Proporciona datos espaciales para que distintas presentaciones representen el agua de manera coherente.

Las operaciones deben mantenerse independientes de texturas y render targets, y usar las convenciones de coordenadas compartidas por grid y projection. Los resultados no deben mutar el mundo.

El barrido (blur) del reflejo también es geometría: el dominio dice en cuántas copias se parte, cuánto baja cada una y con qué opacidad se compone, y el cliente solo las dibuja.

No crea efectos de shader ni vistas de reflejo. El cliente convierte las geometrías calculadas en recursos visuales.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `reflection.rs`

#### Funciones y métodos

- [`waterline`](reflection.rs#L28) — `y` en pantalla de la superficie del agua bajo algo que está de pie en `feet_y`, en píxeles.
  - Firma: `pub fn waterline(feet_y: f64, elevation: f64, level: f64, box_height: f64) -> f64 {`

- [`mirror_sprite`](reflection.rs#L44) — El reflejo del sprite dibujado en `layout`: el mismo dibujo boca abajo sobre
  - Firma: `pub fn mirror_sprite( layout: SpriteLayout, waterline: f64, turn_at: Option<f64>, ) -> ReflectedSprite {`

- [`lay_on_water`](reflection.rs#L64) — Un sprite ya dibujado tal como lo muestra el agua: colocado donde se puso, sin voltear.
  - Firma: `pub fn lay_on_water(layout: SpriteLayout) -> ReflectedSprite {`

- [`cell_top`](reflection.rs#L88) — Las cuatro esquinas de la cara superior de una casilla en pantalla, desde la esquina hacia la cámara.
  - Firma: `pub fn cell_top(cell: (i32, i32), level: f64, projection: ProjectionConfig) -> [(f64, f64); 4] {`

- [`reflection_cells`](reflection.rs#L73) — Las casillas sobre cuya cara superior podría caer un reflejo, como rango `((min_x, min_y), (max_x,
  - Firma: `pub fn reflection_cells( sprite: &ReflectedSprite, level: f64, projection: ProjectionConfig, ) -> Option<((i32, i32), (i32, i32))> {`

- [`blur_radius`](reflection.rs#L180) — Lo ancho que el agua barre un reflejo que cuelga `depth` píxeles bajo su superficie, en píxeles.
  - Firma: `pub fn blur_radius(depth: f64) -> f64 {`

- [`blur_taps`](reflection.rs#L195) — Las copias en las que se dibuja un barrido de `radius` píxeles, desde el propio reflejo hacia abajo.
  - Firma: `pub fn blur_taps(radius: f64) -> [BlurTap; BLUR_TAPS] {`

- [`smear_sprite`](reflection.rs#L222) — El mismo reflejo dibujado `by` píxeles más hondo en el agua.
  - Firma: `pub fn smear_sprite(sprite: &ReflectedSprite, by: f64) -> ReflectedSprite {`

- [`piece_depth`](reflection.rs#L233) — Cuánto cuelga una pieza por debajo de `surface`, en píxeles, medido en su centro.
  - Firma: `pub fn piece_depth(piece: &ReflectionPiece, surface: f64) -> f64 {`

- [`reflection_piece`](reflection.rs#L139) — La parte de `sprite` que cae sobre la cara superior de la casilla `cell`, o `None` cuando no cae ninguna.
  - Firma: `pub fn reflection_piece( sprite: &ReflectedSprite, cell: &[(f64, f64); 4], ) -> Option<ReflectionPiece> {`


#### Tipos

- [`BlurTap`](reflection.rs#L187) — Una de las copias en las que se barre un reflejo: cuánto más hondo se dibuja y con qué opacidad sobre las copias anteriores. `alpha` 0 es una copia que ese barrido no necesita.
  - Firma: `pub struct BlurTap { pub offset: f64, pub alpha: f64, }`

#### Constantes

- [`BLUR_TAPS`](reflection.rs#L13) — Cuántas copias puede barrer la superficie rota del agua de un reflejo.
  - Declaración: `pub const BLUR_TAPS: usize = 5;`

- [`MAX_REFLECTION_CELLS`](reflection.rs#L7) — Cuántas casillas desde la primera se sigue un reflejo, a lo largo de cada eje.
  - Declaración: `pub const MAX_REFLECTION_CELLS: i32 = 24;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `reflection.rs`

#### Funciones internas

- [`clip`](reflection.rs#L242) — Recorta `polygon` al lado interior de la arista de `from` a `to`, in situ.
  - Firma: `fn clip(polygon: &mut Vec<(f64, f64)>, from: (f64, f64), to: (f64, f64), turn: f64) {`

- [`area`](reflection.rs#L269) — El área con signo de un polígono, positiva cuando está orientada en un sentido y negativa en el otro.
  - Firma: `fn area(polygon: &[(f64, f64)]) -> f64 {`

#### Constantes internas

- [`BLUR_AT_SURFACE`](reflection.rs#L16) — Lo que el agua barre lo que refleja justo en su superficie, en píxeles.
  - Declaración: `const BLUR_AT_SURFACE: f64 = 2.5;`

- [`BLUR_PER_PIXEL`](reflection.rs#L19) — Cuánto crece el barrido por cada píxel que un reflejo cuelga bajo la superficie.
  - Declaración: `const BLUR_PER_PIXEL: f64 = 0.11;`

- [`MAX_BLUR`](reflection.rs#L22) — Lo más ancho que llega a crecer el barrido, en píxeles.
  - Declaración: `const MAX_BLUR: f64 = 22.0;`

- [`BLUR_SPACING`](reflection.rs#L25) — Cada cuántos píxeles se dibuja una copia del barrido: uno estrecho gasta menos copias.
  - Declaración: `const BLUR_SPACING: f64 = 4.0;`

- [`MIN_PIECE_AREA`](reflection.rs#L10) — Área en pantalla, en píxeles, por debajo de la cual una pieza se descarta en lugar de dibujarse.
  - Declaración: `const MIN_PIECE_AREA: f64 = 0.01;`
