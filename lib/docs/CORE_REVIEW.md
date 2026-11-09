# CORE_REVIEW.md — deuda del core del motor

Backlog vivo de revisiones del core (skill `armada-core-review`). Cada entrada documenta un hallazgo: fecha, nivel (Bloqueante / Alta / Media / Baja), archivo:línea, impacto en la visión del juego, y estado (corregido / pendiente / plan propuesto / descartado y por qué).

No hay hallazgos registrados todavía. Las revisiones futuras añaden aquí sus pendientes; las correcciones se retiran cuando entran con código y tests.

| Fecha | Hallazgo | Nivel | Archivo | Estado |
| ----- | -------- | ----- | ------- | ------ |
| 2026-11-08 | `WORLD_SEED` con cero a la izquierda (`09543`), `zero_prefixed_literal` de clippy rompe el gate `-D warnings`; era valor decimal, se conserva | Baja | crates/iso/src/terrain/generation.rs | corregido (`9543`, sin cambio de valor) |

Revisión 2026-11-08 (foco: `touch/`, `services::MacroquadInput`, `gui::hud::help_line`, `loops::run`; contexto: resto de crates): sin hallazgos Bloqueante, Alta ni Media. Notas descartadas: el orden arbitrario de `touches()` (HashMap de macroquad) no afecta al resultado porque las zonas de cambio se asignan por hit test independiente; `TouchControls::draw`, `TouchFrame` y la lectura de `touches()` son código GPU/ventana/IO no aislable y se verifican manualmente (ver `touch/mod.md`).
