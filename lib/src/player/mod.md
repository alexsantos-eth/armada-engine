# Player

Este dominio de cliente presenta al jugador y sus efectos visuales usando el estado y la física de `iso::player`. Convierte el estado de dominio en sprites, orientación, interpolación y efectos visibles de Macroquad.

Debe tratar el crate `iso` como autoridad para movimiento y colisiones. Las decisiones de presentación pueden cambiar aquí sin alterar la simulación ni serialización del jugador.

No implementa física, no modifica reglas de entrada ni persiste estado jugable. Es una adaptación visual del dominio de jugador.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `dust_view.rs`

#### Funciones y métodos

- [`new`](dust_view.rs#L133) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`live`](dust_view.rs#L147) — Cuántos soplos siguen elevándose, para el HUD y las pruebas.
  - Firma: `pub fn live(&self) -> usize {`

- [`react`](dust_view.rs#L156) — Detecta lo que ha hecho el jugador desde el último frame y levanta el polvo correspondiente: un soplo
  - Firma: `pub fn react( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`advance`](dust_view.rs#L339) — Envejece cada soplo vivo en `elapsed_ms` de tiempo real, terminando los cuya vida ha acabado.
  - Firma: `pub fn advance(&mut self, elapsed_ms: f64) {`

- [`collect`](dust_view.rs#L348) — Encola cada cubo de polvo vivo en `draws`, cada uno a la profundidad que tomó cuando su soplo
  - Firma: `pub fn collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>) {`

#### Constantes

- [`DUST_TOP`](dust_view.rs#L24) — Los colores de un voxel de polvo, casi blanco: su cara superior iluminada, su lado izquierdo y su lado derecho.
  - Declaración: `pub const DUST_TOP: u32 = 0xfbf9f4;`

- [`DUST_LEFT`](dust_view.rs#L25) — Selecciona el desplazamiento horizontal de polvo a la izquierda del jugador.
  - Declaración: `pub const DUST_LEFT: u32 = 0xe6e2d8;`

- [`DUST_RIGHT`](dust_view.rs#L26) — Selecciona el desplazamiento horizontal de polvo a la derecha del jugador.
  - Declaración: `pub const DUST_RIGHT: u32 = 0xcfcabd;`

- [`DUST_BEHIND_LAYER`](dust_view.rs#L29) — La capa en la que va el polvo dibujado detrás de lo que hay sobre su columna: la que luce la cima de una columna
  - Declaración: `pub const DUST_BEHIND_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;`

- [`DUST_FRONT_DEPTH`](dust_view.rs#L32) — Profundidad añadida a un cubo de polvo delante de los pies, para que se dibuje después de la columna sobre la que está
  - Declaración: `pub const DUST_FRONT_DEPTH: f64 = 0.00001;`

- [`RUN_DUST_EVERY`](dust_view.rs#L50) — Columnas que un jugador corriendo recorre entre dos soplos de polvo.
  - Declaración: `pub const RUN_DUST_EVERY: f64 = 0.7;`

- [`SKID_DUST_EVERY`](dust_view.rs#L53) — Columnas que un jugador derrapando desliza entre dos soplos: más a menudo que al correr, porque un derrape
  - Declaración: `pub const SKID_DUST_EVERY: f64 = 0.2;`

- [`RUN_PUFFS`](dust_view.rs#L56) — Soplos de polvo de carrera o derrape vivos a la vez, reutilizados por turno. La estela de quien nada usa esos mismos soplos.
  - Declaración: `pub const RUN_PUFFS: usize = 6;`

- [`SWIM_WAKE_EVERY`](dust_view.rs) — Columnas que recorre quien nada entre dos pares de crestas de su estela: más a menudo que el polvo de una carrera, porque el agua se cierra detrás.
  - Declaración: `pub const SWIM_WAKE_EVERY: f64 = 0.4;`

- [`SWIM_WAKE_SPREAD`](dust_view.rs) — Cuánto se abre cada brazo de la estela respecto a por donde vino el nadador, en radianes: los dos juntos son la V que arrastra.
  - Declaración: `pub const SWIM_WAKE_SPREAD: f64 = 0.62;`

- [`SWIM_WAKE_BEHIND`](dust_view.rs) — Columnas por detrás del nadador a las que nacen las crestas, para que el agua se cierre detrás del cuerpo y no dentro.
  - Declaración: `pub const SWIM_WAKE_BEHIND: f64 = 0.16;`

- [`SWIM_RIPPLE_MS`](dust_view.rs) — Milisegundos reales entre los anillos que abre quien flota quieto.
  - Declaración: `pub const SWIM_RIPPLE_MS: f64 = 1400.0;`

### `body_motion.rs`

#### Tipos

- [`BodyScale`](body_motion.rs#L22) — Escala visual del cuerpo alrededor de los pies.
  - Firma: `pub struct BodyScale { pub x: f64, pub y: f64 }`
- [`BodyMoment`](body_motion.rs#L29) — Muestra de estado del jugador para una animación visual de un fotograma.
  - Firma: `pub struct BodyMoment { ... }`
- [`BodyMotion`](body_motion.rs#L43) — Memoria de los pulsos visuales de despegue y aterrizaje.
  - Firma: `pub struct BodyMotion { ... }`

#### Funciones y métodos

- [`advance`](body_motion.rs#L65) — Avanza pulsos visuales y devuelve la escala del cuerpo para el fotograma.
  - Firma: `pub fn advance(&mut self, moment: BodyMoment) -> BodyScale {`

#### Constantes

- [`LANDING_SQUASH_MS`](body_motion.rs#L8) — Milisegundos de compresión tras aterrizar.
  - Declaración: `pub const LANDING_SQUASH_MS: f64 = 180.0;`
- [`TAKEOFF_STRETCH_MS`](body_motion.rs#L10) — Milisegundos de estiramiento tras despegar.
  - Declaración: `pub const TAKEOFF_STRETCH_MS: f64 = 120.0;`
- [`AIR_STRETCH_PER_SPEED`](body_motion.rs#L12) — Estiramiento del cuerpo en el aire por bloque por tick de velocidad vertical.
  - Declaración: `pub const AIR_STRETCH_PER_SPEED: f64 = 0.25;`
- [`MAX_AIR_STRETCH`](body_motion.rs#L14) — El mayor estiramiento que el cuerpo puede tomar en el aire.
  - Declaración: `pub const MAX_AIR_STRETCH: f64 = 0.12;`
- [`CLIMB_STRETCH`](body_motion.rs#L16) — Estiramiento del cuerpo en la mitad de una escalada.
  - Declaración: `pub const CLIMB_STRETCH: f64 = 0.05;`
- [`BOB_PER_SPEED`](body_motion.rs#L18) — Balanceo de pisada por columna por tick de velocidad en suelo.
  - Declaración: `pub const BOB_PER_SPEED: f64 = 0.2;`

### `player_view.rs`

#### Funciones y métodos

- [`jump_poses`](player_view.rs#L66) — Las columnas de las cinco fases de salto en una hoja que nombra sus columnas (`data-poses`).
  - Firma: `pub fn jump_poses(poses: &[String], columns: usize) -> Option<[usize; 5]> {`

- [`advance`](player_view.rs#L114) — Tiene en cuenta un frame y responde con la pose a dibujar.
  - Firma: `pub fn advance(&mut self, moment: PlayerMoment, sheets: PlayerSheets) -> PlayerPose {`

- [`facing_name`](player_view.rs#L209) — El nombre de la orientación con la que se dibuja al jugador, para el HUD.
  - Firma: `pub fn facing_name(&self) -> &'static str {`

- [`walked`](player_view.rs#L214) — Distancia de la zancada visual actual, incluida la pedalada inversa del derrape.
  - Firma: `pub fn walked(&self) -> f64 {`

#### Constantes

- [`WALK_STRIDE`](player_view.rs#L10) — Columnas recorridas por ciclo de la hoja de caminar:
  - Declaración: `pub const WALK_STRIDE: f64 = 1.4;`

- [`SWIM_STRIDE`](player_view.rs) — Columnas nadadas por ciclo del crol: una brazada de cada brazo. Más corta que [`WALK_STRIDE`], porque quien nada avanza menos por brazada que quien camina por paso.
  - Declaración: `pub const SWIM_STRIDE: f64 = 0.75;`

- [`SWIM_MOVING`](player_view.rs) — Columnas por frame por debajo de las cuales quien nada cuenta como quieto, y se queda flotando en vez de bracear.
  - Declaración: `pub const SWIM_MOVING: f64 = 0.0005;`

- [`IDLE_PERIOD_MS`](player_view.rs#L21) — Milisegundos reales que dura un ciclo de la hoja de reposo: dos compases del baile del mono.
  - Declaración: `pub const IDLE_PERIOD_MS: f64 = 900.0;`

- [`IDLE_DELAY_MS`](player_view.rs#L24) — Milisegundos que el jugador permanece quieto antes de que empiece su ciclo de reposo, de modo que al pararse para un
  - Declaración: `pub const IDLE_DELAY_MS: f64 = 300.0;`

- [`AIR_POSE`](player_view.rs#L27) — La pose de caminar usada en el aire cuando no hay hoja de salto: las piernas más separadas, un brinco.
  - Declaración: `pub const AIR_POSE: i32 = 3;`

- [`SKID_PEDAL`](player_view.rs#L30) — A qué velocidad pedalean los pies mientras el jugador derrapa: el doble del paso al caminar, y hacia atrás cuando
  - Declaración: `pub const SKID_PEDAL: f64 = 2.0;`

- [`START_FACING`](player_view.rs#L33) — La orientación con la que empieza el jugador, antes de haber caminado a ningún sitio: hacia la cámara, que
  - Declaración: `pub const START_FACING: usize = 12;`

- [`TURN_MS_PER_FACING`](player_view.rs#L36) — Milisegundos reales que la figura pasa en cada orientación por la que transita mientras gira.
  - Declaración: `pub const TURN_MS_PER_FACING: f64 = 35.0;`

### `player_shadow.rs`

#### Tipos

- [`PlayerShadow`](player_shadow.rs#L12) — La elipse de pantalla de la sombra básica del jugador, ya sesgada hacia la dirección de la fase.
  - Firma: `pub struct PlayerShadow { pub centre: ScreenPoint, pub width: f64, pub height: f64, pub alpha: f32, pub shear: [[f64; 2]; 2] }`

#### Funciones

- [`shadow_direction`](player_shadow.rs#L22) — La dirección de las sombras sobre el suelo como vector unitario de pantalla, y cuántos píxeles alcanza una casilla de sombra en esa dirección.
  - Firma: `pub fn shadow_direction(light: PhaseLight, projection: ProjectionConfig) -> (f64, f64, f64) {`
- [`cast_matrix`](player_shadow.rs#L61) — La anisotropía de pantalla de la mancha: el cuadrado del suelo sesgado a lo largo de la dirección de sombra de la fase, proyectado isométricamente (determinante = `1 + (stretch − 1) · CAST_STRETCH_FACTOR`, la fase estira sólo una fracción de su `stretch`).
  - Firma: `pub fn cast_matrix(light: PhaseLight, projection: ProjectionConfig) -> [[f64; 2]; 2] {`
- [`player_shadow`](player_shadow.rs#L98) — Calcula una sombra centrada en los pies que se escora hacia donde la fase proyecta sus sombras; al elevarse el cuerpo se separa de los pies río abajo del sol y se atenúa en el aire.
  - Firma: `pub fn player_shadow( ground: ScreenPoint, height: f64, projection: ProjectionConfig, light: PhaseLight, ) -> PlayerShadow {`

### `shadow_clip.rs`

#### Tipos

- [`ScreenQuad`](shadow_clip.rs#L10) — Una pieza convexa de pantalla: la cara superior de una casilla, con sus vértices en cualquier orden.
  - Firma: `pub type ScreenQuad = [(f64, f64); 4];`
- [`ShadowVertex`](shadow_clip.rs#L13) — Un vértice del abanico suave: dónde cae en pantalla y cuánto se ve (el degradado radial desde el núcleo hasta el borde transparente).
  - Firma: `pub type ShadowVertex = ((f64, f64), f32);`

#### Funciones

- [`ellipse_polygon`](shadow_clip.rs#L17) — La elipse como polígono convexo de `segments` vértices, centrada en `centre`.
  - Firma: `pub fn ellipse_polygon( centre: ScreenPoint, width: f64, height: f64, segments: usize, ) -> Vec<(f64, f64)> {`
- [`sheared_ellipse`](shadow_clip.rs#L37) — El borde de la mancha bajo `shear`: la elipse sin deformar, mapeada por la anisotropía de pantalla.
  - Firma: `pub fn sheared_ellipse( centre: ScreenPoint, width: f64, height: f64, shear: [[f64; 2]; 2], segments: usize, ) -> Vec<(f64, f64)> {`
- [`clip_convex_vertices`](shadow_clip.rs#L57) — Recorta el polígono convexo `subject` por el cuadrilátero convexo `clip`, interpolando el alfa de cada vértice en los cortes.
  - Firma: `pub fn clip_convex_vertices(subject: &[ShadowVertex], clip: &ScreenQuad) -> Vec<ShadowVertex> {`
- [`cast_pieces`](shadow_clip.rs#L98) — La mancha entera como triángulos, recortada a las caras superiores dadas, con degradado de núcleo a borde; sin caras donde recortar, devuelve el abanico completo.
  - Firma: `pub fn cast_pieces( centre: ScreenPoint, width: f64, height: f64, shear: [[f64; 2]; 2], alpha: f32, diamonds: &[ScreenQuad], segments: usize, ) -> Vec<[ShadowVertex; 3]> {`
- [`ground_diamonds`](shadow_clip.rs#L132) — Las caras superiores de las casillas cuyos soportes toca la mancha (dada por `outline`) y cuya cima está a la altura de la sombra, proyectadas sobre el plano de la sombra.
  - Firma: `pub fn ground_diamonds( outline: &[(f64, f64)], elevation: f64, projection: ProjectionConfig, elevation_at: impl Fn(i32, i32) -> Option<i32>, ) -> Vec<ScreenQuad> {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `dust_view.rs`

#### Funciones internas

- [`default`](dust_view.rs#L127) — Implementación de `Default`: la vista de polvo o de jugador vacía.
  - Firma: `fn default() -> Self {`

- [`kick`](dust_view.rs#L219) — El rastro que un jugador corriendo o derrapando levanta tras sus pies, un soplo cada tramo de
  - Firma: `fn kick( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`raise`](dust_view.rs#L314) — Levanta la bocanada `index` con `shape` en el emisor indicado; descarta la anterior.
  - Firma: `fn raise( &mut self, index: usize, shape: DustShape, feet: GridPoint, level: f64, kick: GridPoint, origin: GridPoint, tile_height: f64, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`voxel_key`](dust_view.rs#L414) — Dónde se ordena un cubo de polvo en la escena: la columna sobre la que está a mitad de su vida, y
  - Firma: `fn voxel_key( voxel: DustVoxel, feet: GridPoint, level: f64, tile_height: f64, top_at: &impl Fn(i32, i32) -> Option<f64>, ) -> DrawKey {`

### `player_shadow.rs`

#### Constantes internas

- [`CAST_STRETCH_FACTOR`](player_shadow.rs#L42) — Fracción del `stretch` de la fase que estira la mancha en sí: la dirección proyectada es exacta, el aplanado sólo la mitad de dramático.
  - Declaración: `const CAST_STRETCH_FACTOR: f64 = 0.5;`
- [`CAST_WIDTH`](player_shadow.rs#L45) — Anchura de la mancha, como fracción de la casilla.
  - Declaración: `const CAST_WIDTH: f64 = 0.30;`
- [`CAST_HEIGHT`](player_shadow.rs#L46) — Altura de la mancha, como fracción de la casilla.
  - Declaración: `const CAST_HEIGHT: f64 = 0.125;`
- [`CAST_CORE_ALPHA`](player_shadow.rs#L49) — Alfa del núcleo de la mancha con el cuerpo en el suelo.
  - Declaración: `const CAST_CORE_ALPHA: f64 = 0.28;`
- [`CAST_AIR_FADE`](player_shadow.rs#L52) — Cuánto alfa del núcleo pierde la mancha con el cuerpo en el aire.
  - Declaración: `const CAST_AIR_FADE: f64 = 0.14;`
- [`CAST_PHASE_REFERENCE`](player_shadow.rs#L55) — El alfa más fuerte de una fase, para normalizar cuánto escala la fase la mancha.
  - Declaración: `const CAST_PHASE_REFERENCE: f64 = 0.34;`

### `shadow_clip.rs`

#### Funciones internas

- [`footprint`](shadow_clip.rs#L172) — La cara superior de una casilla proyectada sobre el plano de la sombra: el cuadrilátero de sus cuatro esquinas.
  - Firma: `fn footprint(x: i32, y: i32, elevation: f64, projection: &ProjectionConfig) -> ScreenQuad {`
- [`bounds`](shadow_clip.rs#L192) — El mínimo y el máximo de un iterador de valores, para la huella de pantalla y el rango de casillas.
  - Firma: `fn bounds(values: impl Iterator<Item = f64>) -> (f64, f64) {`
- [`side`](shadow_clip.rs#L198) — El signo del lado del segmento `a → b` en el que cae `p`; decide qué lado es el de dentro comparando con el centro del cuadrilátero.
  - Firma: `fn side(a: (f64, f64), b: (f64, f64), p: (f64, f64)) -> f64 {`
- [`intersection`](shadow_clip.rs#L202) — El punto donde el segmento `from → to` cruza la línea del borde `a → b`, con el alfa interpolado.
  - Firma: `fn intersection( from: ShadowVertex, to: ShadowVertex, a: (f64, f64), b: (f64, f64), ) -> ShadowVertex {`

- [`offset`](dust_view.rs#L445) — Las caras del voxel movidas al punto sobre el que se apoya.
  - Firma: `fn offset(faces: VoxelFaces, x: f64, y: f64) -> VoxelFaces {`

- [`colours`](dust_view.rs#L455) — Los colores de las tres caras para un cubo de `shade` en `alpha`: cada cara con su propio casi blanco
  - Firma: `fn colours(shade: u32, alpha: f64) -> [Color; 3] {`

#### Constantes internas

- [`TAKEOFF_PUFF`](dust_view.rs#L59) — El soplo que levanta un despegue, también en el aire, así que un doble salto levanta otro soplo.
  - Declaración: `const TAKEOFF_PUFF: usize = 0;`

- [`LANDING_PUFF`](dust_view.rs#L62) — El soplo que levanta un aterrizaje, sobre el suelo en el que aterrizó.
  - Declaración: `const LANDING_PUFF: usize = 1;`

- [`PUFFS`](dust_view.rs#L76) — El conjunto completo: un despegue, un aterrizaje y el rastro de carrera.
  - Declaración: `const PUFFS: usize = 2 + RUN_PUFFS;`

- [`ZERO`](dust_view.rs#L389) — Sin kick ni desplazamiento respecto a los pies.
  - Declaración: `const ZERO: GridPoint = GridPoint { x: 0.0, y: 0.0 };`

### `player_view.rs`

#### Funciones internas

- [`default`](player_view.rs#L101) — Implementación de `Default`: la vista de polvo o de jugador vacía.
  - Firma: `fn default() -> Self {`

- [`turn_towards`](player_view.rs#L187) — Avanza la orientación hacia `target` por el camino más corto, una orientación por
  - Firma: `fn turn_towards(&mut self, target: usize, elapsed_ms: f64) {`

- [`pose`](player_view.rs#L218) — Pose del `frame`: hoja, pose y orientación actual.
  - Firma: `fn pose(&self, frame: PlayerFrame) -> PlayerPose {`

- [`phase_column`](player_view.rs#L228) — Cuál de las cinco columnas de salto usa una fase; `Ground` nunca llega aquí y toma la
  - Firma: `fn phase_column(phase: PlayerJumpPhase) -> usize {`

#### Constantes internas

- [`PHASES`](player_view.rs#L67) — Fases del salto: `takeoff`, `rise`, `apex`, `fall`, `landing`.
  - Declaración: `const PHASES: [&str; 5] = ["takeoff", "rise", "apex", "fall", "landing"];`
