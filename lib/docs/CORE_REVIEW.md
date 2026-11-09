# CORE_REVIEW.md — deuda del core del motor

Backlog vivo de revisiones del core (skill `armada-core-review`). Cada entrada documenta un hallazgo: fecha, nivel (Bloqueante / Alta / Media / Baja), archivo:línea, impacto en la visión del juego, y estado (corregido / pendiente / plan propuesto / descartado y por qué).

No hay hallazgos registrados todavía. Las revisiones futuras añaden aquí sus pendientes; las correcciones se retiran cuando entran con código y tests.

| Fecha | Hallazgo | Nivel | Archivo | Estado |
| ----- | -------- | ----- | ------- | ------ |
| 2026-11-08 | `WORLD_SEED` con cero a la izquierda (`09543`), `zero_prefixed_literal` de clippy rompe el gate `-D warnings`; era valor decimal, se conserva | Baja | crates/iso/src/terrain/generation.rs | corregido (`9543`, sin cambio de valor) |

Revisión 2026-11-08 (foco: `touch/`, `services::MacroquadInput`, `gui::hud::help_line`, `loops::run`; contexto: resto de crates): sin hallazgos Bloqueante, Alta ni Media. Notas descartadas: el orden arbitrario de `touches()` (HashMap de macroquad) no afecta al resultado porque las zonas de cambio se asignan por hit test independiente; `TouchControls::draw`, `TouchFrame` y la lectura de `touches()` son código GPU/ventana/IO no aislable y se verifican manualmente (ver `touch/mod.md`).

Revisión 2026-11-08 (foco: reflejos de agua en el cliente — `src/water/reflection_view.rs`, `src/assets/sprites.rs` y tests; contexto: resto del pipeline de dibujo y `iso::water`): sin hallazgos Bloqueante, Alta ni Media. Notas: (1) la ventana de búsqueda del reflejo se abrió de forma simétrica con `MAX_REFLECTION_DROP` porque el pivote del volteo ahora se centra entre los pies y la superficie (el reflejo sube hacia la orilla); en acantilados extremos (desnivel de más de unas casillas) el pie del reflejo podría recortarse: aceptado, es Baja y el pie es la parte menos visible. (2) El reflejo se dibuja sin desenfoque: se probó uno por pasadas desplazadas (`REFLECTION_TAPS`) y se retiró el mismo día por decisión del usuario; un desenfoque real se implementará cuando el motor pase a su fase de render target, pendiente de esa fase. (3) Sin Hallazgo de rendimiento pendiente: la pasada única por pieza se restaura tras la retirada del blur.

Revisión 2026-11-08 (foco: fix de reflejo del salto — `src/water/reflection_view.rs`, `src/game/scene.rs`, `src/water/reflection_view.test.rs`): sin hallazgos Bloqueante, Alta ni Media. Notas: (1) el volteo ahora se pivota entre los pies en el suelo y la superficie (`lift` descuenta el desnivel del salto), por lo que el reflejo se hunde bajo la línea de agua con el lift en vez de deslizarse; cubierto por `a_jumping_sprite_sinks_its_reflection_by_the_lift`. (2) El pie del reflejo puede recortarse en acantilados extremos, como en la revisión anterior: aceptado, es Baja. (3) `lift = 0.0` para entidades: sin cambio funcional fuera del jugador.
