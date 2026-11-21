# Save

Este dominio de cliente adapta archivos nativos y almacenamiento web a los snapshots persistentes de `iso::world`. Es el límite donde el estado serializable del juego se convierte en operaciones de lectura y escritura de plataforma.

Debe validar versiones, propagar errores de I/O de forma comprensible y evitar que detalles de rutas o navegador entren al crate de dominio. Las migraciones de formato se coordinan con los tipos persistentes de `iso::world`.

No define qué partes del mundo se guardan; sólo transporta los snapshots que el dominio produce y consume.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `persistence.rs`

#### Funciones y métodos

- [`snapshot_of`](persistence.rs#L87) — La partida que se escribe para un archivo de chunks en un mundo de `seed`: sus chunks, la semilla en `systems.world` (para que un mundo nacido de `?fresh` se reabra igual) y, si se da, lo que lleva el jugador en `systems.inventory` (`iso::inventory::with_carried`).
  - Firma: `pub fn snapshot_of( archive: &ChunkArchive, seed: u64, carried: Option<&iso::inventory::Carried>, ) -> WorldSave {`
- [`boot_seed`](persistence.rs#L102) — La semilla con la que arranca el mundo: la de la escena, si no la recién tirada por `?fresh`/`--fresh`, si no la que guardó la partida, si no la por defecto.
  - Firma: `pub fn boot_seed( scene: Option<u64>, fresh: Option<u64>, saved: Option<u64>, default: u64, ) -> u64 {`
- [`take_fresh_seed`](persistence.rs#L124) — Una semilla nueva cuando esta ejecución arranca un mundo fresco: en web lee y borra la nota `saves/iso_fresh_seed` que deja `adapter.js`; en nativo, con `--fresh`, borra el archivo de partida y la tira del reloj (la mezcla `iso::world::fresh_seed`).
  - Firma: `pub fn take_fresh_seed() -> Option<u64> {`
- [`save_archive`](persistence.rs#L148) — Escribe la partida de un mundo de `seed`, con lo que lleva el jugador, en disco o, en WASM, en `localStorage`.
  - Firma: `pub fn save_archive(archive: &ChunkArchive, seed: u64, carried: &iso::inventory::Carried) {`
- [`load_save`](persistence.rs) — Intenta cargar un archivo de guardado del disco. Devuelve `None` ante cualquier error o al ejecutarse en WASM. En nativo la ruta la resuelve `crate::app::save_path()`: dentro de un `.app`, `~/Library/Application Support/<GAME_TITLE>/saves/iso_save.json`; fuera, `saves/iso_save.json` junto al CWD.
  - Firma: `pub async fn load_save() -> Option<WorldSave> {`

- [`restore_archive`](persistence.rs#L78) — Restaura un `ChunkArchive` desde un guardado ya parseado, o devuelve un archivo vacío.
  - Firma: `pub fn restore_archive(save: Option<WorldSave>) -> ChunkArchive {`


- [`sync_manager_to_archive`](persistence.rs#L174) — Sincroniza los chunks descubiertos de un `ChunkManager` a un `ChunkArchive`, reemplazando cualquier
  - Firma: `pub fn sync_manager_to_archive(manager: &ChunkManager, archive: &mut ChunkArchive) {`

- [`load_archive_into_manager`](persistence.rs#L181) — Carga en un `ChunkManager` los chunks guardados de un archivo, omitiendo la generación de terreno.
  - Firma: `pub fn load_archive_into_manager( manager: &mut ChunkManager, archive: &ChunkArchive, ) -> Vec<String> {`

- [`restore_discovered_from_archive`](persistence.rs#L190) — Reemplaza los chunks recién generados por su copia archivada, donde el archivo la tenga.
  - Firma: `pub fn restore_discovered_from_archive( manager: &mut ChunkManager, archive: &ChunkArchive, discovered: &[iso::grid::ChunkCoord], ) -> Vec<String> {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `persistence.rs`

#### Funciones internas

- [`iso_storage_get`](persistence.rs#L18) — Import FFI del navegador: lee `localStorage[key]` en un búfer y devuelve su longitud.
  - Firma: `fn iso_storage_get( key_ptr: *const u8, key_len: usize, output_ptr: *mut u8, output_capacity: usize, ) -> isize;`

- [`iso_storage_set`](persistence.rs#L24) — Import FFI del navegador: escribe `value` en `localStorage[key]`; devuelve 0 si tuvo éxito.
  - Firma: `fn iso_storage_set( key_ptr: *const u8, key_len: usize, value_ptr: *const u8, value_len: usize, ) -> i32;`

- [`local_storage_get`](persistence.rs#L34) — Lee `localStorage[key]`; `None` si falta o la build no es WASM.
  - Firma: `fn local_storage_get(key: &str) -> Option<String> {`

- [`local_storage_set`](persistence.rs#L56) — Escribe `value` en `localStorage[key]`; `false` si falló o la build no es WASM.
  - Firma: `fn local_storage_set(key: &str, value: &str) -> bool {`

#### Constantes internas

- [`STORAGE_KEY`](persistence.rs) — Clave del almacenamiento local en WASM (solo build WASM); conserva el mismo nombre relativo que el archivo de desarrollo. En nativo no se usa: la ruta la resuelve `crate::app::save_path()` (ver `src/app/bundle.rs`). En WASM, `web/adapter.js` borra esta misma clave al cargar la página cuando la URL lleva `?fresh` y deja una semilla aleatoria en `saves/iso_fresh_seed` (en `/maker` no se toca); ver `lib/README.md`.
  - Declaración: `const STORAGE_KEY: &str = "saves/iso_save.json";`

- [`OUTPUT_CAPACITY`](persistence.rs#L35) — Tope del búfer de lectura del FFI (32 MiB).
  - Declaración: `const OUTPUT_CAPACITY: usize = 32 * 1024 * 1024;`
