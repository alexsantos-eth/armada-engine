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

- [`touch_phase`](macroquad_adapters.rs#L20) — Traduce la fase de `macroquad::input::Touch` a la fase cruda que entiende `touch::TouchControls`.
  - Firma: `const fn touch_phase(phase: TouchPhase) -> RawTouchPhase {`
- [`poll`](macroquad_adapters.rs#L31) — Lee el teclado y los dedos (convertidos de `macroquad::input::Touch` a `RawTouch`), avanza los controles táctiles (`TouchControls::update`), suma el vector del teclado con el analógico recortado a longitud 1 y publica la entrada normalizada. `jump_pressed`, `jump_held`, `run` y `jetpack` combinan ambas fuentes.
  - Firma: `fn poll(&mut self) -> NormalizedInput {`
  - MacroquadInput es ahora `pub struct MacroquadInput<'a> { pub touch: &'a mut TouchControls }`: el llamante (`game::frame::update`) presta su `TouchControls` a la pasada de entrada.

- [`default`](macroquad_adapters.rs#L73) — Implementación de `Default`: el adaptador de audio en silencio.
  - Firma: `fn default() -> Self {`

- [`play`](macroquad_adapters.rs#L82) — Reproduce `event` (pendiente de la integración de audio; no hace nada).
  - Firma: `fn play(&mut self, event: SoundEvent) {`

- [`set_volume`](macroquad_adapters.rs#L85) — Fija el volumen global en `0..=100`.
  - Firma: `fn set_volume(&mut self, volume: f64) {`

- [`push`](macroquad_adapters.rs#L98) — Añade el valor recibido a la colección o secuencia administrada.
  - Firma: `fn push(&mut self, event: UiEvent) {`

- [`chunk`](macroquad_adapters.rs#L122) — Devuelve las columnas del chunk si `ChunkManager` lo tiene; no lo descubre.
  - Firma: `fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]> {`

- [`discover`](macroquad_adapters.rs#L125) — Descubre `coord` si hace falta (foco + tick) y devuelve sus columnas.
  - Firma: `fn discover(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>> {`
