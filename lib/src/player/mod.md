# Player

Este dominio de cliente presenta al jugador y sus efectos visuales usando el estado y la física de `iso::player`. Convierte el estado de dominio en sprites, orientación, interpolación y efectos visibles de Macroquad.

Debe tratar el crate `iso` como autoridad para movimiento y colisiones. Las decisiones de presentación pueden cambiar aquí sin alterar la simulación ni serialización del jugador.

No implementa física, no modifica reglas de entrada ni persiste estado jugable. Es una adaptación visual del dominio de jugador.


El cuerpo del jugador se dibuja con dos inclinaciones de presentación, ambas resortes amortiguados sobre `BodyMotion`: en el suelo **se inclina hacia donde avanza** (deformación sobre la línea en la que pisa, los pies clavados), y en el aire con el jetpack **el cuerpo entero bascula** hacia donde vuela, girando sobre su centro (`ROLL_PIVOT`) con un muelle más lento y flotante. Las dos se alimentan de la velocidad y de la aceleración por tick, no de la tecla pulsada, así que arrancar, frenar y derrapar se notan en el cuerpo. Solo inclina la deriva **lateral** en pantalla: ir hacia la cámara o alejarse de ella no inclina nada. Al dejar de inclinarse, el sprite vuelve a dibujarse como un rectángulo recto (`SpriteDraw::whole`/`shaded`); inclinado o girado, pasa por `SpriteDraw::leaning`, que lo dibuja en su cuadrilátero. Ni la sombra del suelo ni el reflejo del agua siguen la inclinación.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `dust_view.rs`

#### Funciones y métodos

