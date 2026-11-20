# Effects — partículas ambientales

Dominio de cliente (`iso-core`) que siembra y dibuja las partículas de ambiente: motas de polen bajo el sol y luciérnagas en la noche. Son estado de vista, como el polvo del jugador y las nubes: van en tiempo real (no en ticks), nunca se guardan y el mundo no sabe que existen. Lo que hay en el aire lo deciden la fase efectiva y el suelo bajo el jugador; hacia dónde va, el viento, con una racha lenta modulada por el tiempo real y la fuerza del viento del bioma.

## Qué hace falta fuera

- El reloj del mundo (`Game::clock`) y el override del HUD (`Game::phase_override`, en nativo y `/playground`), para saber la fase con `iso::lighting::phase_at`.
- El `ChunkManager`, para la altura del suelo (`column_at(...).elevation`), la superficie (`c.surface`) y la fuerza del viento del bioma (`biomes()` → `world.biome(x, y).wind_strength`). Sin biomas en juego, `iso::wind::DEFAULT_WIND_STRENGTH`.

## API pública

### `ambient.rs`

- [`AmbientKind`](ambient.rs) — enum de las dos clases: `Pollen`, `Firefly`.
- [`SpawnEnv<'a>`](ambient.rs) — qué se ve donde pueden nacer: `center_x`/`center_y` (punto de mira de la cámara, en columnas), `phase` (fase efectiva), `time_ms` (para las rachas), y tres prestados: `height_at`, `surface_at` y `wind_at` (fuerza del viento en la columna).
- [`AmbientParticles::new(seed: u64)`](ambient.rs) — el enjambre vacío; el cliente pasa `WORLD_SEED`, los tests una semilla fija.
- [`AmbientParticles::live(&self) -> usize`](ambient.rs) — cuántas hay en el aire.
- [`AmbientParticles::update(&mut self, elapsed_ms: f64, env: &SpawnEnv)`](ambient.rs) — envejece y deriva las vivas, descarta las que mueren o se alejan, y gasta los acumuladores de nacimiento (una tirada por clase y frame como mucho).
- [`AmbientParticles::collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>)`](ambient.rs) — encola cada una como un vóxel chunky con `scene_key(..., ENTITY_LAYER, ...)`; heredan la profundidad, el grade de fase y el tilt-shift del pase de presentación.
- [`fade(age_ms: f64, life_ms: f64) -> f64`](ambient.rs) — `pub(crate)`; 0 al nacer y al morir, 1 en medio (smoothstep en los dos bordes de 700 ms).
- [`firefly_pulse(age_ms: f64, phase: f64) -> f64`](ambient.rs) — `pub(crate)`; el parpadeo de la luciérnaga en `[0.1, 1]`.
- `MAX_PARTICLES: usize = 200` — tope global de la bolsa; por debajo, las tasas por clase deciden.

## Reglas de aparición

| Clase | Cuándo | Dónde |
| ----- | ------ | ----- |
| Polen | Día, amanecer o atardecer (12/s) | Cualquier suelo que no sea agua |
| Luciérnaga | Noche (6/s) o atardecer (3/s) | Hierba o tierra desnuda |

El nacimiento se dispara con un disco de `SPAWN_RADIUS` (15) columnas alrededor del jugador; una partícula se descarta pasadas las 20 columnas o al terminar su vida (6–9 s el polen, 5–8 s la luciérnaga). El scatter sale de un xorshift64* propio: misma semilla y mismos frames → mismo enjambre.

## Límites

- Nada de esto toca el dominio ni el guardado; si un efecto necesita el mundo, se decide aquí leyendo columnas, nunca escribiéndolas.
- Los vóxeles se dibujan enteros (sin recorte a casillas ni sombra propia); a 5–9 px desaparecen en el tilt-shift.

## Fuego (`fire.rs`)

Llamas, chispas y humo de las entidades con `asset.fire` (la fogata). Mismo contrato que las partículas ambientales: tiempo real, vóxeles con `ENTITY_LAYER`, nada se guarda.

