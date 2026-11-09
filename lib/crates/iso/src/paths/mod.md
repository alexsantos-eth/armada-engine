# Paths

Este dominio resuelve rutas deterministas sobre la rejilla. Expone las estructuras y la búsqueda necesarias para recorrer el mundo sin conocer la escena, los controles ni el renderer.

Los costes, vecindades y criterios de transitabilidad deben declararse como datos o dependencias explícitas. Una ruta calculada debe ser reproducible para las mismas entradas y no modificar el estado del mundo durante la consulta.

No anima personajes ni decide la intención del jugador; esos consumidores interpretan la ruta resultante desde sus propios dominios.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `astar.rs`

#### Funciones y métodos

- [`find_path`](astar.rs#L47) — Find a cheapest side-neighbour path inside an inclusive rectangle.
  - Firma: `pub fn find_path<G, C, H>( area: WorldRect, starts: &[WorldCoord], mut is_goal: G, mut cost: C, mut heuristic: H, ) -> Option<Vec<WorldCoord>> where G: FnMut(WorldCoord) -> bool, C: FnMut(WorldCoord, WorldCoord) -> f64, H: FnMut(WorldCoord) -> f64, {`

#### Constantes

- [`PATH_STEPS`](astar.rs#L9) — Side neighbours in the same order as the game contract: +x, +y, -x, -y.
  - Declaración: `pub const PATH_STEPS: [WorldCoord; 4] = [ WorldCoord { x: 1, y: 0 }, WorldCoord { x: 0, y: 1 }, WorldCoord { x: -1, y: 0 }, WorldCoord { x: 0, y: -1 }, ];`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `astar.rs`

#### Funciones internas

- [`eq`](astar.rs#L24) — Calcula o recupera «eq» según los parámetros de la firma.
  - Firma: `fn eq(&self, other: &Self) -> bool {`

- [`partial_cmp`](astar.rs#L32) — Calcula o recupera «partial cmp» según los parámetros de la firma.
  - Firma: `fn partial_cmp(&self, other: &Self) -> Option<Ordering> {`

- [`cmp`](astar.rs#L38) — Calcula o recupera «cmp» según los parámetros de la firma.
  - Firma: `fn cmp(&self, other: &Self) -> Ordering {`
