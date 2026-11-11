# Perf

Este dominio de cliente recoge una ventana de métricas de fotogramas y genera informes de rendimiento. Proporciona una capa pequeña y aislada para observar el coste de ejecución sin contaminar la lógica de simulación.

Las métricas deben ser de lectura y no influir en las reglas de juego. Los nombres, unidades y ventanas de muestreo deben mantenerse estables para que las comparaciones sean útiles.

No aplica optimizaciones automáticamente ni decide presupuestos del dominio. Sólo observa y comunica datos de rendimiento.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `frame_log.rs`

#### Funciones y métodos

- [`cpu_ms`](frame_log.rs#L43) — Lo que este bucle gastó en la CPU (simulación incluye `stream_ms` y `bake_ms`). El resto de `frame_ms` fue a la GPU o a espera
  - Firma: `pub fn cpu_ms(&self) -> f64 {`

- [`new`](frame_log.rs#L70) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(capacity: usize) -> Self {`

- [`push`](frame_log.rs#L77) — Añade el valor recibido a la colección o secuencia administrada.
  - Firma: `pub fn push(&mut self, sample: FrameSample) {`

- [`len`](frame_log.rs#L84) — Devuelve cuántos elementos contiene actualmente la colección o el estado consultado.
  - Firma: `pub fn len(&self) -> usize {`

- [`is_empty`](frame_log.rs#L88) — Indica si la colección o el estado consultado no contiene elementos.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`fps`](frame_log.rs#L94) — Los fotogramas de la ventana sobre su propia duración: la tasa que la ventana implica, en vez del recíproco de un solo frame. Un tirón apenas la mueve; es lo que muestra el HUD.
  - Firma: `pub fn fps(&self) -> f64 {`

- [`span_seconds`](frame_log.rs#L104) — Segundos que cubre la ventana, tomados de los propios fotogramas en lugar de un reloj, de modo que la
  - Firma: `pub fn span_seconds(&self) -> f64 {`

- [`worst`](frame_log.rs#L109) — El fotograma que más tardó, que es del que está hecho un tirón.
  - Firma: `pub fn worst(&self) -> FrameSample {`

- [`dropped`](frame_log.rs#L118) — Fotogramas que se perdieron dos refrescos de pantalla, quien los haya hecho esperar: cuenta también la espera del navegador.
  - Firma: `pub fn dropped(&self) -> usize {`
- [`cpu_dropped`](frame_log.rs#L127) — Fotogramas que el bucle perdió por sí mismo: frame largo y CPU del propio bucle por encima de un refresco entero.
  - Firma: `pub fn cpu_dropped(&self) -> usize {`

- [`frame_ms`](frame_log.rs#L141) — `(p50, p95, max)` de fotogramas completos, en milisegundos.
  - Firma: `pub fn frame_ms(&self) -> (f64, f64, f64) {`

- [`cpu_ms`](frame_log.rs#L43) — `(p50, p95, max)` del tiempo de CPU propio de este bucle, en milisegundos.
  - Firma: `pub fn cpu_ms(&self) -> (f64, f64, f64) {`

- [`summary`](frame_log.rs#L168) — El informe completo, como líneas para imprimir. Incluye el desglose `stream` (generación del chunk: terreno, entidades, carreteras, archive y descarga) y `bake` (horneado de sombras y subida al atlas), medios y en el peor frame.
  - Firma: `pub fn summary(&self) -> String {`

#### Constantes

- [`WINDOW_FRAMES`](frame_log.rs#L6) — Fotogramas guardados en la ventana: cinco segundos a 60 fps.
  - Declaración: `pub const WINDOW_FRAMES: usize = 300;`

- [`DROPPED_FRAME_MS`](frame_log.rs#L9) — Dos refrescos de una pantalla de 60 Hz. Un fotograma por encima de esto perdió uno, que es lo que se lee como un
  - Declaración: `pub const DROPPED_FRAME_MS: f64 = 33.4;`
- [`CPU_DROPPED_MS`](frame_log.rs#L13) — Un refresco de 60 Hz gastado entero en el CPU del propio bucle. Superado, el fotograma es culpa del bucle aunque esté en espera.
  - Declaración: `pub const CPU_DROPPED_MS: f64 = 16.7;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `frame_log.rs`

#### Funciones internas

- [`default`](frame_log.rs#L55) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`percentile`](frame_log.rs#L61) — Valor en `fraction` del recorrido de `values` una vez ordenado, rango más cercano. `values` está
  - Firma: `fn percentile(sorted: &[f64], fraction: f64) -> f64 {`

- [`sorted`](frame_log.rs#L134) — Calcula o recupera «sorted» según los parámetros de la firma.
  - Firma: `fn sorted(&self, of: impl Fn(&FrameSample) -> f64) -> Vec<f64> {`

- [`mean`](frame_log.rs#L160) — Calcula o recupera «mean» según los parámetros de la firma.
  - Firma: `fn mean(&self, of: impl Fn(&FrameSample) -> f64) -> f64 {`
