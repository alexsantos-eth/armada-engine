# Save

Este dominio de cliente adapta archivos nativos y almacenamiento web a los snapshots persistentes de `iso::world`. Es el límite donde el estado serializable del juego se convierte en operaciones de lectura y escritura de plataforma.

Debe validar versiones, propagar errores de I/O de forma comprensible y evitar que detalles de rutas o navegador entren al crate de dominio. Las migraciones de formato se coordinan con los tipos persistentes de `iso::world`.

No define qué partes del mundo se guardan; sólo transporta los snapshots que el dominio produce y consume.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `persistence.rs`

#### Funciones y métodos

- [`load_save`](persistence.rs#L54) — Intenta cargar un archivo de guardado del disco. Devuelve `None` ante cualquier error o al ejecutarse en WASM.
  - Firma: `pub async fn load_save() -> Option<WorldSave> {`

- [`restore_archive`](persistence.rs#L70) — Restaura un `ChunkArchive` desde un guardado ya parseado, o devuelve un archivo vacío.
  - Firma: `pub fn restore_archive(save: Option<WorldSave>) -> ChunkArchive {`

- [`save_archive`](persistence.rs#L78) — Persiste el archivo en disco o en el almacenamiento del navegador en WASM.
  - Firma: `pub fn save_archive(archive: &ChunkArchive) {`

- [`sync_manager_to_archive`](persistence.rs#L98) — Sincroniza los chunks descubiertos de un `ChunkManager` a un `ChunkArchive`, reemplazando cualquier
  - Firma: `pub fn sync_manager_to_archive(manager: &ChunkManager, archive: &mut ChunkArchive) {`

- [`load_archive_into_manager`](persistence.rs#L105) — Carga en un `ChunkManager` los chunks guardados de un archivo, omitiendo la generación de terreno.
  - Firma: `pub fn load_archive_into_manager( manager: &mut ChunkManager, archive: &ChunkArchive, ) -> Vec<String> {`

- [`restore_discovered_from_archive`](persistence.rs#L114) — Reemplaza los chunks recién generados por su copia archivada, donde el archivo la tenga.
  - Firma: `pub fn restore_discovered_from_archive( manager: &mut ChunkManager, archive: &ChunkArchive, discovered: &[iso::grid::ChunkCoord], ) -> Vec<String> {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `persistence.rs`

#### Funciones internas

- [`armada_storage_get`](persistence.rs#L11) — Calcula o recupera «armada storage get» según los parámetros de la firma.
  - Firma: `fn armada_storage_get( key_ptr: *const u8, key_len: usize, output_ptr: *mut u8, output_capacity: usize, ) -> isize;`

- [`armada_storage_set`](persistence.rs#L17) — Calcula o recupera «armada storage set» según los parámetros de la firma.
  - Firma: `fn armada_storage_set( key_ptr: *const u8, key_len: usize, value_ptr: *const u8, value_len: usize, ) -> i32;`

- [`local_storage_get`](persistence.rs#L27) — Calcula o recupera «local storage get» según los parámetros de la firma.
  - Firma: `fn local_storage_get(key: &str) -> Option<String> {`

- [`local_storage_set`](persistence.rs#L49) — Calcula o recupera «local storage set» según los parámetros de la firma.
  - Firma: `fn local_storage_set(key: &str, value: &str) -> bool {`

#### Constantes internas

- [`SAVE_PATH`](persistence.rs#L6) — Define el parámetro interno «SAVE PATH» empleado por este módulo.
  - Declaración: `const SAVE_PATH: &str = "saves/armada_save.json";`

- [`OUTPUT_CAPACITY`](persistence.rs#L28) — Define el parámetro interno «OUTPUT CAPACITY» empleado por este módulo.
  - Declaración: `const OUTPUT_CAPACITY: usize = 32 * 1024 * 1024;`
