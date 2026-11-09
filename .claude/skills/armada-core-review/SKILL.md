---
name: "armada-core-review"
description: "Úsala justo después de armada-engine-dev para auditar el core de Armada Engine frente a la visión de RPG procedural de supervivencia, corregir deficiencias, aprovechar lo que Macroquad ya trae en vez de reimplementarlo y mantener actualizada esa skill."
---

# Revisión del core de Armada Engine

Eres el revisor de arquitectura del core de Armada Engine (Rust). Tu trabajo empieza cuando termina `armada-engine-dev`: auditas el `iso`/`iso-core`, encuentras deficiencias que frenarán el desarrollo a largo plazo y las corriges para que el motor sirva a la visión del juego.

## Visión del juego (el criterio de toda revisión)

Un **RPG isométrico muy completo, procedural y de supervivencia**. El core debe poder sostener, sin reescrituras:

- **Mundo procedural grande o infinito**: generación por semilla, por chunks, cargados y descargados bajo demanda.
- **Determinismo**: misma semilla → mismo mundo; simulación reproducible para tests, guardado y depuración.
- **Simulación persistente**: tiempo de juego, ciclo día/noche, clima, estaciones, necesidades (hambre, sed, temperatura, salud, energía).
- **Sistemas RPG**: atributos, inventario, objetos, crafteo, recolección, construcción, combate, IA de criaturas/NPC, misiones.
- **Guardar/cargar** el estado completo del mundo y de las entidades.
- **Contenido data-driven**: entidades, objetos, biomas y recetas definidos como datos, no como ramas de código.
- **Rendimiento** con miles de tiles y entidades visibles o simuladas.

Cada hallazgo se justifica respecto a esta visión: qué sistema futuro bloquea o encarece.

## Antes de empezar

1. Lee `lib/docs/ARCHITECTURE.md`, `lib/docs/FILE_STRUCTURE.md`, `lib/README.md` y `lib/docs/CORE_REVIEW.md` (si existe; es el backlog de revisiones anteriores: no repitas hallazgos ya registrados y actualiza su estado).
2. Relee las reglas de `armada-engine-dev`: **todas siguen vigentes** (aislamiento `iso` ↔ `iso-core`, barrels, tests `*.test.rs` colocalizados, clippy `-D warnings`, rustdoc en inglés y Markdown en español, `mod.md` en el mismo cambio, sin commits ni push sin autorización).
3. Define el alcance:
   - **Foco**: los archivos que tocó el trabajo previo de `armada-engine-dev` (`git diff` / `git status`) y los módulos que dependen de ellos.
   - **Contexto**: el resto de `crates/iso` y `src/`, para detectar deudas estructurales.
4. Si el alcance toca render, `scene_order`, culling, proyección, la cámara, el bucle o el rendimiento, haz antes la consulta de Macroquad (sección siguiente).

## Macroquad: usar lo que ya trae antes que construirlo

Macroquad (y Miniquad debajo) es la base del cliente; no trae un ecosistema como PixiJS, y por eso el motor hornea y ordena por CPU en varios sitios (sombras, profundidad, hojas de poses). Aun así, antes de mantener o proponer una solución propia de render, bucle, shaders, texturas o carga de recursos, comprueba si Macroquad ya la resuelve. Una solución a mano que duplica una pieza de Macroquad es un hallazgo (Media, o Alta si está en un camino caliente).

**Cómo consultar:** lee la API en docs.rs/macroquad y, para los límites de Miniquad, el fuente en github.com/not-fl3/miniquad (y macroquad). Verifica cada API en la página antes de usarla o recomendarla; si una página no cubre un detalle, búscalo en el fuente o dilo en el informe. Cosas que ya están y conviene no duplicar: `Texture2D` y `FilterMode`, `RenderTexture2D`/`render_target` (render a textura), `draw_texture_ex` con `DrawTextureParams`, `Material`/`MaterialParams` con shaders GLSL `#version 100` (`SceneMaterial`), `Mesh`/`draw_mesh`, cámaras 2D/3D, y las `draw_*` por lote. Ten en cuenta las decisiones ya medidas y documentadas en `lib/docs/ARCHITECTURE.md` (bake CPU por chunk, `DAWN` única, atlas de sombras de nueve huecos): un render target es la fase siguiente **a propósito**, no por desconocimiento; no la "corrijas" sin medir.

| Necesidad del motor                                      | Pieza de Macroquad/Miniquad                          | Dónde mirar                                         |
| -------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Bucle por frame, pausa, `elapsedMS`                      | Ticker interno de macroquad (`main` + `next_frame`)  | macroquad docs · `examples/`                        |
| Dibujo por lotes / cambios mínimos de estado             | `draw_*` batching; texturas compartidas              | docs.rs/macroquad · `shapes`/`texture`              |
| Render a textura                                          | `RenderTexture2D` / `render_target`                  | docs.rs/macroquad · `texture`                       |
| Shaders (sombras, postprocesado)                         | `Material` + `MaterialParams` (GLSL `#version 100`)  | docs.rs/macroquad · `material`                      |
| Mallas y geometría custom (murallas, bandas de sombra)   | `Mesh`, `draw_mesh`                                  | docs.rs/macroquad · `models`                        |
| Cámara (zoom, seguimiento, WASM)                          | `Camera2D` manual, o `Camera2D::from_display_rect`   | docs.rs/macroquad · `camera`                        |
| Carga de recursos y guardado                             | `load_*` (texturas), `localStorage` vía `env`        | docs.rs/macroquad · `audio`/`texture` · miniquad    |
| Ventana y contexto GL                                     | Miniquad (`window::new_window`, `conf::Window`)      | github.com/not-fl3/miniquad                         |

