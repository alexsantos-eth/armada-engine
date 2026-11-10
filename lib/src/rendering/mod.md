# Rendering

Este dominio de cliente contiene materiales y primitivas específicas de Macroquad usados para dibujar la escena y presentar la pasada offscreen. Centraliza los componentes visuales reutilizables que no representan por sí mismos una regla de mundo.

Los recursos deben tener una propiedad clara y una vida útil controlada por el cliente. Las APIs públicas de este dominio deben expresar conceptos de renderizado y no filtrar decisiones de terreno, entidades o simulación.

No contiene estado persistente del juego ni algoritmos de dominio. Los consumidores le entregan datos ya calculados.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `scene_material.rs`

#### Funciones y métodos

- [`load`](scene_material.rs#L65) — Carga el material y lo apunta a `shadow_map`.
  - Firma: `pub fn load(shadow_map: &Texture2D) -> Result<Self, String> {`

- [`bind`](scene_material.rs#L97) — Dibuja todo lo que sigue con este material.
  - Firma: `pub fn bind(&self) {`

- [`release`](scene_material.rs#L102) — Devuelve el dibujado al pipeline propio de Macroquad, para el HUD.
  - Firma: `pub fn release(&self) {`

- [`vertex`](scene_material.rs#L108) — Un vértice de la escena: un punto, de dónde leer la textura vinculada, un color, y los dos
  - Firma: `pub fn vertex( position: (f32, f32), uv: (f32, f32), colour: Color, map_uv: (f32, f32), kind: f32, ) -> Vertex {`

El material mezcla los colores con alfa fuente, pero conserva el alfa opaco del render target. Así la composición posterior del target no vuelve a atenuar sprites, sombras ni nubes semitransparentes.

#### Constantes

- [`SPRITE`](scene_material.rs#L7) — `normal.z` de un vértice dibujado desde la textura vinculada, que es todo sprite.
  - Declaración: `pub const SPRITE: f32 = 0.0;`

- [`SHADOW`](scene_material.rs#L10) — `normal.z` de un vértice cuyo color es la cobertura leída del atlas de sombras.
  - Declaración: `pub const SHADOW: f32 = 1.0;`

### `grade.rs`

#### Tipos

- [`PhaseGrade`](grade.rs#L108) — Cómo lee una fase en pantalla: el multiplicador sobre la escena, la saturación alrededor de la luma y el levantado de negros.
  - Declaración: `pub struct PhaseGrade { pub tint: Color, pub saturation: f32, pub lift: Color }`

- [`GradeTransition`](grade.rs#L154) — El crossfade entre el grado presentado y el que la escena pide tras un cambio de fase; se avanza con el tiempo de frame.
  - Declaración: `pub struct GradeTransition { current: PhaseGrade, from: PhaseGrade, to: PhaseGrade, elapsed: f32 }`

- [`GradeMaterial`](grade.rs#L242) — El material de presentación: una pasada a pantalla completa que aplica el grado y tilt-shift al componer la escena offscreen.
  - Declaración: `pub struct GradeMaterial { material: Material }`

#### Funciones y métodos

- [`grade_for`](grade.rs#L232) — El grado con el que presenta una fase horneada.
  - Firma: `pub fn grade_for(phase: BakePhase) -> PhaseGrade {`

- [`lerp_grade`](grade.rs#L139) — La mezcla canal a canal entre dos grados a `t` del crossfade, acotada a `[0, 1]`.
  - Firma: `pub fn lerp_grade(from: PhaseGrade, to: PhaseGrade, t: f32) -> PhaseGrade {`

- [`GradeTransition::new`](grade.rs#L163) — Una transición asentada que presenta `grade`.
  - Firma: `pub fn new(grade: PhaseGrade) -> Self {`

- [`GradeTransition::set_target`](grade.rs#L173) — Apunta la transición a `grade`; re-seleccionar el grado deseado no reinicia nada, y un cambio a mitad parte de lo que se ve.
  - Firma: `pub fn set_target(&mut self, grade: PhaseGrade) {`

- [`GradeTransition::advance`](grade.rs#L183) — Avanza el crossfade `dt` segundos y devuelve el grado a presentar.
  - Firma: `pub fn advance(&mut self, dt: f32) -> PhaseGrade {`

- [`GradeMaterial::load`](grade.rs#L248) — Carga el material; falla igual que el de la escena cuando el contexto no tiene OpenGL.
  - Firma: `pub fn load() -> Result<Self, String> {`

- [`GradeMaterial::bind`](grade.rs#L280) — Aplica los uniforms de grado y tilt-shift, incluida la escala de un texel del target, y dibuja lo que sigue con este material.
  - Firma: `pub fn bind(&self, grade: &PhaseGrade, texel_size: Vec2) {`

- [`GradeMaterial::release`](grade.rs#L299) — Devuelve el dibujado al pipeline propio de Macroquad, para la interfaz.
  - Firma: `pub fn release(&self) {`

#### Constantes

- [`DAWN_GRADE`](grade.rs#L204) — Amanecer: el sol cálido y bajo; tiñe hacia dorado.
  - Declaración: `pub const DAWN_GRADE: PhaseGrade = PhaseGrade {`

- [`DAY_GRADE`](grade.rs#L211) — Día: la escena sin tocar (identidad).
  - Declaración: `pub const DAY_GRADE: PhaseGrade = PhaseGrade {`

- [`SUNSET_GRADE`](grade.rs#L218) — Atardecer: la hora ámbar, más saturada que el amanecer.
  - Declaración: `pub const SUNSET_GRADE: PhaseGrade = PhaseGrade {`

- [`NIGHT_GRADE`](grade.rs#L225) — Noche: la escena fría, desaturada y con los negros levantados.
  - Declaración: `pub const NIGHT_GRADE: PhaseGrade = PhaseGrade {`

El material escribe alfa opaco y se pinta con reemplazo (sin blend), de modo que la pasada de grado nunca deja el framebuffer semitransparente ni se amalgama con el contenido anterior. En esa misma pasada aplica un tilt-shift: conserva una franja horizontal nítida y aumenta suavemente un desenfoque de nueve muestras hacia arriba y abajo. El tamaño real del render target se entrega como uniform para que el radio sea estable en píxeles al redimensionar. El cambio de fase no corta el mundo de golpe: el bucle presenta el grado a través de `GradeTransition`, que interpola tinte, saturación y negros con suavizado (smoothstep) durante `PHASE_TRANSITION_SECONDS` (`game::config`), partiendo de lo que hay en pantalla si se cambia a mitad.

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

- [`SceneTarget::present`](render_target.rs#L69) — Vuelve al framebuffer, invierte verticalmente la textura offscreen y compone la escena ya terminada, aplicando el grade y tilt-shift con el material de presentación cuando está disponible.
  - Firma: `pub fn present(&self, material: Option<&GradeMaterial>, grade: &PhaseGrade) {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `grade.rs`

#### Constantes internas

- [`VERTEX`](grade.rs#L11) — Define el parámetro interno «VERTEX» empleado por este módulo.
  - Declaración: `const VERTEX: &str = r#"#version 100 attribute vec3 position;`

- [`FRAGMENT`](grade.rs#L25) — El fragmento de presentación: desenfoca progresivamente fuera de la franja tilt-shift, escala por `Tint`, desplaza saturación alrededor de la luma Rec. 601 y añade `Lift`.
  - Declaración: `const FRAGMENT: &str = r#"#version 100 #ifdef GL_FRAGMENT_PRECISION_HIGH`

- [`grade_pipeline`](grade.rs#L89) — La tubería del grado: reemplazo opaco (sin blend) para que la pasada nunca amalgame con el contenido anterior del framebuffer.
  - Firma: `fn grade_pipeline() -> PipelineParams {`

### `scene_material.rs`

#### Constantes internas

- [`SHADOW_MAP`](scene_material.rs#L13) — El nombre que el shader da al atlas de sombras. `Texture` y `_ScreenTexture` son de Macroquad
  - Declaración: `const SHADOW_MAP: &str = "ShadowMap";`

- [`VERTEX`](scene_material.rs#L15) — Define el parámetro interno «VERTEX» empleado por este módulo.
  - Declaración: `const VERTEX: &str = r#"#version 100 attribute vec3 position;`

- [`FRAGMENT`](scene_material.rs#L35) — Define el parámetro interno «FRAGMENT» empleado por este módulo.
  - Declaración: `const FRAGMENT: &str = r#"#version 100 #ifdef GL_FRAGMENT_PRECISION_HIGH precision highp float;`
