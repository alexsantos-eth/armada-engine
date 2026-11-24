# Touch

Este dominio de cliente implementa el control en pantalla para dispositivos táctiles: un único **joystick analógico flotante**. No tiene posición fija: el primer dedo que toca la pantalla coloca la base bajo el pulgar; sin dedo, descansa abajo a la derecha. La base se queda donde se colocó: arrastrar el mando más allá del borde sigue en dirección al dedo, y al soltarlo el jugador se detiene. El joystick mueve al jugador igual que el teclado, pero en analógico: el vector de caminar escala con la deflexión, y empujar hasta el tope enciende `run`, el equivalente táctil de mantener `Shift`.

El mismo dedo hace el resto, con gestos:

- **Mantener quieto** el joystick (dentro de la zona muerta) durante `HOLD_MS` recolecta: publica `gather_held` como la tecla `E`. Si el dedo vuelve a moverse deja de recolectar, y vuelve a hacerlo cuando descansa otra vez `HOLD_MS`.
- **Salto** — mientras el joystick mueve al jugador, tocar cualquier parte de la pantalla publica `jump_pressed`; otro toque mientras sigue moviéndose lo publica otra vez, que en el aire es el doble salto (el flanco `jump_pressed` actúa como el `Space` del teclado). Mientras el dedo del salto está abajo publica `jump_held`: el salto variable — al soltar el dedo se corta la subida, igual que Space en el teclado. No hay candado de carrera: deslizar el dedo más allá del borde sigue la dirección del dedo con el mando en el borde; al soltarlo el jugador se detiene.

Mientras el joystick tiene dedo, los demás dedos se ignoran salvo los que saltan: un toque nuevo mientras el jugador se mueve salta. El botón de inventario (el rectángulo `backpack_hit` de `ui`) es un rectángulo de bloqueo de saltos: un toque en él ni salta ni coloca el joystick; el juego lo interpreta solo como el switch del inventario. No hay botón SALTAR ni botón de acción táctil: el HUD (`ui`) no dibuja el botón de acción con controles táctiles.

El módulo decide dónde descansa el joystick y su tamaño (`layout`), cómo se traduce la deflexión a mundo (`stick`) y qué hace el dedo (`controls`). `platform` aporta la pista de plataforma: la build web pregunta al navegador con el import FFI `iso_pointer_coarse` (`(pointer: coarse)` o `maxTouchPoints > 0`), mismo patrón que `iso_route_path` e `iso_storage_*` de `web/adapter.js`; fuera de WASM siempre aporta `false`. En cualquier plataforma, el primer toque revela los controles el resto del proceso. En escritorio con ratón nunca aparecen.

El joystick se pinta **siempre encima del overlay**, con independencia de la ruta: es entrada de juego, no decoración del overlay. Con el kit de UI exportado lo dibuja `ui::draw_clay_stick` (base y mando de arcilla, mando rojo en carrera y la herramienta de lo que está al alcance sobre el mando, que se balancea mientras se recolecta); sin el kit, `TouchControls::draw` pinta círculos simples. El stick descansa invisible: se dibuja solo mientras el jugador lo usa.

