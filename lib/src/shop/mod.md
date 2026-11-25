# Shop (cliente)

La tienda que abre un comerciante, en el cliente. Las reglas (precios, estante, tratos) viven en [`iso::economy`](../../crates/iso/src/economy/mod.md); esta carpeta las convierte en filas que el jugador elige, recuerda lo que la tienda abierta tiene en pantalla y coloca sus piezas en cada tamaño de pantalla. Las pinta `ui::draw_shop` con el kit ([`ui`](../ui/mod.md)); el pegamento con el juego está en `src/game/shop.rs`. Todo lo de aquí es puro y se prueba; los textos van sin tildes (la fuente por defecto de Macroquad no las dibuja).

**Cómo se juega.** Sobre cada puesto de mercado (`market_stall`) en pantalla flota un icono sin texto (una moneda en un disco crema, `mark.rs`) que sube y baja, pero solo mientras el jugador está al alcance de ese puesto (y entonces late). Con el puesto al alcance el botón de acción pasa a «Comerciar» y la acción de recolectar (`E` en PC, tocar el botón redondo en móvil) abre la tienda; el jugador queda quieto mientras está abierta y se cierra sola si deja de haber un comerciante al alcance.

- Pestañas **Vender** (lo que lleva y las aldeas pagan, una fila por item sumando slots: elegirla vende todas las unidades) y **Comprar** (el estante del día, barato primero; una fila apagada, con su estilo disabled, es la que no se puede comprar: si ya la tienes dice «Ya la tienes» y si no alcanzan las monedas no dice nada).
- Teclado: flechas o `W`/`S` suben y bajan, flechas o `A`/`D` cambian de pestaña, `Intro` o `Espacio` tratan la fila, `Esc` cierra. Puntero y táctil: tocar una pestaña la abre, tocar una fila la elige y tocar la elegida la trata (dos toques, para no vender sin querer), tocar la X o fuera del panel cierra.
- Cada trato suena (`ItemCollect`), vibra y deja un globo con lo ocurrido («Vendiste Madera por 28 Monedas», «Compraste Trampa de bejuco por 36 Monedas»). La cartera (una etiqueta rectangular redondeada con la moneda y la cuenta, sin palabras) se ve en la esquina cuando tiene monedas. Con la tienda abierta el mundo de fondo se desenfoca (`rendering::backdrop`).

La tienda abierta no se guarda: solo la cartera (`systems.economy`) y lo que cambió en el inventario.

## Catálogo de API pública

### `session.rs`

- [`Shop`](session.rs#L36) — Una tienda abierta: pestaña, fila bajo el cursor y último mensaje. `open`, `press`, `clamp`, `say` y `advance`.
- [`Tab`](session.rs#L8), [`ShopKey`](session.rs#L17), [`ShopEvent`](session.rs#L27) — Las pestañas, las teclas que entiende (venga del teclado, del puntero o de una escena) y lo que piden al juego.
- [`MESSAGE_MS`](session.rs#L4) — Cuánto dura el mensaje de un trato.

### `rows.rs`

- [`rows`](rows.rs#L56) — Las filas de una pestaña a partir de lo que lleva el jugador, su cartera y el mercado.
  - Firma: `pub(crate) fn rows(tab: Tab, stock: &ShopStock<'_>) -> Vec<ShopRow> {`
- [`trade`](rows.rs#L117) — Hace el trato de una fila y dice qué pasó con las palabras de la tienda.
  - Firma: `pub(crate) fn trade( row: &ShopRow, carried: &mut Carried, wallet: &mut Wallet, market: &Market, economy: &EconomyCatalog, items: &ItemCatalog, ) -> Result<String, &'static str> {`
- [`ShopRow`](rows.rs#L20), [`RowAction`](rows.rs#L11), [`ShopStock`](rows.rs#L37), [`tool_piece`](rows.rs#L46) — Una línea de la tienda, lo que hace, de dónde se lee todo y la pieza del kit de cada familia de herramienta.

### `mark.rs`

- [`MarketMark`](mark.rs#L18) — Un mercado en pantalla: dónde reposa su icono, su lado y si el jugador lo tiene al alcance.
- [`mark_pose`](mark.rs#L42) — La pose del icono en un instante: sube y baja (`BOB_MS`), con fase propia por mercado, y late si está al alcance.
- [`mark_side`](mark.rs#L36), [`mark_rect`](mark.rs#L56) — El lado según el ancho de casilla y el cuadrado que recibe el toque.

### `layout.rs`

- [`ShopLayout::new`](layout.rs#L59) — Panel centrado, pestañas, botón de cierre, filas visibles (hasta 6, con desplazamiento que sigue al cursor) y pie.
  - Firma: `pub(crate) fn new(width: f32, height: f32, count: usize, cursor: usize) -> Self {`
- [`ShopLayout::hit`](layout.rs#L119) — Sobre qué está un punto (`Hit`): pestaña, fila, cierre, panel o fuera.
