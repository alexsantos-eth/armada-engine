# Touch

Este dominio de cliente implementa los controles en pantalla para dispositivos táctiles: un **joystick analógico** abajo a la izquierda y un **botón SALTAR** abajo a la derecha. El joystick mueve al jugador igual que el teclado, pero en analógico: el vector de caminar escala con la deflexión, y empujar hasta el tope enciende `run`, el equivalente táctil de mantener `Shift`. El botón SALTAR publica `jump_pressed`/`jump_held` como la barra espaciadora.

El módulo decide dónde van los controles y si el puntero cae dentro (`layout`), cómo se traduce la deflexión del joystick a mundo (`stick`) y qué dedos son del joystick y cuáles del botón (`controls`). `platform` aporta la pista de plataforma: la build web pregunta al navegador con el import FFI `iso_pointer_coarse` (`(pointer: coarse)` o `maxTouchPoints > 0`), mismo patrón que `iso_route_path` e `iso_storage_*` de `web/adapter.js`; fuera de WASM siempre aporta `false`. En cualquier plataforma, el primer toque revela los controles el resto del proceso. En escritorio con ratón nunca aparecen.

Los controles táctiles se pintan **siempre encima del overlay**, con independencia de la ruta: son entrada de juego, no decoración del overlay. `/` en web seguiría siendo injugable en un móvil sin ellos.

