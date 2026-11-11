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

- [`play`](audio.rs#L16) — Reproduce un sonido de una sola vez.
  - Firma: `fn play(&mut self, event: SoundEvent);`

- [`set_volume`](audio.rs#L18) — Establece el volumen maestro (0.0..=1.0).
  - Firma: `fn set_volume(&mut self, volume: f64);`

### `chunk_loader.rs`

#### Funciones internas

- [`chunk`](chunk_loader.rs#L9) — Devuelve las columnas de un chunk descubierto, o `None` cuando aún no se ha descubierto.
  - Firma: `fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]>;`

- [`discover`](chunk_loader.rs#L11) — Descubre un chunk si hace falta y devuelve sus columnas.
  - Firma: `fn discover(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>>;`

### `input.rs`

#### Funciones internas

- [`poll`](input.rs#L18) — Sondea el estado actual de la entrada. Se llama una vez por fotograma.
  - Firma: `fn poll(&mut self) -> NormalizedInput;`

### `ui.rs`

#### Funciones internas

- [`push`](ui.rs#L23) — Envía un evento a la capa de UI.
  - Firma: `fn push(&mut self, event: UiEvent);`
