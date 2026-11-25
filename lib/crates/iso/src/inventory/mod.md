# Inventory

Este dominio modela lo que el jugador lleva encima: una fila fija de slots (`Inventory`), cada uno con una pila de un solo item, y un cinturón de herramientas (`Toolbelt`) aparte de los slots. La separación sigue al GDD: al morir se pierden los recursos de los slots y se conservan las herramientas.

`Carried` agrupa las dos cosas y es lo que se guarda: su parte en `systems.inventory` del guardado (`INVENTORY_PART`, versión `INVENTORY_PART_VERSION`), al lado de la parte `world` de la semilla. El estado no vive como campos de `World`: cada sistema escribe y lee su parte versionada. Al reabrir, un item o herramienta que el catálogo ya no declara se descarta y se informa; una pila por encima del tope de su item se recorta.

El inventario no decide qué se recolecta ni cuándo: eso es `iso::harvest`. Las pilas se rellenan antes de abrir slots vacíos y se vacían desde el último slot.

## Catálogo de API pública

### `slots.rs`

#### Funciones y métodos

- [`Inventory::new`](slots.rs#L23) — Un inventario vacío de `capacity` slots.
  - Firma: `pub fn new(capacity: usize) -> Self {`
- [`Inventory::restore`](slots.rs#L32) — Reconstruye un inventario guardado: pierde las pilas fuera de la capacidad, vacía (y devuelve) las de items que el catálogo no tiene y recorta las que exceden su tope.
  - Firma: `pub fn restore( capacity: usize, saved: Vec<Option<ItemStack>>, items: &ItemCatalog, ) -> (Self, Vec<String>) {`
- [`Inventory::capacity`](slots.rs#L54) — Número de slots.
  - Firma: `pub fn capacity(&self) -> usize {`
- [`Inventory::slots`](slots.rs#L59) — Los slots en orden.
  - Firma: `pub fn slots(&self) -> &[Option<ItemStack>] {`
- [`Inventory::count`](slots.rs#L64) — Unidades de un item sumando todos los slots.
  - Firma: `pub fn count(&self, item: &str) -> u32 {`
- [`Inventory::add`](slots.rs#L75) — Guarda hasta `amount` unidades (primero completa pilas, luego abre slots) y devuelve lo que no cupo; un item que el catálogo no tiene nunca cabe.
  - Firma: `pub fn add(&mut self, item: &str, amount: u32, items: &ItemCatalog) -> u32 {`
- [`Inventory::add_with_slots`](slots.rs#L80) — Variante interna que informa el índice y las unidades depositadas en cada slot.
- [`Inventory::fits`](slots.rs#L123) — Si todos los rendimientos caben a la vez.
  - Firma: `pub fn fits(&self, yields: &[HarvestYield], items: &ItemCatalog) -> bool {`
- [`Inventory::take`](slots.rs#L132) — Saca unidades desde el último slot; si no hay suficientes no saca nada.
  - Firma: `pub fn take(&mut self, item: &str, amount: u32) -> bool {`

#### Constantes

- [`STARTING_SLOTS`](slots.rs#L6) — Slots con que aterriza el jugador, antes de que un traje sume bolsillos.
  - Declaración: `pub const STARTING_SLOTS: usize = 12;`

#### Tipos

- [`ItemStack`](slots.rs#L10) — Unidades de un item en un slot.
  - Declaración: `pub struct ItemStack { pub item: String, pub count: u32 }`
- [`Inventory`](slots.rs#L17) — Fila fija de slots; un slot vacío es `None`.
  - Declaración: `pub struct Inventory { ... }`

### `toolbelt.rs`

#### Funciones y métodos

- [`Toolbelt::starting`](toolbelt.rs#L13) — Las herramientas iniciales del catálogo (`startingTools`).
  - Firma: `pub fn starting(items: &ItemCatalog) -> Self {`
- [`Toolbelt::restore`](toolbelt.rs#L20) — Reconstruye un cinturón guardado y devuelve las herramientas que el catálogo ya no declara.
  - Firma: `pub fn restore(saved: Vec<String>, items: &ItemCatalog) -> (Self, Vec<String>) {`
- [`Toolbelt::tools`](toolbelt.rs#L32) — Los ids de las herramientas que lleva, en el orden en que las ganó.
  - Firma: `pub fn tools(&self) -> &[String] {`
- [`Toolbelt::give`](toolbelt.rs#L37) — Añade una herramienta y dice si era nueva y está declarada.
  - Firma: `pub fn give(&mut self, id: &str, items: &ItemCatalog) -> bool {`
- [`Toolbelt::best_tier`](toolbelt.rs#L46) — El nivel más alto que lleva de un tipo.
  - Firma: `pub fn best_tier(&self, kind: ToolKind, items: &ItemCatalog) -> Option<u8> {`

#### Tipos

- [`Toolbelt`](toolbelt.rs#L7) — Las herramientas que lleva el jugador; nunca se pierden al morir.
  - Declaración: `pub struct Toolbelt { ... }`

### `part.rs`

#### Funciones y métodos

- [`Carried::starting`](part.rs#L20) — Lo que trae un jugador nuevo: slots vacíos y las herramientas iniciales.
  - Firma: `pub fn starting(capacity: usize, items: &ItemCatalog) -> Self {`
- [`with_carried`](part.rs#L44) — `systems` con la parte del inventario escrita; las demás partes quedan como estaban.
  - Firma: `pub fn with_carried(mut systems: serde_json::Value, carried: &Carried) -> serde_json::Value {`
- [`saved_carried`](part.rs#L60) — Lo que registra el guardado, o `None` si es anterior a la parte o de otra versión.
  - Firma: `pub fn saved_carried( systems: &serde_json::Value, capacity: usize, items: &ItemCatalog, ) -> Option<RestoredCarried> {`

#### Constantes

- [`INVENTORY_PART`](part.rs#L7) — La clave de la parte dentro de `systems`.
  - Declaración: `pub const INVENTORY_PART: &str = "inventory";`
- [`INVENTORY_PART_VERSION`](part.rs#L9) — La versión de la parte que escribe y lee este motor.
  - Declaración: `pub const INVENTORY_PART_VERSION: u32 = 1;`

#### Tipos

- [`Carried`](part.rs#L13) — Todo lo que lleva el jugador: inventario y cinturón.
  - Declaración: `pub struct Carried { pub inventory: Inventory, pub toolbelt: Toolbelt }`
- [`RestoredCarried`](part.rs#L30) — Lo leído de un guardado y los ids que tuvo que dejar fuera.
  - Declaración: `pub struct RestoredCarried { pub carried: Carried, pub dropped: Vec<String> }`