- [`FireSpot`](fire.rs) — un fuego en pantalla: `x`/`y` (centro de su casilla, en columnas) y `ground` (bloques de suelo).
- [`Flame`](fire.rs) — una lengua de llama: `dx`, `dy`, `height`, `size` y `colours` (`0xRRGGBB`, cara superior primero).
- [`Fire::new(seed: u64)`](fire.rs) / `Fire::default()` — la bolsa vacía.
- [`Fire::live(&self) -> usize`](fire.rs) — chispas y volutas en el aire.
- [`Fire::update(&mut self, elapsed_ms: f64, spots: &[FireSpot])`](fire.rs) — envejece, descarta y lanza chispas (4,5/s) y humo (2,4/s) por fuego.
- [`Fire::collect(&self, spots, time_ms, projection, draws)`](fire.rs) — encola llamas, chispas y humo.
- [`flames(time_ms: f64, phase: f64) -> [Flame; 6]`](fire.rs) — las llamas de un instante: función pura del tiempo y la fase del fuego.
- `MAX_EMBERS: usize = 160` — tope global de chispas y humo.

## Entidades animadas (`emitters.rs`)

Lo que se mueve sobre las entidades con `asset.effect` en su blueprint (`"effect": "torch"`, etc.). El sprite del atlas queda quieto; las llamas, la farola, las moscas, el vapor y las hojas se dibujan aquí como vóxeles, con las ayudas de `fire.rs` (`flames`, `fade`, `voxel_draw`, `sort_key`). Mismo contrato: tiempo real, `ENTITY_LAYER`, nada se guarda.

| `effect` | Entidad | Qué dibuja |
| -------- | ------- | ---------- |
| `torch` | `torch_post` | La llama de la fogata a la mitad, en la copa del poste; chispas (1,8/s) y un hilo de humo (0,9/s) |
| `brazier` | `brazier` | Dos llamas de la fogata lado a lado, más bajas; chispas (5/s), sin humo |
| `lantern` | `hanging_lantern` | Farola de hierro con cristal que parpadea, colgada de tres eslabones; péndulo de 2,3 s y ±0,3 rad bajo el gancho |
| `flies` | `fly_swarm`, `fly_swarm_bones`, `fly_swarm_sand` | 12 moscas en órbitas de Lissajous con zumbido, alrededor de un punto que deriva despacio |
| `geyser` | `geyser` | Ciclo de 5,2 s: vapor suave (1,4/s) y, en los últimos 1,3 s, ráfaga de gotas (90/s, gravedad 5,5 bloques/s²) y vapor (16/s) |
| `leaves` | `leaf_emitter` | Hojas (0,8/s) que caen desde 1,45–1,95 bloques con aleteo y reposan 1,6 s en el suelo |
| `candles` | `ritual_candles` | Una llamita (base naranja + punta amarilla) en cada una de las 5 mechas, desfasadas |

- [`EffectSpot`](emitters.rs) — `kind` (`iso::entities::EntityEffect`) y `at` (el `FireSpot` de la casilla).
- [`Emitters::new(seed)`](emitters.rs) / `Emitters::default()`; [`live()`](emitters.rs) cuenta lo que hay en el aire.
- [`Emitters::update(elapsed_ms, time_ms, spots)`](emitters.rs) — envejece, descarta y lanza; `time_ms` es el mismo reloj con el que se dibuja (`wind_ms`), para que el géiser sople cuando su chorro se ve.
- [`Emitters::collect(spots, time_ms, projection, draws)`](emitters.rs) — las partes propias de cada spot (función pura del tiempo y la casilla) y los motes.
- [`geyser_burst(time_ms, phase) -> f64`](emitters.rs) — 0 en reposo, sube a 1 y baja durante la ráfaga.
- `MAX_MOTES: usize = 260` — tope global de chispas, humo, gotas, vapor y hojas.

Los anclajes (la copa de la antorcha, el cuenco del brasero, el gancho de la farola, la boca del géiser, las mechas) se miden en vóxeles de los modelos de `artifacts/vox/clay/vox_buildings.py`, que los nombran en sus comentarios: si se mueve una pieza allí, hay que mover la constante aquí.

Como la fogata, las llamas reciben el grade de la fase: de noche se oscurecen igual que el resto de la escena (no hay luz emisiva).
