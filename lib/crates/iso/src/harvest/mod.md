# Harvest

Este dominio decide qué puede recolectar el jugador desde donde está y lleva el trabajo de recolectarlo. Es la Fase 1 del GDD: agarrar recursos del mundo (árboles, rocas, plantas) y llenarlos en el inventario.

- **Alcance** (`reach.rs`): de las entidades con regla en `items.json`, la que tiene una casilla de su huella más cerca de los pies del jugador, a `HARVEST_SIGHT` columnas como mucho y a `HARVEST_LEVEL_REACH` bloques de altura. El objetivo dice cuál es esa casilla (`nearest`) y si está a `HARVEST_REACH` (todas las vecinas, diagonales incluidas, `in_reach`): si no lo está, con la tecla mantenida la recolección queda en `Approaching` y el cliente hace caminar al jugador hacia ella (`approach_walk`) hasta que llega y empieza a golpear. Un empate lo gana el id menor, así que el orden en que llegan las entidades no importa.
- **Trabajo** (`harvester.rs`): mientras se mantiene la tecla de recolectar sobre el mismo objetivo, cada tick fijo suma la velocidad de la mejor herramienta del tipo pedido (`tool_speed_tenths`). Soltar la tecla pausa el trabajo; cambiar de objetivo o perderlo de alcance empieza de cero. Sin la herramienta o el nivel pedidos, o sin sitio para todo el rendimiento, el objetivo queda bloqueado y no avanza.
- Al terminar (`HarvestStatus::Done`), quien llama saca la entidad del mundo (`ChunkManager::remove_entity_at`), olvida el horneado de sombras de los chunks donde podía caer la suya (`shadow_chunks`, `HARVEST_SHADOW_SPAN`) para que se rehornee sin ella, y guarda el rendimiento; la entidad quitada viaja con su chunk en el guardado, así que no vuelve al reabrir.

- **Golpes** (`harvester.rs`): mientras se trabaja, el jugador golpea a un ritmo fijo, independiente de la herramienta: un golpe cada `HARVEST_STRIKE_TICKS` ticks, que cae en el tick `HARVEST_STRIKE_AT` (la pose de impacto de la hoja `gather` del jugador está en ese punto). `Harvester::swing` dice en qué tick del golpe va y `Harvester::strikes` cuenta los golpes dados, sin volver atrás, para que la vista note uno nuevo y sacuda la entidad y suelte astillas.
- **Astillas** (`chips.rs`): formas del polvo del jugador (`DustShape`) con el color del item que da el objetivo (`strike_chips`, y `felled_chips`, más y más amplias, cuando cae), y el punto del objetivo donde caen las manos (`strike_point`, `STRIKE_LIFT`).

El trabajo en curso no se guarda: un objetivo a medias empieza de cero tras recargar. La fauna (NPC) todavía no se recolecta: los personajes nacen de la semilla y no se guardan, así que se rechaza en el catálogo.

## Catálogo de API pública

### `reach.rs`

#### Funciones y métodos

