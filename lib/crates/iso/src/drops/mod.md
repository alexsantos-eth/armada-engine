# Drops

Este dominio guarda los montones de items que hay en el suelo. Al derribar algo, su rendimiento no va directo al inventario: cae alrededor de donde estaba y el jugador lo recoge al pasar por encima. Lo que no cabe en el inventario se queda en el suelo hasta que haya sitio.

- **Dónde cae** (`Drops::spawn`): un objeto por cada unidad de la regla, a como mucho `DROP_SCATTER` columnas del ancla, repartidos en círculo desde un giro que sale de un flujo sembrado con el id de la entidad (`derive_seed`): el mismo derribo cae siempre en los mismos sitios. Cada objeto recuerda de dónde salió (`from`), para que la vista lo lance desde ahí.
- **Piezas voxel** (`pieces.rs`, `Drops::spawn_pieces`): si la entidad tiene `entity-parts.json`, lo que suelta no son montones sino las propias piezas del kit. Cada item de `items.json` declara en `pieces` los nombres de pieza que lo representan (`wood`: `trunk`, `log`, `branch`…) y el `parts.json` de cada modelo marca con `collect` cuáles de sus piezas se recogen (por defecto las que algún item declara; `put(..., collect=False)` en `vox_models.py` la deja de adorno, como los hongos pequeños de `mushrooms`, donde solo se recogen las setas grandes); `plan_pieces` elige, por item, entre las piezas recolectables, hasta `min(unidades, piezas de ese tipo, MAX_PIECE_DROPS)` piezas con un flujo sembrado, y **cada pieza vale una unidad**: una entidad con dos troncos da como mucho dos. Esas piezas no se desvanecen con el resto de la explosión: se quedan flotando donde caen (`rest_of`, a como mucho `PIECE_SCATTER` columnas) con su sprite (`Drop::piece`) y se recogen igual. Lo que ninguna pieza representa cae como montón normal.
- **Recogerlo** (`Drops::collect`, en el paso fijo): un montón recién caído espera `PICKUP_DELAY_TICKS`; después, si los pies están a `PICKUP_REACH` columnas y `PICKUP_LEVEL_REACH` bloques, entra al inventario todo lo que cabe y el resto se queda (`Collected::refused`).
- **Guardado**: su propia parte versionada en `systems.drops` (`DROPS_PART`, `DROPS_PART_VERSION`), con el siguiente id para que nunca se repita. Los montones de guardados anteriores conservan su cantidad, y `piece` solo se escribe en las piezas. Al reabrir se dejan fuera los montones de items que el catálogo ya no declara.

Los montones no viven en los chunks ni en el catálogo de entidades: no se generan, no colisionan y no proyectan sombra horneada. El cliente los dibuja (`src/harvest/drop_view.rs`).

## Catálogo de API pública

### `ground.rs`

#### Funciones y métodos

- [`Drops::list`](ground.rs#L81) — Los montones, del más viejo al más nuevo.
  - Firma: `pub fn list(&self) -> &[Drop] {`
- [`Drops::spawn`](ground.rs#L87) — Deja un objeto por unidad alrededor del ancla de lo derribado.
  - Firma: `pub fn spawn(&mut self, felled: Felled<'_>, yields: &[HarvestYield]) {`
- [`Drops::collect`](ground.rs#L120) — Deja pasar `ticks` y recoge en el inventario los montones al alcance de los pies que ya no esperan, tanto de cada uno como quepa.
  - Firma: `pub fn collect( &mut self, feet: Feet, inventory: &mut Inventory, items: &ItemCatalog, ticks: u32, ) -> Collected {`
- [`with_drops`](ground.rs#L185) — `systems` con la parte de los montones escrita; las demás partes quedan como estaban.
  - Firma: `pub fn with_drops(mut systems: serde_json::Value, drops: &Drops) -> serde_json::Value {`
- [`saved_drops`](ground.rs#L201) — Los montones que registra el guardado, o `None` si es anterior a la parte o de otra versión.
  - Firma: `pub fn saved_drops(systems: &serde_json::Value, items: &ItemCatalog) -> Option<Drops> {`

#### Constantes

- [`DROP_SCATTER`](ground.rs#L12) — Distancia máxima a la que cae un montón del centro de lo que lo soltó.
  - Declaración: `pub const DROP_SCATTER: f64 = 0.35;`
- [`PICKUP_REACH`](ground.rs#L15) — Distancia máxima de los pies a un montón para recogerlo.
  - Declaración: `pub const PICKUP_REACH: f64 = 0.55;`
- [`PICKUP_DELAY_TICKS`](ground.rs#L19) — Ticks que un montón nuevo espera en el suelo antes de poder recogerse: lo justo para verlo caer.
  - Declaración: `pub const PICKUP_DELAY_TICKS: u32 = 10;`
- [`PICKUP_LEVEL_REACH`](ground.rs#L22) — Bloques máximos entre un montón y los pies para recogerlo.
  - Declaración: `pub const PICKUP_LEVEL_REACH: f64 = 1.5;`
- [`DROPS_PART`](ground.rs#L25) / [`DROPS_PART_VERSION`](ground.rs#L27) — Clave y versión de la parte de los montones dentro de `systems`.

#### Tipos

- [`Drop`](ground.rs#L31) — Un objeto en el suelo o un montón de un guardado anterior: id, item, cantidad, dónde está, en qué bloque, de dónde salió y cuántos ticks le quedan de espera.
- [`Felled`](ground.rs#L49) — Lo derribado, tal como lo necesita la caída: id de instancia, ancla y bloque.
- [`StackGain`](ground.rs#L58) — El slot de destino, el ítem y las unidades depositadas durante la recogida de un montón.
- [`Collected`](ground.rs#L66) — Los totales recogidos por tipo de objeto, los depósitos por slot y si algo al alcance quedó fuera.
- [`Drops`](ground.rs#L74) — Todos los montones del suelo.
