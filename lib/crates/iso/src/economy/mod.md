# Economy

Este dominio es la economía básica del GDD (Fase 2): las monedas del jugador, lo que las aldeas pagan por lo que se recolecta y lo que cobran por las herramientas, y qué entidades comercian. Es el contenido de `content/json/economy.json` (`schemaVersion` 1), validado contra los items y las entidades al cargar: un item o una herramienta que no están declarados, un precio de 0, un comerciante que no existe o es un personaje (`npc`), un precio repetido, un `planetSpread` mayor de 90 o un catálogo vacío son errores de carga.

- **Moneda (`Wallet`).** La lleva el jugador, no el planeta: sobrevive al viaje. Se guarda como su propia parte versionada `systems.economy` (`ECONOMY_PART`), al lado de `world`, `inventory` y `drops`; un guardado sin la parte arranca con 0 monedas.
- **Precios (`Market`).** El planeta mueve todos los precios un porcentaje fijo (`100 ± planetSpread`, sacado de la semilla con `derive_seed`): el mismo item vale más o menos según el mundo, tanto al vender como al comprar. Los precios van en monedas enteras y nunca bajan de una.
- **Estante diario.** De las herramientas que declara `goods`, cada día del reloj del mundo (`clock_time(tick).day`) el mercado pone `catalogSize` sobre el estante, elegidas ordenándolas por `derive_seed(semilla del día, herramienta)`. Es función de la semilla y del día, nunca de un flujo con estado, así que dos clientes ven el mismo estante. Se muestra de la más barata a la más cara.
- **Comerciantes.** `merchants` lista los blueprints que comercian. Hoy es el `market_stall` (el puesto de las aldeas, zonas `center` y `market`): el vendedor es el puesto. `pick_merchant` elige el más cercano a menos de `TRADE_REACH` columnas y `TRADE_LEVEL_REACH` bloques de los pies; en un empate gana el id menor.
- **Comercio.** Vender (`sell_item`) saca del inventario hasta lo pedido (lo que lleve, si lleva menos) y paga el precio del mercado; comprar (`buy_tool`) cobra el precio del estante y da la herramienta al cinturón. No se vende lo que las aldeas no compran, ni se compra lo que no está hoy en el estante o sin monedas suficientes (una herramienta se puede comprar otra vez: el cinturón la cuenta) (`TradeError`).

El dominio no dibuja nada ni conoce teclas: la tienda vive en el cliente (`src/shop`).

## Formato de `economy.json`

```json
{
  "schemaVersion": 1,
  "currency": "Monedas",
  "merchants": ["market_stall"],
  "planetSpread": 20,
  "catalogSize": 3,
  "prices": [{ "item": "wood", "coins": 2 }],
  "goods": [{ "tool": "bone_axe", "coins": 30 }]
}
```

- `prices`: monedas base por unidad vendida; cada item del catálogo debe tener la suya (lo comprueba un test del contenido real). `goods`: herramientas a la venta con su precio base; ninguna es de las iniciales.
- Los textos van sin tildes: la fuente por defecto de Macroquad no las dibuja.

## Catálogo de API pública

### `catalog.rs`

- [`parse_economy`](catalog.rs#L116) — Parsea y valida la economía contra los items y las entidades que nombra.
  - Firma: `pub fn parse_economy( json: &str, items: &ItemCatalog, entities: &EntityCatalog, ) -> Result<EconomyCatalog, EconomyError> {`
- [`EconomyCatalog`](catalog.rs#L79) — El contenido validado: `currency`, `is_merchant`, `base_price`, `goods` y `catalog_size`.
- [`EconomyError`](catalog.rs#L42) — Todo lo que el contenido puede declarar mal.
- [`Good`](catalog.rs#L17) — Una herramienta a la venta y su precio base.
- [`Market::open`](catalog.rs#L216) — El mercado de la semilla en un día: porcentaje del planeta y estante.
  - Firma: `pub fn open(economy: &EconomyCatalog, seed: u64, day: u64) -> Self {`
- [`Market::sell_price`](catalog.rs#L260) — Las monedas que da una unidad de un item, si las aldeas lo compran.
  - Firma: `pub fn sell_price(&self, economy: &EconomyCatalog, item: &str) -> Option<u32> {`
- [`Market::offers`](catalog.rs#L250), [`Market::offer`](catalog.rs#L255), [`Market::percent`](catalog.rs#L240), [`Market::day`](catalog.rs#L245) — El estante (barato primero), una oferta por herramienta, el porcentaje del planeta y el día.
- [`Offer`](catalog.rs#L194), [`Market`](catalog.rs#L202) — Una herramienta del estante con su precio y el mercado.
- [`ECONOMY_SCHEMA_VERSION`](catalog.rs#L10), [`MAX_PLANET_SPREAD`](catalog.rs#L13) — La versión del esquema y la mayor variación de precios entre planetas (90 %).

### `trade.rs`

- [`Wallet`](trade.rs#L9) — Las monedas del jugador: `with`, `coins`, `earn` (satura) y `spend` (solo si alcanza).
- [`sell_item`](trade.rs#L56) — Vende hasta `amount` unidades de un item y devuelve las monedas ganadas.
  - Firma: `pub fn sell_item( inventory: &mut Inventory, wallet: &mut Wallet, market: &Market, economy: &EconomyCatalog, item: &str, amount: u32, ) -> Result<u64, TradeError> {`
- [`buy_tool`](trade.rs#L77) — Compra una herramienta del estante y devuelve su precio.
  - Firma: `pub fn buy_tool( toolbelt: &mut Toolbelt, wallet: &mut Wallet, market: &Market, items: &ItemCatalog, tool: &str, ) -> Result<u32, TradeError> {`
- [`TradeError`](trade.rs#L43) — Por qué no hubo trato: `NothingToSell`, `NotOffered`, `TooPoor`.

### `merchant.rs`

- [`pick_merchant`](merchant.rs#L27) — El comerciante más cercano a los pies dentro del alcance.
  - Firma: `pub fn pick_merchant<'a>( feet: Feet, entities: impl IntoIterator<Item = &'a Entity>, economy: &EconomyCatalog, ) -> Option<Merchant> {`
- [`Merchant`](merchant.rs#L16) — Un comerciante al alcance: id, ancla, blueprint y distancia.
- [`TRADE_REACH`](merchant.rs#L9), [`TRADE_LEVEL_REACH`](merchant.rs#L12) — 3 columnas y 2 bloques.

### `part.rs`

- [`with_wallet`](part.rs#L17) — `systems` con la parte de la cartera escrita; las demás quedan como estaban.
  - Firma: `pub fn with_wallet(mut systems: serde_json::Value, wallet: &Wallet) -> serde_json::Value {`
- [`saved_wallet`](part.rs#L32) — La cartera que registra el guardado, o `None` si es anterior a la parte o de otra versión.
  - Firma: `pub fn saved_wallet(systems: &serde_json::Value) -> Option<Wallet> {`
- [`ECONOMY_PART`](part.rs#L6), [`ECONOMY_PART_VERSION`](part.rs#L8) — La clave de la parte y su versión.
