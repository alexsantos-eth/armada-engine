# Perf

Este dominio de cliente recoge una ventana de métricas de fotogramas y genera informes de rendimiento. Proporciona una capa pequeña y aislada para observar el coste de ejecución sin contaminar la lógica de simulación.

Las métricas deben ser de lectura y no influir en las reglas de juego. Los nombres, unidades y ventanas de muestreo deben mantenerse estables para que las comparaciones sean útiles.

No aplica optimizaciones automáticamente ni decide presupuestos del dominio. Sólo observa y comunica datos de rendimiento.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `frame_log.rs`

#### Funciones y métodos

- [`cpu_ms`](frame_log.rs#L32) — What this loop spent on the CPU. The rest of `frame_ms` went to the GPU or to waiting
  - Firma: `pub fn cpu_ms(&self) -> f64 {`

- [`new`](frame_log.rs#L59) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(capacity: usize) -> Self {`

- [`push`](frame_log.rs#L66) — Añade el valor recibido a la colección o secuencia administrada.
  - Firma: `pub fn push(&mut self, sample: FrameSample) {`

- [`len`](frame_log.rs#L73) — Devuelve cuántos elementos contiene actualmente la colección o el estado consultado.
  - Firma: `pub fn len(&self) -> usize {`

- [`is_empty`](frame_log.rs#L77) — Indica si la colección o el estado consultado no contiene elementos.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`span_seconds`](frame_log.rs#L82) — Seconds the window covers, taken from the frames themselves rather than a clock, so the
  - Firma: `pub fn span_seconds(&self) -> f64 {`

- [`worst`](frame_log.rs#L87) — The frame that took longest, which is the one a stutter is made of.
  - Firma: `pub fn worst(&self) -> FrameSample {`

- [`dropped`](frame_log.rs#L96) — Frames that missed two display refreshes.
  - Firma: `pub fn dropped(&self) -> usize {`

- [`frame_ms`](frame_log.rs#L110) — `(p50, p95, max)` of whole frames, in milliseconds.
  - Firma: `pub fn frame_ms(&self) -> (f64, f64, f64) {`

- [`cpu_ms`](frame_log.rs#L120) — `(p50, p95, max)` of this loop's own CPU time, in milliseconds.
  - Firma: `pub fn cpu_ms(&self) -> (f64, f64, f64) {`

- [`summary`](frame_log.rs#L137) — The whole report, as lines to print.
  - Firma: `pub fn summary(&self) -> String {`

#### Constantes

- [`WINDOW_FRAMES`](frame_log.rs#L6) — Frames kept in the window: five seconds at 60 fps.
  - Declaración: `pub const WINDOW_FRAMES: usize = 300;`

- [`DROPPED_FRAME_MS`](frame_log.rs#L9) — Two refreshes of a 60 Hz display. A frame over this dropped one, which is what reads as a
  - Declaración: `pub const DROPPED_FRAME_MS: f64 = 33.4;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `frame_log.rs`

#### Funciones internas

- [`default`](frame_log.rs#L44) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`percentile`](frame_log.rs#L50) — Value at `fraction` of the way through `values` once sorted, nearest rank. `values` is
  - Firma: `fn percentile(sorted: &[f64], fraction: f64) -> f64 {`

- [`sorted`](frame_log.rs#L103) — Calcula o recupera «sorted» según los parámetros de la firma.
  - Firma: `fn sorted(&self, of: impl Fn(&FrameSample) -> f64) -> Vec<f64> {`

- [`mean`](frame_log.rs#L129) — Calcula o recupera «mean» según los parámetros de la firma.
  - Firma: `fn mean(&self, of: impl Fn(&FrameSample) -> f64) -> f64 {`
