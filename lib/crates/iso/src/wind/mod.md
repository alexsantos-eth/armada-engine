# Wind

Este dominio modela el empuje del viento sobre lo que se mece: el desplazamiento horizontal de la punta de un sprite con `sway` (hoy, la copa de un árbol), como función pura del tiempo real, de los parámetros del sprite (`cut`, `amplitude`, `period` de su blueprint) y de la fuerza del viento sobre su columna. Es estado de vista, como la cámara: va en tiempo real, no en ticks, y nunca se guarda ni influye en el mundo.

Los parámetros de mece viven en el contenido (`entities.json`, `asset.sway`); la fuerza por región, en el bioma (`windStrength` en `biomes.json`); la fase de cada instancia sale de un hash de su id, así que dos árboles vecinos no se mecen al unísono y un árbol se mece igual siempre que se muestra. El cliente decide cómo aplica el desplazamiento (hoy: la copa se dibuja sesgada alrededor del corte; el tronco no se mueve).

No conoce texturas, sprites ni Macroquad: el cliente traduce el desplazamiento a geometría de dibujo.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `mod.rs`

#### Funciones

- [`sway_phase`](mod.rs#L21) — Fase (radianes, en `[0, 2π)`) de la entidad con este `id` de instancia: un hash de él (`derive_seed(0, "sway@{id}")`), de modo que los vecinos no se mecen al unísono y la instancia se mece igual siempre que se muestra.
  - Firma: `pub fn sway_phase(id: &str) -> f64 {`

- [`sway_offset`](mod.rs#L30) — Desplazamiento horizontal de la punta del sprite (píxeles de mundo, positivo a la derecha) en el instante `time_ms`: una onda principal de `sway.period` más [`SWAY_GUST_WEIGHT`](mod.rs#L13) de otra onda [`SWAY_GUST_RATE`](mod.rs#L16) veces más rápida, desplazada por `phase` ([`sway_phase`](mod.rs#L21)), nunca más allá de `sway.amplitude × strength`.
  - Firma: `pub fn sway_offset(sway: &EntitySway, phase: f64, time_ms: f64, strength: f64) -> f64 {`

#### Constantes

- [`DEFAULT_WIND_STRENGTH`](mod.rs#L9) — La fuerza del viento cuando nada la dice (sin contenido de biomas): cada mece a su amplitud de autor por 1,5 (el antiguo default del cliente).
  - Declaración: `pub const DEFAULT_WIND_STRENGTH: f64 = 1.5;`

- [`SWAY_GUST_WEIGHT`](mod.rs#L13) — Peso de la segunda onda, más rápida, en [`sway_offset`](mod.rs#L30): lo que impide que un mece marque el ritmo como un metrónomo.
  - Declaración: `pub const SWAY_GUST_WEIGHT: f64 = 0.3;`

- [`SWAY_GUST_RATE`](mod.rs#L16) — Cuántas veces es más rápida la segunda onda de [`sway_offset`](mod.rs#L30) que la primera.
  - Declaración: `pub const SWAY_GUST_RATE: f64 = 2.3;`
