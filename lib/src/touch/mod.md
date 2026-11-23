# Touch

Este dominio de cliente implementa el control en pantalla para dispositivos táctiles: un único **joystick analógico flotante**. No tiene posición fija: el primer dedo que toca la pantalla coloca la base bajo el pulgar; sin dedo, descansa abajo a la derecha como pista de dónde aparecerá. La base se queda donde se colocó: el mando se detiene en el borde y, si el dedo sigue más allá, aparece el candado de carrera. El joystick mueve al jugador igual que el teclado, pero en analógico: el vector de caminar escala con la deflexión, y empujar hasta el tope enciende `run`, el equivalente táctil de mantener `Shift`.

El mismo dedo hace el resto, con gestos:

- **Mantener quieto** el joystick (dentro de la zona muerta) durante `HOLD_MS` recolecta: publica `gather_held` como la tecla `E`. Si el dedo vuelve a moverse deja de recolectar, y vuelve a hacerlo cuando descansa otra vez `HOLD_MS`.
- **Salto** — mientras el joystick mueve al jugador, tocar cualquier parte de la pantalla publica `jump_pressed`; otro toque mientras sigue moviéndose lo publica otra vez, que en el aire es el doble salto (el flanco `jump_pressed` actúa como el `Space` del teclado). No hay cadena de toques: el doble salto son los dos toques, nada más.
- **Carrera fija** (como en Minecraft o los FPS móviles): pasado el borde aparece el candado en la dirección del dedo, a `LOCK_REACH` radios del centro. Si el dedo llega a él, la carrera se bloquea: el jugador corre en esa dirección aunque se levante el dedo, y el candado se enciende. Bloqueado, un toque nuevo en la pantalla salta; deslizar un dedo más allá del borde cambia la dirección, y deslizarlo de vuelta al centro desbloquea y devuelve ese dedo al joystick.
- **Toque con inercia**, para jugar con una sola mano: al soltar el joystick mientras camina, el jugador sigue `COAST_MS` en la misma dirección. Un toque dentro de esa ventana coloca el joystick en la misma dirección y mantiene el rumbo mientras el dedo siga abajo sin moverse (moverlo vuelve a dirigir); al soltarlo vuelve a tener inercia. Solo es táctil: el teclado no cambia.

Mientras el joystick tiene dedo, los demás dedos se ignoran salvo los que saltan: un toque nuevo mientras el jugador se mueve salta. El botón de inventario (el rectángulo `backpack_hit` de `gui::clay`) es un rectángulo de bloqueo de saltos: un toque en él ni salta ni coloca el joystick — el juego lo interpreta solo como el toggle del inventario. No hay botón SALTAR ni botón de acción táctil: el HUD (`gui::clay`) quita el botón de acción cuando los controles están visibles.

El módulo decide dónde descansa el joystick y su tamaño (`layout`), cómo se traduce la deflexión a mundo (`stick`) y qué hace el dedo (`controls`). `platform` aporta la pista de plataforma: la build web pregunta al navegador con el import FFI `iso_pointer_coarse` (`(pointer: coarse)` o `maxTouchPoints > 0`), mismo patrón que `iso_route_path` e `iso_storage_*` de `web/adapter.js`; fuera de WASM siempre aporta `false`. En cualquier plataforma, el primer toque revela los controles el resto del proceso. En escritorio con ratón nunca aparecen.

El joystick se pinta **siempre encima del overlay**, con independencia de la ruta: es entrada de juego, no decoración del overlay. Con el kit de UI exportado lo dibuja `gui::clay::draw_clay_stick` (base y mando de arcilla, mando rojo en carrera y la herramienta de lo que está al alcance sobre el mando, que se balancea mientras se recolecta); sin el kit, `TouchControls::draw` pinta círculos simples.

