# Clay (HUD nativo del kit de UI)

El kit de UI de arcilla y cómic (`web/ui/`, ver [`docs/UI-KIT.md`](../../docs/UI-KIT.md)) dibujado con Macroquad. `scripts/export-ui.cjs` pinta cada pieza del kit con el CSS real a PNG en `content/ui/` y escribe `content/ui/ui.json` (tamaño, margen alrededor de la forma, borde de nine-slice y colores de los tokens). Este dominio carga esas piezas y la fuente Fredoka, las estira con nine-slice, las coloca (`layout.rs`) y las anima con las curvas del CSS. Pinta el `UiFrame`/`UiGain` que arma `harvest::hud_frame`.

Es el único HUD del juego: se usa igual en nativo, en web y en las corridas guionizadas (por eso las capturas de los PR muestran el HUD tal como se juega). Si falta `content/ui/` o la fuente, `ClaySkin::load` devuelve `None` y el cliente pinta la hotbar simple de `harvest::hotbar`.

Todo es puro y se prueba (`skin`, `slice`, `layout`, `motion`, `hud`) salvo `draw.rs`, que solo llama a Macroquad y se comprueba con `scenes/pr-harvest.json` (excepción de GPU de `FILE_STRUCTURE.md`). Las rotaciones y escalas se aplican con una cámara de matriz propia (`pose_matrix`), como un `transform` de CSS con su origen en el pivote.

## Catálogo de API pública

### `mod.rs`

- Reexporta `draw_clay_hud`, `draw_clay_stick`, `UiFrame`, `UiGain`, `UiAction`, `UiStack`, `ClayHud`, `HudLayout` y `ClaySkin`.

### `frame.rs`

