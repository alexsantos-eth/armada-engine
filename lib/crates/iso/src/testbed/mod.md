# Testbed

Este dominio portable contiene las reglas de una **corrida guionizada**: lo que describe un
`scene.json`, lo que sus ediciones hacen al mundo, cómo se secuencian sus pasos y con qué
responde. Existe para que la IA (o cualquiera) pueda probar el juego sin tocar el teclado: se
escribe un archivo, se ejecuta un comando y salen capturas PNG y un informe.

El reparto es el de siempre: aquí viven las decisiones, probadas sin ventana; el cliente
([`src/testbed/`](../../../../src/testbed/mod.md)) lee el archivo, lleva a cabo cada fotograma y
escribe los PNG. La guía de uso en español está en [docs/TESTBED.md](../../../../docs/TESTBED.md).

Tres decisiones que no son obvias:

- **Las ediciones no tienen reglas propias.** Un `edit` del guion se traduce a un `MakerBrush` y
  se aplica con `iso::maker::apply_brush`, el mismo trazo que da la mano en `/maker`. Así lo que
  describe una escena y lo que se construye a mano caen igual, y una entidad que el editor
  rechazaría también la rechaza el guion.
- **Un paso o termina el fotograma o no lo termina.** Los que solo cambian el mundo (`phase`,
  `teleport`, `edit`) se toman sobre la marcha y la máquina sigue al siguiente dentro del mismo
  fotograma; los que mueven al jugador, dejan pasar tiempo o capturan (`walk`, `jump`, `jetpack`,
  `wait`, `shot`) lo terminan. Por eso un `shot` nunca sale contaminado por el paso que lo sigue.
- **`settle` no cuenta segundos, espera a que la luz esté al día.** El cliente responde si lo que
  hay en pantalla está generado y con sus sombras horneadas y fundidas; el guion repite fotograma
  hasta que sí. Ese es el problema que hacía inservibles las capturas de `/maker`, donde el
  horneado tarda unos segundos. El presupuesto de fotogramas (`maxFrames`) lo acota igualmente, y
  el informe dice que se agotó.

## Catálogo de API pública

### `mod.rs`

#### Reexportaciones