- [`new`](dust_view.rs#L163) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`live`](dust_view.rs#L181) — Cuántos soplos siguen elevándose, para el HUD y las pruebas.
  - Firma: `pub fn live(&self) -> usize {`

- [`react`](dust_view.rs#L190) — Detecta lo que ha hecho el jugador desde el último frame y levanta el polvo correspondiente: un soplo
  - Firma: `pub fn react( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`advance`](dust_view.rs#L433) — Envejece cada soplo vivo en `elapsed_ms` de tiempo real, terminando los cuya vida ha acabado.
  - Firma: `pub fn advance(&mut self, elapsed_ms: f64) {`

- [`collect`](dust_view.rs#L442) — Encola cada cubo de polvo vivo en `draws`, cada uno a la profundidad que tomó cuando su soplo
  - Firma: `pub fn collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>) {`

#### Constantes

- [`DUST_TOP`](dust_view.rs#L25) — Los colores de un voxel de polvo, casi blanco: su cara superior iluminada, su lado izquierdo y su lado derecho.
  - Declaración: `pub const DUST_TOP: u32 = 0xfbf9f4;`

- [`DUST_LEFT`](dust_view.rs#L26) — Selecciona el desplazamiento horizontal de polvo a la izquierda del jugador.
  - Declaración: `pub const DUST_LEFT: u32 = 0xe6e2d8;`

- [`DUST_RIGHT`](dust_view.rs#L27) — Selecciona el desplazamiento horizontal de polvo a la derecha del jugador.
  - Declaración: `pub const DUST_RIGHT: u32 = 0xcfcabd;`

- [`DUST_BEHIND_LAYER`](dust_view.rs#L30) — La capa en la que va el polvo dibujado detrás de lo que hay sobre su columna: la que luce la cima de una columna
  - Declaración: `pub const DUST_BEHIND_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;`

- [`DUST_FRONT_DEPTH`](dust_view.rs#L33) — Profundidad añadida a un cubo de polvo delante de los pies, para que se dibuje después de la columna sobre la que está
  - Declaración: `pub const DUST_FRONT_DEPTH: f64 = 0.00001;`

- [`RUN_DUST_EVERY`](dust_view.rs#L51) — Columnas que un jugador corriendo recorre entre dos soplos de polvo.
  - Declaración: `pub const RUN_DUST_EVERY: f64 = 0.7;`

- [`SKID_DUST_EVERY`](dust_view.rs#L54) — Columnas que un jugador derrapando desliza entre dos soplos: más a menudo que al correr, porque un derrape
  - Declaración: `pub const SKID_DUST_EVERY: f64 = 0.2;`

- [`RUN_PUFFS`](dust_view.rs#L57) — Soplos de polvo de carrera o derrape vivos a la vez, reutilizados por turno. La estela de quien nada usa esos mismos soplos.
  - Declaración: `pub const RUN_PUFFS: usize = 6;`

- [`SWIM_WAKE_EVERY`](dust_view.rs) — Columnas que recorre quien nada entre dos pares de crestas de su estela: más a menudo que el polvo de una carrera, porque el agua se cierra detrás.
  - Declaración: `pub const SWIM_WAKE_EVERY: f64 = 0.4;`

- [`SWIM_WAKE_SPREAD`](dust_view.rs) — Cuánto se abre cada brazo de la estela respecto a por donde vino el nadador, en radianes: los dos juntos son la V que arrastra.
  - Declaración: `pub const SWIM_WAKE_SPREAD: f64 = 0.62;`

- [`SWIM_WAKE_BEHIND`](dust_view.rs) — Columnas por detrás del nadador a las que nacen las crestas, para que el agua se cierre detrás del cuerpo y no dentro.
  - Declaración: `pub const SWIM_WAKE_BEHIND: f64 = 0.16;`

- [`SWIM_RIPPLE_MS`](dust_view.rs) — Milisegundos reales entre los anillos que abre quien flota quieto.
  - Declaración: `pub const SWIM_RIPPLE_MS: f64 = 1400.0;`

- [`JET_FIRE_EVERY_MS`](dust_view.rs#L60) / [`JET_SMOKE_EVERY_MS`](dust_view.rs#L63) — Milisegundos reales entre dos soplos de llama y de humo del jetpack mientras se vuela. La quema se marca en tiempo real, no en columnas recorridas: es un motor encendido, no un paso dado.
  - Declaración: `pub const JET_FIRE_EVERY_MS: f64 = 40.0;`

- [`JET_FIRE_PUFFS`](dust_view.rs#L67) / [`JET_SMOKE_PUFFS`](dust_view.rs#L70) — Soplos de llama y de humo vivos a la vez: uno más de los que caben en la vida de un soplo, para que el más viejo haya terminado antes de que su hueco vuelva a tocar.
  - Declaración: `pub const JET_FIRE_PUFFS: usize = (JET_FIRE.ms / JET_FIRE_EVERY_MS) as usize + 2;`

### `body_motion.rs`

#### Tipos

- [`BodyScale`](body_motion.rs#L147) — Escala visual del cuerpo alrededor de los pies.
  - Firma: `pub struct BodyScale { pub x: f64, pub y: f64 }`
- [`BodyMoment`](body_motion.rs#L154) — Muestra de estado del jugador para una animación visual de un fotograma.
  - Firma: `pub struct BodyMoment { ... }`
- [`BodyMotion`](body_motion.rs#L174) — Memoria de los pulsos visuales de despegue y aterrizaje y de los dos resortes de inclinación.
  - Firma: `pub struct BodyMotion { ... }`
- [`BodyPose`](body_motion.rs#L188) — Cómo se dibuja el cuerpo este fotograma: su escala sobre los pies, la inclinación sobre la línea en la que pisa (`tilt`) y el giro sobre el centro del cuerpo (`turned`).
  - Firma: `pub struct BodyPose { pub scale: BodyScale, pub tilt: f64, pub turned: f64 }`
- [`BodyLean`](body_motion.rs#L64) — Dónde está una inclinación y a qué velocidad gira: el estado de un resorte.
  - Firma: `pub struct BodyLean { pub angle: f64, pub speed: f64 }`
- [`LeanSpring`](body_motion.rs#L44) — Cómo sigue una inclinación a su objetivo: frecuencia angular y amortiguación.
  - Firma: `pub struct LeanSpring { pub stiffness: f64, pub damping: f64 }`

#### Funciones y métodos

- [`advance`](body_motion.rs#L212) — Avanza los pulsos visuales y las dos inclinaciones, y devuelve cómo se dibuja el cuerpo este fotograma. Volando, el cuerpo entero gira hacia donde va en vez de inclinarse, y la inclinación de pie se suelta; fuera del aire vuelve a enderezarse, cada una con su resorte.
  - Firma: `pub fn advance(&mut self, moment: BodyMoment) -> BodyPose {`
- [`screen_drift`](body_motion.rs#L71) — Cuánto deriva una velocidad por la pantalla, en columnas por tick: hacia la derecha positivo, hacia o desde la cámara nada, así que solo un movimiento lateral inclina.
  - Firma: `pub fn screen_drift(velocity: GridPoint) -> f64 {`
- [`lean_target`](body_motion.rs#L78) — El ángulo hacia el que se inclina en el suelo: adelante con su velocidad, más al acelerar y hacia atrás al frenar, nunca más allá de `MAX_LEAN`; derrapando clava los talones y se inclina contra el deslizamiento.
  - Firma: `pub fn lean_target(velocity: GridPoint, acceleration: GridPoint, skidding: bool) -> f64 {`
- [`roll_target`](body_motion.rs#L90) — El ángulo hacia el que gira el cuerpo entero volando: de cabeza hacia donde va, con los pies levantándose detrás, nunca más allá de `MAX_FLY_ROLL`.
  - Firma: `pub fn roll_target(velocity: GridPoint, acceleration: GridPoint) -> f64 {`
- [`step_body_lean`](body_motion.rs#L99) — Mueve una inclinación hacia su objetivo durante `ms` por el resorte amortiguado, en pasos de 16 ms como mucho; sobre un objetivo de `0` se para exactamente en `0`.
  - Firma: `pub fn step_body_lean(lean: &mut BodyLean, target: f64, ms: f64, spring: LeanSpring) {`
- [`body_quad`](body_motion.rs#L119) — Las cuatro esquinas de pantalla en las que se dibuja el cuerpo: el rectángulo inclinado `tilt` sobre la línea de los pies y girado después `turned` sobre el centro del cuerpo, `ROLL_PIVOT` bloques por encima.
  - Firma: `pub fn body_quad(layout: SpriteLayout, feet: (f64, f64), tilt: f64, turned: f64, box_height: f64) -> [(f64, f64); 4] {`

#### Constantes

- [`LEAN_PER_SPEED`](body_motion.rs#L23) / [`LEAN_PER_ACCEL`](body_motion.rs#L26) / [`MAX_LEAN`](body_motion.rs#L30) — Cuánto se inclina el cuerpo en el suelo por columna por tick de deriva lateral (0,35: un paseo unos 3°, una carrera unos 5°), cuánto por aceleración (1,2: se inclina al arrancar y hacia atrás al frenar) y el tope (0,16 rad, unos 9°).
  - Declaración: `pub const LEAN_PER_SPEED: f64 = 0.35;`
- [`SKID_LEAN_PER_SPEED`](body_motion.rs#L28) — Derrapando se inclina contra el deslizamiento en vez de hacia él, con los talones clavados.
  - Declaración: `pub const SKID_LEAN_PER_SPEED: f64 = 0.8;`
- [`FLY_ROLL_PER_SPEED`](body_motion.rs#L33) / [`FLY_ROLL_PER_ACCEL`](body_motion.rs#L35) / [`MAX_FLY_ROLL`](body_motion.rs#L37) — Lo mismo volando, pero es un giro del cuerpo entero y mucho mayor (2,3 y 4, hasta 0,6 rad, unos 34°).
  - Declaración: `pub const FLY_ROLL_PER_SPEED: f64 = 2.3;`
- [`ROLL_PIVOT`](body_motion.rs#L39) — Bloques por encima de los pies a los que está el centro del cuerpo, sobre el que gira volando.
  - Declaración: `pub const ROLL_PIVOT: f64 = 0.28;`
- [`LEAN_SPRING`](body_motion.rs#L50) / [`FLY_ROLL_SPRING`](body_motion.rs#L57) — Los dos resortes amortiguados: el de pie es rápido y rebota un poco al parar (18 / 0,45); el del vuelo es lento y flotante, el cuerpo colgando del jetpack (8 / 0,5).
  - Declaración: `pub const LEAN_SPRING: LeanSpring = LeanSpring { stiffness: 18.0, damping: 0.45 };`
- [`LANDING_SQUASH_MS`](body_motion.rs#L10) — Milisegundos de compresión tras aterrizar.
  - Declaración: `pub const LANDING_SQUASH_MS: f64 = 180.0;`
- [`TAKEOFF_STRETCH_MS`](body_motion.rs#L12) — Milisegundos de estiramiento tras despegar.
  - Declaración: `pub const TAKEOFF_STRETCH_MS: f64 = 120.0;`
- [`AIR_STRETCH_PER_SPEED`](body_motion.rs#L14) — Estiramiento del cuerpo en el aire por bloque por tick de velocidad vertical.
  - Declaración: `pub const AIR_STRETCH_PER_SPEED: f64 = 0.25;`
- [`MAX_AIR_STRETCH`](body_motion.rs#L16) — El mayor estiramiento que el cuerpo puede tomar en el aire.
  - Declaración: `pub const MAX_AIR_STRETCH: f64 = 0.12;`
- [`CLIMB_STRETCH`](body_motion.rs#L18) — Estiramiento del cuerpo en la mitad de una escalada.
  - Declaración: `pub const CLIMB_STRETCH: f64 = 0.05;`
- [`BOB_PER_SPEED`](body_motion.rs#L20) — Balanceo de pisada por columna por tick de velocidad en suelo.
  - Declaración: `pub const BOB_PER_SPEED: f64 = 0.2;`

### `flip.rs`

#### Tipos

- [`FlipMoment`](flip.rs#L12) — Lo que el jugador ha hecho desde el frame anterior, en lo que atañe al mortal.
  - Firma: `pub struct FlipMoment { ... }`
- [`FlipMotion`](flip.rs#L24) — La memoria del mortal entre frames: cuánto lleva girado y a qué ritmo.
  - Firma: `pub struct FlipMotion { ... }`

#### Funciones y métodos

- [`advance`](flip.rs#L49) — Tiene en cuenta un frame y responde con la parte del mortal que lleva girada, de `0.0` a `1.0`, o `None` cuando el jugador se dibuja derecho.
  - Firma: `pub fn advance(&mut self, moment: FlipMoment) -> Option<f64> {`

#### Constantes

- [`FLIP_MS`](flip.rs#L4) — Milisegundos reales que dura un mortal entero, el tiempo en el aire de un segundo salto.
  - Declaración: `pub const FLIP_MS: f64 = 520.0;`

- [`FLIP_LANDING_MS`](flip.rs#L8) — Milisegundos reales en los que se termina el giro que quedaba cuando un aterrizaje corta el mortal.
  - Declaración: `pub const FLIP_LANDING_MS: f64 = 110.0;`

### `player_view.rs`

#### Funciones y métodos

- [`jump_poses`](player_view.rs#L70) — Las columnas de las cinco fases de salto en una hoja que nombra sus columnas (`data-poses`).
  - Firma: `pub fn jump_poses(poses: &[String], columns: usize) -> Option<[usize; 5]> {`

- [`advance`](player_view.rs#L118) — Tiene en cuenta un frame y responde con la pose a dibujar.
  - Firma: `pub fn advance(&mut self, moment: PlayerMoment, sheets: PlayerSheets) -> PlayerPose {`

- [`facing_name`](player_view.rs#L229) — El nombre de la orientación con la que se dibuja al jugador, para el HUD.
  - Firma: `pub fn facing_name(&self) -> &'static str {`

- [`facing`](player_view.rs#L224) — La orientación con la que se dibuja al jugador, índice en `PLAYER_FACINGS`: de ahí se saca lo que lleva a la espalda (las toberas del jetpack).
  - Firma: `pub fn facing(&self) -> usize {`

- [`walked`](player_view.rs#L234) — Distancia de la zancada visual actual, incluida la pedalada inversa del derrape.
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

- [`default`](dust_view.rs#L157) — Implementación de `Default`: la vista de polvo o de jugador vacía.
  - Firma: `fn default() -> Self {`

- [`kick`](dust_view.rs#L253) — El rastro que un jugador corriendo o derrapando levanta tras sus pies, un soplo cada tramo de
  - Firma: `fn kick( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`burn`](dust_view.rs#L350) — La llama y el humo que el jetpack quema por sus toberas mientras se vuela: ambos salen de las toberas de la espalda (`iso::player::jet_nozzle`, `JET_NOZZLE_LIFT`) y no de los pies, así que el orden de dibujo los deja delante o detrás del cuerpo según hacia dónde derivan. En el suelo no se quema nada y los relojes vuelven a infinito, para que el primer fotograma de un vuelo encienda ya.
  - Firma: `fn burn( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`raise`](dust_view.rs#L408) — Levanta la bocanada `index` con `shape` en el emisor indicado; descarta la anterior.
  - Firma: `fn raise( &mut self, index: usize, shape: DustShape, feet: GridPoint, level: f64, kick: GridPoint, origin: GridPoint, tile_height: f64, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`voxel_key`](dust_view.rs#L508) — Dónde se ordena un cubo de polvo en la escena: la columna sobre la que está a mitad de su vida, y
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

- [`offset`](dust_view.rs#L539) — Las caras del voxel movidas al punto sobre el que se apoya.
  - Firma: `fn offset(faces: VoxelFaces, x: f64, y: f64) -> VoxelFaces {`

- [`colours`](dust_view.rs#L549) — Los colores de las tres caras para un cubo de `shade` en `alpha`: cada cara con su propio casi blanco
  - Firma: `fn colours(shade: u32, alpha: f64) -> [Color; 3] {`

#### Constantes internas

- [`TAKEOFF_PUFF`](dust_view.rs#L73) — El soplo que levanta un despegue, también en el aire, así que un doble salto levanta otro soplo.
  - Declaración: `const TAKEOFF_PUFF: usize = 0;`

- [`LANDING_PUFF`](dust_view.rs#L76) — El soplo que levanta un aterrizaje, sobre el suelo en el que aterrizó.
  - Declaración: `const LANDING_PUFF: usize = 1;`

- [`PUFFS`](dust_view.rs#L96) — El conjunto completo: un despegue, un aterrizaje, un chapuzón, un anillo, el rastro y la llama y el humo del jetpack.
  - Declaración: `const PUFFS: usize = JET_SMOKE_PUFF + JET_SMOKE_PUFFS;`

- [`JET_FIRE_PUFF`](dust_view.rs#L88) / [`JET_SMOKE_PUFF`](dust_view.rs#L91) — El primer hueco de la llama y del humo que quema el jetpack; cada uno se recorre por turno.
  - Declaración: `const JET_FIRE_PUFF: usize = TRAIL_PUFF + RUN_PUFFS;`

- [`ZERO`](dust_view.rs#L483) — Sin kick ni desplazamiento respecto a los pies.
  - Declaración: `const ZERO: GridPoint = GridPoint { x: 0.0, y: 0.0 };`

### `flip.rs`

El mortal es solo presentación: el dominio no sabe que el cuerpo gira. `FlipMotion` escucha los contadores de `PlayerFeedback` — un salto nuevo con `air_jump` arranca el giro, un aterrizaje lo termina — y entrega la parte del giro hecha, que `player_view` convierte en la columna de la hoja `flip` (`iso::scene_order::FlipInput`).

El giro avanza a ritmo constante (una vuelta en `FLIP_MS`), porque un mortal acelerado o frenado se lee como un tirón. Al completar la vuelta el mortal termina y el jugador vuelve a su hoja de siempre. Si aterriza antes, el resto de la vuelta se reparte en `FLIP_LANDING_MS`: termina el mortal en el suelo en vez de saltar de golpe a la vertical.

**El giro va dibujado, no rotado en pantalla.** Rotar el sprite es una voltereta lateral igual para todas las orientaciones: quien camina hacia la cámara giraría de lado. La hoja `flip.svg` (`../../../artifacts/player_flip.py`) hornea el mortal de verdad, una fila por orientación: la figura se inclina sobre su propio eje lateral **antes** del yaw de la orientación, así que quien va hacia la cámara cae hacia la cámara. Por eso el cliente no tiene ningún giro de sprite; si la hoja falta en el atlas, el segundo salto vuelve a las poses de salto de siempre.

#### Funciones internas

- [`default`](flip.rs#L35) — Implementación de `Default`: nadie gira todavía y una vuelta por `FLIP_MS`.
  - Firma: `fn default() -> Self {`

### `player_view.rs`

#### Funciones internas

- [`default`](player_view.rs#L105) — Implementación de `Default`: la vista de polvo o de jugador vacía.
  - Firma: `fn default() -> Self {`

- [`turn_towards`](player_view.rs#L201) — Avanza la orientación hacia `target` por el camino más corto, una orientación por
  - Firma: `fn turn_towards(&mut self, target: usize, elapsed_ms: f64) {`

- [`pose`](player_view.rs#L238) — Pose del `frame`: hoja, pose y orientación actual.
  - Firma: `fn pose(&self, frame: PlayerFrame) -> PlayerPose {`

- [`phase_column`](player_view.rs#L248) — Cuál de las cinco columnas de salto usa una fase; `Ground` nunca llega aquí y toma la
  - Firma: `fn phase_column(phase: PlayerJumpPhase) -> usize {`

#### Constantes internas

- [`PHASES`](player_view.rs#L71) — Fases del salto: `takeoff`, `rise`, `apex`, `fall`, `landing`.
  - Declaración: `const PHASES: [&str; 5] = ["takeoff", "rise", "apex", "fall", "landing"];`
