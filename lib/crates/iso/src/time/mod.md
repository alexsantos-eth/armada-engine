# Time

Este dominio define el reloj lógico del juego y sus conversiones temporales. Ofrece una representación estable del paso del tiempo sin depender de relojes del sistema ni de la frecuencia de actualización.

Las unidades y límites de conversión deben ser explícitos para evitar mezclar tiempo real, ticks y fases de simulación. Las reglas temporales compartidas se centralizan aquí.

No obtiene la hora actual ni programa eventos de plataforma. Los clientes alimentan el reloj lógico con el tiempo que observan.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `clock.rs`

#### Funciones y métodos

- [`new`](clock.rs#L22) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(tick: u64) -> Self {`

- [`advance`](clock.rs#L27) — Avanza atómicamente; el desbordamiento deja el reloj sin cambios.
  - Firma: `pub fn advance(&mut self, ticks: u64) -> Result<u64, ClockOverflow> {`

- [`time_of_day`](clock.rs#L44) — Fracción de un día para un desplazamiento con signo; los desplazamientos negativos envuelven al día anterior.
  - Firma: `pub fn time_of_day(tick: i64) -> f64 {`

- [`clock_time`](clock.rs#L48) — Hora del día (`ClockTime`) correspondiente a `tick`.
  - Firma: `pub fn clock_time(tick: u64) -> ClockTime {`

- [`format_clock_time`](clock.rs#L58) — Formatea `time` como `HH:MM` (24 h).
  - Firma: `pub fn format_clock_time(time: ClockTime) -> String {`

#### Constantes

- [`TICKS_PER_SECOND`](clock.rs#L3) — Define la frecuencia base del reloj lógico en ticks por segundo.
  - Declaración: `pub const TICKS_PER_SECOND: u64 = 20;`

- [`TICKS_PER_DAY`](clock.rs#L4) — Define cuántos ticks lógicos forman un día de juego.
  - Declaración: `pub const TICKS_PER_DAY: u64 = 20 * 60 * TICKS_PER_SECOND;`

- [`TICKS_PER_HOUR`](clock.rs#L5) — Define cuántos ticks lógicos forman una hora de juego.
  - Declaración: `pub const TICKS_PER_HOUR: u64 = TICKS_PER_DAY / 24;`

- [`WORLD_START_TICK`](clock.rs#L6) — Define el tick lógico desde el que comienza un mundo nuevo.
  - Declaración: `pub const WORLD_START_TICK: u64 = 8 * TICKS_PER_HOUR;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `clock.rs`

#### Funciones internas

- [`default`](clock.rs#L14) — Implementación de `Default`: el reloj arranca en `WORLD_START_TICK`.
  - Firma: `fn default() -> Self {`