El `MacroquadInput` (dominio `services`) mezcla el teclado con `TouchFrame`; cuando ambos están activos se suma el vector y se recorta a longitud 1.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`TouchControls`](mod.rs#L17) — Los controles: visibilidad, el dedo que es del joystick y los dedos que son del botón.
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, TouchControls};`
- [`RawTouch`](mod.rs#L17) — Un dedo tal y como lo ve la máquina de estados, en píxeles de pantalla.
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, TouchControls};`
- [`RawTouchPhase`](mod.rs#L17) — La fase del ciclo de vida de un dedo (`Started`, `Stationary`, `Moved`, `Ended`, `Cancelled`).
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, TouchControls};`
- [`coarse_pointer`](mod.rs#L18) — Pista de plataforma: `true` si el puntero principal es táctil (FFI en WASM; `false` nativo).
  - Firma: `pub(crate) use platform::coarse_pointer;`

### `layout.rs`

#### Constantes

- [`GRAB_FACTOR`](layout.rs#L9) — El área de agarre del joystick es `GRAB_FACTOR` veces su radio (los pulgares no caen en el centro).
  - Declaración: `pub(crate) const GRAB_FACTOR: f32 = 1.5;`

#### Tipos y funciones

- [`TouchLayout`](layout.rs#L13) — La geometría de pantalla de los dos controles: centros y radios.
  - Firma: `pub(crate) struct TouchLayout { pub(crate) joystick_center: (f32, f32), pub(crate) joystick_radius: f32, pub(crate) joystick_grab_radius: f32, pub(crate) knob_radius: f32, pub(crate) jump_center: (f32, f32), pub(crate) jump_radius: f32 }`
- [`TouchLayout::new`](layout.rs#L24) — La disposición para un viewport `width` × `height`: ambos controles en las esquinas inferiores, radios escalados con la altura (0.75–1.4).
  - Firma: `pub(crate) fn new(width: f32, height: f32) -> Self {`
- [`TouchLayout::grab_hit`](layout.rs#L39) — ¿Está el punto dentro del área de agarre del joystick?
  - Firma: `pub(crate) fn grab_hit(&self, x: f32, y: f32) -> bool {`
- [`TouchLayout::jump_hit`](layout.rs#L44) — ¿Está el punto dentro del botón SALTAR?
  - Firma: `pub(crate) fn jump_hit(&self, x: f32, y: f32) -> bool {`

### `stick.rs`

#### Constantes

- [`DEADZONE`](stick.rs#L12) — Deflexión por debajo de la cual el joystick lee como parado.
  - Declaración: `pub(crate) const DEADZONE: f64 = 0.18;`
- [`RUN_THRESHOLD`](stick.rs#L14) — Deflexión a partir de la cual `run` se enciende, el equivalente a `Shift`.
  - Declaración: `pub(crate) const RUN_THRESHOLD: f64 = 0.8;`

#### Tipos y funciones

- [`StickReading`](stick.rs#L18) — El resultado de una muestra del joystick: vector de caminar (longitud ≤ 1), magnitud analógica (0–1) y el flag `run`.
  - Firma: `pub(crate) struct StickReading { pub(crate) walk: GridPoint, pub(crate) magnitude: f64, pub(crate) run: bool }`
- [`stick_reading`](stick.rs#L26) — Traduce un desplazamiento en píxeles de pantalla respecto al centro a mundo: aplica la misma transformación que el teclado (`x = across + up`, `y = up - across`), normaliza y multiplica por la deflexión recortada a `radius`; `dy` crece hacia abajo, así que se invierte para `up`.
  - Firma: `pub(crate) fn stick_reading(dx: f64, dy: f64, radius: f64) -> StickReading {`
- [`clamp_offset`](stick.rs#L56) — La posición del mando dibujada, recortada a `radius` para que no salga de la base.
  - Firma: `pub(crate) fn clamp_offset(dx: f64, dy: f64, radius: f64) -> (f64, f64) {`

### `controls.rs`

#### Tipos y funciones

- [`RawTouchPhase`](controls.rs#L18) — La fase del ciclo de vida de un dedo.
  - Firma: `pub(crate) enum RawTouchPhase { Started, Stationary, Moved, Ended, Cancelled }`
- [`RawTouch`](controls.rs#L28) — Un dedo en píxeles de pantalla.
  - Firma: `pub(crate) struct RawTouch { pub(crate) id: u64, pub(crate) phase: RawTouchPhase, pub(crate) x: f32, pub(crate) y: f32 }`
- [`TouchFrame`](controls.rs#L37) — Lo que los controles piden este frame: `walk` analógico, `magnitude`, `run`, `jump_pressed` (flanco de subida) y `jump_held`.
  - Firma: `pub(crate) struct TouchFrame { pub(crate) walk: GridPoint, pub(crate) magnitude: f64, pub(crate) run: bool, pub(crate) jump_pressed: bool, pub(crate) jump_held: bool }`
- [`TouchControls::new`](controls.rs#L65) — Crea los controles; `coarse_pointer` los deja visibles desde el arranque en móviles.
  - Firma: `pub(crate) fn new(coarse_pointer: bool) -> Self {`
- [`TouchControls::visible`](controls.rs#L77) — Si los controles se pintan: pista de plataforma o primer toque recibido.
  - Firma: `pub(crate) fn visible(&self) -> bool {`
- [`TouchControls::update`](controls.rs#L82) — Avanza la máquina de estados con los dedos del frame. Cada `Started` se asigna al control cuya zona lo contiene (el botón gana al joystick); la propiedad se conserva hasta `Ended`/`Cancelled`; devuelve el `TouchFrame`.
  - Firma: `pub(crate) fn update(&mut self, width: f32, height: f32, touches: &[RawTouch]) -> TouchFrame {`
- [`TouchControls::draw`](controls.rs#L142) — Pinta los controles sobre el overlay: base y mando del joystick (el mando se tiñe de naranja en carrera) y el botón SALTAR. Sin decisiones; no-op si no son visibles.
  - Firma: `pub(crate) fn draw(&self) {`

## Detalles de implementación

### `controls.rs`

#### Funciones internas

- [`knob_offset`](controls.rs#L181) — La posición del mando dibujada: desplazamiento crudo recortado a `radius`.
  - Firma: `fn knob_offset(touch: &RawTouch, layout: &TouchLayout) -> (f32, f32) {`

La conversión desde `macroquad::input::Touch` (y su filtro de `Started`/`Ended`) vive en `services::macroquad_adapters::poll`. Los tests cubren la asignación de dedos, el flanco de salto, la cancelación y la coexistencia joystick + botón. La pasada de dibujo y la lectura real de `touches()` dependen de macroquad/GPU y se verifican manualmente con `scripts/run-native.sh` o en la build web.
