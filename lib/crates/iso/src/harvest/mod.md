# Harvest

Este dominio decide qué puede recolectar el jugador desde donde está y lleva el trabajo de recolectarlo. Es la Fase 1 del GDD: agarrar recursos del mundo (árboles, rocas, plantas) y llenarlos en el inventario.

- **Alcance** (`reach.rs`): de las entidades con regla en `items.json`, la que deja menos hueco (`gap`) entre el cuerpo del jugador y el cuadrado de colisión de una casilla de su huella, medido por el eje en que están más lejos, como la colisión (`PLAYER_RADIUS` más medio lado de colisión). Se elige hasta `HARVEST_SIGHT` columnas de hueco y `HARVEST_LEVEL_REACH` bloques de altura; el objetivo dice cuál es esa casilla (`nearest`). Está al alcance (`in_reach`) solo cuando el hueco cabe en `HARVEST_CONTACT_SLACK`: el jugador golpea lo más cerca que deja la colisión. Si no, con la tecla mantenida la recolección queda en `Approaching` y el cliente lo hace caminar hacia esa casilla (`approach_walk`), frenando a lo largo de `HARVEST_APPROACH_EASE` hasta `HARVEST_APPROACH_CREEP` para llegar sin chocar ni rebotar. Un empate lo gana el id menor, así que el orden en que llegan las entidades no importa.
- **Trabajo** (`harvester.rs`): mientras se mantiene la tecla de recolectar sobre el mismo objetivo, cada tick fijo suma la velocidad de la mejor herramienta del tipo pedido (`tool_speed_tenths`). Soltar la tecla pausa el trabajo; cambiar de objetivo o perderlo de alcance empieza de cero. Sin la herramienta o el nivel pedidos el objetivo queda bloqueado y no avanza; un inventario lleno no lo bloquea: el rendimiento cae al suelo (`iso::drops`) y lo que no cabe espera ahí.
- Al terminar (`HarvestStatus::Done`), quien llama saca la entidad del mundo (`ChunkManager::remove_entity_at`), pide a las sombras que borren la suya: solo las columnas donde podía caer (`shadow_area`, `HARVEST_SHADOW_SPAN`) se hornean otra vez, en parches pequeños copiados sobre el mapa de cada chunk (`iso::lighting::patch`), sin rehornear chunks enteros, y deja flotando en el suelo las piezas que representan el rendimiento (`iso::drops::plan_pieces` y `Drops::spawn_pieces`); la entidad quitada viaja con su chunk en el guardado, así que no vuelve al reabrir.

- **Golpes** (`harvester.rs`): mientras se trabaja, el jugador golpea a un ritmo fijo, independiente de la herramienta: un golpe cada `HARVEST_STRIKE_TICKS` ticks, que cae en el tick `HARVEST_STRIKE_AT` (la pose de impacto de la hoja `gather` del jugador y de las hojas `chop_<herramienta>` está en ese punto). `Harvester::swing` dice en qué tick del golpe va y `Harvester::strikes` cuenta los golpes dados, sin volver atrás, para que la vista note uno nuevo y sacuda la entidad y suelte astillas.
- **Astillas** (`chips.rs`): formas del polvo del jugador (`DustShape`) con el color del item que da el objetivo (`strike_chips`, y `felled_chips`, más y más amplias, cuando cae), y el punto del objetivo donde caen las manos (`strike_point`, `STRIKE_LIFT`).

El trabajo en curso no se guarda: un objetivo a medias empieza de cero tras recargar. La fauna (NPC) todavía no se recolecta: los personajes nacen de la semilla y no se guardan, así que se rechaza en el catálogo.

## Catálogo de API pública

### `reach.rs`

#### Funciones y métodos

