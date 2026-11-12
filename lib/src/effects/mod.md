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
