# Services

Este dominio declara los puertos para entrada, audio, interfaz y carga de chunks que el cliente debe implementar. Establece límites explícitos entre reglas de juego y efectos del exterior mediante traits y tipos de intercambio.

Las interfaces deben ser pequeñas, orientadas a capacidades y no filtrar tipos del backend. Las implementaciones concretas viven en los clientes o en adaptadores de infraestructura.

No contiene lógica visual ni acceso directo a plataforma. Los cambios en un puerto deben acompañarse de pruebas de contrato en sus consumidores.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `audio.rs`

#### Funciones internas

- [`play`](audio.rs#L16) — Plays a one-shot sound.
  - Firma: `fn play(&mut self, event: SoundEvent);`

- [`set_volume`](audio.rs#L18) — Sets the master volume (0.0..=1.0).
  - Firma: `fn set_volume(&mut self, volume: f64);`

### `chunk_loader.rs`

#### Funciones internas

- [`chunk`](chunk_loader.rs#L9) — Returns the columns of a discovered chunk, or `None` when not yet discovered.
  - Firma: `fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]>;`

- [`discover`](chunk_loader.rs#L11) — Discovers a chunk if needed and returns its columns.
  - Firma: `fn discover(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>>;`

### `input.rs`

#### Funciones internas

- [`poll`](input.rs#L18) — Polls the current input state. Called once per frame.
  - Firma: `fn poll(&mut self) -> NormalizedInput;`

### `ui.rs`

#### Funciones internas

- [`push`](ui.rs#L17) — Pushes an event to the UI layer.
  - Firma: `fn push(&mut self, event: UiEvent);`