El `MacroquadInput` (dominio `services`) mezcla el teclado con `TouchFrame`; cuando ambos están activos se suma el vector y se recorta a longitud 1.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`TouchControls`](controls.rs#L116) — Los controles: visibilidad, el dedo del joystick y el bloqueo de saltos del inventario.
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};`
- [`StickView`](controls.rs#L62) — Dónde se dibuja el joystick este fotograma y qué hace.
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};`
- [`RawTouch`](controls.rs#L42) — Un dedo tal y como lo ve la máquina de estados, en píxeles de pantalla.
  - Firma: `pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};`
- [`RawTouchPhase`](controls.rs#L34) — La fase del ciclo de vida de un dedo (`Started`, `Stationary`, `Moved`, `Ended`, `Cancelled`).
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
- [`LOCK_REACH`](controls.rs#L28) — A cuántos radios del centro hay que deslizar el dedo para bloquear la carrera (1,6).
- [`COAST_MS`](controls.rs#L26) — Cuánto sigue caminando el jugador al soltar un joystick que caminaba (300 ms).

#### Tipos y funciones

- [`RawTouchPhase`](controls.rs#L34) — La fase del ciclo de vida de un dedo.
  - Firma: `pub(crate) enum RawTouchPhase { Started, Stationary, Moved, Ended, Cancelled }`
- [`RawTouch`](controls.rs#L42) — Un dedo en píxeles de pantalla.
  - Firma: `pub(crate) struct RawTouch { pub(crate) id: u64, pub(crate) phase: RawTouchPhase, pub(crate) x: f32, pub(crate) y: f32 }`
- [`TouchFrame`](controls.rs#L53) — Lo que los controles piden este frame: `walk` analógico, `magnitude`, `run`, `jump_pressed` (flanco), `jump_held` y `gather_held`.
- [`StickView`](controls.rs#L62) — Centro de la base, posición del mando, radios, si hay dedo, si corre, si recolecta, dónde va el candado (`lock_at`) y si la carrera está bloqueada.
- [`TouchControls::new`](controls.rs#L135) — Crea los controles; `coarse_pointer` los deja visibles desde el arranque en móviles.
  - Firma: `pub(crate) fn new(coarse_pointer: bool) -> Self {`
- [`TouchControls::visible`](controls.rs#L149) — Si los controles se pintan: pista de plataforma o primer toque recibido.
  - Firma: `pub(crate) fn visible(&self) -> bool {`
- [`TouchControls::update`](controls.rs#L166) — Avanza la máquina de estados con los dedos del frame en el instante `now_ms`: el primer `Started` sin joystick lo coloca bajo el dedo; el dedo arrastra la base más allá del borde; quieto `HOLD_MS` recolecta; al soltar deja la inercia; mientras el joystick mueve al jugador, un `Started` nuevo (fuera del rectángulo de inventario) publica `jump_pressed` (el doble salto con el segundo). Devuelve el `TouchFrame`.
  - Firma: `pub(crate) fn update( &mut self, width: f32, height: f32, touches: &[RawTouch], now_ms: f64, ) -> TouchFrame {`
- [`TouchControls::set_jump_block`](controls.rs#L155) — El rectángulo del botón de inventario: un toque en él ni salta ni coloca el joystick.
  - Firma: `pub(crate) fn set_jump_block(&mut self, rect: Option<Rect>) {`
- [`TouchControls::view`](controls.rs#L300) — Dónde se dibuja el joystick: bajo el dedo si hay uno, con el mando en el borde si la carrera está bloqueada, descansando en la esquina si no; el candado aparece pasado el borde y se queda mientras dura el bloqueo.
  - Firma: `pub(crate) fn view(&self, width: f32, height: f32) -> StickView {`
- [`TouchControls::draw`](controls.rs#L434) — Pinta el joystick simple (círculos; el mando naranja en carrera) para cuando falta el kit de UI. No-op si no es visible.
  - Firma: `pub(crate) fn draw(&self) {`

## Detalles de implementación

### `controls.rs`

#### Funciones internas

- [`update_locked`](controls.rs#L352) — La carrera bloqueada: corre en la dirección del candado; un `Started` nuevo en la pantalla salta (el doble salto), deslizar pasado el borde cambia la dirección y volver al centro (desde fuera) desbloquea.
  - Firma: `fn update_locked( &mut self, layout: &TouchLayout, touches: &[RawTouch], now_ms: f64, ) -> TouchFrame {`

La conversión desde `macroquad::input::Touch` y el reloj (`get_time`) viven en `services::macroquad_adapters::poll`. Los tests cubren la colocación bajo el dedo, la base fija, el bloqueo de carrera (bloquear, saltar, dirigir y desbloquear), recolectar al mantener quieto, los saltos por toque nuevo mientras el joystick mueve al jugador (simple y doble), el toque en el inventario bloqueado, la inercia, la cancelación y un segundo dedo. La pasada de dibujo y la lectura real de `touches()` dependen de macroquad/GPU y se verifican en la build web con un móvil emulado.
