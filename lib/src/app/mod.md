# App

Este dominio de cliente aloja el pegamento de arranque: la ventana (`bootstrap.rs`), la composición que cede el control al bucle, y el layout del bundle de macOS (`bundle.rs`). No contiene comportamiento de juego ni reglas del dominio portable — el mundo vive en `game`, el dibujado en sus vistas, y la simulación en `iso`.

Existe para concentrar lo que solo cambia con la plataforma o con la ventana: el título y el tamaño de la ventana salen de una única constante (`game::config::GAME_TITLE`), y las rutas que un `.app` reubica (assets en `Contents/Resources`, guardado en el directorio de soporte per-user) se resuelven aquí para que el resto del cliente no sepa que corre dentro de un bundle. Fuera del bundle — desarrollo con `cargo run`, builds WASM— el comportamiento es exactamente el de siempre.

El dominio no sabe nada de Macroquad más allá de `Conf`; no posee estado, no guarda, no dibuja y no decide ticks.

## Catálogo de API pública

Este catálogo documenta las funciones y reexportaciones del dominio, con su firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`run`](mod.rs#L11) — Arranque completo del cliente: crea el juego y cede el control al bucle de frames.
  - Declaración: `pub(crate) use bootstrap::{run, window_conf};`
- [`window_conf`](mod.rs#L11) — Configuración de la ventana del juego.
  - Declaración: `pub(crate) use bootstrap::{run, window_conf};`
- [`asset_path`](mod.rs#L13) — Dónde se pide un asset al disco (solo builds nativas).
  - Declaración: `pub(crate) use bundle::{asset_path, save_path};`
- [`save_path`](mod.rs#L13) — Dónde vive el archivo de guardado (solo builds nativas).
  - Declaración: `pub(crate) use bundle::{asset_path, save_path};`

### `bootstrap.rs`

#### Funciones y métodos

- [`window_conf`](bootstrap.rs#L14) — La ventana del juego: título [`GAME_TITLE`](../game/config.rs) y 960×600 por defecto. El icono se difiere al bundle (`None`) para que un `.app` en macOS pinte su `game.icns` y no el logo por defecto de Miniquad. Única fuente del título: cambiar el nombre del juego es editar esa constante.
  - Firma: `pub(crate) fn window_conf() -> Conf {`
- [`run`](bootstrap.rs#L24) — Arranca el juego (arte, mundo, guardado) y ejecuta el bucle de frames hasta que el jugador sale.
  - Firma: `pub(crate) async fn run() {`

### `bundle.rs`

Solo se compila en builds no-WASM.

#### Funciones y métodos

- [`asset_path`](bundle.rs#L48) — Dónde se pide un asset al disco: tal cual si existe junto al CWD (desarrollo); `Contents/Resources/<ruta>` del bundle cuando corre dentro de un `.app`; tal cual en otro caso (modo de fallo idéntico al desarrollo).
  - Firma: `pub(crate) fn asset_path(path: &str) -> String {`
- [`save_path`](bundle.rs#L76) — Dónde vive el guardado: dentro de un `.app`, `~/Library/Application Support/<GAME_TITLE>/saves/iso_save.json`; fuera, `saves/iso_save.json` junto al CWD.
  - Firma: `pub(crate) fn save_path() -> PathBuf {`

## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `bootstrap.rs`

No hay helpers internos; el comportamiento se comprueba en [`bootstrap.test.rs`](bootstrap.test.rs) (título de la ventana desde `GAME_TITLE`, tamaño por defecto 960×600).

### `bundle.rs`

#### Funciones internas

- [`resources_of`](bundle.rs#L17) — El `Contents/Resources` de `exe`, cuando `exe` parece el binario de un bundle de macOS (par `Contents`/`MacOS`) y ese directorio existe; sirve a los tests con un cierre `is_dir` inyectado.
  - Firma: `fn resources_of(exe: &Path, is_dir: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {`
- [`bundle_resources`](bundle.rs#L31) — El `Contents/Resources` del proceso actual, o `None` fuera de un bundle.
  - Firma: `fn bundle_resources() -> Option<PathBuf> {`
- [`decide_asset`](bundle.rs#L38) — La elección pura entre ruta junto al CWD, ruta del bundle o ruta tal cual; la existencia previa en disco la decide `asset_path`.
  - Firma: `fn decide_asset(path: &str, cwd_hit: bool, bundle_hit: Option<PathBuf>) -> String {`
- [`decide_save`](bundle.rs#L57) — La elección pura entre el directorio de soporte per-user (dentro de un bundle, con home conocido) y la ruta de desarrollo.
  - Firma: `fn decide_save(home: Option<PathBuf>, inside_bundle: bool, title: &str) -> PathBuf {`
- [`home_dir`](bundle.rs#L68) — El home del usuario desde `HOME`, o `None` si falta o está vacío.
  - Firma: `fn home_dir() -> Option<PathBuf> {`

#### Constantes internas

- [`SAVE_FILE`](bundle.rs#L13) — El nombre relativo del archivo de guardado dentro del directorio elegido.
  - Declaración: `const SAVE_FILE: &str = "saves/iso_save.json";`

Lo que toca el sistema de archivos (existencia previa, `current_exe`, `HOME`) vive en las envolturas `asset_path`/`save_path`/`bundle_resources`; la decisión es pura y está cubierta por [`bundle.test.rs`](bundle.test.rs) (9 pruebas: CWD que gana, asset servido desde el bundle, fallback a la ruta relativa, guardado en Application Support, fallbacks sin bundle y sin home, y el layout del bundle bien o mal formado).