- [`UiStack`](frame.rs#L6) — Una pila en un slot: id del item, nombre y cantidad.
- [`UiAction`](frame.rs#L14) — El botón de acción del HUD: la herramienta y el verbo del harvest.
- [`UiFrame`](frame.rs#L21) — Lo que muestra el HUD este fotograma: visible, controles táctiles en pantalla, slots, progreso (0–1), el punto arriba del jugador dónde satan, el material que va a soltar y nota; acción del botón de acción.
- [`UiGain`](frame.rs#L38) — Un depósito de la recogida con su slot, ítem, nombre, cantidad y punto de salida en fracciones de pantalla.

### `skin.rs`

- [`REQUIRED_PIECES`](skin.rs#L9) — Las piezas que el HUD dibuja; el manifest debe traerlas todas.
- [`MANIFEST_PATH`](skin.rs#L39) — `content/ui/ui.json`.
- [`DISPLAY_FONT`](skin.rs#L206) — `content/fonts/Fredoka-Bold.ttf`, la fuente display del kit.
- [`Piece`](skin.rs#L44) — Una pieza exportada: PNG, tamaño en píxeles de imagen, margen alrededor de la forma y borde de nine-slice.
- [`UiManifest`](skin.rs#L55) — El manifest exportado: versión, escala, carpeta de iconos, colores y piezas.
- [`Palette`](skin.rs#L65) — Los colores del kit que el HUD pinta a mano (tinta, crema, marrón, rojo, verde).
- [`UiManifest::palette`](skin.rs#L75) — La paleta, o `None` si falta un token.
  - Firma: `pub(crate) fn palette(&self) -> Option<Palette> {`
- [`hex_rgb`](skin.rs#L88) — `#rrggbb` (con o sin almohadilla) como RGB.
  - Firma: `pub(crate) fn hex_rgb(value: &str) -> Option<[u8; 3]> {`
- [`parse_manifest`](skin.rs#L98) — Lee y comprueba el manifest: versión 1, escala positiva, todas las piezas y colores.
  - Firma: `pub(crate) fn parse_manifest(text: &str) -> Result<UiManifest, String> {`
- [`ClaySkin`](skin.rs#L123) — El kit cargado: manifest, paleta, textura por pieza y por ítem, y la fuente.
- [`ClaySkin::load`](skin.rs#L134) — Carga el kit por la ruta de contenido del cliente, con un icono por cada id de ítem; `None` con un aviso si falta algo.

### `slice.rs`

- [`nine_slice`](slice.rs#L12) — Los pares (origen en la imagen, destino en pantalla) que dibujan una pieza alrededor de una forma: uno si la pieza no tiene borde, nueve si lo tiene, con las esquinas a su tamaño exportado y encogidas si la forma es más pequeña.
  - Firma: `pub(crate) fn nine_slice(piece: &Piece, scale: f32, shape: Rect) -> Vec<(Rect, Rect)> {`

### `layout.rs`

- [`HudLayout`](layout.rs#L32) — Los rectángulos del HUD para un tamaño de pantalla: lado de slot, slots, panel, ancla del aviso y botón de acción (solo en escritorio).
- [`HudLayout::new`](layout.rs#L48) — Una fila centrada abajo en escritorio (slots de 30 a 54 px) con el botón de acción en la esquina; con controles táctiles, la barra arriba (una fila fina de 34 a 44 px si cabe, si no filas de seis) y sin botón de acción.
  - Firma: `pub(crate) fn new(width: f32, height: f32, count: usize, touch: bool) -> Self {`
- [`HudLayout::action_hit`](layout.rs#L123) — Si un punto cae en el botón de acción (redondo).
  - Firma: `pub(crate) fn action_hit(&self, x: f32, y: f32) -> bool {`
- [`BOTTOM_MARGIN`](layout.rs#L9), [`TOP_MARGIN`](layout.rs#L11), [`ACTION_MARGIN`](layout.rs#L13), [`SLOT_GAP`](layout.rs#L15), [`SLOT_ASPECT`](layout.rs#L19) — Las medidas del HUD en escritorio.
- [`TOUCH_ROW_SLOT`](layout.rs#L22) — El lado mínimo y máximo de un slot en la fila única táctil; por debajo, la barra pasa a filas de seis.

### `motion.rs`

- [`bubble_pose`](motion.rs#L75) — El globo a una edad: entra pequeño con sacudida (`ac-pop`), descansa y se va subiendo y desvaneciéndose (`ac-out`).
  - Firma: `pub(crate) fn bubble_pose(age_ms: f64) -> BubblePose {`
- [`bubble_done`](motion.rs#L97) — Si el globo terminó de irse.
  - Firma: `pub(crate) fn bubble_done(age_ms: f64) -> bool {`
- [`bump_pose`](motion.rs#L102) — El rebote de un slot (`ac-bump`): escala x, escala y y giro.
  - Firma: `pub(crate) fn bump_pose(age_ms: f64) -> (f32, f32, f32) {`
- [`fly_pose`](motion.rs#L114) — Un número volando del jugador a su slot: parábola que sube 110 px sobre el extremo más alto, crece, se sacude cada vez menos y se desvanece al final (`ArmadaUI.fly`).
  - Firma: `pub(crate) fn fly_pose(age_ms: f64, from: (f32, f32), to: (f32, f32)) -> FlyPose {`
- [`chop_angle`](motion.rs#L136) — El vaivén de la herramienta del botón mientras se trabaja (`ac-chop`).
  - Firma: `pub(crate) fn chop_angle(age_ms: f64) -> f32 {`
- [`pose_matrix`](motion.rs#L144) — La matriz que escala, gira y mueve lo que se dibuja alrededor de un pivote, en píxeles de pantalla.
  - Firma: `pub(crate) fn pose_matrix( screen: (f32, f32), pivot: (f32, f32), scale: (f32, f32), turn_deg: f32, offset: (f32, f32), ) -> Mat4 {`
- [`BubblePose`](motion.rs#L24), [`FlyPose`](motion.rs#L34) — Las poses del globo y del número volador.
- [`POP_MS`](motion.rs#L8), [`BUBBLE_HOLD_MS`](motion.rs#L10), [`OUT_MS`](motion.rs#L12), [`BUMP_MS`](motion.rs#L14), [`FLY_MS`](motion.rs#L16), [`CHOP_MS`](motion.rs#L18) — Las duraciones del CSS y del JS del kit.

### `hud.rs`

- [`ClayHud`](hud.rs#L53) — El estado de las animaciones, del botón de acción y del inventario táctil.
- [`ClayHud::update_inventory`](hud.rs#L69) — Alterna el inventario con un toque nuevo sobre la mochila y devuelve el sonido de apertura o cierre.
  - Firma: `pub(crate) fn update_inventory(&mut self, layout: &HudLayout, touches: &[Touch]) -> Option<SoundEvent>`
- [`ClayHud::apply`](hud.rs#L93) — Toma el fotograma y las ganancias: cada ganancia lanza un vuelo al slot donde se depositaron las unidades; una nota nueva de inventario lleno abre el globo de aviso.
  - Firma: `pub(crate) fn apply(&mut self, frame: &UiFrame, gains: &[UiGain], size: (f32, f32)) {`
- [`ClayHud::advance`](hud.rs#L118) — Envejece todo; un vuelo que aterriza entrega su cuenta y hace rebotar el slot.
  - Firma: `pub(crate) fn advance(&mut self, elapsed_ms: f64) {`
- [`ClayHud::shown_count`](hud.rs#L147) — Lo que muestra un slot: su cuenta menos lo que aún vuela hacia él.
  - Firma: `pub(crate) fn shown_count(&self, slot: usize, count: u32) -> u32 {`
- [`ClayHud::bump_age`](hud.rs#L152) — Cuánto lleva rebotando un slot, si rebota.
  - Firma: `pub(crate) fn bump_age(&self, slot: usize) -> Option<f64> {`
- [`Flight`](hud.rs#L29) — Un vuelo en curso: item, cantidad, de dónde sale, a qué slot va (o, con los controles táctiles, a la mochila) y a cuánto tiempo.
- [`BubbleContent`](hud.rs#L16), [`Bubble`](hud.rs#L22) — Qué dice el globo de aviso.

### `frame.rs` (tienda)

- [`ShopFrame`](frame.rs#L49) — Lo que muestra la tienda abierta: nombre de la moneda, monedas, pestaña, cursor, filas y mensaje. Lo arma `Game::shop_frame`.

### `shop.rs`

Pinta la tienda con el kit y no tiene test (excepción de GPU de `FILE_STRUCTURE.md`; se comprueba con `scenes/pr-shop.json`): el panel es la pieza `hotbar`, las filas y las pestañas son `shop_row`, `shop_row_selected` y `shop_row_disabled`, los precios llevan la pieza `coin`, el cierre es `badge` y los mensajes y el globo que ofrece la tienda son `bubble`. Dónde va cada cosa lo decide `crate::shop::ShopLayout`.

- [`draw_shop`](shop.rs#L124) — Pinta el fondo oscurecido, el panel con sus pestañas, las filas visibles, la cartera y el mensaje del último trato.
- [`draw_shop_prompt`](shop.rs#L204), [`shop_prompt_rect`](shop.rs#L195) — El globo «Comerciar» cuando hay un comerciante al alcance y el rectángulo que el toque usa para abrir.
- [`draw_wallet`](shop.rs#L212) — La cartera en la esquina: moneda y cuenta.

### `draw.rs`

- [`draw_clay_stick`](draw.rs#L384) — Pinta el joystick táctil flotante con el kit: la base y el mando (rojo en carrera) y, si hay algo al alcance, su herramienta sobre el mando, que se balancea mientras el joystick quieto recolecta. Invisible mientras el stick descansa idle. No-op si no hay dedo.
  - Firma: `pub(crate) fn draw_clay_stick( skin: &ClaySkin, view: &StickView, tool: Option<&str>, clock_ms: f64, ) {`
- [`draw_clay_hud`](draw.rs#L439) — Pinta la barra de progreso con el material que va a soltar arriba del jugador, el panel y los slots, el botón de acción, el globo de aviso y los números voladores. Dibuja la mochila cerrada o abierta según el estado del inventario táctil. La pieza `progress` es el fondo oscuro de la barra y `progress_fill` se estira dentro de su contorno según el avance.
  - Firma: `pub(crate) fn draw_clay_hud(skin: &ClaySkin, hud: &ClayHud, frame: &UiFrame, layout: &HudLayout) {`
