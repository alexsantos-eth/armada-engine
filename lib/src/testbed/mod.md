# Testbed (cliente)

Este dominio de cliente corre el juego **desde un archivo de escena** en vez de desde una
persona al teclado: lee `scene.json`, construye el mundo que describe, conduce al jugador por el
mismo puerto de entrada que usa el teclado, escribe en PNG los fotogramas que le piden y
responde con un `report.json`. Las reglas viven en
[`iso::testbed`](../../crates/iso/src/testbed/mod.md); aquí está el archivo, la ventana y el
disco. La guía de uso está en [docs/TESTBED.md](../../docs/TESTBED.md).

Se arranca con `--scene <archivo>` en la build nativa (`scripts/run-scene.sh escena/scene.json`),
que es también lo que elige la ruta `Route::Script`: sin overlay, sin guardado y con el jetpack
disponible. La build web no tiene argumentos, así que nunca corre una escena.

Cuatro decisiones que no son obvias:

- **El jugador se conduce por el puerto, no por el teclado.** `ScriptInput` implementa
  `iso::services::InputService` igual que `MacroquadInput`, así que la física, la animación y el
  audio no notan la diferencia. Ese es el motivo de que esto funcione donde inyectar eventos en
  el canvas de macroquad no funciona.
- **El reloj del fotograma es fijo mientras hay guion** (`SCRIPTED_FRAME_MS`, un paso de la
  simulación), no lo que midió la ventana. Dos corridas de la misma escena avanzan la simulación,
  el oleaje, el polvo y las nubes exactamente igual, por rápido que dibujara la máquina.
- **La captura se toma después de componer la escena**, justo tras `scene_target.present`, de
  modo que lleva el grado de color de la fase y no lleva overlay.
- **El informe lista lo que se ve**, no todo lo cargado: los chunks que dibujó el último
  fotograma (`Game::shown`). Si una edición no entró, el informe dice qué había en esa celda.

## Catálogo de API pública

### `mod.rs`

#### Reexportaciones

