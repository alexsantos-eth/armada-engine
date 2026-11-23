# Services

Este dominio declara los puertos para entrada, audio e interfaz que el cliente debe implementar. Establece límites explícitos entre reglas de juego y efectos del exterior mediante traits y tipos de intercambio.

Las interfaces deben ser pequeñas, orientadas a capacidades y no filtrar tipos del backend. Las implementaciones concretas viven en los clientes o en adaptadores de infraestructura.

No contiene lógica visual ni acceso directo a plataforma. Los cambios en un puerto deben acompañarse de pruebas de contrato en sus consumidores.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `audio.rs`

#### Funciones internas

- [`play`](audio.rs#L27) — Reproduce un sonido de una sola vez.
  - Firma: `fn play(&mut self, event: SoundEvent);`

- `play_with_volume` — Reproduce un sonido de una sola vez escalado a `volume` (0.0..=1.0). La implementación por defecto ignora el volumen y delega en `play`.
  - Firma: `fn play_with_volume(&mut self, event: SoundEvent, volume: f64) { ... }`

- `play_loop` — Sustituye el bucle actual por `sound` (`None` lo detiene). La implementación por defecto no hace nada.
  - Firma: `fn play_loop(&mut self, sound: Option<SoundLoop>) { ... }`

- `set_ambient` — Mantiene el fondo `sound` (`AmbientLoop`) sonando a `volume` (0.0..=1.0), o en silencio a `0.0`. La implementación por defecto no hace nada.
  - Firma: `fn set_ambient(&mut self, sound: AmbientLoop, volume: f64) { ... }`

- `set_volume` — Establece el volumen maestro (0.0..=1.0).
  - Firma: `fn set_volume(&mut self, volume: f64);`

Los tipos de intercambio son `SoundEvent` (`Jump`, `AirJump`, `Land`, `Footstep`, `Climb`, `Skid`, `HarvestHit`, `HarvestFell`, `ItemDrop`, `ItemCollect`, `RabbitHop`, `CrabStep`, `BirdCall(n)` con `n < BIRD_CALLS`; es `Copy`), `SoundLoop` (`Walk(Footing)`, `Run(Footing)`, `Jetpack`), `Footing` (`Grass`, `Sand`, `Dirt`, `Stone`; `Footing::of` agrupa las superficies del terreno por cómo suenan: camino y gradas son `Stone`, tierra es `Dirt`, agua no tiene) y `AmbientLoop` (`Wind`, `Fire`, `Geyser`), los fondos que suenan todos a la vez, cada uno a su volumen.

### `soundscape.rs`

Lo fuerte que suena el mundo desde donde está el jugador. Puro; el cliente junta las fuentes (`src/game/soundscape.rs`) y las reproduce.

- `distance_gain(distance)` — `1.0` hasta `HEARING_NEAR` (1,5 columnas), cae con el cuadrado de lo que queda hasta `0.0` en `HEARING_FAR` (12 columnas).
- `distance(a, b)` — Columnas entre dos puntos de la rejilla.
- `combined(gains)` — Varias fuentes de un tipo oídas juntas, `1 − Π(1 − g)`: dos fuegos suenan más que uno sin pasar nunca de `1.0`.
- `ease_volume(current, target, elapsed_ms)` — Un fondo camino de su nivel, con semivida `AMBIENT_EASE_HALF_LIFE_MS` (180 ms), para que lo que entra en pantalla o una racha crezcan en vez de saltar.
- `wind_level(strength, time_ms)` — El viento según el `windStrength` del bioma, con rachas lentas.
- `bird_level(phase)` — Cuánto cantan los pájaros: más al amanecer, menos de día, poco al atardecer, nada de noche.
- `bird_call_due(level, elapsed_ms, since_last_ms, roll)` — Si canta un pájaro ahora: nunca antes de `BIRD_CALL_GAP_MS` (dos minutos) desde el último, y pasado ese hueco con una probabilidad por minuto de `BIRD_CALLS_PER_MINUTE` por `level`. Con muchos árboles al amanecer sale un canto cada tres minutos más o menos; con pocos, más espaciado. Los pájaros no son un fondo continuo.
- `geyser_level(gain, blow)` — Un géiser: `GEYSER_QUIET` del volumen mientras solo humea, entero en lo alto de la erupción.
- `footfall_of(kind)` y `footfall_sounds(before, npcs, listener)` — La pisada de cada animal y las de los que pisaron desde `before` (ids y `Npc::footfalls`): una por tipo, al volumen del más cercano, para que una manada no se amontone; los que no se oyen quedan fuera.
- Constantes: `HEARING_NEAR`, `HEARING_FAR`, `AMBIENT_EASE_HALF_LIFE_MS`, `BIRDS_PER_TREE` (lo que suma un árbol al canto), `BIRD_CALL_GAP_MS`, `BIRD_CALLS_PER_MINUTE`, `GEYSER_QUIET`.

### `input.rs`

#### Funciones internas

- [`poll`](input.rs#L22) — Sondea el estado actual de la entrada. Se llama una vez por fotograma.
  - Firma: `fn poll(&mut self) -> NormalizedInput;`
  - `NormalizedInput` lleva `walk`, `jump_pressed`, `jump_held`, `run` `jetpack_pressed` y `gather_held` (la tecla de recolectar mantenida: el trabajo sobre lo que está al alcance avanza mientras se mantiene). `jetpack_pressed` es la pulsación de la tecla que se pone el jetpack, no un mantenido: el cliente alterna el equipo con ella, y volar es mantener la tecla de salto.

### `ui.rs`

#### Funciones internas

- [`push`](ui.rs#L23) — Envía un evento a la capa de UI.
  - Firma: `fn push(&mut self, event: UiEvent);`
