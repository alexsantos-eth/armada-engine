# Simulation

Este dominio implementa el acumulador de paso fijo que desacopla la simulación determinista de la frecuencia de renderizado. Define cómo convertir tiempo transcurrido en pasos de juego y en interpolación segura para la presentación.

La lógica debe protegerse de saltos de tiempo, conservar límites de acumulación explícitos y no depender de un reloj de plataforma. Quien lo use proporciona el tiempo medido y ejecuta los pasos resultantes.

No actualiza la escena ni lee el reloj real por sí mismo. Es una utilidad de coordinación para sistemas de simulación.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `stepper.rs`

#### Funciones y métodos

- [`new`](stepper.rs#L38) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(options: StepperOptions) -> Result<Self, InvalidStepperOptions> {`

- [`consume_frame`](stepper.rs#L57) — Acumula `elapsed_ms` y devuelve cuántos ticks debe ejecutar ahora el bucle.
  - Firma: `pub fn consume_frame(&mut self, elapsed_ms: f64) -> u64 {`

- [`interpolation_alpha`](stepper.rs#L74) — Fracción (`0..1`) del avance dentro del tick actual, para interpolar en el render.
  - Firma: `pub fn interpolation_alpha(&self) -> f64 {`

- [`set_time_scale`](stepper.rs#L78) — Fija la escala temporal (`1.0` = tiempo real); `InvalidStepperOptions` si no es finita o positiva.
  - Firma: `pub fn set_time_scale(&mut self, scale: f64) -> Result<(), InvalidStepperOptions> {`

#### Constantes

- [`STEP_MS`](stepper.rs#L5) — Define la duración de un paso fijo de simulación en milisegundos.
  - Declaración: `pub const STEP_MS: f64 = 1000.0 / TICKS_PER_SECOND as f64;`

- [`DEFAULT_MAX_FRAME_MS`](stepper.rs#L6) — Define el máximo intervalo de fotograma que el acumulador acepta antes de limitarlo.
  - Declaración: `pub const DEFAULT_MAX_FRAME_MS: f64 = 250.0;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `stepper.rs`

#### Funciones internas

- [`default`](stepper.rs#L16) — Implementación de `Default`: el stepper por defecto (`max_frame_ms` de 250, sin escala).
  - Firma: `fn default() -> Self {`

- [`default`](stepper.rs#L88) — Implementación de `Default`: el stepper por defecto (`max_frame_ms` de 250, sin escala).
  - Firma: `fn default() -> Self {`
