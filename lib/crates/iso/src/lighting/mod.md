# Lighting

Este dominio calcula luz, fases temporales, caras iluminables, recepción y proyección de sombras como datos puros. Sus resultados permiten obtener iluminación coherente sin depender de texturas, shaders o recursos de GPU.

Los algoritmos deben ser deterministas, verificables y expresar sus entradas espaciales de forma explícita. La configuración de calidad visual que dependa del backend no debe filtrarse a estas estructuras.

No crea render targets ni emite órdenes de dibujo. El cliente de presentación convierte los resultados en atlas, máscaras y materiales.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `bake.rs`

#### Funciones y métodos

- [`around`](bake.rs#L28) — El área que hornea un chunk de columnas `[min_x, max_x] × [min_y, max_y]`, con su margen.
  - Firma: `pub fn around(min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> Self {`

- [`columns`](bake.rs#L37) — Columnas que cubre el área.
  - Firma: `pub fn columns(&self) -> i32 {`

- [`square_of`](bake.rs#L42) — El cuadrado de texels de la columna `(x, y)` dentro de un área dibujada con `pixels_per_tile`, en
  - Firma: `pub fn square_of(&self, x: i32, y: i32, pixels_per_tile: u32) -> Option<(u32, u32)> {`

- [`rows`](bake.rs#L52) — Filas que cubre el área.
  - Firma: `pub fn rows(&self) -> i32 {`

- [`new`](bake.rs#L114) — Un mapa vacío sobre `area`.
  - Firma: `pub fn new(area: MapArea, pixels_per_tile: u32) -> Self {`

- [`clear`](bake.rs#L127) — Borra todos los texels conservando el buffer: un chunk se rehornea cuando aparece un vecino, y la
  - Firma: `pub fn clear(&mut self) {`

- [`move_to`](bake.rs#L132) — Apunta el mapa a otra área del mundo y lo borra.
  - Firma: `pub fn move_to(&mut self, area: MapArea) {`

- [`square_of`](bake.rs#L42) — El cuadrado de texels de una columna, como `(x, y)` de su esquina en texels. `None` fuera del
  - Firma: `pub fn square_of(&self, x: i32, y: i32) -> Option<(u32, u32)> {`

- [`is_empty`](bake.rs#L151) — Si algún texel lleva cobertura, para que el cliente pueda saltarse un chunk que nada sombrea.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`at`](bake.rs#L175) — Cobertura en `[0, 1]` en `(u, v)`, ambas en `[0, 1]` sobre el dibujo, siendo `(0, 0)` su
  - Firma: `pub fn at(&self, u: f64, v: f64) -> f64 {`

- [`at_texel`](bake.rs#L186) — Cobertura en una posición ya expresada en texels del plano, que es como la recorre el horneado: la posición
  - Firma: `pub fn at_texel(&self, x: f64, y: f64) -> f64 {`

- [`bake_ground_shadows`](bake.rs#L215) — Hornea `casters` en `map` (recorrido DDA + siluetas) y después lo desenfoca.
  - Firma: `pub fn bake_ground_shadows( map: &mut ShadowMap, casters: &[ShadowCaster], ground: Option<&HeightField>, light: &ShadowProjection, metrics: BoxMetrics, level_at: ReceivingLevel<'_>, silhouette_of: SilhouetteOf<'_, '_>, ) {`

- [`new`](bake.rs#L258) — Lee los niveles sobre los que el área de `map` recibe sombras, que necesita cada paso posterior.
  - Firma: `pub fn new(map: &ShadowMap, level_at: ReceivingLevel<'_>) -> Self {`

- [`step`](bake.rs#L268) — Hace la siguiente pieza del horneado del mapa (un caster, unas filas del horizonte, unas filas del terreno o una ventana de filas del desenfoque) y dice si queda algo por hacer.
  - Firma: `pub fn step( &mut self, map: &mut ShadowMap, casters: &[ShadowCaster], ground: Option<&HeightField>, light: &ShadowProjection, metrics: BoxMetrics, silhouette_of: SilhouetteOf<'_, '_>, ) -> bool {`

- [`blur`](bake.rs#L1042) — Un desenfoque de caja separable sobre todo el mapa: la penumbra.
  - Firma: `pub fn blur(map: &mut ShadowMap, radius: u32) {`

#### Constantes

- [`SHADOW_MAP_PIXELS_PER_TILE`](bake.rs#L9) — Texels de un mapa de sombras por casilla de mundo.
  - Declaración: `pub const SHADOW_MAP_PIXELS_PER_TILE: u32 = 36;`

- [`SHADOW_MAP_MARGIN`](bake.rs#L12) — Casillas que el mapa de un chunk alcanza más allá del chunk por cada lado, para que el desenfoque de una sombra que cruza
  - Declaración: `pub const SHADOW_MAP_MARGIN: i32 = 1;`

- [`SHADOW_BLUR_TEXELS`](bake.rs#L15) — Radio del desenfoque de caja con el que termina el horneado, en texels: la penumbra.
  - Declaración: `pub const SHADOW_BLUR_TEXELS: u32 = 1;`

### `faces.rs`

#### Funciones y métodos

- [`point`](faces.rs#L27) — El punto del mundo que está a `along` del camino a través de la cara y a `down` del camino hacia abajo.
  - Firma: `pub fn point(&self, along: f64, down: f64) -> (f64, f64, f64) {`

- [`terrain_faces`](faces.rs#L38) — Todas las caras expuestas de `columns`, orientadas solo hacia la cámara, divididas en los límites de bloque.
  - Firma: `pub fn terrain_faces( columns: impl IntoIterator<Item = (i32, i32, f64, TerrainMaterial)>, level_at: impl Fn(i32, i32) -> Option<f64>, floor: f64, ) -> Vec<TerrainFace> {`

### `phases.rs`

#### Funciones y métodos

- [`phase_at`](phases.rs#L41) — La fase que gobierna el reloj del juego en `tick`: la atmósfera sigue el ciclo de 24 h del mundo.
  - Firma: `pub fn phase_at(tick: u64) -> BakePhase {`

- [`opacity`](phases.rs#L15) — La opacidad a la que se dibujan sus sombras, que es para lo único que se usan los dos números
  - Firma: `pub fn opacity(&self) -> f64 {`

- [`label`](phases.rs#L53) — El rótulo en español de una fase seleccionable.
  - Firma: `pub const fn label(self) -> &'static str {`

- [`light`](phases.rs#L63) — La configuración de luz correspondiente a una fase seleccionable.
  - Firma: `pub const fn light(self) -> PhaseLight {`

#### Tipos

- [`BakePhase`](phases.rs#L22) — Fase de horneado seleccionable: amanecer, día, atardecer o noche.
  - Declaración: `pub enum BakePhase { Dawn, Day, Sunset, Night }`

#### Constantes

- [`DAWN`](phases.rs#L74) — Amanecer: el sol bajo en el este, así que las sombras se alargan y van casi rectas a lo largo del mundo `−x`.
  - Declaración: `pub const DAWN: PhaseLight = PhaseLight {`

- [`DAY`](phases.rs#L85) — Mediodía: luz desde arriba a la derecha, sombras cortas a plena intensidad.
  - Declaración: `pub const DAY: PhaseLight = PhaseLight {`

- [`SUNSET`](phases.rs#L96) — Atardecer: el sol bajo en el sur, sombras tan largas como las del amanecer y giradas un cuarto.
  - Declaración: `pub const SUNSET: PhaseLight = PhaseLight {`

- [`NIGHT`](phases.rs#L107) — Noche: una luna tenue, sombras cortas y débiles.
  - Declaración: `pub const NIGHT: PhaseLight = PhaseLight {`

- [`DAWN_START_HOUR`](phases.rs#L30) — La primera hora del amanecer, inclusiva; antes manda la noche.
  - Declaración: `pub const DAWN_START_HOUR: u64 = 6;`

- [`DAY_START_HOUR`](phases.rs#L32) — La primera hora del día, inclusiva.
  - Declaración: `pub const DAY_START_HOUR: u64 = 9;`

- [`SUNSET_START_HOUR`](phases.rs#L34) — La primera hora del atardecer, inclusiva.
  - Declaración: `pub const SUNSET_START_HOUR: u64 = 17;`

- [`NIGHT_START_HOUR`](phases.rs#L36) — La primera hora de la noche, inclusiva.
  - Declaración: `pub const NIGHT_START_HOUR: u64 = 20;`

### `received.rs`

#### Funciones y métodos

- [`columns`](received.rs#L20) — Columnas que cubre el área.
  - Firma: `pub fn columns(&self) -> u32 {`

- [`rows`](received.rs#L24) — Filas que cubre el área.
  - Firma: `pub fn rows(&self) -> u32 {`

- [`at`](received.rs#L29) — Cuán oscura es la esquina a `column` a lo ancho y a `row` hacia abajo, en `[0, 1]`.
  - Firma: `pub fn at(&self, column: u32, row: u32) -> f32 {`

- [`is_clear`](received.rs#L36) — Si todas las esquinas están despejadas, para que el cliente vuelva a dibujar el sprite como un único quad.
  - Firma: `pub fn is_clear(&self) -> bool {`

- [`shade_grid`](received.rs#L65) — Calcula la rejilla `ShadeGrid` de sombra que `casters` proyectan sobre `receiver`.
  - Firma: `pub fn shade_grid( receiver: &ShadowReceiver, casters: &[ShadowCaster], light: &ShadowProjection, metrics: BoxMetrics, silhouette_of: super::bake::SilhouetteOf<'_, '_>, ground: Option<&HeightField>, lattice: ShadeLatticeSpec, ) -> Option<ShadeGrid> {`

- [`shaded_at`](received.rs#L162) — Cuán sombreado está un punto del mundo, por los casters que lo rodean y por el terreno.
  - Firma: `pub fn shaded_at( point: ShadowPoint, casters: &[ShadowCaster], light: &ShadowProjection, tile_width: f64, box_height: f64, silhouette_of: super::bake::SilhouetteOf<'_, '_>, ground: Option<&HeightField>, ) -> f64 {`

#### Tipos

- [`ShadeLatticeSpec`](received.rs#L54) — Cómo se tiende la rejilla de sombra: su resolución y con qué opacidad cae.
  - Declaración: `pub struct ShadeLatticeSpec { pub columns: u32, pub rows: u32, pub opacity: f64, }`

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

- [`cast_shadow_offset`](shadow.rs#L105) — Dónde proyecta el sol la silueta de un caster sobre otro recorte vertical, en píxeles de pantalla.
  - Firma: `pub fn cast_shadow_offset( light: &ShadowProjection, caster_foot: (f64, f64), receiver_foot: (f64, f64), lift: f64, tile_width: f64, box_height: f64, ) -> Option<(f64, f64)> {`

- [`shadow_reach`](shadow.rs#L127) — Distancia máxima por el terreno (casillas) que puede alcanzar la sombra de algo de `height` píxeles de pantalla de alto
  - Firma: `pub fn shadow_reach(height: f64, lift: f64, tile_width: f64, box_height: f64) -> f64 {`

#### Tipos

- [`BoxMetrics`](shadow.rs#L135) — Métricas de la caja del dibujo: ancho de una casilla de mundo y alto de un bloque, en píxeles de pantalla.
  - Declaración: `pub struct BoxMetrics { pub tile_width: f64, pub box_height: f64, }`

#### Constantes

- [`MAX_SHADOW_STRETCH`](shadow.rs#L60) — Tope a cuánto alcanza una unidad de altura cuando el sol está bajo (`1 / tan(altitude)`).
  - Declaración: `pub const MAX_SHADOW_STRETCH: f64 = 4.0;`

### `terrain.rs`

#### Funciones y métodos

- [`coverage`](terrain.rs#L26) — Cuán sombreado está un receiver `elevation` bloques más arriba, en `[0, 1]`.
  - Firma: `pub fn coverage(&self, elevation: f64) -> f64 {`

- [`new`](terrain.rs#L48) — Lee todas las columnas de `min_x..=max_x` por `min_y..=max_y`, ampliadas por el alcance del rayo.
  - Firma: `pub fn new( min_x: i32, min_y: i32, max_x: i32, max_y: i32, level_at: impl Fn(i32, i32) -> Option<f64>, ) -> Self {`

- [`is_empty`](terrain.rs#L78) — Si ninguna columna del campo tiene terreno, de modo que cada recorrido volvería despejado.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`horizon`](terrain.rs#L90) — Avanza hacia el sol desde la casilla bajo `(px, py)` y devuelve lo que encuentra.
  - Firma: `pub fn horizon(&self, px: f64, py: f64, light: &ShadowProjection, box_height: f64, tile_width: f64) -> Horizon {`

- [`receiver_point`](terrain.rs#L178) — Dónde está en el mundo un píxel de un sprite vertical, para poder preguntar por el horizonte del terreno
  - Firma: `pub fn receiver_point( foot: ShadowPoint, screen_foot: (f64, f64), screen: (f64, f64), light: &ShadowProjection, tile_width: f64, box_height: f64, ) -> ShadowPoint {`

#### Constantes

- [`TERRAIN_RAY_REACH`](terrain.rs#L6) — Hasta dónde se busca el terreno a lo largo de la luz, en casillas.
  - Declaración: `pub const TERRAIN_RAY_REACH: f64 = 12.0;`

- [`CLEAR`](terrain.rs#L20) — Un horizonte que no sombrea nada, para un punto para el que el recorrido nunca encontró terreno.
  - Declaración: `pub const CLEAR: Self = Self { elevation: f64::NEG_INFINITY, width: 0.1 };`


### `volume.rs`

El volumen sólido de una entidad, leído del `.vox` con el que se renderizó su sprite
(`artifacts/vox/clay/vox_shadow.py` → `lib/content/volumes/shadow-volumes.bin`). El horneado de
suelo usa su sombra precalculada en vez del recorte del sprite: la primera vez que un horneado la pide
bajo una luz, `volume_stamp` proyecta las columnas hacia el sol sobre suelo plano y el cliente la
guarda (`ShadowScene::stamps`, se vacía al cambiar de fase); después cada chunk solo la copia. Por qué no el recorte: el recorte confunde
profundidad con altura y no sabe a qué lado de la entidad queda una rama, así que su sombra
se despegaba de la entidad. Las sombras sobre otras entidades, caras y el jugador siguen
leyendo siluetas.

#### Tipos

- [`ShadowVolume`](volume.rs#L30) — Columnas de 1/32 de casilla con hasta dos tramos sólidos cada una (en bloques), su caja y su punto más alto.
- [`VolumeColumn`](volume.rs#L13) — Centro de la columna en casillas desde el centro de la celda ancla, y sus tramos.
- [`GroundCast`](bake.rs#L91) — Qué deja un `ShadowCaster` en el suelo: su silueta, un volumen (solo la celda ancla) o nada (las demás celdas de una entidad con volumen).
- [`CasterShapes`](bake.rs#L209) — Los dos resolutores que recibe el horneado: siluetas y sombras precalculadas (`StampOf`) por índice.
- [`ShadowStamp`](bake.rs) — La sombra de un volumen bajo una luz, en téxeles del mapa, con su área en casillas relativa a la celda de la entidad.
- [`volume_stamp`](bake.rs) — La calcula: cada tramo barre su cuadrado desde donde cae su base hasta donde cae su cima.

#### Funciones y métodos

- [`parse_shadow_volumes`](volume.rs#L102) — Lee el fichero de volúmenes; pasa los ejes del modelo (x abajo-derecha = mundo −y, y abajo-izquierda = mundo −x, ancla en la última casilla) a los del mundo.
  - Firma: `pub fn parse_shadow_volumes(bytes: &[u8]) -> Result<Vec<(String, ShadowVolume)>, String> {`

- [`shadow_box`](volume.rs#L75) — La caja que puede cubrir la sombra del volumen: la huella barrida hasta el alcance de su punto más alto.
  - Firma: `pub fn shadow_box( &self, foot: (f64, f64), deepest: f64, light: &ShadowProjection, metrics: (f64, f64), ) -> (f64, f64, f64, f64) {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `bake.rs`

#### Funciones internas

- [`within`](bake.rs#L382) — Los pasos `0..=steps` de un recorrido que empieza en `from` y avanza con paso `step` que quedan dentro
  - Firma: `fn within(from: f64, step: f64, low: f64, high: f64, steps: u32) -> Option<(u32, u32)> {`

- [`meet`](bake.rs#L394) — Los pasos que retienen ambos recorridos, o `None` cuando no comparten ninguno.
  - Firma: `fn meet(one: (u32, u32), other: (u32, u32)) -> Option<(u32, u32)> {`

- [`horizon_lattice_shape`](bake.rs#L403) — Proyecta sobre cada texel la sombra que el terreno proyecta sobre sí mismo.
  - Firma: `fn horizon_lattice_shape(map: &ShadowMap) -> (u32, u32, u32) {`

- [`horizon_rows`](bake.rs#L414) — Recorre `rows` filas del horizonte hacia el sol desde `from` y las vuelca en `out`; devuelve las filas recorridas.
  - Firma: `fn horizon_rows( map: &ShadowMap, ground: &HeightField, light: &ShadowProjection, metrics: BoxMetrics, from: u32, rows: u32, out: &mut Vec<Horizon>, ) -> u32 {`

- `lay_stamp` — Copia la sombra precalculada al mapa, una pasada por nivel de terreno: en suelo más bajo se desliza luz abajo lo que alcanza el desnivel (redondeado a téxel), y solo escribe las columnas de ese nivel. Aproximación: en un escalón la sombra no se estira y lo que una columna más alta entierra sigue proyectando.

- `stamp_swept_square` — Rellena los téxeles cuyo centro barre un cuadrado deslizado a lo largo de la luz (línea a línea, sin muestreo).

- [`lay_terrain_rows`](bake.rs#L441) — Proyecta la sombra propia del terreno sobre `rows` filas de columnas, empezando en la fila `from` de la
  - Firma: `fn lay_terrain_rows( map: &mut ShadowMap, lattice: &[Horizon], levels: &LevelCache, from: i32, rows: i32, ) -> i32 {`

- [`clear_columns_without_ground`](bake.rs#L554) — Pone en blanco el cuadrado de cada columna para la que el mundo no tiene terreno.
  - Firma: `fn clear_columns_without_ground(map: &mut ShadowMap, levels: &LevelCache) {`

- [`new`](bake.rs#L582) — Construye la caché de niveles de `area` muestreando `level_at` por columna.
  - Firma: `fn new(area: MapArea, level_at: ReceivingLevel<'_>) -> Self {`

- [`at`](bake.rs#L604) — Nivel de la caché en `(x, y)`, o `None` fuera del área.
  - Firma: `fn at(&self, x: i32, y: i32) -> Option<f64> {`

- [`any`](bake.rs#L614) — Si la caché contiene al menos un nivel finito.
  - Firma: `fn any(&self) -> bool {`

- [`lay_caster`](bake.rs#L620) — Proyecta la silueta de un caster sobre cada texel que puede alcanzar su sombra.
  - Firma: `fn lay_caster( map: &mut ShadowMap, caster: &ShadowCaster, light: &ShadowProjection, tile_width: f64, box_height: f64, levels: &mut LevelCache, silhouette_of: SilhouetteOf<'_, '_>, ) {`

- [`shadow_box`](bake.rs#L977) — La caja que cubre la sombra de `laid` una vez que un lift la ha movido `shift` casillas hacia abajo por la luz.
  - Firma: `fn shadow_box(laid: &[(f64, f64); 4], shift: f64, light: &ShadowProjection) -> WorldBox {`

- [`union`](bake.rs#L997) — Caja que une `a` y `b` (mínimo y máximo por eje).
  - Firma: `fn union(a: WorldBox, b: WorldBox) -> WorldBox {`

- [`columns_touched`](bake.rs#L1002) — Las columnas de `area` que solapa `box`, o `None` cuando no toca el área en absoluto.
  - Firma: `fn columns_touched(area: MapArea, world: WorldBox) -> Option<(i32, i32, i32, i32)> {`

- [`texels_of`](bake.rs#L1014) — Los texels del cuadrado de una columna que solapa `box`, limitados al mapa.
  - Firma: `fn texels_of( map: &ShadowMap, column_x: i32, column_y: i32, world: WorldBox, ) -> Option<(u32, u32, u32, u32)> {`

- [`blur_across_rows`](bake.rs#L1067) — La primera pasada del desenfoque, a lo ancho del mapa, recorriendo `rows` filas desde `from` para que comparta el frame con el juego; devuelve las filas recorridas.
  - Firma: `fn blur_across_rows( map: &mut ShadowMap, radius: u32, levels: &LevelCache, from: u32, rows: u32, ) -> u32 {`

- [`blur_across_within_levels`](bake.test.rs#L737) — Pasada completa del primer desenfoque, sin leer nunca a través de un desnivel del terreno; solo la usan los tests (vive en `bake.test.rs`).
  - Firma: `fn blur_across_within_levels(map: &mut ShadowMap, radius: u32, levels: &LevelCache) {`

- [`blur_down_rows`](bake.rs#L1180) — La segunda pasada del desenfoque, hacia abajo por el mapa, recorriendo `rows` filas desde el cursor de `job` para que comparta el frame con el juego; devuelve las filas recorridas.
  - Firma: `fn blur_down_rows( map: &mut ShadowMap, span: usize, levels: &LevelCache, job: &mut BlurDownJob, rows: u32, ) -> u32 {`

- [`blur_down_within_levels`](bake.test.rs#L749) — Pasada completa de la segunda pasada del desenfoque; solo la usan los tests (vive en `bake.test.rs`).
  - Firma: `fn blur_down_within_levels(map: &mut ShadowMap, span: usize, levels: &LevelCache) {`

- [`mark_cuts`](bake.rs#L1269) — Marca los cortes (primera/última fila o cada `per_tile` cuando `flush` lo pide).
  - Firma: `fn mark_cuts(cuts: &mut [bool], per_tile: usize, flush: impl Fn(usize) -> bool) {`

- [`full_window_means`](bake.rs#L1277) — Todos los cocientes a los que puede llegar una ventana completa del desenfoque, calculados una vez.
  - Firma: `fn full_window_means(span: usize) -> Vec<u8> {`

- [`window_mean`](bake.rs#L1283) — La media de `line` sobre `at ± span`, con los extremos limitados y `means` para una ventana completa.
  - Firma: `fn window_mean(line: &[u8], at: usize, span: usize, means: &[u8]) -> u8 {`

- [`mean`](bake.rs#L1295) — La media de `line` sobre `at ± span`, con los extremos limitados.
  - Firma: `fn mean(line: &[u8], at: usize, span: usize) -> u8 {`

#### Constantes internas

- [`HORIZON_ROWS_PER_STEP`](bake.rs#L239) — Filas de retícula recorridas, y filas de columnas sombreadas, en una sola pieza de trabajo.
  - Declaración: `const HORIZON_ROWS_PER_STEP: u32 = 8;`

- [`TERRAIN_ROWS_PER_STEP`](bake.rs#L240) — Filas de columnas de terreno proyectadas por paso de trabajo.
  - Declaración: `const TERRAIN_ROWS_PER_STEP: i32 = 4;`

- [`BLUR_ROWS_PER_STEP`](bake.rs#L241) — Filas recorridas por paso en la primera pasada del desenfoque (a lo ancho del mapa).
  - Declaración: `const BLUR_ROWS_PER_STEP: u32 = 128;`

- [`BLUR_DOWN_ROWS_PER_STEP`](bake.rs#L242) — Filas recorridas por paso en la segunda pasada del desenfoque (hacia abajo por el mapa).
  - Declaración: `const BLUR_DOWN_ROWS_PER_STEP: u32 = 64;`

#### Tipos internos

- [`BlurDownJob`](bake.rs#L1150) — El estado rodante de la segunda pasada del desenfoque (anillo de filas, sumas acumuladas, cortes por desnivel), que viaja entre pasos para que el desenfoque recorra el mapa por ventanas de filas y no en un único paso.
  - Declaración: `struct BlurDownJob {`

- [`TERRAIN_SAMPLES_PER_TILE`](bake.rs#L400) — Con qué frecuencia se pregunta por el horizonte del terreno a lo ancho de una casilla.
  - Declaración: `const TERRAIN_SAMPLES_PER_TILE: u32 = 3;`

### `terrain.rs`

#### Funciones internas

- [`level`](terrain.rs#L82) — Altura en `(x, y)`; `NEG_INFINITY` fuera del campo.
  - Firma: `fn level(&self, x: i32, y: i32) -> f64 {`

- [`signum`](terrain.rs#L159) — Signo de `value`: `−1`, `0` o `1`.
  - Firma: `fn signum(value: f64) -> i32 {`

#### Constantes internas

- [`SURFACE_BIAS`](terrain.rs#L9) — A cuánta distancia por debajo del horizonte tiene que estar una superficie para contar como sombreada, en bloques.
  - Declaración: `const SURFACE_BIAS: f64 = 0.04;`

### `patch.rs`

Parchear parte del mapa horneado de un chunk: cuando algo sale del mundo, solo las columnas donde podía caer su sombra se hornean otra vez, en un mapa pequeño, y se copian encima del mapa del chunk, en vez de hornear el chunk entero.

- [`chunk_map_area`](patch.rs#L31) — El área que hornea un chunk: sus columnas y el margen.
  - Firma: `pub fn chunk_map_area(coord: ChunkCoord) -> MapArea {`
- [`patch_of`](patch.rs#L38) — El parche que necesita el mapa de `coord` para las columnas viejas `stale`, o `None` si no lo tocan. `inner` son las columnas que se copian (las viejas dentro del mapa del chunk) y `baked` las que se hornean: `inner` y una casilla alrededor, para que el desenfoque del borde lea lo mismo que el horneado del chunk, sin salir de su mapa.
  - Firma: `pub fn patch_of(coord: ChunkCoord, stale: WorldRect) -> Option<MapPatch> {`
- [`copy_patch`](patch.rs#L64) — Los texels de `inner` sacados de un mapa horneado sobre un área mayor, y dónde caen en el mapa del chunk.
  - Firma: `pub fn copy_patch(map: &ShadowMap, inner: MapArea, chunk_map: MapArea) -> PatchCopy {`
- [`MapPatch`](patch.rs#L10) — La parte del mapa de un chunk que un parche hornea otra vez.
- [`PatchCopy`](patch.rs#L22) — Texels a copiar sobre el mapa de un chunk, fila a fila, y dónde caen.