- [`advance`, `begin`, `write_shots`](mod.rs#L13) — Abrir la corrida, llevar un fotograma a cabo y escribir sus capturas.
  - Firma: `pub(crate) use drive::{advance, begin, write_shots};`
- [`ScriptInput`](input.rs#L10) — La entrada de un fotograma guionizado.
  - Firma: `pub(crate) use input::ScriptInput;`
- [`ScriptRun`](run.rs#L22) — La corrida en vuelo.
  - Firma: `pub(crate) use run::ScriptRun;`
- [`load_scene`, `out_dir`, `scene_path`](mod.rs#L16) — De dónde sale la escena y a dónde va lo que produce.
  - Firma: `pub(crate) use scene_file::{load_scene, out_dir, scene_path};`

### `scene_file.rs`

#### Funciones y métodos

- [`scene_argument`](scene_file.rs#L18) — La escena que nombran unos argumentos: el valor tras `--scene`, o la cola de `--scene=…`.
  - Firma: `pub(crate) fn scene_argument<'a>(arguments: impl Iterator<Item = &'a String>) -> Option<String> {`
- [`scene_path`](scene_file.rs#L35) — La escena que le pidieron a este proceso; en web, siempre `None`.
  - Firma: `pub(crate) fn scene_path() -> Option<PathBuf> {`
- [`out_dir`](scene_file.rs#L48) — Dónde va la salida: `out` tal cual si es absoluta, y junto al archivo de escena si no.
  - Firma: `pub(crate) fn out_dir(scene: &Path, out: &str) -> PathBuf {`
- [`shot_path`](scene_file.rs#L60) — Dónde se escribe una captura, para un nombre que la escena ya validó.
  - Firma: `pub(crate) fn shot_path(out: &Path, name: &str) -> Option<PathBuf> {`
- [`load_scene`](scene_file.rs#L68) — Lee la escena y dice qué tiene mal en vez de reventar.
  - Firma: `pub(crate) fn load_scene(path: &Path) -> Result<Scene, String> {`

#### Constantes

- [`SCENE_FLAG`](scene_file.rs#L13) — El argumento que corre una escena (`--scene`).
  - Declaración: `pub(crate) const SCENE_FLAG: &str = "--scene";`
- [`REPORT_FILE`](scene_file.rs#L65) — Cómo se llama el informe de una corrida (`report.json`).
  - Declaración: `pub(crate) const REPORT_FILE: &str = "report.json";`

### `input.rs`

#### Tipos

- [`ScriptInput`](input.rs#L10) — La entrada de un fotograma guionizado, entregada por el mismo puerto que el teclado.
  - Declaración: `pub(crate) struct ScriptInput { pub frame: NormalizedInput }`

### `run.rs`

#### Tipos

- [`ScriptRun`](run.rs#L22) — Una corrida en vuelo: los pasos que quedan, a dónde va su salida y lo que tiene que contar.
  - Declaración: `pub(crate) struct ScriptRun { script, out, written, notes }`

#### Funciones y métodos

- [`new`](run.rs#L31) — Una corrida de los pasos de una escena escribiendo en `out`.
  - Firma: `pub(crate) fn new(scene: &Scene, out: PathBuf) -> Self {`
- [`out`](run.rs#L41) — Dónde se escriben las capturas y el informe de esta corrida.
  - Firma: `pub(crate) fn out(&self) -> &Path {`
- [`frame`](run.rs#L46) — El fotograma que toca ahora, anotando lo que el guion tenga que decir de él.
  - Firma: `pub(crate) fn frame(&mut self, lit: bool) -> ScriptFrame {`
- [`note`](run.rs#L55) — Anota algo que merece aparecer en el informe.
  - Firma: `pub(crate) fn note(&mut self, text: String) {`
- [`wrote`](run.rs#L60) — Anota una captura que llegó al disco.
  - Firma: `pub(crate) fn wrote(&mut self, name: &str) {`
- [`report`](run.rs#L65) — El informe de la corrida tal como está, para el estado que el cliente lee del mundo.
  - Firma: `pub(crate) fn report(&self, player: Option<ReportPlayer>, entities: Vec<ReportEntity>, phase: BakePhase) -> Report {`
- [`phase_name`](run.rs#L12) — El nombre con el que una escena llama a una fase del día.
  - Firma: `pub(crate) const fn phase_name(phase: BakePhase) -> &'static str {`
- [`summary`](run.rs#L94) — La línea que imprime una corrida terminada, para que la terminal diga qué pasó sin abrir el informe.
  - Firma: `pub(crate) fn summary(report: &Report) -> String {`
- [`shots_asked`](run.rs#L106) — Las capturas que pide una escena, para anunciarlas antes de correr.
  - Firma: `pub(crate) fn shots_asked(scene: &Scene) -> Vec<String> {`

### `drive.rs`

Pegamento con la ventana, el mundo y el disco: sin decisiones propias, se comprueba con una
corrida real (`scripts/run-scene.sh`), por la excepción de FILE_STRUCTURE para código atado a GPU
y E/S.

#### Funciones y métodos

- [`begin`](drive.rs#L28) — Abre la corrida que describe la escena: fija su luz, construye lo que pide y pone al jugador donde lo quiere.
  - Firma: `pub(crate) fn begin(game: &mut Game, scene: &Scene, out: PathBuf) {`
- [`advance`](drive.rs#L50) — Lleva a cabo el fotograma que pide el guion y devuelve la entrada del jugador; `None` termina el proceso con el informe escrito.
  - Firma: `pub(crate) fn advance(game: &mut Game) -> Option<(NormalizedInput, Vec<String>)> {`
- [`write_shots`](drive.rs#L128) — Escribe las capturas que pidió este fotograma, ya con él en pantalla.
  - Firma: `pub(crate) fn write_shots(game: &mut Game, names: &[String]) {`
