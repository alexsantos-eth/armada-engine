# Items

Este dominio declara lo que el jugador puede cargar (items), las herramientas que recolectan y las reglas que dicen qué entidad del mundo da qué al recolectarla. Es el contenido de `content/json/items.json` (`schemaVersion` 1), validado contra el catálogo de entidades al cargar: un blueprint que el catálogo no tiene, un blueprint en dos reglas, un personaje (`npc`) como objetivo o un item que no está declarado son errores de carga.

Las herramientas siguen la tabla de niveles del GDD (`TOOL_SPEED_TENTHS`: x1, x2, x3.5, x6, x10, x18, x35, x60, x100, x500). Una regla con `tool` pide una herramienta de ese tipo de nivel `tier` o mayor; una regla sin `tool` se recolecta a mano (nivel 0, velocidad x1). La velocidad se expresa en décimas enteras para que la simulación siga siendo determinista sin flotantes.

El dominio no guarda nada ni conoce el inventario: es catálogo puro. El inventario vive en `iso::inventory` y la recolección en `iso::harvest`.

## Formato de `items.json`

```json
{
  "schemaVersion": 1,
  "items": [{ "id": "wood", "name": "Madera", "stack": 50, "rarity": "common" }],
  "tools": [{ "id": "flint_axe", "name": "Hacha de pedernal", "kind": "axe", "tier": 1 }],
  "startingTools": ["flint_axe"],
  "harvest": [
    { "blueprints": ["tree"], "tool": "axe", "tier": 1, "ticks": 40,
      "yields": [{ "item": "wood", "amount": 3 }] }
  ]
}
```

- `stack`: unidades máximas por slot (≥ 1). `rarity`: `common`, `rare` o `exotic`. `color` (opcional): seis dígitos hex, el color de las astillas que suelta un golpe sobre lo que lo da (`ItemDef::color`).
- `kind`: `axe`, `pickaxe` o `net`. `tier`: `1..=10`.
- `ticks`: trabajo a mano, en ticks fijos (20 por segundo); una herramienta de nivel `n` lo divide por su multiplicador.
- Los nombres no llevan tildes: la fuente por defecto de Macroquad no las dibuja.

## Catálogo de API pública

### `catalog.rs`

#### Funciones y métodos

- [`tool_speed_tenths`](catalog.rs#L18) — Velocidad de recolección de un nivel, en décimas de la velocidad a mano; el nivel 0 es la mano y un nivel mayor que 10 vale como 10.
  - Firma: `pub fn tool_speed_tenths(tier: u8) -> u32 {`
- [`parse_items`](catalog.rs#L209) — Parsea y valida el contenido de items contra el catálogo de entidades que nombran sus reglas.
  - Firma: `pub fn parse_items(json: &str, entities: &EntityCatalog) -> Result<ItemCatalog, ItemsError> {`
- [`ItemCatalog::item`](catalog.rs#L108) — El item con ese id.
  - Firma: `pub fn item(&self, id: &str) -> Option<&ItemDef> {`
- [`ItemCatalog::tool`](catalog.rs#L113) — La herramienta con ese id.
  - Firma: `pub fn tool(&self, id: &str) -> Option<&ToolDef> {`
- [`ItemCatalog::starting_tools`](catalog.rs#L118) — Las herramientas con que aterriza un jugador nuevo, en orden de archivo.
  - Firma: `pub fn starting_tools(&self) -> &[String] {`
- [`ItemCatalog::harvest_rule`](catalog.rs#L123) — Cómo se recolecta una entidad de ese blueprint, si se puede.
  - Firma: `pub fn harvest_rule(&self, blueprint: &str) -> Option<&HarvestRule> {`
- [`ItemDef::color`](catalog.rs#L58) — El color de sus astillas como `0xRRGGBB`, si declara uno.
  - Firma: `pub fn color(&self) -> Option<u32> {`

#### Constantes

- [`ITEMS_SCHEMA_VERSION`](catalog.rs#L8) — El esquema de `items.json` que acepta el parser.
  - Declaración: `pub const ITEMS_SCHEMA_VERSION: u32 = 1;`
- [`MAX_TOOL_TIER`](catalog.rs#L11) — El último nivel de la progresión de herramientas.
  - Declaración: `pub const MAX_TOOL_TIER: u8 = 10;`
- [`TOOL_SPEED_TENTHS`](catalog.rs#L14) — Velocidad de cada nivel en décimas de la velocidad a mano (índice 0 = nivel 1), según la tabla del GDD.
  - Declaración: `pub const TOOL_SPEED_TENTHS: [u32; MAX_TOOL_TIER as usize] = [10, 20, 35, 60, 100, 180, 350, 600, 1000, 5000];`

#### Tipos

- [`ItemRarity`](catalog.rs#L26) — Rareza de un item (`Common`, `Rare`, `Exotic`); decide su banda de precio en la economía.
  - Declaración: `pub enum ItemRarity { Common, Rare, Exotic }`
- [`ToolKind`](catalog.rs#L35) — Familia de una herramienta; una regla pide una.
  - Declaración: `pub enum ToolKind { Axe, Pickaxe, Net }`
- [`ItemDef`](catalog.rs#L44) — Un item cargable: id, nombre visible, tope por slot y rareza.
  - Declaración: `pub struct ItemDef { pub id: String, pub name: String, pub stack: u32, pub rarity: ItemRarity }`
- [`ToolDef`](catalog.rs#L68) — Una herramienta: equipo aparte de los slots.
  - Declaración: `pub struct ToolDef { pub id: String, pub name: String, pub kind: ToolKind, pub tier: u8 }`
- [`HarvestYield`](catalog.rs#L79) — Unidades de un item que da una recolección.
  - Declaración: `pub struct HarvestYield { pub item: String, pub amount: u32 }`
- [`HarvestRule`](catalog.rs#L86) — Cómo se recolecta una entidad: herramienta (o `None`, a mano), nivel mínimo, trabajo en ticks a mano y lo que da.
  - Declaración: `pub struct HarvestRule { pub tool: Option<ToolKind>, pub tier: u8, pub ticks: u32, pub yields: Vec<HarvestYield> }`
- [`ItemCatalog`](catalog.rs#L98) — El contenido validado; las búsquedas son por id, nunca por orden de `HashMap`.
  - Declaración: `pub struct ItemCatalog { ... }`
- [`ItemsError`](catalog.rs#L130) — Todo lo que el contenido puede declarar mal: JSON ilegible, esquema no soportado, ids vacíos o repetidos, `stack` 0, nivel fuera de tabla (o una regla a mano con nivel), herramienta inicial no declarada, blueprint desconocido, repetido o que es un personaje, item desconocido, rendimiento vacío o 0, trabajo 0, color que no son seis dígitos hex.
  - Declaración: `pub enum ItemsError { ... }`
