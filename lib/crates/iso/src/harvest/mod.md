# Harvest

Este dominio decide qué puede recolectar el jugador desde donde está y lleva el trabajo de recolectarlo. Es la Fase 1 del GDD: agarrar recursos del mundo (árboles, rocas, plantas) y llenarlos en el inventario.

- **Alcance** (`reach.rs`): de las entidades con regla en `items.json`, la que tiene una casilla de su huella más cerca de los pies del jugador, a `HARVEST_REACH` columnas como mucho (todas las vecinas, diagonales incluidas) y a `HARVEST_LEVEL_REACH` bloques de altura. Un empate lo gana el id menor, así que el orden en que llegan las entidades no importa.
- **Trabajo** (`harvester.rs`): mientras se mantiene la tecla de recolectar sobre el mismo objetivo, cada tick fijo suma la velocidad de la mejor herramienta del tipo pedido (`tool_speed_tenths`). Soltar la tecla pausa el trabajo; cambiar de objetivo o perderlo de alcance empieza de cero. Sin la herramienta o el nivel pedidos, o sin sitio para todo el rendimiento, el objetivo queda bloqueado y no avanza.
- Al terminar (`HarvestStatus::Done`), quien llama saca la entidad del mundo (`ChunkManager::remove_entity_at`) y guarda el rendimiento; la entidad quitada viaja con su chunk en el guardado, así que no vuelve al reabrir.

El trabajo en curso no se guarda: un objetivo a medias empieza de cero tras recargar. La fauna (NPC) todavía no se recolecta: los personajes nacen de la semilla y no se guardan, así que se rechaza en el catálogo.

## Catálogo de API pública

### `reach.rs`

#### Funciones y métodos

- [`pick_harvest_target`](reach.rs#L36) — La entidad recolectable más cercana a los pies dentro del alcance; los empates los gana el id menor.
  - Firma: `pub fn pick_harvest_target<'a>( feet: Feet, entities: impl IntoIterator<Item = &'a Entity>, items: &ItemCatalog, ) -> Option<HarvestTarget> {`

#### Constantes

- [`HARVEST_REACH`](reach.rs#L10) — Distancia máxima, en columnas, del centro de una casilla de la huella a los pies.
  - Declaración: `pub const HARVEST_REACH: f64 = 1.5;`
- [`HARVEST_LEVEL_REACH`](reach.rs#L13) — Bloques máximos entre la base de la entidad y los pies.
  - Declaración: `pub const HARVEST_LEVEL_REACH: f64 = 2.0;`

#### Tipos

- [`Feet`](reach.rs#L17) — Dónde están los pies del jugador: punto de columna (centros enteros) y altura.
  - Declaración: `pub struct Feet { pub at: GridPoint, pub elevation: f64 }`
- [`HarvestTarget`](reach.rs#L24) — Una entidad recolectable: id de instancia, ancla y blueprint.
  - Declaración: `pub struct HarvestTarget { pub id: String, pub anchor: WorldCoord, pub blueprint: String }`

### `harvester.rs`

#### Funciones y métodos

- [`Harvester::step`](harvester.rs#L62) — Avanza la recolección `ticks` ticks con lo que lleva el jugador y dice qué pasó.
  - Firma: `pub fn step( &mut self, input: HarvestInput<'_>, carried: &Carried, items: &ItemCatalog, ) -> HarvestStatus {`

#### Tipos

- [`HarvestBlock`](harvester.rs#L10) — Por qué un objetivo no se puede recolectar: falta la herramienta (`NeedsTool { kind, tier }`) o el inventario está lleno.
  - Declaración: `pub enum HarvestBlock { NeedsTool { kind: ToolKind, tier: u8 }, InventoryFull }`
- [`HarvestStatus`](harvester.rs#L19) — Lo que hizo la recolección en este paso: `Idle`, `Ready`, `Blocked`, `Working { progress, total }` (décimas de tick a mano; también en pausa, con la tecla suelta) o `Done { target, yields }`.
  - Declaración: `pub enum HarvestStatus { Idle, Ready { .. }, Blocked { .. }, Working { .. }, Done { .. } }`
- [`HarvestInput`](harvester.rs#L44) — La entrada de un paso: tecla mantenida, objetivo en alcance y ticks.
  - Declaración: `pub struct HarvestInput<'a> { pub held: bool, pub target: Option<&'a HarvestTarget>, pub ticks: u32 }`
- [`Harvester`](harvester.rs#L55) — El trabajo sobre el objetivo actual; se conserva al soltar la tecla y se pierde al cambiar de objetivo, perderlo de alcance o quedar bloqueado.
  - Declaración: `pub struct Harvester { ... }`
