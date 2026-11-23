# Clay (HUD nativo del kit de UI)

El kit de UI de arcilla y cómic (`web/ui/`, ver [`docs/UI-KIT.md`](../../../docs/UI-KIT.md)) dibujado con Macroquad. `scripts/export-ui.cjs` pinta cada pieza del kit con el CSS real a PNG en `content/ui/` y escribe `content/ui/ui.json` (tamaño, margen alrededor de la forma, borde de nine-slice y colores de los tokens). Este dominio carga esas piezas y la fuente Fredoka, las estira con nine-slice, las coloca (`layout.rs`) y las anima con las curvas del CSS. Pinta el `UiFrame`/`UiGain` que arma `harvest::hud_frame`.

Es el único HUD del juego: se usa igual en nativo, en web y en las corridas guionizadas (por eso las capturas de los PR muestran el HUD tal como se juega). Si falta `content/ui/` o la fuente, `ClaySkin::load` devuelve `None` y el cliente pinta la hotbar simple de `harvest::hotbar`.

Todo es puro y se prueba (`skin`, `slice`, `layout`, `motion`, `hud`) salvo `draw.rs`, que solo llama a Macroquad y se comprueba con `scenes/pr-harvest.json` (excepción de GPU de `FILE_STRUCTURE.md`). Las rotaciones y escalas se aplican con una cámara de matriz propia (`pose_matrix`), como un `transform` de CSS con su origen en el pivote.

## Catálogo de API pública

### `mod.rs`

- Reexporta `draw_clay_hud`, `draw_clay_stick`, `UiFrame`, `UiGain`, `UiPrompt`, `UiStack`, `ClayHud`, `HudLayout` y `ClaySkin`.

### `frame.rs`

