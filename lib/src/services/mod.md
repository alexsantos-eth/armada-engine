# Services

Este dominio de cliente implementa con Macroquad los puertos de entrada, audio, interfaz y carga de chunks declarados por `iso::services`. Concentra el contacto con plataforma para que la simulación pueda depender de interfaces y no de APIs concretas.

Cada adaptador debe conservar la semántica del trait que implementa y traducir los errores del backend a resultados comprensibles para el cliente. Las dependencias de Macroquad no deben escapar a los módulos de dominio.

No añade reglas de juego a los puertos. Las políticas y decisiones siguen residiendo en el crate `iso`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `macroquad_adapters.rs`

#### Funciones internas

- [`poll`](macroquad_adapters.rs#L16) — Calcula o recupera «poll» según los parámetros de la firma.
  - Firma: `fn poll(&mut self) -> NormalizedInput {`

- [`default`](macroquad_adapters.rs#L41) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`play`](macroquad_adapters.rs#L50) — Calcula o recupera «play» según los parámetros de la firma.
  - Firma: `fn play(&mut self, event: SoundEvent) {`

- [`set_volume`](macroquad_adapters.rs#L53) — Actualiza «volume» con el valor indicado.
  - Firma: `fn set_volume(&mut self, volume: f64) {`

- [`push`](macroquad_adapters.rs#L66) — Añade el valor recibido a la colección o secuencia administrada.
  - Firma: `fn push(&mut self, event: UiEvent) {`

- [`chunk`](macroquad_adapters.rs#L90) — Calcula o recupera «chunk» según los parámetros de la firma.
  - Firma: `fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]> {`

- [`discover`](macroquad_adapters.rs#L93) — Calcula o recupera «discover» según los parámetros de la firma.
  - Firma: `fn discover(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>> {`
