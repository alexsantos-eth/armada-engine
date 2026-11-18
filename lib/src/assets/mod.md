# Assets

Este dominio de cliente gestiona el atlas de Macroquad, las hojas de sprites y las órdenes de dibujo que consumen los contratos de `iso::assets`. Traduce datos de contenido del núcleo a recursos y coordenadas que entiende el backend gráfico.

Debe conservar la separación entre manifestos del dominio y recursos cargados del cliente. Las conversiones de UV, medidas de textura y caché de atlas se concentran aquí para no duplicarse en vistas de terreno o entidades.

No redefine la semántica de los assets ni modifica sus manifiestos. Los cambios de contenido se realizan en `iso::assets`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `sprites.rs`

#### Funciones y métodos

- [`frame`](sprites.rs#L64) — El frame de la pose `pose` en la fila de `facing`, con ambos ajustados a la cuadrícula: un
  - Firma: `pub fn frame(&self, facing: usize, pose: usize) -> SpriteFrame {`

- [`columns`](sprites.rs#L70) — Cuántas poses tiene una fila.
  - Firma: `pub fn columns(&self) -> usize {`

- [`poses`](sprites.rs#L75) — Los nombres que el dibujo da a sus columnas, cuando los nombra (las fases de un salto); vacío
  - Firma: `pub fn poses(&self) -> &[String] {`

- [`new`](sprites.rs#L82) — Construye el acceso sobre las texturas que nombra el manifiesto: el atlas compartido, y después las
  - Firma: `pub fn new( atlas: Texture2D, extra: Vec<(String, Texture2D)>, manifest: &AssetManifest, ) -> Self {`

- [`has_white_patch`](sprites.rs#L175) — Si el atlas incluye [`WHITE_PATCH`]. Sin él las sombras se dibujan igualmente, pero cada
  - Firma: `pub fn has_white_patch(&self) -> bool {`

- [`asset`](sprites.rs#L179) — El sprite empaquetado para `source`, o `None` si el atlas no lo tiene.
  - Firma: `pub fn asset(&self, source: &str) -> Option<SpriteAsset> {`

- [`sheet`](sprites.rs#L184) — La hoja de poses en `source`, para las animaciones del jugador.
  - Firma: `pub fn sheet(&self, source: &str) -> Option<&SheetAsset> {`

- [`standing`](sprites.rs#L189) — El frame para algo situado sobre `ground` y el rectángulo en el que dibujarlo, o
  - Firma: `pub fn standing( &self, source: &str, ground: ScreenPoint, tile_width: f64, ) -> Option<(SpriteFrame, SpriteLayout)> {`

- [`draw`](sprites.rs#L215) — Dibuja un frame de `texture` en el rectángulo que describe `layout`, multiplicado por `tint`.
  - Firma: `pub fn draw(&self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, tint: Color) {`

- [`draw_band`](sprites.rs#L266) — Dibuja la parte de un frame que cae dentro de `band`, que es un trozo del mismo
  - Firma: `pub fn draw_band( &self, texture: usize, frame: SpriteFrame, band: &SpriteBand, shade: Option<&ShadeLattice>, veil: Veil, ) {`

- [`draw_veiled`](sprites.rs#L232) — Dibuja un frame entero en `layout`, multiplicado por `tint` y aclarado por `veil`: el sprite completo tras el que está el jugador. Es una malla de cuatro vértices porque `draw_texture_ex` no deja escribir `normal.w`.
  - Firma: `pub fn draw_veiled( &mut self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, tint: Color, veil: Veil, ) {`

- [`measure_cover`](sprites.rs#L157) — Mide dónde es sólido cada sprite del atlas compartido, a partir de los píxeles RGBA del propio atlas; se llama una vez al arrancar, antes de soltar la imagen.
  - Firma: `pub fn measure_cover(&mut self, width: u32, height: u32, rgba: &[u8]) {`

- [`cover_mask`](sprites.rs#L170) — La `CoverMask` del arte de `source`, si se midió.
  - Firma: `pub fn cover_mask(&self, source: &str) -> Option<&CoverMask> {`

- [`see_through`](sprites.rs#L869) — El mismo dibujo conservando `opacity` de sí: el sprite de una entidad tras la que está el jugador. Solo se aclaran `DrawKind::Sprite` y `DrawKind::Shaded`; cualquier otro tipo vuelve intacto.
  - Firma: `pub fn see_through(mut self, opacity: f32) -> Self {`

- [`tinted_by`](sprites.rs#L880) — El mismo dibujo multiplicado por `tint`: el pelaje de un personaje. Solo lo toman `DrawKind::Sprite` y un `DrawKind::Shaded` entero; cualquier otro tipo vuelve intacto.
  - Firma: `pub fn tinted_by(mut self, tint: Color) -> Self {`

- [`draw_quad`](sprites.rs#L311) — Dibuja un frame dentro de un cuadrilátero (en sentido horario desde su esquina superior izquierda) como una sola malla, con o sin sombras: así se dibuja el cuerpo del jugador cuando se inclina o bascula, llevándose el arte consigo.
  - Firma: `pub fn draw_quad( &mut self, texture: usize, frame: SpriteFrame, corners: &[(f64, f64); 4], shade: Option<&ShadeLattice>, ) {`
- [`leaning`](sprites.rs#L936) — Encola un sprite dibujado en un cuadrilátero propio en vez de en un rectángulo recto: el jugador inclinado o basculando.
  - Firma: `pub fn leaning( key: DrawKey, texture: usize, frame: SpriteFrame, corners: [(f64, f64); 4], shade: Option<Rc<ShadeLattice>,> ) -> Self {`
- [`draw_shaded`](sprites.rs#L368) — Dibuja un frame como una retícula de quads, con cada esquina oscurecida por las sombras que caen sobre ella.
  - Firma: `pub fn draw_shaded( &mut self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: &ShadeLattice, veil: Veil, ) {`

- [`draw_face_shadow`](sprites.rs#L419) — Dibuja una sombra sobre el quad plano `corners`: una retícula de negro, tan opaca en cada
  - Firma: `pub fn draw_face_shadow(&mut self, corners: &[(f64, f64); 4], shade: &ShadeLattice, opacity: f32) {`

- [`draw_voxel`](sprites.rs#L472) — Dibuja un voxel de polvo: sus tres caras visibles en color plano, como una única malla.
  - Firma: `pub fn draw_voxel(&mut self, faces: &VoxelFaces, colours: &[Color; 3]) {`

- [`draw_ground_shadow`](sprites.rs#L500) — Dibuja la sombra horneada en la cara superior de una columna: un quad, sombreado por el atlas de sombras.
  - Firma: `pub fn draw_ground_shadow( &mut self, corners: &[(f64, f64); 4], map_uv: &[(f32, f32); 4], opacity: f32, ) {`

- [`draw_reflection`](sprites.rs#L526) — Dibuja el dibujo de un sprite como lo muestra el agua: el polígono `points` sobre la superficie del agua, cada
  esquina leyendo su `uv`. Un desenfoque real queda aplazado a la fase de render target.
  - Firma: `pub fn draw_reflection( &mut self, texture: usize, frame: SpriteFrame, points: &[(f64, f64)], uv: &[(f64, f64)], colour: Color, ) {`

- [`draw_ground_ellipse`](sprites.rs) — Dibuja las piezas ya recortadas de la sombra elíptica del jugador mediante la misma malla de trabajo reutilizada por el resto de la cola.

- [`on_screen_in`](sprites.rs#L620) — Si `layout` caería en algún punto de `screen`.
  - Firma: `pub fn on_screen_in(layout: SpriteLayout, screen: (f32, f32)) -> bool {`

- [`on_screen`](sprites.rs#L629) — Si `layout` caería en algún punto de la pantalla.
  - Firma: `pub fn on_screen(layout: SpriteLayout) -> bool {`

- [`faded`](sprites.rs#L673) — Construye en una sola pasada la retícula que dibuja `grid`, aplicando `fade` a la oscuridad; se comparte por referencia contada entre los dibujos de una entidad.
  - Firma: `pub fn faded(grid: &ShadeGrid, fade: f32) -> Self {`

- [`from_coverage`](sprites.rs#L690) — Una retícula directamente a partir de valores de cobertura, fila a fila, para una superficie sin dibujo
  - Firma: `pub fn from_coverage(columns: u32, rows: u32, coverage: Vec<f32>) -> Self {`

- [`whole`](sprites.rs#L835) — Un sprite dibujado completo, que es todo lo situado sobre una única casilla.
  - Firma: `pub fn whole(key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout) -> Self {`

- [`tinted`](sprites.rs#L846) — Un sprite dibujado completo y multiplicado por `tint`: un bloque de terreno en una zona de color.
  - Firma: `pub fn tinted( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, tint: Color, ) -> Self {`

- [`band`](sprites.rs#L890) — Una banda de un sprite cuya huella abarca varias casillas.
  - Firma: `pub fn band( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, band: Option<SpriteBand>, ) -> Self {`

- [`shaded`](sprites.rs#L912) — Un sprite oscurecido por las sombras que caen sobre él.
  - Firma: `pub fn shaded( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: ShadeLattice, ) -> Self {`

- [`shaded_band`](sprites.rs#L955) — Una banda de un sprite que abarca varias casillas, oscurecida por las sombras que caen sobre ella.
  - Firma: `pub fn shaded_band( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: ShadeLattice, band: SpriteBand, ) -> Self {`

- [`ground_shadow`](sprites.rs#L979) — La sombra horneada en la cara superior de una columna, leída del atlas de sombras.
  - Firma: `pub fn ground_shadow( key: DrawKey, corners: [(f64, f64); 4], map_uv: [(f32, f32); 4], opacity: f32, ) -> Self {`

- [`reflection`](sprites.rs#L997) — La parte de lo reflejado por el agua que corresponde a una casilla de agua.
  - Firma: `pub fn reflection( key: DrawKey, texture: usize, frame: SpriteFrame, points: Vec<(f64, f64)>, uv: Vec<(f64, f64)>, colour: Color, ) -> Self {`

- [`voxel`](sprites.rs#L1019) — Un voxel de una bocanada del polvo del jugador.
  - Firma: `pub fn voxel(key: DrawKey, faces: VoxelFaces, colours: [Color; 3]) -> Self {`

- [`face_shadow`](sprites.rs#L1028) — Una sombra sobre una cara vertical expuesta del terreno.
  - Firma: `pub fn face_shadow( key: DrawKey, corners: [(f64, f64); 4], shade: Rc<ShadeLattice>, opacity: f32, ) -> Self {`

- [`ground_ellipse`](sprites.rs#L1047) — Una mancha blanda sobre el suelo, con degradado de núcleo a borde y sesgo de pantalla `shear`, recortada a las caras superiores de las casillas en las que puede apoyarse (`clip`); lista vacía de `clip` la pinta entera.
  - Firma: `pub fn ground_ellipse( key: DrawKey, centre: ScreenPoint, width: f64, height: f64, alpha: f32, shear: [[f64; 2]; 2], clip: Vec<[(f64, f64); 4]>, ) -> Self {`

- [`draw_depth`](sprites.rs#L1089) — Redibuja la lista ya ordenada como profundidades para la profundidad de campo, con el material de profundidad ligado por quien llama: solo lo sólido y en pie, nunca sombras, reflejos ni sprites vistos a través (X-Ray).
  - Firma: `pub fn draw_depth(atlas: &mut SpriteAtlas, draws: &[SpriteDraw], frame: &DepthFrame) {`

- [`SpriteDraw::on_surface`](sprites.rs#L840) — Marca el draw como bloque de terreno cuya columna acaba en `top` (`Focus::Surface`).
  - Firma: `pub fn on_surface(mut self, top: f64) -> Self {`

- [`Focus`](sprites.rs#L823) — Cómo coloca en profundidad un draw la pasada de profundidad de campo: `Standing` (todo el sprite a la profundidad de su casilla) o `Surface { top }` (cara superior leída píxel a píxel).
  - Declaración: `pub enum Focus { Standing, Surface { top: f64 } }`

- [`draw_sorted`](sprites.rs#L1072) — Ordena los sprites encolados de lejos a cerca y los dibuja, con `material` enlazado durante todo el proceso.
  - Firma: `pub fn draw_sorted( atlas: &mut SpriteAtlas, material: Option<&crate::rendering::scene_material::SceneMaterial>, draws: &mut [SpriteDraw], ) {`

`SpriteAtlas` conserva una malla `Mesh` de trabajo. Las funciones de dibujo la vacían y rellenan;
`draw_mesh` de Macroquad copia sus vértices al batch, por lo que la reutilización no cambia el
resultado y evita reservar los vectores de geometría en cada dibujo.

- [`scene_key`](sprites.rs#L1244) — Clave de profundidad de algo situado en la casilla cuyo centro es `(x, y)`, a la elevación `elevation`.
  - Firma: `pub fn scene_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {`

- [`ground_key`](sprites.rs#L1259) — Clave de profundidad de la superficie de una casilla: el terreno en sí, y lo pintado sobre él — un
  - Firma: `pub fn ground_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {`

#### Constantes

- [`ATLAS_TEXTURE`](sprites.rs#L19) — El atlas compartido, que es la textura de todo lo que no es una hoja de poses del jugador.
  - Declaración: `pub const ATLAS_TEXTURE: usize = 0;`

- [`WHITE_PATCH`](sprites.rs#L22) — El asset que no es más que blanco opaco, para dibujar color plano a partir del atlas compartido.
  - Declaración: `pub const WHITE_PATCH: &str = "/assets/shadow/white.png";`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `sprites.rs`

#### Funciones internas

- [`texture`](sprites.rs#L200) — La textura que nombra una orden de dibujo, o el atlas compartido si nombra una que no está cargada.
  - Firma: `fn texture(&self, index: usize) -> &Texture2D {`

- [`draw_polygon`](sprites.rs#L538) — Dibuja el dibujo de `frame` sobre el polígono convexo `points`, con cada esquina leyéndolo en la
  - Firma: `fn draw_polygon( &self, texture: usize, frame: SpriteFrame, points: &[(f64, f64)], uv: &[(f64, f64)], colour: Color, ) {`

- [`source`](sprites.rs#L609) — Los píxeles del frame en el atlas, con medio texel de margen por cada lado.
  - Firma: `fn source(&self, frame: SpriteFrame) -> Rect {`

- [`scaled`](sprites.rs#L645) — La misma retícula con su oscuridad escalada por `scale` (smooth para el fade-in tras un horneado; `1.0` devuelve una copia exacta y `0.0` la levanta a totalmente iluminada).
  - Firma: `pub(crate) fn scaled(&self, scale: f32) -> Self {`

- [`light_in`](sprites.rs#L703) — La luz `along` a través de la retícula y `down` por ella, ambas en `[0, 1]`, leídas entre los
  - Firma: `fn light_in(&self, along: f32, down: f32) -> f32 {`

- [`light_at`](sprites.rs#L718) — Intensidad de luz del atlas en `column`,`row` (0..1) para el horneado.
  - Firma: `fn light_at(&self, column: u32, row: u32) -> f32 {`

- [`draw_queue`](sprites.rs#L1126) — Dibuja `draws` en orden ya ordenado con el atlas y el material.
  - Firma: `fn draw_queue(atlas: &SpriteAtlas, draws: &mut [SpriteDraw]) {`

#### Constantes internas

- [`INSET`](sprites.rs#L610) — Desborde de medio texel para el muestreo del atlas.
  - Declaración: `const INSET: f32 = 0.5;`