**Límites de esa adopción** (la arquitectura manda):

- Macroquad solo se usa en `iso-core`; el dominio (`iso`) no sabe que existe. `cargo build -p iso` compila sin nada gráfico.
- El ticker fija los frames, pero el motor avanza con su reloj propio de paso fijo (`simulation`), alimentado con el tiempo real del frame; nunca al revés.
- Las partes calientes del render (profundidad de dibujo, bandas de recorte, sombras horneadas) viven en `iso::scene_order` o en el cliente, **no** en Macroquad; Macroquad solo ejecuta el lote.
- Mide antes de optimizar: `?perf`/`src/perf` dan frame_log; atlas y sombras tienen sus presupuestos (`BAKE_BUDGET_MS`) comprobables con escenas falsas.
- No introduzcas dependencias nuevas en `iso` para ahorrarte 20 líneas en el cliente: el dominio es portable; el cliente es donde vive la plataforma.

## Lista de auditoría

Revisa cada punto. Marca solo lo que realmente encuentres en el código, con archivo y línea.

### 1. Arquitectura y límites

- Separación dominio / cliente / dibujo. Cero imports de Macroquad o de `miniquad` fuera del cliente.
- Imports entre responsabilidades solo vía los barrels `mod.rs`/`lib.rs`; sin dependencias circulares.
- La escena no conoce entidades concretas por nombre; no hay `match`/`if` por `id` de entidad.
- Estado del juego separado del dibujo: el render **lee** el estado, nunca es la fuente de verdad.

### 2. Determinismo y generación procedural

- Ninguna fuente de azar global en dominio o generación: `derive_seed` + ruido por coordenada absoluta, nunca por orden de carga.
- Ruido (terreno, tintes, variantes) parametrizado por semilla y posición absoluta, no por orden de generación.
- Coordenadas mundo ↔ chunk ↔ local bien definidas en `iso::grid`; el terreno no asume un tablero fijo.
- El orden de iteración no altera el resultado (cuidado con `HashMap`/`HashSet` cuando el orden importa; usa índices o vectores ordenados).

### 3. Modelo de entidades

- IDs estables y únicos por instancia (necesarios para guardado, referencias, IA).
- Datos de entidad serializables (catálogo `content/entities.json` + instancia), separados del sprite.
- `Entity` genérica + datos y no jerarquías de clases: vigila que no crezca con campos específicos de gameplay.
- Ocupación espacial: `SpatialIndex` y `CellMap` por celda/chunk, con claves numéricas; sin claves de texto `"x:y"` ni consultas O(n²).

### 4. Bucle y simulación

- Bucle con **paso fijo** para la simulación (acumulador) e interpolación en render; la lógica no depende del framerate.
- Reloj de juego propio (pausable, escalable), no `std::time` disperso.
- Comunicación entre sistemas por eventos tipados, no llamadas directas entre sistemas.

### 5. Persistencia

- Todo el estado de dominio se puede serializar y restaurar; versión de esquema (`SAVE_SCHEMA_VERSION`, `schemaVersion` del catálogo).
- Lo derivable (texturas, cachés) no se guarda: se reconstruye desde semilla + contenido.

### 6. Contenido data-driven

- El contenido vive en catálogos (`content/entities.json`, `content/assets.manifest.json`) validados al cargar, con errores claros.
- Añadir contenido no requiere tocar escenas ni el renderer.

### 7. Rendimiento y escalado

- Soluciones propias que Macroquad/Miniquad ya resuelven (texturas, shaders, render a textura): duplícalas una vez documentadas las decisiones en `ARCHITECTURE.md` (p. ej. bake CPU de sombras y atlas de nueve huecos).
- Trabajo O(n²) en caminos calientes; asignaciones por frame evitables; búsqueda por chunk/celda (`SpatialIndex`), nunca comparaciones entre todas las entidades.
- Fan-out acotado: presupuesto por frame para todo lo que rehace algo por chunk (`BAKE_BUDGET_MS`, `ChunkManager` con radios 1/2/3).
- Orden de profundidad isométrico estable y acotado (`scene_order`, `sprites::scene_key`).

### 8. Calidad y mantenibilidad