- [`pick_harvest_target`](reach.rs#L49) — La entidad recolectable más cercana a los pies dentro del alcance; los empates los gana el id menor.
  - Firma: `pub fn pick_harvest_target<'a>( feet: Feet, entities: impl IntoIterator<Item = &'a Entity>, items: &ItemCatalog, ) -> Option<HarvestTarget> {`

- [`approach_walk`](reach.rs#L101) — La caminata unitaria que lleva al jugador en línea recta hacia la casilla más cercana del objetivo; quieta si ya está ahí.
  - Firma: `pub fn approach_walk(target: &HarvestTarget, feet: GridPoint) -> GridPoint {`
- [`shadow_chunks`](reach.rs#L116) — Los chunks sobre los que pudo caer la sombra horneada de una entidad recolectada, cuyo horneado queda viejo al quitarla.
  - Firma: `pub fn shadow_chunks(anchor: WorldCoord) -> Vec<crate::grid::ChunkCoord> {`

#### Constantes

- [`HARVEST_SIGHT`](reach.rs#L14) — Distancia máxima a la que se elige un objetivo; más allá de `HARVEST_REACH` el jugador camina hasta él.
  - Declaración: `pub const HARVEST_SIGHT: f64 = 4.0;`
- [`HARVEST_SHADOW_SPAN`](reach.rs#L17) — Columnas alrededor del ancla sobre las que pudo caer su sombra horneada.
  - Declaración: `pub const HARVEST_SHADOW_SPAN: i32 = 8;`
- [`HARVEST_REACH`](reach.rs#L10) — Distancia máxima, en columnas, del centro de una casilla de la huella a los pies.
  - Declaración: `pub const HARVEST_REACH: f64 = 1.5;`
- [`HARVEST_LEVEL_REACH`](reach.rs#L20) — Bloques máximos entre la base de la entidad y los pies.
  - Declaración: `pub const HARVEST_LEVEL_REACH: f64 = 2.0;`

#### Tipos

- [`Feet`](reach.rs#L24) — Dónde están los pies del jugador: punto de columna (centros enteros) y altura.
  - Declaración: `pub struct Feet { pub at: GridPoint, pub elevation: f64 }`
- [`HarvestTarget`](reach.rs#L31) — Una entidad recolectable: id de instancia, ancla, blueprint y el bloque sobre el que se apoya.
  - Declaración: `pub struct HarvestTarget { pub id: String, pub anchor: WorldCoord, pub blueprint: String, pub elevation: i32, pub nearest: WorldCoord, pub in_reach: bool }`

### `harvester.rs`

#### Funciones y métodos

- [`HarvestStatus::target`](harvester.rs#L51) — El objetivo al alcance, pase lo que pase con él; `None` en `Idle`.
  - Firma: `pub fn target(&self) -> Option<&HarvestTarget> {`
- [`Harvester::swing`](harvester.rs#L171) — Ticks del golpe en curso, de `0` a `HARVEST_STRIKE_TICKS`; `0` es arriba, al empezar a bajar.
  - Firma: `pub fn swing(&self) -> u32 {`
- [`Harvester::strikes`](harvester.rs#L176) — Golpes dados desde que existe este recolector; nunca baja.
  - Firma: `pub fn strikes(&self) -> u64 {`

- [`Harvester::step`](harvester.rs#L86) — Avanza la recolección `ticks` ticks con lo que lleva el jugador y dice qué pasó.
  - Firma: `pub fn step( &mut self, input: HarvestInput<'_>, carried: &Carried, items: &ItemCatalog, ) -> HarvestStatus {`

#### Constantes

- [`HARVEST_STRIKE_TICKS`](harvester.rs#L9) — Ticks de un golpe: alzar, golpear, seguir.
  - Declaración: `pub const HARVEST_STRIKE_TICKS: u32 = 10;`
- [`HARVEST_STRIKE_AT`](harvester.rs#L11) — Tick del golpe en que caen las manos.
  - Declaración: `pub const HARVEST_STRIKE_AT: u32 = 6;`

#### Tipos

- [`HarvestBlock`](harvester.rs#L15) — Por qué un objetivo no se puede recolectar: falta la herramienta (`NeedsTool { kind, tier }`) o el inventario está lleno.
  - Declaración: `pub enum HarvestBlock { NeedsTool { kind: ToolKind, tier: u8 }, InventoryFull }`
- [`HarvestStatus`](harvester.rs#L24) — Lo que hizo la recolección en este paso: `Idle`, `Ready`, `Approaching` (tecla mantenida, objetivo fuera de alcance: caminar hacia él), `Blocked`, `Working { progress, total }` (décimas de tick a mano; también en pausa, con la tecla suelta) o `Done { target, yields }`.
  - Declaración: `pub enum HarvestStatus { Idle, Ready { .. }, Blocked { .. }, Working { .. }, Done { .. } }`
- [`HarvestInput`](harvester.rs#L65) — La entrada de un paso: tecla mantenida, objetivo en alcance y ticks.
  - Declaración: `pub struct HarvestInput<'a> { pub held: bool, pub target: Option<&'a HarvestTarget>, pub ticks: u32 }`
- [`Harvester`](harvester.rs#L77) — El trabajo sobre el objetivo actual; se conserva al soltar la tecla y se pierde al cambiar de objetivo, perderlo de alcance o quedar bloqueado.
  - Declaración: `pub struct Harvester { ... }`

### `chips.rs`

#### Funciones y métodos

- [`darker`](chips.rs#L15) — Un color al 60 %, la cara en sombra de una astilla.
  - Firma: `pub fn darker(color: u32) -> u32 {`
- [`strike_chips`](chips.rs#L21) — La ráfaga de un golpe: pocas astillas pequeñas lanzadas hacia el jugador y hacia arriba.
  - Firma: `pub fn strike_chips(color: u32) -> DustShape {`
- [`strike_chips_of`](chips.rs#L37) — `strike_chips` de un item que puede no declarar color; sin él, polvo.
  - Firma: `pub fn strike_chips_of(color: Option<u32>) -> DustShape {`
- [`felled_chips`](chips.rs#L48) — La ráfaga del último golpe, cuando el objetivo cae: más astillas, más amplias y más largas.
  - Firma: `pub fn felled_chips(color: u32) -> DustShape {`
- [`strike_point`](chips.rs#L64) — Dónde cae un golpe sobre el objetivo anclado en `cell`: `STRIKE_REACH` del camino desde el centro de la casilla hacia los pies.
  - Firma: `pub fn strike_point(cell: WorldCoord, feet: GridPoint) -> GridPoint {`

#### Constantes

- [`STRIKE_REACH`](chips.rs#L9) — Parte del camino desde la casilla del objetivo hacia el jugador en la que cae el golpe.
  - Declaración: `pub const STRIKE_REACH: f64 = 0.35;`
- [`STRIKE_LIFT`](chips.rs#L12) — Bloques sobre la base del objetivo a los que cae el golpe: la altura de las manos.
  - Declaración: `pub const STRIKE_LIFT: f64 = 0.45;`
