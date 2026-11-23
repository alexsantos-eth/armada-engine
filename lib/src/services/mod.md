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
- [`poll`](macroquad_adapters.rs#L31) — Lee el teclado y los dedos (convertidos de `macroquad::input::Touch` a `RawTouch`), avanza los controles táctiles (`TouchControls::update`), suma el vector del teclado con el analógico recortado a longitud 1 y publica la entrada normalizada. `jump_pressed`, `jump_held` y `run` combinan ambas fuentes; `gather_held` es `E` mantenida; `jetpack_pressed` es la pulsación de `J` (una pulsación, no un mantenido: el cliente alterna con ella el equipo).
  - Firma: `fn poll(&mut self) -> NormalizedInput {`
  - MacroquadInput es ahora `pub struct MacroquadInput<'a> { pub touch: &'a mut TouchControls }`: el llamante (`game::frame::update`) presta su `TouchControls` a la pasada de entrada.

- `SOUND_FILES`, `LOOP_FILES` y `AMBIENT_FILES` — Correspondencia fija evento/bucle/fondo → WAV generado en `content/sounds/` (11 sueltos; 9 bucles: andar y correr por cada `Footing` más el jetpack; 4 fondos). Un test comprueba que cada WAV existe y tiene su `.strudel` en `music/`.
- `load_sounds` — Carga una de esas listas; un archivo que no carga avisa y queda en silencio.
- `AMBIENT_SILENCE` — Por debajo de este volumen un fondo se detiene en vez de sonar inaudible.
- `EVENTS_KEPT` — Tope del registro `events`; al llenarse se tira la mitad más vieja.
- [`sound_path`](macroquad_adapters.rs#L86) — Resuelve la ruta de un sonido: `./content/…` en WASM y `app::asset_path` en nativo (desarrollo: ruta relativa al CWD; `.app`: `Contents/Resources`).

- `ambient_level` — El volumen al que suena ahora un fondo; `0.0` si está parado. `Game::update_soundscape` lo usa como punto de partida del suavizado y el testbed lo escribe en `report.json` (`ambience`).
- `set_ambient` — Arranca en bucle, ajusta o para el fondo según el volumen pedido; cada fondo es independiente y suena a la vez que el bucle del jugador.
- [`load`](macroquad_adapters.rs#L109) — Carga los veinticuatro WAVs. Un archivo que no carga registra un aviso y ese evento queda en silencio, como antes.
  - Firma: `pub async fn load() -> Self {`
- [`default`](macroquad_adapters.rs#L154) — Implementación de `Default`: adaptador sin sonidos (eventos registrados, en silencio) para las pruebas.
  - Firma: `fn default() -> Self {`
- [`effective_volume`](macroquad_adapters.rs#L140) — Volumen del disparo escalado por el maestro, recortado a `0..=1`.
  - Firma: `fn effective_volume(&self, gain: f64) -> f32 {`
- [`stop_current_loop`](macroquad_adapters.rs#L144) — Detiene el bucle actual, si lo hay, y olvida cuál era.
  - Firma: `fn stop_current_loop(&mut self) {`

- [`play`](macroquad_adapters.rs#L166) — Registra `event` y reproduce su WAV (si está cargado) con el volumen maestro.
  - Firma: `fn play(&mut self, event: SoundEvent) {`
- [`play_with_volume`](macroquad_adapters.rs#L179) — Igual que `play`, con el WAV escalado además por `volume` (0.0..=1.0); lo usa el aterrizaje, cuya intensidad sigue al impacto.
  - Firma: `fn play_with_volume(&mut self, event: SoundEvent, volume: f64) {`
- [`play_loop`](macroquad_adapters.rs#L192) — Sustituye el bucle actual (silencio con `None`) por el de `sound`; repetir el mismo bucle es un no-op.
  - Firma: `fn play_loop(&mut self, sound: Option<SoundLoop>) {`
- [`set_volume`](macroquad_adapters.rs#L212) — Fija el volumen maestro en `0.0..=1.0` y lo aplica al bucle en reproducción y a los fondos que suenan.
  - Firma: `fn set_volume(&mut self, volume: f64) {`

- [`push`](macroquad_adapters.rs#L230) — Añade el valor recibido a la colección o secuencia administrada.
  - Firma: `fn push(&mut self, event: UiEvent) {`