- [`pick_harvest_target`](reach.rs#L60) — La entidad recolectable más cercana a los pies dentro del alcance; los empates los gana el id menor.
  - Firma: `pub fn pick_harvest_target<'a>( feet: Feet, entities: impl IntoIterator<Item = &'a Entity>, items: &ItemCatalog, ) -> Option<HarvestTarget> {`

- [`approach_walk`](reach.rs#L124) — La caminata que lleva al jugador en línea recta hacia la casilla más cercana del objetivo: entera de lejos, frenando hasta `HARVEST_APPROACH_CREEP` en el último `HARVEST_APPROACH_EASE` de hueco; quieta si ya está ahí.
  - Firma: `pub fn approach_walk(target: &HarvestTarget, feet: GridPoint) -> GridPoint {`
- [`shadow_area`](reach.rs#L140) — Las columnas sobre las que pudo caer la sombra horneada de una entidad recolectada: el área cuyo horneado queda viejo al quitarla.
  - Firma: `pub fn shadow_area(anchor: WorldCoord) -> crate::grid::WorldRect {`

#### Constantes

- [`HARVEST_SIGHT`](reach.rs#L11) — Hueco máximo con el que se elige un objetivo; más allá de `HARVEST_CONTACT_SLACK` el jugador camina hasta él.
  - Declaración: `pub const HARVEST_SIGHT: f64 = 3.5;`
- [`HARVEST_SHADOW_SPAN`](reach.rs#L25) — Columnas alrededor del ancla sobre las que pudo caer su sombra horneada.
  - Declaración: `pub const HARVEST_SHADOW_SPAN: i32 = 8;`
- [`HARVEST_CONTACT_SLACK`](reach.rs#L15) — Hueco, en columnas, entre los cuerpos con el que el jugador ya golpea: lo que cubre un tick de paso lento.
  - Declaración: `pub const HARVEST_CONTACT_SLACK: f64 = 0.08;`
- [`HARVEST_APPROACH_EASE`](reach.rs#L19) — Hueco a lo largo del cual el acercamiento frena de un paso entero a uno lento.
  - Declaración: `pub const HARVEST_APPROACH_EASE: f64 = 0.6;`
- [`HARVEST_APPROACH_CREEP`](reach.rs#L22) — Fracción más lenta de un paso a la que frena el acercamiento.
  - Declaración: `pub const HARVEST_APPROACH_CREEP: f64 = 0.25;`
- [`HARVEST_LEVEL_REACH`](reach.rs#L28) — Bloques máximos entre la base de la entidad y los pies.
  - Declaración: `pub const HARVEST_LEVEL_REACH: f64 = 2.0;`

#### Tipos

- [`Feet`](reach.rs#L32) — Dónde están los pies del jugador: punto de columna (centros enteros) y altura.
  - Declaración: `pub struct Feet { pub at: GridPoint, pub elevation: f64 }`
- [`HarvestTarget`](reach.rs#L39) — Una entidad recolectable: id de instancia, ancla, blueprint y el bloque sobre el que se apoya.
  - Declaración: `pub struct HarvestTarget { pub id: String, pub anchor: WorldCoord, pub blueprint: String, pub elevation: i32, pub nearest: WorldCoord, pub gap: f64, pub in_reach: bool }`

### `harvester.rs`

#### Funciones y métodos

- [`HarvestStatus::target`](harvester.rs#L49) — El objetivo al alcance, pase lo que pase con él; `None` en `Idle`.
  - Firma: `pub fn target(&self) -> Option<&HarvestTarget> {`
- [`Harvester::swing`](harvester.rs#L162) — Ticks del golpe en curso, de `0` a `HARVEST_STRIKE_TICKS`; `0` es arriba, al empezar a bajar.
  - Firma: `pub fn swing(&self) -> u32 {`
- [`Harvester::strikes`](harvester.rs#L167) — Golpes dados desde que existe este recolector; nunca baja.
  - Firma: `pub fn strikes(&self) -> u64 {`

- [`Harvester::step`](harvester.rs#L84) — Avanza la recolección `ticks` ticks con lo que lleva el jugador y dice qué pasó.
  - Firma: `pub fn step( &mut self, input: HarvestInput<'_>, carried: &Carried, items: &ItemCatalog, ) -> HarvestStatus {`

- [`tool_in_hand`](harvester.rs#L182) — La herramienta que el jugador blande contra un blueprint: la mejor que lleva del tipo que pide su regla; `None` si se recolecta a mano o no la lleva.
  - Firma: `pub fn tool_in_hand<'a>( blueprint: &str, carried: &Carried, items: &'a ItemCatalog, ) -> Option<&'a ToolDef> {`

#### Constantes

- [`HARVEST_STRIKE_TICKS`](harvester.rs#L9) — Ticks de un ciclo de animación y sonido: alzar, golpear, seguir.
  - Declaración: `pub const HARVEST_STRIKE_TICKS: u32 = 6;`
- [`HARVEST_STRIKE_AT`](harvester.rs#L11) — Tick del golpe en que caen las manos.
  - Declaración: `pub const HARVEST_STRIKE_AT: u32 = 3;`

#### Tipos

- [`HarvestBlock`](harvester.rs#L15) — Por qué un objetivo no se puede recolectar: falta la herramienta (`NeedsTool { kind, tier }`).
  - Declaración: `pub enum HarvestBlock { NeedsTool { kind: ToolKind, tier: u8 } }`
- [`HarvestStatus`](harvester.rs#L22) — Lo que hizo la recolección en este paso: `Idle`, `Ready`, `Approaching` (tecla mantenida, objetivo fuera de alcance: caminar hacia él), `Blocked`, `Working { progress, total }` (décimas de tick a mano; también en pausa, con la tecla suelta) o `Done { target, yields }`.
  - Declaración: `pub enum HarvestStatus { Idle, Ready { .. }, Blocked { .. }, Working { .. }, Done { .. } }`
- [`HarvestInput`](harvester.rs#L63) — La entrada de un paso: tecla mantenida, objetivo en alcance y ticks.
  - Declaración: `pub struct HarvestInput<'a> { pub held: bool, pub target: Option<&'a HarvestTarget>, pub ticks: u32 }`
- [`Harvester`](harvester.rs#L75) — El trabajo sobre el objetivo actual; se conserva al soltar la tecla y se pierde al cambiar de objetivo, perderlo de alcance o quedar bloqueado.
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
