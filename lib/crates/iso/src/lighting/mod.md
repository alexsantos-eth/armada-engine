# Lighting

Este dominio calcula luz, fases temporales, caras iluminables, recepción y proyección de sombras como datos puros. Sus resultados permiten obtener iluminación coherente sin depender de texturas, shaders o recursos de GPU.

Los algoritmos deben ser deterministas, verificables y expresar sus entradas espaciales de forma explícita. La configuración de calidad visual que dependa del backend no debe filtrarse a estas estructuras.

No crea render targets ni emite órdenes de dibujo. El cliente de presentación convierte los resultados en atlas, máscaras y materiales.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `bake.rs`

#### Funciones y métodos

- [`around`](bake.rs#L26) — El área que hornea un chunk de columnas `[min_x, max_x] × [min_y, max_y]`, con su margen.
  - Firma: `pub fn around(min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> Self {`

- [`columns`](bake.rs#L35) — Calcula o recupera «columns» según los parámetros de la firma.
  - Firma: `pub fn columns(&self) -> i32 {`

- [`square_of`](bake.rs#L40) — El cuadrado de texels de la columna `(x, y)` dentro de un área dibujada con `pixels_per_tile`, en
  - Firma: `pub fn square_of(&self, x: i32, y: i32, pixels_per_tile: u32) -> Option<(u32, u32)> {`

- [`rows`](bake.rs#L50) — Calcula o recupera «rows» según los parámetros de la firma.
  - Firma: `pub fn rows(&self) -> i32 {`

- [`new`](bake.rs#L89) — Un mapa vacío sobre `area`.
  - Firma: `pub fn new(area: MapArea, pixels_per_tile: u32) -> Self {`

- [`clear`](bake.rs#L102) — Borra todos los texels conservando el buffer: un chunk se rehornea cuando aparece un vecino, y la
  - Firma: `pub fn clear(&mut self) {`

- [`move_to`](bake.rs#L107) — Apunta el mapa a otra área del mundo y lo borra.
  - Firma: `pub fn move_to(&mut self, area: MapArea) {`

- [`square_of`](bake.rs#L121) — El cuadrado de texels de una columna, como `(x, y)` de su esquina en texels. `None` fuera del
  - Firma: `pub fn square_of(&self, x: i32, y: i32) -> Option<(u32, u32)> {`

- [`is_empty`](bake.rs#L126) — Si algún texel lleva cobertura, para que el cliente pueda saltarse un chunk que nada sombrea.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`at`](bake.rs#L150) — Cobertura en `[0, 1]` en `(u, v)`, ambas en `[0, 1]` sobre el dibujo, siendo `(0, 0)` su
  - Firma: `pub fn at(&self, u: f64, v: f64) -> f64 {`

- [`at_texel`](bake.rs#L158) — Cobertura en una posición ya expresada en texels del plano, que es como la recorre el horneado: la posición
  - Firma: `pub fn at_texel(&self, x: f64, y: f64) -> f64 {`

- [`bake_ground_shadows`](bake.rs#L176) — Calcula o recupera «bake ground shadows» según los parámetros de la firma.
  - Firma: `pub fn bake_ground_shadows( map: &mut ShadowMap, casters: &[ShadowCaster], ground: Option<&HeightField>, light: &ShadowProjection, tile_width: f64, box_height: f64, level_at: ReceivingLevel<'_>, silhouette_of: SilhouetteOf<'_, '_>, ) {`

- [`new`](bake.rs#L219) — Lee los niveles sobre los que el área de `map` recibe sombras, que necesita cada paso posterior.
  - Firma: `pub fn new(map: &ShadowMap, level_at: ReceivingLevel<'_>) -> Self {`

- [`is_done`](bake.rs#L228) — Evalúa si se cumple la condición «done» para el estado recibido.
  - Firma: `pub fn is_done(&self) -> bool {`

- [`step`](bake.rs#L235) — Calcula o recupera «step» según los parámetros de la firma.
  - Firma: `pub fn step( &mut self, map: &mut ShadowMap, casters: &[ShadowCaster], ground: Option<&HeightField>, light: &ShadowProjection, tile_width: f64, box_height: f64, silhouette_of: SilhouetteOf<'_, '_>, ) -> bool {`

- [`blur`](bake.rs#L704) — Un desenfoque de caja separable sobre todo el mapa: la penumbra.
  - Firma: `pub fn blur(map: &mut ShadowMap, radius: u32) {`

#### Constantes

- [`SHADOW_MAP_PIXELS_PER_TILE`](bake.rs#L7) — Texels de un mapa de sombras por casilla de mundo.
  - Declaración: `pub const SHADOW_MAP_PIXELS_PER_TILE: u32 = 36;`

- [`SHADOW_MAP_MARGIN`](bake.rs#L10) — Casillas que el mapa de un chunk alcanza más allá del chunk por cada lado, para que el desenfoque de una sombra que cruza
  - Declaración: `pub const SHADOW_MAP_MARGIN: i32 = 1;`

- [`SHADOW_BLUR_TEXELS`](bake.rs#L13) — Radio del desenfoque de caja con el que termina el horneado, en texels: la penumbra.
  - Declaración: `pub const SHADOW_BLUR_TEXELS: u32 = 1;`

### `faces.rs`

#### Funciones y métodos

- [`point`](faces.rs#L27) — El punto del mundo que está a `along` del camino a través de la cara y a `down` del camino hacia abajo.
  - Firma: `pub fn point(&self, along: f64, down: f64) -> (f64, f64, f64) {`

- [`terrain_faces`](faces.rs#L38) — Todas las caras expuestas de `columns`, orientadas solo hacia la cámara, divididas en los límites de bloque.
  - Firma: `pub fn terrain_faces( columns: impl IntoIterator<Item = (i32, i32, f64, TerrainMaterial)>, level_at: impl Fn(i32, i32) -> Option<f64>, floor: f64, ) -> Vec<TerrainFace> {`

### `phases.rs`

#### Funciones y métodos

- [`opacity`](phases.rs#L14) — La opacidad a la que se dibujan sus sombras, que es para lo único que se usan los dos números
  - Firma: `pub fn opacity(&self) -> f64 {`

- [`label`](phases.rs#L30) — El rótulo en español de una fase seleccionable.
  - Firma: `pub const fn label(self) -> &'static str {`

- [`light`](phases.rs#L40) — La configuración de luz correspondiente a una fase seleccionable.
  - Firma: `pub const fn light(self) -> PhaseLight {`

#### Tipos

- [`BakePhase`](phases.rs#L21) — Fase de horneado seleccionable: amanecer, día, atardecer o noche.
  - Declaración: `pub enum BakePhase { Dawn, Day, Sunset, Night }`

#### Constantes

- [`DAWN`](phases.rs#L51) — Amanecer: el sol bajo en el este, así que las sombras se alargan y van casi rectas a lo largo del mundo `−x`.
  - Declaración: `pub const DAWN: PhaseLight = PhaseLight {`

- [`DAY`](phases.rs#L62) — Mediodía: luz desde arriba a la derecha, sombras cortas a plena intensidad.
  - Declaración: `pub const DAY: PhaseLight = PhaseLight {`

- [`SUNSET`](phases.rs#L73) — Atardecer: el sol bajo en el sur, sombras tan largas como las del amanecer y giradas un cuarto.
  - Declaración: `pub const SUNSET: PhaseLight = PhaseLight {`

- [`NIGHT`](phases.rs#L84) — Noche: una luna tenue, sombras cortas y débiles.
  - Declaración: `pub const NIGHT: PhaseLight = PhaseLight {`

### `received.rs`

#### Funciones y métodos

- [`columns`](received.rs#L20) — Calcula o recupera «columns» según los parámetros de la firma.
  - Firma: `pub fn columns(&self) -> u32 {`

- [`rows`](received.rs#L24) — Calcula o recupera «rows» según los parámetros de la firma.
  - Firma: `pub fn rows(&self) -> u32 {`

- [`at`](received.rs#L29) — Cuán oscura es la esquina a `column` a lo ancho y a `row` hacia abajo, en `[0, 1]`.
  - Firma: `pub fn at(&self, column: u32, row: u32) -> f32 {`

- [`is_clear`](received.rs#L36) — Si todas las esquinas están despejadas, para que el cliente vuelva a dibujar el sprite como un único quad.
  - Firma: `pub fn is_clear(&self) -> bool {`

- [`shade_grid`](received.rs#L54) — Calcula o recupera «shade grid» según los parámetros de la firma.
  - Firma: `pub fn shade_grid( receiver: &ShadowReceiver, casters: &[ShadowCaster], light: &ShadowProjection, opacity: f64, tile_width: f64, box_height: f64, silhouette_of: super::bake::SilhouetteOf<'_, '_>, ground: Option<&HeightField>, columns: u32, rows: u32, ) -> Option<ShadeGrid> {`

- [`shaded_at`](received.rs#L137) — Cuán sombreado está un punto del mundo, por los casters que lo rodean y por el terreno.
  - Firma: `pub fn shaded_at( point: ShadowPoint, casters: &[ShadowCaster], light: &ShadowProjection, tile_width: f64, box_height: f64, silhouette_of: super::bake::SilhouetteOf<'_, '_>, ground: Option<&HeightField>, ) -> f64 {`

#### Constantes

- [`SHADE_COLUMNS`](received.rs#L8) — Esquinas a lo ancho del dibujo de un receiver, y hacia abajo.
  - Declaración: `pub const SHADE_COLUMNS: u32 = 8;`

- [`SHADE_ROWS`](received.rs#L9) — Define cuántas filas contiene la tabla de tonos de sombra recibida.
  - Declaración: `pub const SHADE_ROWS: u32 = 16;`

### `shadow.rs`

#### Funciones y métodos

- [`apply`](shadow.rs#L16) — Dónde cae `point`.
  - Firma: `pub fn apply(&self, point: (f64, f64)) -> (f64, f64) {`

- [`inverse`](shadow.rs#L24) — El mapa inverso, o `None` cuando este colapsa el plano sobre una línea.
  - Firma: `pub fn inverse(&self) -> Option<Self> {`

- [`tiles_per_pixel_of_height`](shadow.rs#L63) — Casillas de longitud de mundo por píxel de pantalla de altura.
  - Firma: `pub fn tiles_per_pixel_of_height(tile_width: f64) -> f64 {`

- [`tiles_per_pixel_across`](shadow.rs#L68) — Casillas de longitud de mundo por píxel de pantalla *a lo ancho* de la sombra, donde el sprite conserva su propio
  - Firma: `pub fn tiles_per_pixel_across(tile_width: f64) -> f64 {`

- [`block_height_in_tiles`](shadow.rs#L73) — Altura de un bloque en casillas de longitud de mundo (alrededor de media casilla).
  - Firma: `pub fn block_height_in_tiles(box_height: f64, tile_width: f64) -> f64 {`

- [`silhouette_matrix`](shadow.rs#L78) — Proyecta la silueta de un sprite sobre el terreno como su sombra: píxeles de pantalla relativos al
  - Firma: `pub fn silhouette_matrix( light: &ShadowProjection, foot: (f64, f64), lift: f64, tile_width: f64, box_height: f64, ) -> Affine2D {`

- [`lift_reach`](shadow.rs#L100) — Hasta qué distancia hacia abajo desplaza la sombra un plano `lift` bloques por debajo del propio terreno del caster, en
  - Firma: `pub fn lift_reach( light: &ShadowProjection, lift: f64, tile_width: f64, box_height: f64, ) -> f64 {`

- [`cast_shadow_offset`](shadow.rs#L110) — Dónde proyecta el sol la silueta de un caster sobre otro recorte vertical, en píxeles de pantalla.
  - Firma: `pub fn cast_shadow_offset( light: &ShadowProjection, caster_foot: (f64, f64), receiver_foot: (f64, f64), lift: f64, tile_width: f64, box_height: f64, ) -> Option<(f64, f64)> {`

- [`shadow_reach`](shadow.rs#L132) — Distancia máxima por el terreno (casillas) que puede alcanzar la sombra de algo de `height` píxeles de pantalla de alto
  - Firma: `pub fn shadow_reach(height: f64, lift: f64, tile_width: f64, box_height: f64) -> f64 {`

#### Constantes

- [`MAX_SHADOW_STRETCH`](shadow.rs#L60) — Tope a cuánto alcanza una unidad de altura cuando el sol está bajo (`1 / tan(altitude)`).
  - Declaración: `pub const MAX_SHADOW_STRETCH: f64 = 4.0;`

### `terrain.rs`

#### Funciones y métodos

- [`coverage`](terrain.rs#L23) — Cuán sombreado está un receiver `elevation` bloques más arriba, en `[0, 1]`.
  - Firma: `pub fn coverage(&self, elevation: f64) -> f64 {`

- [`new`](terrain.rs#L45) — Lee todas las columnas de `min_x..=max_x` por `min_y..=max_y`, ampliadas por el alcance del rayo.
  - Firma: `pub fn new( min_x: i32, min_y: i32, max_x: i32, max_y: i32, level_at: impl Fn(i32, i32) -> Option<f64>, ) -> Self {`

- [`is_empty`](terrain.rs#L68) — Si ninguna columna del campo tiene terreno, de modo que cada recorrido volvería despejado.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`horizon`](terrain.rs#L80) — Avanza hacia el sol desde la casilla bajo `(px, py)` y devuelve lo que encuentra.
  - Firma: `pub fn horizon(&self, px: f64, py: f64, light: &ShadowProjection, box_height: f64, tile_width: f64) -> Horizon {`

- [`receiver_point`](terrain.rs#L150) — Dónde está en el mundo un píxel de un sprite vertical, para poder preguntar por el horizonte del terreno
  - Firma: `pub fn receiver_point( foot: ShadowPoint, screen_foot: (f64, f64), screen: (f64, f64), light: &ShadowProjection, tile_width: f64, box_height: f64, ) -> ShadowPoint {`

#### Constantes

- [`TERRAIN_RAY_REACH`](terrain.rs#L6) — Hasta dónde se busca el terreno a lo largo de la luz, en casillas.
  - Declaración: `pub const TERRAIN_RAY_REACH: f64 = 12.0;`

- [`CLEAR`](terrain.rs#L20) — Un horizonte que no sombrea nada, para un punto para el que el recorrido nunca encontró terreno.
  - Declaración: `pub const CLEAR: Self = Self { elevation: f64::NEG_INFINITY, width: 0.1 };`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `bake.rs`

#### Funciones internas

- [`within`](bake.rs#L312) — Los pasos `0..=steps` de un recorrido que empieza en `from` y avanza con paso `step` que quedan dentro
  - Firma: `fn within(from: f64, step: f64, low: f64, high: f64, steps: u32) -> Option<(u32, u32)> {`

- [`meet`](bake.rs#L324) — Los pasos que retienen ambos recorridos, o `None` cuando no comparten ninguno.
  - Firma: `fn meet(one: (u32, u32), other: (u32, u32)) -> Option<(u32, u32)> {`

- [`horizon_lattice_shape`](bake.rs#L333) — Proyecta sobre cada texel la sombra que el terreno proyecta sobre sí mismo.
  - Firma: `fn horizon_lattice_shape(map: &ShadowMap) -> (u32, u32, u32) {`

- [`horizon_rows`](bake.rs#L340) — Calcula o recupera «horizon rows» según los parámetros de la firma.
  - Firma: `fn horizon_rows( map: &ShadowMap, ground: &HeightField, light: &ShadowProjection, tile_width: f64, box_height: f64, from: u32, rows: u32, out: &mut Vec<Horizon>, ) -> u32 {`

- [`lay_terrain_rows`](bake.rs#L364) — Proyecta la sombra propia del terreno sobre `rows` filas de columnas, empezando en la fila `from` de la
  - Firma: `fn lay_terrain_rows( map: &mut ShadowMap, lattice: &[Horizon], levels: &LevelCache, from: i32, rows: i32, ) -> i32 {`

- [`clear_columns_without_ground`](bake.rs#L473) — Pone en blanco el cuadrado de cada columna para la que el mundo no tiene terreno.
  - Firma: `fn clear_columns_without_ground(map: &mut ShadowMap, levels: &LevelCache) {`

- [`new`](bake.rs#L501) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `fn new(area: MapArea, level_at: ReceivingLevel<'_>) -> Self {`

- [`at`](bake.rs#L518) — Calcula o recupera «at» según los parámetros de la firma.
  - Firma: `fn at(&self, x: i32, y: i32) -> Option<f64> {`

- [`any`](bake.rs#L528) — Calcula o recupera «any» según los parámetros de la firma.
  - Firma: `fn any(&self) -> bool {`

- [`lay_caster`](bake.rs#L534) — Proyecta la silueta de un caster sobre cada texel que puede alcanzar su sombra.
  - Firma: `fn lay_caster( map: &mut ShadowMap, caster: &ShadowCaster, light: &ShadowProjection, tile_width: f64, box_height: f64, levels: &mut LevelCache, silhouette_of: SilhouetteOf<'_, '_>, ) {`

- [`shadow_box`](bake.rs#L644) — La caja que cubre la sombra de `laid` una vez que un lift la ha movido `shift` casillas hacia abajo por la luz.
  - Firma: `fn shadow_box(laid: &[(f64, f64); 4], shift: f64, light: &ShadowProjection) -> WorldBox {`

- [`union`](bake.rs#L659) — Calcula o recupera «union» según los parámetros de la firma.
  - Firma: `fn union(a: WorldBox, b: WorldBox) -> WorldBox {`

- [`columns_touched`](bake.rs#L664) — Las columnas de `area` que solapa `box`, o `None` cuando no toca el área en absoluto.
  - Firma: `fn columns_touched(area: MapArea, world: WorldBox) -> Option<(i32, i32, i32, i32)> {`

- [`texels_of`](bake.rs#L676) — Los texels del cuadrado de una columna que solapa `box`, limitados al mapa.
  - Firma: `fn texels_of( map: &ShadowMap, column_x: i32, column_y: i32, world: WorldBox, ) -> Option<(u32, u32, u32, u32)> {`

- [`blur_across_within_levels`](bake.rs#L728) — El mismo desenfoque, pero sin leer nunca a través de un desnivel del terreno.
  - Firma: `fn blur_across_within_levels(map: &mut ShadowMap, radius: u32, levels: &LevelCache) {`

- [`blur_down_within_levels`](bake.rs#L784) — La segunda pasada de [`blur_within_levels`], hacia abajo por el mapa, ejecutada fila a fila.
  - Firma: `fn blur_down_within_levels(map: &mut ShadowMap, span: usize, levels: &LevelCache) {`

- [`mark_cuts`](bake.rs#L858) — Calcula o recupera «mark cuts» según los parámetros de la firma.
  - Firma: `fn mark_cuts(cuts: &mut [bool], per_tile: usize, flush: impl Fn(usize) -> bool) {`

- [`full_window_means`](bake.rs#L866) — Todos los cocientes a los que puede llegar una ventana completa del desenfoque, calculados una vez.
  - Firma: `fn full_window_means(span: usize) -> Vec<u8> {`

- [`window_mean`](bake.rs#L872) — La media de `line` sobre `at ± span`, con los extremos limitados y `means` para una ventana completa.
  - Firma: `fn window_mean(line: &[u8], at: usize, span: usize, means: &[u8]) -> u8 {`

- [`mean`](bake.rs#L884) — La media de `line` sobre `at ± span`, con los extremos limitados.
  - Firma: `fn mean(line: &[u8], at: usize, span: usize) -> u8 {`

#### Constantes internas

- [`HORIZON_ROWS_PER_STEP`](bake.rs#L201) — Filas de retícula recorridas, y filas de columnas sombreadas, en una sola pieza de trabajo.
  - Declaración: `const HORIZON_ROWS_PER_STEP: u32 = 8;`

- [`TERRAIN_ROWS_PER_STEP`](bake.rs#L202) — Define el parámetro interno «TERRAIN ROWS PER STEP» empleado por este módulo.
  - Declaración: `const TERRAIN_ROWS_PER_STEP: i32 = 4;`

- [`TERRAIN_SAMPLES_PER_TILE`](bake.rs#L330) — Con qué frecuencia se pregunta por el horizonte del terreno a lo ancho de una casilla.
  - Declaración: `const TERRAIN_SAMPLES_PER_TILE: u32 = 3;`

### `terrain.rs`

#### Funciones internas

- [`level`](terrain.rs#L72) — Calcula o recupera «level» según los parámetros de la firma.
  - Firma: `fn level(&self, x: i32, y: i32) -> f64 {`

- [`signum`](terrain.rs#L131) — Calcula o recupera «signum» según los parámetros de la firma.
  - Firma: `fn signum(value: f64) -> i32 {`

#### Constantes internas

- [`SURFACE_BIAS`](terrain.rs#L9) — A cuánta distancia por debajo del horizonte tiene que estar una superficie para contar como sombreada, en bloques.
  - Declaración: `const SURFACE_BIAS: f64 = 0.04;`