- [`apply_edit`](mod.rs#L12) — Las ediciones de la escena sobre el mundo.
  - Firma: `pub use apply::apply_edit;`
- [`Report`, `ReportEntity`, `ReportPlayer`, `entities_in`, `player_of`, `refusal_note`](mod.rs#L13) — Con qué responde una corrida.
  - Firma: `pub use report::{Report, ReportEntity, ReportPlayer, entities_in, player_of, refusal_note};`
- [`Scene`, `SceneEdit`, `ScenePhase`, `SceneStep`, `SceneWorld`, …](mod.rs#L14) — El esquema de `scene.json`.
  - Firma: `pub use scene::{Scene, SceneEdit, ScenePhase, SceneStep, SceneWorld, is_shot_name, parse_scene};`
- [`Script`, `ScriptFrame`](mod.rs#L17) — La máquina que decide qué hace cada fotograma.
  - Firma: `pub use script::{Script, ScriptFrame};`

### `scene.rs`

#### Tipos

- [`SceneWorld`](scene.rs#L15) — Lo que abre una corrida: `procedural` (el mundo transmitido) o `blank` (un chunk plano de hierba, como el editor).
  - Declaración: `pub enum SceneWorld { Procedural, Blank }`
- [`ScenePhase`](scene.rs#L26) — Una fase del día a la que una escena fija la luz.
  - Declaración: `pub enum ScenePhase { Dawn, Day, Sunset, Night }`
- [`SceneEdit`](scene.rs#L53) — Un cambio al mundo, en los términos de las siete herramientas del editor.
  - Declaración: `pub enum SceneEdit { Raise, Lower, Surface, Tint, Top, Place, Erase }`
- [`SceneStep`](scene.rs#L116) — Un paso de la corrida.
  - Declaración: `pub enum SceneStep { Walk, Jump, Jetpack, Wait, Settle, Teleport, Phase, Edit, Shot }`
- [`Scene`](scene.rs#L171) — Una corrida completa, tal como la describe `scene.json`.
  - Declaración: `pub struct Scene { world, seed, centre, window, zoom, phase, player, edits, steps, out, max_frames }`

#### Funciones y métodos

- [`bake`](scene.rs#L35) — La fase de horneado que nombra una fase de la escena.
  - Firma: `pub const fn bake(self) -> BakePhase {`
- [`at`](scene.rs#L92) — La celda sobre la que trabaja una edición.
  - Firma: `pub const fn at(&self) -> [i32; 2] {`
- [`times`](scene.rs#L105) — Cuántos trazos da una edición.
  - Firma: `pub const fn times(&self) -> u32 {`
- [`ends_the_frame`](scene.rs#L146) — Si el paso termina el fotograma en el que se toma.
  - Firma: `pub const fn ends_the_frame(&self) -> bool {`
- [`default_steps`](scene.rs#L208) — Los pasos de una escena sin pasos: esperar la luz y tomar una captura.
  - Firma: `pub fn default_steps() -> Vec<SceneStep> {`
- [`is_shot_name`](scene.rs#L214) — Si un nombre de captura es un nombre de archivo llano acabado en `.png`, sin carpeta propia.
  - Firma: `pub fn is_shot_name(name: &str) -> bool {`
- [`parse_scene`](scene.rs#L225) — Lee una escena y dice qué tiene mal en vez de reventar; rechaza campos desconocidos y nombres de captura que se salgan de la carpeta de salida.
  - Firma: `pub fn parse_scene(json: &str) -> Result<Scene, String> {`

#### Constantes

- [`DEFAULT_MAX_FRAMES`](scene.rs#L161) — Presupuesto de fotogramas por defecto: 600, treinta segundos al paso fijo.
  - Declaración: `pub const DEFAULT_MAX_FRAMES: u32 = 600;`

### `script.rs`

#### Tipos

- [`ScriptFrame`](script.rs#L13) — Lo que hace un fotograma guionizado: la entrada del jugador, la fase, el teletransporte, las ediciones, las capturas y si la corrida terminó.
  - Declaración: `pub struct ScriptFrame { input, phase, teleport, edits, shots, done, note }`
- [`Script`](script.rs#L44) — Los pasos de una corrida y por dónde va.
  - Declaración: `pub struct Script { steps, at, left, frames, max_frames }`

#### Funciones y métodos

- [`new`](script.rs#L55) — Una corrida de `steps` que se rinde a los `max_frames`.
  - Firma: `pub fn new(steps: Vec<SceneStep>, max_frames: u32) -> Self {`
- [`frames`](script.rs#L66) — Cuántos fotogramas lleva la corrida.
  - Firma: `pub const fn frames(&self) -> u32 {`
- [`step`](script.rs#L71) — En qué paso va, contando desde cero.
  - Firma: `pub const fn step(&self) -> usize {`
- [`steps`](script.rs#L76) — Cuántos pasos tiene la corrida.
  - Firma: `pub const fn steps(&self) -> usize {`
- [`frame`](script.rs#L82) — El fotograma que toca ahora; `lit` dice si lo que hay en pantalla ya está generado y con la luz horneada.
  - Firma: `pub fn frame(&mut self, lit: bool) -> ScriptFrame {`

### `apply.rs`

#### Funciones y métodos

- [`blueprint_index`](apply.rs#L14) — Dónde está un blueprint en el catálogo, por el nombre con el que lo llama la escena, girado un cuarto de vuelta si lo pide.
  - Firma: `pub fn blueprint_index(catalog: &EntityCatalog, id: &str, turned: bool) -> Result<usize, String> {`
- [`brush_for`](apply.rs#L30) — El pincel que da una edición.
  - Firma: `pub fn brush_for(catalog: &EntityCatalog, edit: &SceneEdit) -> Result<MakerBrush, String> {`
- [`apply_edit`](apply.rs#L77) — Aplica una edición tantas veces como pida y responde con el trazo más revelador; `Nothing` es que la celda la rechazó o ya estaba así, y un `Err` es que la escena está mal escrita.
  - Firma: `pub fn apply_edit(manager: &mut ChunkManager, dressing: &mut Dressing, edit: &SceneEdit) -> Result<MakerStroke, String> {`

### `report.rs`

#### Tipos

- [`ReportPlayer`](report.rs#L15) — Dónde acabó el jugador, y en qué celda.
  - Declaración: `pub struct ReportPlayer { x, y, elevation, cell }`
- [`ReportEntity`](report.rs#L25) — Una entidad en pie al acabar la corrida.
  - Declaración: `pub struct ReportEntity { blueprint, cell, elevation }`
- [`Report`](report.rs#L36) — Todo aquello con lo que responde una corrida.
  - Declaración: `pub struct Report { frames, steps_taken, steps, shots, phase, player, entities, notes }`

#### Funciones y métodos

- [`refusal_note`](report.rs#L57) — Lo que dice el informe de una edición que no cambió nada, con el estado de la celda (superficie, elevación y qué hay en pie) para poder corregir la escena sin abrir el juego.
  - Firma: `pub fn refusal_note(at: [i32; 2], column: Option<TerrainColumn>, standing: Option<&str>) -> String {`
- [`player_of`](report.rs#L74) — La línea del jugador del informe.
  - Firma: `pub fn player_of(x: f64, y: f64, elevation: f64) -> ReportPlayer {`
- [`entities_in`](report.rs#L84) — Lo que hay en pie en unos chunks, ordenado por celda para que dos corridas de la misma escena respondan igual.
  - Firma: `pub fn entities_in(manager: &ChunkManager, chunks: &[ChunkCoord]) -> Vec<ReportEntity> {`
