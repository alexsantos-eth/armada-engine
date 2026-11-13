# Assets

Este dominio de cliente gestiona el atlas de Macroquad, las hojas de sprites y las órdenes de dibujo que consumen los contratos de `iso::assets`. Traduce datos de contenido del núcleo a recursos y coordenadas que entiende el backend gráfico.

Debe conservar la separación entre manifestos del dominio y recursos cargados del cliente. Las conversiones de UV, medidas de textura y caché de atlas se concentran aquí para no duplicarse en vistas de terreno o entidades.

No redefine la semántica de los assets ni modifica sus manifiestos. Los cambios de contenido se realizan en `iso::assets`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `sprites.rs`

#### Funciones y métodos

- [`frame`](sprites.rs#L67) — El frame de la pose `pose` en la fila de `facing`, con ambos ajustados a la cuadrícula: un
  - Firma: `pub fn frame(&self, facing: usize, pose: usize) -> SpriteFrame {`

- [`columns`](sprites.rs#L73) — Cuántas poses tiene una fila.
  - Firma: `pub fn columns(&self) -> usize {`

- [`poses`](sprites.rs#L78) — Los nombres que el dibujo da a sus columnas, cuando los nombra (las fases de un salto); vacío
  - Firma: `pub fn poses(&self) -> &[String] {`

- [`artwork_key`](sprites.rs#L26) — La identidad de un asset, sin el fichero en el que está dibujado: su ruta de
  origen sin extensión. Un repintado es un PNG junto al dibujo al que sustituye, mientras que
  `entities.json` y el resto del motor siguen nombrando el dibujo, así que los dos tienen que
  encontrarse en una clave que no mencione el fichero.
  - Firma: `fn artwork_key(source: &str) -> &str {`

- [`new`](sprites.rs#L85) — Construye el acceso sobre las texturas que nombra el manifiesto: el atlas compartido, y después las
  - Firma: `pub fn new( atlas: Texture2D, extra: Vec<(String, Texture2D)>, manifest: &AssetManifest, ) -> Self {`

- [`has_white_patch`](sprites.rs#L152) — Si el atlas incluye [`WHITE_PATCH`]. Sin él las sombras se dibujan igualmente, pero cada
  - Firma: `pub fn has_white_patch(&self) -> bool {`

- [`asset`](sprites.rs#L156) — El sprite empaquetado para `source`, o `None` si el atlas no lo tiene.
  - Firma: `pub fn asset(&self, source: &str) -> Option<SpriteAsset> {`

- [`sheet`](sprites.rs#L161) — La hoja de poses en `source`, para las animaciones del jugador.
  - Firma: `pub fn sheet(&self, source: &str) -> Option<&SheetAsset> {`

- [`standing`](sprites.rs#L166) — El frame para algo situado sobre `ground` y el rectángulo en el que dibujarlo, o
  - Firma: `pub fn standing( &self, source: &str, ground: ScreenPoint, tile_width: f64, ) -> Option<(SpriteFrame, SpriteLayout)> {`

- [`draw`](sprites.rs#L182) — Dibuja un frame de `texture` en el rectángulo que describe `layout`, multiplicado por `tint`.
  - Firma: `pub fn draw(&self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, tint: Color) {`

- [`draw_band`](sprites.rs#L200) — Dibuja la parte de un frame que cae dentro de `band`, que es un trozo del mismo
  - Firma: `pub fn draw_band( &self, texture: usize, frame: SpriteFrame, band: &SpriteBand, shade: Option<&ShadeLattice>, ) {`

- [`draw_quad`](sprites.rs#L252) — Dibuja un frame dentro de un cuadrilátero (en sentido horario desde su esquina superior izquierda) como una sola malla, con o sin sombras: así se dibuja el cuerpo del jugador cuando se inclina o bascula, llevándose el arte consigo.
  - Firma: `pub fn draw_quad( &self, texture: usize, frame: SpriteFrame, corners: &[(f64, f64); 4], shade: Option<&ShadeLattice>, ) {`
- [`leaning`](sprites.rs#L775) — Encola un sprite dibujado en un cuadrilátero propio en vez de en un rectángulo recto: el jugador inclinado o basculando.
  - Firma: `pub fn leaning( key: DrawKey, texture: usize, frame: SpriteFrame, corners: [(f64, f64); 4], shade: Option<ShadeLattice>, ) -> Self {`
- [`draw_shaded`](sprites.rs#L307) — Dibuja un frame como una retícula de quads, con cada esquina oscurecida por las sombras que caen sobre ella.
  - Firma: `pub fn draw_shaded( &self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: &ShadeLattice, ) {`

- [`draw_face_shadow`](sprites.rs#L355) — Dibuja una sombra sobre el quad plano `corners`: una retícula de negro, tan opaca en cada
  - Firma: `pub fn draw_face_shadow(&self, corners: &[(f64, f64); 4], shade: &ShadeLattice, opacity: f32) {`

- [`draw_voxel`](sprites.rs#L400) — Dibuja un voxel de polvo: sus tres caras visibles en color plano, como una única malla.
  - Firma: `pub fn draw_voxel(&self, faces: &VoxelFaces, colours: &[Color; 3]) {`

- [`draw_ground_shadow`](sprites.rs#L432) — Dibuja la sombra horneada en la cara superior de una columna: un quad, sombreado por el atlas de sombras.
  - Firma: `pub fn draw_ground_shadow( &self, corners: &[(f64, f64); 4], map_uv: &[(f32, f32); 4], opacity: f32, ) {`

- [`draw_reflection`](sprites.rs#L461) — Dibuja el dibujo de un sprite como lo muestra el agua: el polígono `points` sobre la superficie del agua, cada
  esquina leyendo su `uv`. Un desenfoque real queda aplazado a la fase de render target.
  - Firma: `pub fn draw_reflection( &self, texture: usize, frame: SpriteFrame, points: &[(f64, f64)], uv: &[(f64, f64)], colour: Color, ) {`

- [`on_screen_in`](sprites.rs#L527) — Si `layout` caería en algún punto de `screen`.
  - Firma: `pub fn on_screen_in(layout: SpriteLayout, screen: (f32, f32)) -> bool {`

- [`on_screen`](sprites.rs#L536) — Si `layout` caería en algún punto de la pantalla.
  - Firma: `pub fn on_screen(layout: SpriteLayout) -> bool {`

- [`new`](sprites.rs#L552) — La retícula que dibuja `grid`: una esquina sombreada `v` conserva `1 − v` de su color.
  - Firma: `pub fn new(grid: &ShadeGrid) -> Self {`

- [`from_coverage`](sprites.rs#L586) — Una retícula directamente a partir de valores de cobertura, fila a fila, para una superficie sin dibujo
  - Firma: `pub fn from_coverage(columns: u32, rows: u32, coverage: Vec<f32>) -> Self {`

- [`whole`](sprites.rs#L709) — Un sprite dibujado completo, que es todo lo situado sobre una única casilla.
  - Firma: `pub fn whole(key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout) -> Self {`

- [`tinted`](sprites.rs#L714) — Un sprite dibujado completo y multiplicado por `tint`: un bloque de terreno en una zona de color.
  - Firma: `pub fn tinted( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, tint: Color, ) -> Self {`

- [`band`](sprites.rs#L734) — Una banda de un sprite cuya huella abarca varias casillas.
  - Firma: `pub fn band( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, band: Option<SpriteBand>, ) -> Self {`

- [`shaded`](sprites.rs#L754) — Un sprite oscurecido por las sombras que caen sobre él.
  - Firma: `pub fn shaded( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: ShadeLattice, ) -> Self {`

- [`shaded_band`](sprites.rs#L793) — Una banda de un sprite que abarca varias casillas, oscurecida por las sombras que caen sobre ella.
  - Firma: `pub fn shaded_band( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: ShadeLattice, band: SpriteBand, ) -> Self {`

- [`ground_shadow`](sprites.rs#L814) — La sombra horneada en la cara superior de una columna, leída del atlas de sombras.
  - Firma: `pub fn ground_shadow( key: DrawKey, corners: [(f64, f64); 4], map_uv: [(f32, f32); 4], opacity: f32, ) -> Self {`

- [`reflection`](sprites.rs#L831) — La parte de lo reflejado por el agua que corresponde a una casilla de agua.
  - Firma: `pub fn reflection( key: DrawKey, texture: usize, frame: SpriteFrame, points: Vec<(f64, f64)>, uv: Vec<(f64, f64)>, colour: Color, ) -> Self {`

- [`voxel`](sprites.rs#L852) — Un voxel de una bocanada del polvo del jugador.
  - Firma: `pub fn voxel(key: DrawKey, faces: VoxelFaces, colours: [Color; 3]) -> Self {`

- [`face_shadow`](sprites.rs#L860) — Una sombra sobre una cara vertical expuesta del terreno.
  - Firma: `pub fn face_shadow( key: DrawKey, corners: [(f64, f64); 4], shade: Rc<ShadeLattice>, opacity: f32, ) -> Self {`

- [`ground_ellipse`](sprites.rs#L878) — Una mancha blanda sobre el suelo, con degradado de núcleo a borde y sesgo de pantalla `shear`, recortada a las caras superiores de las casillas en las que puede apoyarse (`clip`); lista vacía de `clip` la pinta entera.
  - Firma: `pub fn ground_ellipse( key: DrawKey, centre: ScreenPoint, width: f64, height: f64, alpha: f32, shear: [[f64; 2]; 2], clip: Vec<[(f64, f64); 4]>, ) -> Self {`

- [`draw_sorted`](sprites.rs#L902) — Ordena los sprites encolados de lejos a cerca y los dibuja, con `material` enlazado durante todo el proceso.
  - Firma: `pub fn draw_sorted( atlas: &SpriteAtlas, material: Option<&crate::rendering::scene_material::SceneMaterial>, draws: &mut [SpriteDraw], ) {`

- [`scene_key`](sprites.rs#L1028) — Clave de profundidad de algo situado en la casilla cuyo centro es `(x, y)`, a la elevación `elevation`.
  - Firma: `pub fn scene_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {`

- [`ground_key`](sprites.rs#L1043) — Clave de profundidad de la superficie de una casilla: el terreno en sí, y lo pintado sobre él — un
  - Firma: `pub fn ground_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {`

#### Constantes

- [`ATLAS_TEXTURE`](sprites.rs#L17) — El atlas compartido, que es la textura de todo lo que no es una hoja de poses del jugador.
  - Declaración: `pub const ATLAS_TEXTURE: usize = 0;`

- [`WHITE_PATCH`](sprites.rs#L20) — El asset que no es más que blanco opaco, para dibujar color plano a partir del atlas compartido.
  - Declaración: `pub const WHITE_PATCH: &str = "/assets/shadow/white.svg";`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `sprites.rs`

#### Funciones internas

- [`texture`](sprites.rs#L177) — La textura que nombra una orden de dibujo, o el atlas compartido si nombra una que no está cargada.
  - Firma: `fn texture(&self, index: usize) -> &Texture2D {`

- [`draw_polygon`](sprites.rs#L473) — Dibuja el dibujo de `frame` sobre el polígono convexo `points`, con cada esquina leyéndolo en la
  - Firma: `fn draw_polygon( &self, texture: usize, frame: SpriteFrame, points: &[(f64, f64)], uv: &[(f64, f64)], colour: Color, ) {`

- [`source`](sprites.rs#L516) — Los píxeles del frame en el atlas, con medio texel de margen por cada lado.
  - Firma: `fn source(&self, frame: SpriteFrame) -> Rect {`

- [`scaled`](sprites.rs#L568) — La misma retícula con su oscuridad escalada por `scale` (smooth para el fade-in tras un horneado; `1.0` devuelve una copia exacta y `0.0` la levanta a totalmente iluminada).
  - Firma: `pub(crate) fn scaled(&self, scale: f32) -> Self {`

- [`light_in`](sprites.rs#L599) — La luz `along` a través de la retícula y `down` por ella, ambas en `[0, 1]`, leídas entre los
  - Firma: `fn light_in(&self, along: f32, down: f32) -> f32 {`

- [`light_at`](sprites.rs#L614) — Intensidad de luz del atlas en `column`,`row` (0..1) para el horneado.
  - Firma: `fn light_at(&self, column: u32, row: u32) -> f32 {`

- [`draw_queue`](sprites.rs#L916) — Dibuja `draws` en orden ya ordenado con el atlas y el material.
  - Firma: `fn draw_queue(atlas: &SpriteAtlas, draws: &mut [SpriteDraw]) {`

#### Constantes internas

- [`INSET`](sprites.rs#L517) — Desborde de medio texel para el muestreo del atlas.
  - Declaración: `const INSET: f32 = 0.5;`