- [`UiStack`](frame.rs#L6) — Una pila en un slot: id del item, nombre y cantidad.
- [`UiPrompt`](frame.rs#L15) — El aviso: texto, verbo y herramienta del botón de acción, progreso (0–1) mientras se trabaja y si una herramienta que falta lo bloquea.
- [`UiFrame`](frame.rs#L25) — Lo que muestra el HUD este fotograma: visible, controles táctiles en pantalla, slots, aviso y nota.
- [`UiGain`](frame.rs#L35) — Una recogida: item, nombre, cantidad y de dónde sale volando, como fracción de la pantalla.

### `skin.rs`

- [`REQUIRED_PIECES`](skin.rs#L9) — Las piezas que el HUD dibuja; el manifest debe traerlas todas.
- [`MANIFEST_PATH`](skin.rs#L36) — `content/ui/ui.json`.
- [`DISPLAY_FONT`](skin.rs#L192) — `content/fonts/Fredoka-Bold.ttf`, la fuente display del kit.
- [`Piece`](skin.rs#L41) — Una pieza exportada: PNG, tamaño en píxeles de imagen, margen alrededor de la forma y borde de nine-slice.
- [`UiManifest`](skin.rs#L52) — El manifest exportado: versión, escala, carpeta de iconos, colores y piezas.
- [`Palette`](skin.rs#L62) — Los colores del kit que el HUD pinta a mano (tinta, crema, marrón, rojo, verde).
- [`UiManifest::palette`](skin.rs#L72) — La paleta, o `None` si falta un token.
  - Firma: `pub(crate) fn palette(&self) -> Option<Palette> {`
- [`hex_rgb`](skin.rs#L85) — `#rrggbb` (con o sin almohadilla) como RGB.
  - Firma: `pub(crate) fn hex_rgb(value: &str) -> Option<[u8; 3]> {`
- [`parse_manifest`](skin.rs#L95) — Lee y comprueba el manifest: versión 1, escala positiva, todas las piezas y colores.
  - Firma: `pub(crate) fn parse_manifest(text: &str) -> Result<UiManifest, String> {`
- [`ClaySkin`](skin.rs#L120) — El kit cargado: manifest, paleta, textura por pieza y por ítem, y la fuente.
- [`ClaySkin::load`](skin.rs#L131) — Carga el kit por la ruta de contenido del cliente, con un icono por cada id de ítem; `None` con un aviso si falta algo.

### `slice.rs`

- [`nine_slice`](slice.rs#L12) — Los pares (origen en la imagen, destino en pantalla) que dibujan una pieza alrededor de una forma: uno si la pieza no tiene borde, nueve si lo tiene, con las esquinas a su tamaño exportado y encogidas si la forma es más pequeña.
  - Firma: `pub(crate) fn nine_slice(piece: &Piece, scale: f32, shape: Rect) -> Vec<(Rect, Rect)> {`

### `layout.rs`

- [`HudLayout`](layout.rs#L30) — Los rectángulos del HUD para un tamaño de pantalla: lado de slot, slots, panel, ancla del aviso y botón de acción (solo en escritorio).
- [`HudLayout::new`](layout.rs#L45) — Una fila centrada abajo en escritorio (slots de 30 a 54 px) con el botón de acción en la esquina; con controles táctiles, la barra arriba (una fila fina de 34 a 44 px si cabe, si no filas de seis) y sin botón de acción.
  - Firma: `pub(crate) fn new(width: f32, height: f32, count: usize, touch: bool) -> Self {`
- [`HudLayout::action_hit`](layout.rs#L113) — Si un punto cae en el botón de acción (redondo).
  - Firma: `pub(crate) fn action_hit(&self, x: f32, y: f32) -> bool {`
- [`BOTTOM_MARGIN`](layout.rs#L9), [`TOP_MARGIN`](layout.rs#L11), [`ACTION_MARGIN`](layout.rs#L13), [`SLOT_GAP`](layout.rs#L15), [`SLOT_ASPECT`](layout.rs#L21) — Las medidas del HUD en escritorio.
- [`TOUCH_ROW_SLOT`](layout.rs#L24) — El lado mínimo y máximo de un slot en la fila única táctil; por debajo, la barra pasa a filas de seis.

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

- [`ClayHud`](hud.rs#L46) — El estado de las animaciones: globo, vuelos, rebotes por slot, cuentas en el aire, reloj y si el botón está pulsado.
- [`ClayHud::apply`](hud.rs#L62) — Toma el fotograma y las ganancias: cada ganancia abre el globo sobre el jugador y lanza un vuelo al slot que tiene el ítem (o al primero vacío); una nota nueva de inventario lleno abre un globo de aviso.
  - Firma: `pub(crate) fn apply(&mut self, frame: &UiFrame, gains: &[UiGain], size: (f32, f32)) {`
- [`ClayHud::advance`](hud.rs#L105) — Envejece todo; un vuelo que aterriza entrega su cuenta y hace rebotar el slot.
  - Firma: `pub(crate) fn advance(&mut self, elapsed_ms: f64) {`
- [`ClayHud::shown_count`](hud.rs#L138) — Lo que muestra un slot: su cuenta menos lo que aún vuela hacia él.
  - Firma: `pub(crate) fn shown_count(&self, item: &str, count: u32) -> u32 {`
- [`ClayHud::bump_age`](hud.rs#L143) — Cuánto lleva rebotando un slot, si rebota.
  - Firma: `pub(crate) fn bump_age(&self, slot: usize) -> Option<f64> {`
- [`BubbleContent`](hud.rs#L15), [`Bubble`](hud.rs#L27), [`Flight`](hud.rs#L36) — Qué dice el globo, el globo en pantalla y un vuelo en curso.
- [`BUBBLE_LIFT`](hud.rs#L11) — Cuánto por encima del pecho del jugador apunta la cola del globo.

### `draw.rs`

- [`draw_clay_stick`](draw.rs#L462) — Pinta el joystick táctil flotante con el kit: la base y el mando (rojo en carrera) y, si hay algo al alcance, su herramienta sobre el mando, que se balancea mientras el joystick quieto recolecta. Invisible mientras el stick descansa idle. No-op si no hay dedo.
  - Firma: `pub(crate) fn draw_clay_stick( skin: &ClaySkin, view: &StickView, tool: Option<&str>, clock_ms: f64, ) {`
- [`draw_clay_hud`](draw.rs#L528) — Pinta el aviso, el panel y los slots (con rebote, icono y cuenta con contorno), el botón de acción (aplastado si se pulsa, herramienta que se balancea mientras se trabaja), el globo y los números voladores.
  - Firma: `pub(crate) fn draw_clay_hud(skin: &ClaySkin, hud: &ClayHud, frame: &UiFrame, layout: &HudLayout) {`
