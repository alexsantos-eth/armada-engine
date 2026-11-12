# Paths

Este dominio resuelve rutas deterministas sobre la rejilla. Expone las estructuras y la búsqueda necesarias para recorrer el mundo sin conocer la escena, los controles ni el renderer.

Los costes, vecindades y criterios de transitabilidad deben declararse como datos o dependencias explícitas. Una ruta calculada debe ser reproducible para las mismas entradas y no modificar el estado del mundo durante la consulta.

No anima personajes ni decide la intención del jugador; esos consumidores interpretan la ruta resultante desde sus propios dominios.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `astar.rs`

#### Funciones y métodos

- [`find_path`](astar.rs#L47) — Encuentra un camino más barato por vecinos laterales dentro de un rectángulo inclusivo.
  - Firma: `pub fn find_path<G, C, H>( area: WorldRect, starts: &[WorldCoord], mut is_goal: G, mut cost: C, mut heuristic: H, ) -> Option<Vec<WorldCoord>> where G: FnMut(WorldCoord) -> bool, C: FnMut(WorldCoord, WorldCoord) -> f64, H: FnMut(WorldCoord) -> f64, {`

#### Constantes

- [`PATH_STEPS`](astar.rs#L9) — Vecinos laterales en el mismo orden que el contrato del juego: +x, +y, -x, -y.
  - Declaración: `pub const PATH_STEPS: [WorldCoord; 4] = [ WorldCoord { x: 1, y: 0 }, WorldCoord { x: 0, y: 1 }, WorldCoord { x: -1, y: 0 }, WorldCoord { x: 0, y: -1 }, ];`

### `roads.rs`

#### Funciones y métodos

- [`new`](roads.rs) — Construye un conector de estructura con sus casillas laterales de acceso, ordenadas y sin duplicados.
  - Firma: `pub fn new(anchor: WorldCoord, access_cells: impl IntoIterator<Item = WorldCoord>) -> Self {`
- [`access_cells`](roads.rs) — Devuelve las casillas candidatas para la entrada de camino de la estructura.
  - Firma: `pub fn access_cells(&self) -> &[WorldCoord] {`
- [`connect_roads`](roads.rs) — Materializa un árbol de caminos determinista entre conectores, sin cruzar agua, ocupación ni desniveles mayores a un bloque, y convierte en gradas cada bloque que queda un nivel por encima del camino contiguo.
  - Firma: `pub fn connect_roads(columns: &mut [TerrainColumn], connectors: &[RoadConnector], occupied: &[WorldCoord]) -> usize {`
- [`place_stairs`](roads.rs) — Convierte en gradas todo bloque de camino que queda un nivel por encima del camino de al lado, y devuelve cuántas colocó. La regla es `terrain::stairs_direction`, leída sobre una instantánea del camino anterior a cualquier cambio, así que una cuesta de varios niveles sale igual en cualquier orden de recorrido.
  - Firma: `pub fn place_stairs(columns: &mut [TerrainColumn]) -> usize {`

#### Tipos

- [`RoadConnector`](roads.rs) — Estructura que pide una entrada conectada a la red de caminos.
  - Declaración: `pub struct RoadConnector { ... }`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `astar.rs`

#### Funciones internas

- [`eq`](astar.rs#L24) — Igualdad por coste/coordenada de la entrada en la cola.
  - Firma: `fn eq(&self, other: &Self) -> bool {`

- [`partial_cmp`](astar.rs#L32) — Orden parcial por coste para la cola (inverso del natural).
  - Firma: `fn partial_cmp(&self, other: &Self) -> Option<Ordering> {`

- [`cmp`](astar.rs#L38) — Orden total por coste para la cola (inverso del natural).
  - Firma: `fn cmp(&self, other: &Self) -> Ordering {`
