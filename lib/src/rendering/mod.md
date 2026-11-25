# Rendering

Este dominio de cliente contiene materiales y primitivas específicas de Macroquad usados para dibujar la escena y presentar la pasada offscreen. Centraliza los componentes visuales reutilizables que no representan por sí mismos una regla de mundo.

El shader de la escena hace además el dithering de la oclusión del jugador: en la rama de sprites, un vértice con `normal.w > 0` descarta los píxeles cuyo umbral de Bayer 4 × 4 (leído de `gl_FragCoord`) queda por debajo de ese valor. `normal.w` vale 0 en todo lo demás, incluido lo que dibuja `draw_texture_ex`, así que nada cambia para un sprite opaco. `Veil` es quien escribe ese valor.

Los recursos deben tener una propiedad clara y una vida útil controlada por el cliente. Las APIs públicas de este dominio deben expresar conceptos de renderizado y no filtrar decisiones de terreno, entidades o simulación.

No contiene estado persistente del juego ni algoritmos de dominio. Los consumidores le entregan datos ya calculados.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `scene_material.rs`

#### Funciones y métodos

- [`load`](scene_material.rs#L101) — Carga el material y lo apunta a `shadow_map`.
  - Firma: `pub fn load(shadow_map: &Texture2D) -> Result<Self, String> {`

- [`bind`](scene_material.rs#L126) — Dibuja todo lo que sigue con este material.
  - Firma: `pub fn bind(&self) {`

- [`release`](scene_material.rs#L131) — Devuelve el dibujado al pipeline propio de Macroquad, para el HUD.
  - Firma: `pub fn release(&self) {`

- [`of`](scene_material.rs#L165) — El `Veil` que deja a un sprite con `opacity` de sí; `dithered` dice si el material de la escena está ligado para descartar los píxeles (rejilla de Bayer en el shader) o si hay que caer a transparencia normal.
  - Firma: `pub fn of(opacity: f32, dithered: bool) -> Self {`

- [`over`](scene_material.rs#L185) — El vértice con el velo puesto: `normal.w` lleva la parte de píxeles a descartar y el alfa del color se multiplica por `alpha`.
  - Firma: `pub fn over(self, mut vertex: Vertex) -> Vertex {`

- [`vertex`](scene_material.rs#L137) — Un vértice de la escena: un punto, de dónde leer la textura vinculada, un color, y los dos
  - Firma: `pub fn vertex( position: (f32, f32), uv: (f32, f32), colour: Color, map_uv: (f32, f32), kind: f32, ) -> Vertex {`

El material mezcla los colores con alfa fuente, pero conserva el alfa opaco del render target. Así la composición posterior del target no vuelve a atenuar sprites, sombras ni nubes semitransparentes.

#### Constantes

- [`SPRITE`](scene_material.rs#L7) — `normal.z` de un vértice dibujado desde la textura vinculada, que es todo sprite.
  - Declaración: `pub const SPRITE: f32 = 0.0;`

- [`SHADOW`](scene_material.rs#L10) — `normal.z` de un vértice cuyo color es la cobertura leída del atlas de sombras.
  - Declaración: `pub const SHADOW: f32 = 1.0;`

### `grade.rs`

#### Tipos

- [`PhaseGrade`](grade.rs#L94) — Cómo lee una fase en pantalla: el multiplicador sobre la escena, la saturación alrededor de la luma y el levantado de negros.
  - Declaración: `pub struct PhaseGrade { pub tint: Color, pub saturation: f32, pub lift: Color }`

- [`GradeTransition`](grade.rs#L136) — El crossfade entre el grado presentado y el que la escena pide tras un cambio de fase; se avanza con el tiempo de frame.
  - Declaración: `pub struct GradeTransition { current: PhaseGrade, from: PhaseGrade, to: PhaseGrade, elapsed: f32 }`

- [`GradeMaterial`](grade.rs#L219) — El material de presentación: una pasada a pantalla completa que aplica el grado y la profundidad de campo al componer la escena offscreen.
  - Declaración: `pub struct GradeMaterial { material: Material }`

#### Funciones y métodos

- [`grade_for`](grade.rs#L209) — El grado con el que presenta una fase horneada.
  - Firma: `pub fn grade_for(phase: BakePhase) -> PhaseGrade {`

- [`lerp_grade`](grade.rs#L121) — La mezcla canal a canal entre dos grados a `t` del crossfade, acotada a `[0, 1]`.
  - Firma: `pub fn lerp_grade(from: PhaseGrade, to: PhaseGrade, t: f32) -> PhaseGrade {`

- [`GradeTransition::new`](grade.rs#L145) — Una transición asentada que presenta `grade`.
  - Firma: `pub fn new(grade: PhaseGrade) -> Self {`

- [`GradeTransition::set_target`](grade.rs#L155) — Apunta la transición a `grade`; re-seleccionar el grado deseado no reinicia nada, y un cambio a mitad parte de lo que se ve.
  - Firma: `pub fn set_target(&mut self, grade: PhaseGrade) {`

- [`GradeTransition::advance`](grade.rs#L165) — Avanza el crossfade `dt` segundos y devuelve el grado a presentar.
  - Firma: `pub fn advance(&mut self, dt: f32) -> PhaseGrade {`

- [`GradeMaterial::load`](grade.rs#L225) — Carga el material; falla igual que el de la escena cuando el contexto no tiene OpenGL.
  - Firma: `pub fn load() -> Result<Self, String> {`

- [`GradeMaterial::bind`](grade.rs#L259) — Aplica los uniforms de grado y de profundidad de campo (escala de un texel del target, mapa de profundidad y foco en los pies del jugador) y dibuja lo que sigue con este material.
  - Firma: `pub fn bind(&self, grade: &PhaseGrade, texel_size: Vec2, depth: &Texture2D, focus: f32) {`

- [`GradeMaterial::release`](grade.rs#L278) — Devuelve el dibujado al pipeline propio de Macroquad, para la interfaz.
  - Firma: `pub fn release(&self) {`

#### Constantes

- [`DAWN_GRADE`](grade.rs#L181) — Amanecer: el sol cálido y bajo; tiñe hacia dorado.
  - Declaración: `pub const DAWN_GRADE: PhaseGrade = PhaseGrade {`

- [`DAY_GRADE`](grade.rs#L188) — Día: la escena sin tocar (identidad).
  - Declaración: `pub const DAY_GRADE: PhaseGrade = PhaseGrade {`

- [`SUNSET_GRADE`](grade.rs#L195) — Atardecer: la hora ámbar, más saturada que el amanecer.
  - Declaración: `pub const SUNSET_GRADE: PhaseGrade = PhaseGrade {`

- [`NIGHT_GRADE`](grade.rs#L202) — Noche: la escena fría, desaturada y con los negros levantados.
  - Declaración: `pub const NIGHT_GRADE: PhaseGrade = PhaseGrade {`

El material escribe alfa opaco y se pinta con reemplazo (sin blend), de modo que la pasada de grado nunca deja el framebuffer semitransparente ni se amalgama con el contenido anterior. En esa misma pasada aplica la profundidad de campo (ver `depth_of_field.rs`): el radio del bokeh de disco (ver `lens.rs`) sale de la profundidad isométrica de cada píxel, no de su altura en pantalla; después vienen el tono de lente y el viñeteado. El tamaño real del render target se entrega como uniform para que el radio sea estable en píxeles al redimensionar. El cambio de fase no corta el mundo de golpe: el bucle presenta el grado a través de `GradeTransition`, que interpola tinte, saturación y negros con suavizado (smoothstep) durante `PHASE_TRANSITION_SECONDS` (`game::config`), partiendo de lo que hay en pantalla si se cambia a mitad.

### `depth_of_field.rs`

La profundidad de campo desenfoca por **profundidad isométrica** (`x + y` del mundo, la misma coordenada que ordena el dibujo) y no por la altura en pantalla: la copa de un árbol alto o el tejado de una torre quedan exactamente tan nítidos como su base. Tras dibujar la escena, el bucle redibuja la lista ya ordenada en un mapa de profundidad a la misma resolución que la escena (`DepthTarget`, `DepthMaterial`, `sprites::draw_depth`): cada draw lleva un `DepthStamp` en el color (dos cotas de 16 bits) y en `normal.x` (la elevación), y el fragmento escribe `clamp((y + lift) / alto, least, most)` en dos bytes, con prueba de alfa a 0,5. Un sprite en pie (`Focus::Standing`) tiene las dos cotas iguales, la de su casilla; la cara superior de una columna de terreno (`Focus::Surface`) se lee píxel a píxel entre la esquina lejana y la cercana de su casilla, así el suelo plano sigue siendo un degradado continuo y las caras laterales toman la esquina cercana. Las profundidades se miden como la altura en pantalla que tendría el suelo al nivel de la cámara (`DepthFrame`), así que un campo llano al nivel de la cámara lee igual que antes. El foco del entorno cae en la columna redondeada del jugador (`get_player_column`). El cuerpo y el jetpack usan `Focus::Player`: el sello transporta la marca en `normal.y` y el mapa la escribe en alfa para cada píxel visible del sprite, incluidos sus bordes semitransparentes. La composición asigna radio cero a esos píxeles y les aplica el grado de color y el viñeteado de la escena. No entran sombras, reflejos, la elipse del jugador ni lo que el jugador ve a través (X-Ray); lo que no se dibuja (el vacío) cae a la altura en pantalla. El grado lee el mapa y aplica tres zonas: banda focal centrada en los pies del jugador (`FOCAL_HALF_HEIGHT` 0,10, banda del 20 % del alto) con CoC 0, transición `smoothstep` de `TRANSITION_HEIGHT` 0,20 y meseta con `MAX_BLUR_RADIUS_PX` 4 hacia los bordes. El desenfoque en sí es el bokeh de disco de `lens.rs`. La parte GPU se comprueba con `armada-visual-check`; la aritmética de los dos shaders tiene su espejo en CPU en `depth_of_field.test.rs`.

#### Tipos

- [`DepthFrame`](depth_of_field.rs#L46) — Lo que la proyección del fotograma dice de la profundidad: dónde cae el suelo del nivel de la cámara y dónde está el foco.
  - Declaración: `pub struct DepthFrame { ground_origin, elevation_step, level, tile_height, height, focus }`

- [`DepthStamp`](depth_of_field.rs#L117) — La profundidad que escribe un draw: `least`, `most`, `lift` y la marca de nitidez.
  - Declaración: `pub struct DepthStamp { pub least: f32, pub most: f32, pub lift: f32, sharp: bool }`

- [`DepthMaterial`](depth_of_field.rs#L247) — El material de la pasada de profundidad.
  - Declaración: `pub struct DepthMaterial { material: Material }`

- [`DepthTarget`](depth_of_field.rs#L277) — El mapa que lee el grado, a la misma resolución que la escena.
  - Declaración: `pub struct DepthTarget { target: RenderTarget, size: (u32, u32) }`

#### Funciones y métodos

- [`encode_depth`](depth_of_field.rs#L37) — Empaqueta una profundidad en dos bytes (alto primero), acotada al rango del mapa.
  - Firma: `pub fn encode_depth(depth: f32) -> [u8; 2] {`

- [`DepthFrame::new`](depth_of_field.rs#L57) — El marco de profundidad de `projection` al nivel de cámara `level`, enfocado en la columna redondeada del jugador (`feet` = los pies como proyecta `player_feet`, esperada como `rp + 0,5`; `get_player_column(feet - 0,5)`), igual que ordena `scene_key`.
  - Firma: `pub fn new(projection: ProjectionConfig, level: f64, height: f32, feet: GridPoint) -> Self {`

- [`DepthFrame::focus`](depth_of_field.rs#L82) — La profundidad de la columna redondeada del jugador, centro de la banda focal.
  - Firma: `pub fn focus(&self) -> f32 {`

- [`DepthFrame::height`](depth_of_field.rs#L87) — El alto de pantalla en píxeles del que las profundidades son fracción.
  - Firma: `pub fn height(&self) -> f32 {`

- [`DepthFrame::stamp`](depth_of_field.rs#L92) — Dónde cae en profundidad un draw ordenado por `key`, leído como dice `focus`.
  - Firma: `pub fn stamp(&self, key: DrawKey, focus: Focus) -> DepthStamp {`

- [`DepthStamp::over`](depth_of_field.rs#L127) — Pone el sello sobre un vértice: las dos cotas en el color, la elevación en `normal.x` y la marca de nitidez en `normal.y`.
  - Firma: `pub fn over(&self, vertex: &mut Vertex) {`

- [`DepthMaterial::load`](depth_of_field.rs#L253) — Carga el material; falla como el de la escena sin OpenGL, y entonces el desenfoque sigue la altura en pantalla.
  - Firma: `pub fn load() -> Result<Self, String> {`

- [`DepthTarget::new`](depth_of_field.rs#L275) — Reserva el mapa para un framebuffer de `width` por `height`.
  - Firma: `pub fn new(width: f32, height: f32) -> Self {`

- [`DepthTarget::resize`](depth_of_field.rs#L299) — Solo vuelve a reservar al cambiar el tamaño.
  - Firma: `pub fn resize(&mut self, width: f32, height: f32) {`

- [`DepthTarget::texture`](depth_of_field.rs#L308) — El mapa, para que el grado lo muestree.
  - Firma: `pub fn texture(&self) -> &Texture2D {`

- [`DepthTarget::begin`](depth_of_field.rs#L314) — Limpia el mapa («nada dibujado») y dirige lo que sigue a él con el material, en píxeles de la escena.
  - Firma: `pub fn begin(&self, material: &DepthMaterial, frame: &DepthFrame) {`

- [`DepthTarget::end`](depth_of_field.rs#L327) — Devuelve el dibujado al pipeline de Macroquad.
  - Firma: `pub fn end(&self) {`

#### Constantes

- [`DEPTH_MIN`](depth_of_field.rs#L19) — La profundidad más baja del mapa, como fracción del alto desde arriba.
  - Declaración: `pub const DEPTH_MIN: f32 = -1.0;`

- [`DEPTH_SPAN`](depth_of_field.rs#L22) — Cuánta profundidad abarca el mapa sobre `DEPTH_MIN` (pies muy por debajo de la pantalla siguen contando).
  - Declaración: `pub const DEPTH_SPAN: f32 = 3.0;`

- [`FOCAL_HALF_HEIGHT`](depth_of_field.rs#L25) — Media altura de la banda focal nítida (CoC 0).
  - Declaración: `pub const FOCAL_HALF_HEIGHT: f32 = 0.10;`

- [`TRANSITION_HEIGHT`](depth_of_field.rs#L28) — Lo que tarda el desenfoque en llegar a su radio completo tras la banda.
  - Declaración: `pub const TRANSITION_HEIGHT: f32 = 0.20;`

- [`MAX_BLUR_RADIUS_PX`](depth_of_field.rs#L31) — El radio completo, en píxeles del target.
  - Declaración: `pub const MAX_BLUR_RADIUS_PX: f32 = 4.0;`

- [`DEPTH_MAP`](depth_of_field.rs#L34) — El nombre del sampler del mapa en el grado.
  - Declaración: `pub const DEPTH_MAP: &str = "DepthMap";`

- [`GRADE_DEPTH_GLSL`](depth_of_field.rs#L136) — El GLSL que incluye el grado: lee el mapa (`sceneDepth`) y lo convierte en radio (`blurRadius`).
  - Declaración: `pub const GRADE_DEPTH_GLSL: &str = r#"`

- [`DEPTH_FRAGMENT`](depth_of_field.rs#L194) — El fragmento de la pasada de profundidad: prueba de alfa y profundidad en dos bytes.
  - Declaración: `pub const DEPTH_FRAGMENT: &str = r#"#version 100`

### `lens.rs`

La lente del aspecto de maqueta, incluida en el fragmento de presentación. **Bokeh de disco**: `BOKEH_TAPS` (16) muestras en espiral de Vogel (ángulo áureo, radios de área igual `√((i + ½)/n)`) desenrolladas desde `vogel_offsets`, escaladas por el radio del CoC; cada muestra pesa `1 + BOKEH_HIGHLIGHT·luma⁴`, así los brillos conservan su disco y las esquinas de los bloques desenfocados se redondean como arcilla en vez de lavarse (el filtro anterior de 9 muestras en cruz dejaba fantasmas en rejilla). Con radio < 0,05 px se lee una sola muestra. Con `focus = 1 − radio/máx`, **tono**: saturación `+SCENE_SATURATION + FOCUS_SATURATION·focus` (0 % en toda la escena, +2 % en foco) antes del grado de fase; la lente no toca el contraste (se quitó a petición). **Viñeteado**: `1 − VIGNETTE_STRENGTH·smoothstep(VIGNETTE_START, 1, d)` con `d` 0 en el centro y 1 en la esquina (−14 % en las esquinas), multiplicado con el `Tint`. El cliente no tiene pase de SSAO ni dibuja `contact_shadow`: la oscuridad entre bloques viene horneada del render clay de Blender, y en pantalla no se refuerza (el micro-contraste se probó y se quitó: dentaba las siluetas). La aritmética tiene su espejo en `lens.test.rs`.

#### Funciones y métodos

- [`vogel_offsets`](lens.rs#L33) — Las `count` muestras de una espiral de Vogel sobre el disco unidad.
  - Firma: `pub fn vogel_offsets(count: usize) -> Vec<(f32, f32)> {`

- [`glsl_float`](lens.rs#L44) — `value` escrito como literal float de GLSL.
  - Firma: `pub fn glsl_float(value: f32) -> String {`

- [`lens_glsl`](lens.rs#L49) — El GLSL que incluye la presentación: `bokeh`, `lensTone` y `vignette`, con las constantes como literales.
  - Firma: `pub fn lens_glsl() -> String {`

#### Constantes

- [`BOKEH_TAPS`](lens.rs#L11) — Cuántas muestras lee el disco del bokeh.
  - Declaración: `pub const BOKEH_TAPS: usize = 16;`

- [`GOLDEN_ANGLE`](lens.rs#L14) — El giro entre muestras consecutivas de Vogel, `π(3 − √5)`.
  - Declaración: `pub const GOLDEN_ANGLE: f32 = 2.399_963;`

- [`BOKEH_HIGHLIGHT`](lens.rs#L17) — Cuánto más pesa en el bokeh una muestra blanca que una negra.
  - Declaración: `pub const BOKEH_HIGHLIGHT: f32 = 2.0;`

- [`SCENE_SATURATION`](lens.rs#L20) — Saturación añadida en toda la escena.
  - Declaración: `pub const SCENE_SATURATION: f32 = 0.0;`

- [`FOCUS_SATURATION`](lens.rs#L23) — Saturación añadida encima donde la escena está nítida.
  - Declaración: `pub const FOCUS_SATURATION: f32 = 0.02;`


- [`VIGNETTE_START`](lens.rs#L26) — A qué distancia del centro (0) a la esquina (1) empieza el viñeteado.
  - Declaración: `pub const VIGNETTE_START: f32 = 0.55;`

- [`VIGNETTE_STRENGTH`](lens.rs#L29) — Cuánto oscurece el viñeteado las esquinas.
  - Declaración: `pub const VIGNETTE_STRENGTH: f32 = 0.14;`

### `render_target.rs`

#### Funciones y métodos

- [`render_target_size`](render_target.rs#L10) — Convierte el tamaño del framebuffer en dimensiones enteras válidas para una textura, redondeando hacia arriba y evitando cero o valores no finitos.
  - Firma: `pub fn render_target_size(width: f32, height: f32) -> (u32, u32) {`

- [`SceneTarget::new`](render_target.rs#L40) — Reserva el target de la escena con filtro nearest para el tamaño del framebuffer inicial.
  - Firma: `pub fn new(width: f32, height: f32) -> Self {`

- [`SceneTarget::resize`](render_target.rs#L48) — Solo vuelve a reservar el target cuando cambian sus dimensiones de textura.
  - Firma: `pub fn resize(&mut self, width: f32, height: f32) -> bool {`

- [`SceneTarget::begin`](render_target.rs#L61) — Dirige el dibujo de escena al target offscreen conservando el sistema de coordenadas en píxeles del framebuffer.
  - Firma: `pub fn begin(&self) {`

- [`SceneTarget::present`](render_target.rs#L70) — Vuelve al framebuffer, invierte verticalmente la textura offscreen y compone la escena ya terminada, aplicando el grado y la profundidad de campo (mapa `depth`, foco `focus`) con el material de presentación cuando está disponible.
  - Firma: `pub fn present( &self, material: Option<&GradeMaterial>, grade: &PhaseGrade, (depth, focus): (&Texture2D, f32), ) {`

## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `grade.rs`

#### Constantes internas

- [`VERTEX`](grade.rs#L17) — Vértice GLSL (`#version 100`) del shader de grado/material.
  - Declaración: `const VERTEX: &str = r#"#version 100 attribute vec3 position;`

- [`FRAGMENT_HEAD`](grade.rs#L35) — Cabecera del fragmento de presentación: precisión, `uv` y los uniforms del grado.
  - Declaración: `const FRAGMENT_HEAD: &str = r#"#version 100 #ifdef GL_FRAGMENT_PRECISION_HIGH`

- [`FRAGMENT_BODY`](grade.rs#L55) — Cuerpo del fragmento: desenfoca con el radio de `blurRadius`, escala por `Tint`, desplaza saturación alrededor de la luma Rec. 601 y añade `Lift`.
  - Declaración: `const FRAGMENT_BODY: &str = r#"`

- [`fragment`](grade.rs#L68) — El fragmento completo: cabecera, `GRADE_DEPTH_GLSL` y cuerpo.
  - Firma: `fn fragment() -> String {`

- [`grade_pipeline`](grade.rs#L75) — La tubería del grado: reemplazo opaco (sin blend) para que la pasada nunca amalgame con el contenido anterior del framebuffer.
  - Firma: `fn grade_pipeline() -> PipelineParams {`

### `scene_material.rs`

#### Constantes internas

- [`SHADOW_MAP`](scene_material.rs#L13) — El nombre que el shader da al atlas de sombras. `Texture` y `_ScreenTexture` son de Macroquad
  - Declaración: `const SHADOW_MAP: &str = "ShadowMap";`

- [`VERTEX`](scene_material.rs#L15) — Vértice GLSL (`#version 100`) del shader de grado/material.
  - Declaración: `const VERTEX: &str = r#"#version 100 attribute vec3 position;`

- [`FRAGMENT`](scene_material.rs#L39) — Fragmento GLSL (`#version 100`) del shader de material.
  - Declaración: `const FRAGMENT: &str = r#"#version 100 #ifdef GL_FRAGMENT_PRECISION_HIGH precision highp float;`

### `backdrop.rs`

- `fade(blur, open, frame_ms)` — Los píxeles de desenfoque tras un menú abierto en este fotograma: sube hasta `MENU_BLUR_PX` mientras hay un menú abierto (tienda, mochila) y baja a cero al cerrarse. La pasada de presentación lo aplica a toda la escena (`MenuBlur` en `grade.rs`).