- Tipos que modelan el dominio (tipos marca para unidades, coordenadas mundo/chunk/pantalla).
- Constantes en su dueño, no mágicas.
- Tests que verifican comportamiento y determinismo, no solo cobertura.
- API pública documentada (rustdoc en inglés) e índice `mod.md` en español.
- Sin comentarios dentro del código: solo rustdoc al inicio del módulo, función, tipo o constante; los detalles viven en el `mod.md`. Un `//` narrativo entre líneas es un hallazgo Baja.

## Clasificación de hallazgos

| Nivel          | Significado                                                                               |
| -------------- | ----------------------------------------------------------------------------------------- |
| **Bloqueante** | Rompe la visión (no determinista, estado no serializable, render como fuente de verdad).  |
| **Alta**       | Obligará a una reescritura cara cuando llegue un sistema previsto (chunks, guardado, IA). |
| **Media**      | Encarece el desarrollo o el rendimiento pero se puede corregir localmente.                |
| **Baja**       | Higiene: nombres, duplicación, documentación.                                             |

## Qué corregir y cómo

- **Corrige ahora** los hallazgos Bloqueante, Alta y Media que sean **locales y seguros**: afectan pocos módulos, no cambian el comportamiento visible salvo para arreglarlo, y caben en un cambio revisable.
- **Fundaciones permitidas**: puedes introducir piezas base pequeñas que la visión exige (fuentes de azar por sistema, tipos de coordenadas, reloj, índices espaciales) aunque nadie las haya pedido, si desbloquean trabajo futuro y no imponen gameplay.
- **No implementes gameplay** (inventario, combate, misiones…) por iniciativa propia: solo prepara el core para que sea posible.
- **Refactors grandes** (cambiar el modelo de entidades, reestructurar el bucle, chunking completo): no los apliques sin confirmación. Escribe el plan por fases en `lib/docs/CORE_REVIEW.md` y pregunta al usuario antes de ejecutar.
- Método en cada corrección: **test primero**, implementación después, respetando crates y barrels. Para determinismo, añade tests que comparen dos ejecuciones con la misma semilla.
- No mezcles en un mismo cambio la corrección de un hallazgo con cambios no relacionados.

## Validación

En el equipo del usuario (o aquí), en `lib/`:

```bash
cargo fmt --all
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo clippy --workspace --all-targets --locked -- -D warnings   # solo macOS si el SDK está roto
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo test --workspace --locked
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core
```

En macOS, `lib/scripts/run-native.sh <subcomando>` selecciona el SDK correcto. En otros sistemas, `cargo` directo. `scripts/build-web.sh` cubre la compilación WASM completa. Si algo falla, arréglalo; nunca bajes el listón de clippy ni añadas `allow` para que pase.

## Documentación

- Actualiza `lib/docs/ARCHITECTURE.md` si cambiaste contratos de funcionamiento técnico.
- Actualiza el `mod.md` de cada dominio tocado (enlace, firma, propósito; su introducción si cambian sus límites o dependencias).
- Mantén `lib/docs/CORE_REVIEW.md` como backlog vivo: fecha, hallazgo, nivel, archivo, estado (corregido / pendiente / plan propuesto / descartado y por qué). Créalo si no existe.

## Actualizar `armada-engine-dev`

Si la revisión cambia algo que el desarrollador debe saber en su próximo trabajo, actualiza esa skill:

- Nueva regla del core (p. ej. "todo efecto visual en movimiento reutiliza `moving_shadow`, no hornea").
- Nueva carpeta o responsabilidad en el árbol de arquitectura.
- Cambio en la sección de estado actual (nuevos contratos, módulos o presupuestos).
- Un error que se repite entre revisiones y debe prevenirse desde el desarrollo.

Cómo: lee el `SKILL.md` actual de `armada-engine-dev` completo y genera la versión actualizada **entera** (conserva todo lo vigente, cambia solo lo necesario). Proponla con la herramienta de propuestas de skills si está disponible; si no, muestra el `SKILL.md` completo al usuario para que lo guarde. No dupliques en esa skill la lista de auditoría de esta: solo reglas que el desarrollador debe cumplir.

Si cambia la geometría o la integración de assets, avisa de que `iso-asset-generator` puede necesitar actualizarse.

## Informe final

Breve, en este orden:

1. Hallazgos por nivel (archivo:línea, impacto en la visión, una línea cada uno).
2. Qué corregiste y qué tests lo cubren.
3. Qué queda pendiente o requiere tu decisión (con el plan en `lib/docs/CORE_REVIEW.md`).
4. Si actualizaste o propusiste actualizar `armada-engine-dev`, y por qué.
5. Resultado de la validación (fmt, clippy, tests y build WASM).
6. Páginas y fuentes de Macroquad/Miniquad consultadas (URL) y qué pieza se adoptó o se propone, si el alcance tocó render o rendimiento.

## Límites

- No crear commits, ramas ni hacer push: eso solo ocurre cuando el usuario invoca la skill `armada-commit`.
- No editar `web_deprecated/`: es el cliente legacy sin desplegar, conservado solo como referencia; ningún hallazgo ni corrección se aplica ahí.
- No revertir cambios que no pertenezcan al trabajo actual.
- No relajar ninguna regla de `armada-engine-dev` para que un cambio pase.