El `MacroquadInput` (dominio `services`) mezcla el teclado con `TouchFrame`; cuando ambos están activos se suma el vector y se recorta a longitud 1.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`TouchControls`](controls.rs#L78) — Los controles: visibilidad, el dedo del joystick y el bloqueo de saltos del inventario.
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};`
- [`StickView`](controls.rs#L58) — Dónde se dibuja el joystick este fotograma y qué hace.
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};`
- [`RawTouch`](controls.rs#L37) — Un dedo tal y como lo ve la máquina de estados, en píxeles de pantalla.
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};`
- [`RawTouchPhase`](controls.rs#L27) — La fase del ciclo de vida de un dedo (`Started`, `Stationary`, `Moved`, `Ended`, `Cancelled`).
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};`
- [`coarse_pointer`](platform.rs#L14) — Pista de plataforma: `true` si el puntero principal es táctil (FFI en WASM; `false` nativo).
  - Firma: `pub(crate) use platform::coarse_pointer;`

### `layout.rs`

- [`TouchLayout`](layout.rs#L9) — Dónde descansa el joystick (abajo a la derecha) y los radios de la base y el mando.
  - Firma: `pub(crate) struct TouchLayout { pub(crate) rest: (f32, f32), pub(crate) radius: f32, pub(crate) knob_radius: f32 }`
- [`TouchLayout::new`](layout.rs#L17) — La disposición para un viewport `width` × `height`: radios escalados con la altura (0.75–1.4).
  - Firma: `pub(crate) fn new(width: f32, height: f32) -> Self {`

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

#### Constantes

- [`HOLD_MS`](controls.rs#L23) — Cuánto debe descansar el joystick en su zona muerta para recolectar (300 ms).

#### Tipos y funciones

- [`RawTouchPhase`](controls.rs#L27) — La fase del ciclo de vida de un dedo.
  - Firma: `pub(crate) enum RawTouchPhase { Started, Stationary, Moved, Ended, Cancelled }`
- [`RawTouch`](controls.rs#L37) — Un dedo en píxeles de pantalla.
  - Firma: `pub(crate) struct RawTouch { pub(crate) id: u64, pub(crate) phase: RawTouchPhase, pub(crate) x: f32, pub(crate) y: f32 }`
- [`TouchFrame`](controls.rs#L46) — Lo que los controles piden este frame: `walk` analógico, `magnitude`, `run`, `jump_pressed` (flanco), `jump_held` (el salto variable: el dedo del salto sigue abajo) y `gather_held`.
- [`StickView`](controls.rs#L58) — Centro de la base, posición del mando, radios, si hay dedo, si corre, si recolecta.
- [`TouchControls::new`](controls.rs#L97) — Crea los controles; `coarse_pointer` los deja visibles desde el arranque en móviles.
  - Firma: `pub(crate) fn new(coarse_pointer: bool) -> Self {`
- [`TouchControls::visible`](controls.rs#L110) — Si los controles se pintan: pista de plataforma o primer toque recibido.
  - Firma: `pub(crate) fn visible(&self) -> bool {`
- [`TouchControls::set_jump_block`](controls.rs#L116) — El rectángulo del botón de inventario: un toque en él ni salta ni coloca el joystick.
  - Firma: `pub(crate) fn set_jump_block(&mut self, rect: Option<Rect>) {`
- [`TouchControls::update`](controls.rs#L129) — Avanza la máquina de estados con los dedos del frame en el instante `now_ms`: el primer `Started` sin joystick lo coloca bajo el dedo; el dedo arrastra la base; quieto `HOLD_MS` recolecta; al soltar el stick el jugador se detiene; mientras el stick mueve al jugador, un `Started` nuevo (fuera del rectángulo de inventario) publica `jump_pressed` (el doble salto con el segundo) y, mientras ese dedo siga abajo, `jump_held` (salto variable). Devuelve el `TouchFrame`.
  - Firma: `pub(crate) fn update( &mut self, width: f32, height: f32, touches: &[RawTouch], now_ms: f64, ) -> TouchFrame {`
- [`TouchControls::view`](controls.rs#L215) — Dónde se dibuja el joystick: bajo el dedo si hay uno, descansando en la esquina si no.
  - Firma: `pub(crate) fn view(&self, width: f32, height: f32) -> StickView {`
- [`TouchControls::draw`](controls.rs#L245) — Pinta el joystick simple (círculos; el mando naranja en carrera) para cuando falta el kit de UI; no se pinta mientras el stick descansa idle. No-op si no es visible.
  - Firma: `pub(crate) fn draw(&self) {`

## Detalles de implementación

La conversión desde `macroquad::input::Touch` y el reloj (`get_time`) viven en `services::macroquad_adapters::poll`. Los tests cubren la colocación bajo el dedo, la base fija, los saltos por toque nuevo mientras el joystick mueve al jugador (simple y doble), el toque en el inventario bloqueado, la cancelación y un segundo dedo. La pasada de dibujo y la lectura real de `touches()` dependen de macroquad/GPU y se verifican en la build web con un móvil emulado.
