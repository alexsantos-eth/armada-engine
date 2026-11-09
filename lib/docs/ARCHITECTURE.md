# Arquitectura del motor (Rust)

Este documento define los límites, contratos y prácticas de la implementación en Rust con Macroquad. Es autocontenido: describe el funcionamiento técnico del juego y del workspace, sin depender de otros clientes ni de sus ficheros. Lo que hace cada módulo concreto está en su [`mod.md`](#catálogos-de-api-por-módulo), junto a su código.

**Idioma.** La documentación del workspace está en español: este documento, el [README](../README.md), [Estructura de archivos](FILE_STRUCTURE.md) y los catálogos `mod.md`. Los nombres de código y los comentarios de documentación en el código (`///`, `//!`) van en inglés; una revisión no debe mezclar los dos dentro de un mismo archivo.

## Estado del proyecto

**Implementado:** el workspace `lib`, el crate `iso` sin dependencias gráficas y el cliente Macroquad (paquete `iso-core`), `grid` con mapa de celdas e índice espacial, búsqueda `paths`, `projection`, geometría y visibilidad de `camera`, reloj `time`, acumulador de paso fijo `simulation`, el modelo y generador de `terrain`, el modelo de mundo `world` en memoria con chunks descubiertos, las sombras de `lighting` con el horneado de una fase, el guardado nativo/web y una muestra jugable en la demo nativa y WASM. El contrato del catálogo de entidades vive en `content/entities.json` (`schemaVersion` 1) y lo valida `iso::entities::validate_catalog`. **Previsto:** la composición de sistemas de simulación, las reglas de colocación de entidades, el guardado persistente de chunks y la vista definitiva con assets. Una sección prevista es un contrato de diseño, no una afirmación de que su código ya existe.

## Estructura y dependencias

```text
lib/
  crates/iso/     # crate `iso`: dominio portable y sin Macroquad
  src/            # crate `iso-core`: cliente Macroquad, binario y adaptadores
  content/        # manifiesto de assets, atlas y catálogo de entidades
  assets-src/     # SVG fuente del atlas (copia local, no se despliega)
  web/            # cargador WASM y archivos web (`/` limpio, `/playground` con GUI)
  scripts/        # utilidades de atlas y ejecución nativa
```

La regla de dependencia es `iso-core → iso`. `iso` no importa Macroquad, navegador, audio ni archivos de la escena; el cliente puede usar tipos y decisiones del dominio, pero el dominio no conoce sprites, texturas ni resolución de pantalla. Si una regla necesita pruebas sin GPU o navegador, normalmente pertenece al dominio. La estructura exacta de carpetas y archivos es la de [Estructura de archivos](FILE_STRUCTURE.md).

Cada carpeta de dominio con API pública mantiene un catálogo `mod.md` en español con sus funciones, métodos y constantes: es la referencia de qué hace cada módulo y dónde vive. La política de actualización (al cambiar el código se actualiza su `mod.md` en el mismo cambio) vive en [Estructura de archivos](FILE_STRUCTURE.md) y la resume:

- **Al añadir, renombrar, mover o eliminar** un archivo, función, método o constante de producción, se actualiza su enlace, firma y propósito en el `mod.md` de su dominio en el mismo cambio.
- El catálogo describe la API pública; los helpers privados se mantienen junto al código.

### Catálogos de API por módulo

Dominio portable, crate `iso`:

- [assets](../crates/iso/src/assets/mod.md), [camera](../crates/iso/src/camera/mod.md), [entities](../crates/iso/src/entities/mod.md), [grid](../crates/iso/src/grid/mod.md), [lighting](../crates/iso/src/lighting/mod.md), [paths](../crates/iso/src/paths/mod.md), [player](../crates/iso/src/player/mod.md), [projection](../crates/iso/src/projection/mod.md), [scene_order](../crates/iso/src/scene_order/mod.md), [services](../crates/iso/src/services/mod.md), [simulation](../crates/iso/src/simulation/mod.md), [terrain](../crates/iso/src/terrain/mod.md), [time](../crates/iso/src/time/mod.md), [water](../crates/iso/src/water/mod.md), [world](../crates/iso/src/world/mod.md)

Cliente Macroquad, crate `iso-core`:

- [assets](../src/assets/mod.md), [game](../src/game/mod.md), [gui](../src/gui/mod.md), [lighting](../src/lighting/mod.md), [loops](../src/loops/mod.md), [perf](../src/perf/mod.md), [player](../src/player/mod.md), [rendering](../src/rendering/mod.md), [save](../src/save/mod.md), [services](../src/services/mod.md), [terrain](../src/terrain/mod.md), [touch](../src/touch/mod.md), [water](../src/water/mod.md)

## Invariantes compartidas

- `World` es la fuente de verdad del juego. La escena y sus vistas mantienen solo cachés y recursos derivados. Descargar un chunk visual no elimina su contenido del mundo ni del archivo guardado.
- La rejilla usa coordenadas enteras para celdas y chunks, y posiciones fraccionarias solo para movimiento y proyección. La conversión de coordenadas negativas usa división euclídea; un chunk mide 32 × 32 celdas mientras no se cambie explícitamente el contrato.
- La proyección isométrica conserva sus ejes: `+x` aparece arriba a la derecha y `+y` arriba a la izquierda. Elevación, orden de dibujo y conversiones inversas comparten la misma configuración.
- La simulación avanza en ticks fijos de 50 ms. El tiempo del fotograma alimenta un acumulador y un factor de interpolación para dibujar; no altera las reglas de juego según los FPS.
- Las decisiones que afecten al juego usan un orden estable de iteración, desempate y eventos. No se exige que una semilla reproduzca el mundo anterior ni que vuelva a generar un mundo guardado.
- Los datos persistidos tienen versión y validación. Índices espaciales, GPU, cámara, listeners y cachés se reconstruyen; no se serializan.

### Sistema de coordenadas que se conserva

En el mundo, `x` crece hacia el noreste de la pantalla (arriba a la derecha), `y` hacia el noroeste (arriba a la izquierda), y `x+y` creciente se aleja de la cámara. `(0, 0)` es la columna del vértice sur, la más cercana a la cámara en el diagrama de referencia. `z` o `elevation` crece verticalmente hacia arriba; el nivel `0` corresponde al nivel del mar y los niveles negativos quedan bajo él. Una columna `(x, y)` va hasta `(x+1, y+1)` y su centro es `(x+0.5, y+0.5)`.

La pantalla tiene origen arriba a la izquierda, `screen_x` a la derecha y `screen_y` hacia abajo. El origen de proyección sitúa la columna `(0, 0)` dentro del canvas y no cambia los ejes del mundo. Los chunks repiten esos ejes: `(0, 0)` cubre `0..31` y una coordenada `-1` cae en el chunk `-1` con local `31`. Los assets SVG usan otro convenio de ejes; su orientación y `data-tiles` se convierten al preparar el atlas, sin cambiar el convenio del dominio.

## Flujo de un fotograma

1. `input` lee teclado, puntero y controles del cliente y los traduce a comandos de dominio. No mueve entidades directamente.
2. `app` acumula el tiempo transcurrido, aplica un límite a fotogramas largos y ejecuta cero o más ticks fijos.
3. En cada tick, los sistemas leen y modifican `World`; `time` avanza; `events` distribuye avisos tipados en orden de suscripción. Las decisiones sobre colisiones, rutas y terreno se resuelven aquí.
4. `scene` observa el estado resultante, determina los chunks visibles y sincroniza las vistas con presupuesto de trabajo por fotograma.
5. `camera`, `projection` y `render` construyen y dibujan la imagen. La interpolación afecta solo a la presentación. La escena limpia recursos de los chunks que salen de la vista.

La generación de un chunk se inicia desde el flujo de mundo, no desde una vista. El chunk generado o modificado pasa al archivo de mundo; después la escena puede mostrarlo u ocultarlo cuantas veces sea necesario. El orden exacto de sistemas y eventos se declara en un único punto de composición y se cubre con una prueba de integración.

## Cómo funciona el juego

### Generación de terreno

El generador produce columnas con alturas y materiales (agua, arena, suelo, hierba) con ruido muestreado en coordenadas absolutas de mundo, de modo que no haya costuras entre chunks ni dependencia del orden de descubrimiento. La semilla del mundo vive en un único lugar: `iso::terrain::WORLD_SEED`, que comparten el valor por defecto de `TerrainConfig`, la configuración del juego (`game/config.rs`) y los tests; sirve para reproducir escenarios, y los guardados almacenan chunks materializados, no la semilla. La elección de textura y tinte no vive en el dominio: `terrain/appearance.rs` es la regla pura de cómo se viste el suelo —un campo de tinte suave (`derive_seed`, FNV-1a) repartido por `TintZones` en paleta ordenada de oscuro a claro, y qué crece encima decidido por `VariantPicker` con tres corrientes de ruido— y el cliente lo une con el atlas. Todo es presentación: no cambia material, altura, transitabilidad ni sombras.

### Entidades y colocación

Las definiciones de entidades viven en `content/entities.json` (`schemaVersion` 1, validado por `iso::entities::validate_catalog`): huella por casilla, colisión, altura, eje de longitud, superficies admitidas. Una instancia es el blueprint más posición y orientación; las instancias tienen identidad estable para guardarse. La colocación es determinista y consulta solo el terreno; la densidad, grupos y reglas se diseñan aquí, no se heredan de ningún contenido anterior.

### Orden de dibujo y sprites

`iso::scene_order` asigna a cada elemento una clave de profundidad: posición proyectada, elevación, casilla de la huella y, como desempate, capa (`PLAYER_BEHIND_LAYER` < `ENTITY_LAYER` < `PLAYER_FRONT_LAYER`). Terreno, entidades y jugador comparten una sola clave (`sprites::scene_key`, alimentada con el centro de la casilla y su elevación), y un sprite que ocupa varias casillas se corta en bandas verticales que caen una media casilla más allá del centro de cada una. El jugador se dibuja centrado en el rombo con su `InkBox` escalado por `PLAYER_SCALE`, y se ordena por la casilla en la que está, nunca por su posición fraccionaria. Todos los bloques de terreno llenan su casilla entera, así que no hay surco entre bloques. Los bloques de sombra que proyecta se tratan igual.

### Atlas y hojas de sprites

Las texturas del juego salen de los SVG fuente (`assets-src/assets/`), no del binario: `scripts/rasterize.py` dibuja cada SVG a su tamaño de pantalla (320 px por tile de mundo) y `pack_atlas` los recorta y coloca en estanterías dentro de `content/atlas.png` (4096 px de ancho), con su `content/assets.manifest.json`. El recorte coincide con el `InkBox` medido del SVG, y `remeasure_atlas` reescribe la geometría de un atlas ya empaquetado sin rasterizar nada.

Las hojas de poses del jugador son rejillas de 16 orientaciones (una fila por punto de la rosa de los dieciséis vientos, sentido antihorario desde el este) por pose, y no caben en el atlas: reciben textura propia (`content/player-16_<hoja>.png`), con su rejilla descrita por `data-cell` en el manifiesto, de modo que la pose está en `facing * columns + pose`. Las celdas cortadas nunca caen entre píxeles, y todas comparten el `InkBox` de la plantilla del personaje.

### Sombras

`iso::lighting` está en Rust y no dibuja: define la geometría de la sombra (proyección de siluetas, alcance del rayo, fases). El cliente la hornea en CPU una vez por chunk a un mapa de un canal de alfa y se queda quieta en una fase (`DAWN`); hornear en GPU costaría el terreno y el desenfoque enteros en GLSL sin poder probarlos. El horizonte del terreno se evalúa por chunk contra un `HeightField` que llega más allá del propio chunk, con un recorrido DDA hacia el sol (`TERRAIN_RAY_REACH`), de modo que un acantilado sombrea lo que tiene debajo y oscurece a quien se meta en su sombra. Las entidades y el jugador reciben una rejilla de sombra (`ShadeLattice`) convertida en colores de vértice sobre el propio sprite. El suelo y las caras verticales se dibujan como capas de cuadriláteros apoyadas en el techo que se dibuja. Dos sombras se mueven y no se hornean: la del jugador (una geometría por frame, con su propia profundidad) y la de las nubes (un patrón sobre la vista terminada, bajo el HUD). El horneado es una máquina de estados reanudable con presupuesto por frame (`BAKE_BUDGET_MS`) y el mapa de cada chunk mostrado vive en un atlas de nueve huecos; el recorte de cámara nunca puede pedir más chunks que huecos.

### Agua y reflejos

El reflejo es el mismo sprite dibujado bocabajo colgando de la línea de agua, sin render target ni máscara: voltea el rectángulo del sprite y lo corta a las casillas de agua que cubre (`reflection_piece`), con la profundidad de cada casilla de agua. Las casillas a las que llega se sacan del propio dibujo (`reflection_cells`), solo acotadas en trabajo (`MAX_REFLECTION_CELLS`, `MAX_REFLECTION_DROP`). Una huella de varias casillas se gira media vuelta (`turn_at`) en vez de voltearse, y un asset que trae su propio reflejo dibujado (`reflectionSource` del manifiesto) se coloca como su generador lo puso. El color es `#c4dbe4` al 0,62 de opacidad, porque el shader multiplica.

### Cámara y seguimiento

`iso::camera` guarda centro, zoom y seguimiento; `camera::focus` define a qué altura mira una cámara que sigue al jugador: fija el nivel en la cima que pisa, no lo mueve durante un salto, baja con los pies en una caída y sube a una cima más alta sobre la curva de una escalada. `advance()` lleva el nivel mostrado al nivel objetivo con un resorte críticamente amortiguado (`CAMERA_LEVEL_SMOOTH_MS`, 65 ms) y el cliente solo suaviza la altura, nunca el avance por el suelo. `streaming` queda previsto: carga/descarga con presupuesto por frame, separando visibilidad de persistencia.

### Guardado

`save` persiste chunks descubiertos, entidades con estado y los objetos de estado del juego (`player`, `systems`) con sus versiones; el contenido guardado es la autoridad al reabrir, no el generador. La persistencia web implementa una interfaz de almacenamiento que una implementación nativa puede sustituir por archivos sin cambiar el formato lógico. Las versiones desconocidas o datos malformados se comunican sin `panic!`.

### Controles táctiles

En pantallas táctiles el cliente pinta dos controles en las esquinas inferiores: un joystick analógico a la izquierda y un botón SALTAR a la derecha (`src/touch`). El joystick alimenta la misma transformación de entrada que el teclado (`x = across + up`, `y = up - across`) pero con magnitud analógica recortada a deflexión máxima: a medio empuje se camina a media velocidad, y a partir de una deflexión fija (`RUN_THRESHOLD`) se enciende `run`, el equivalente a mantener `Shift`. El botón publica `jump_pressed`/`jump_held` como la barra espaciadora. Ambos controles son entrada de juego, no overlay: se pintan siempre encima de la escena, también en `/`, y aparecen en dispositivos de puntero grueso (la build web lo sabe con el import FFI `iso_pointer_coarse`) o en cualquier plataforma tras el primer toque; en escritorio con ratón no aparecen. El HUD sustituye la línea de ayuda por la de los controles cuando son visibles. El joystick sigue a un único dedo, el botón admite varios a la vez.

## Previsto (contratos de diseño, no afirmaciones)

- `input` y `app`: comandos del dominio a partir de teclado y puntero; composición del mundo, sistemas, escena y ciclo principal.
- `events` y `simulation`: eventos tipados síncronos en orden de registro; registro y ejecución de sistemas en orden declarado, con eventos de dominio y sin llamadas directas entre sistemas.
- Colocación de entidades completa (densidad, grupos, biomas, vecindad) y reglas de aparición.
- Guardado persistente de chunks (en memoria en esta fase) y migraciones versionadas del formato.
- `parts` y persistencia completa, `streaming` con presupuesto.
- Módulos ambientales (curvas de luz, viento, ondas), `water`/`effects`/`audio` definitivas y `ui` con comandos sobre el flujo de simulación.
- `scene`, `render` y `input` definitivos: listas de materiales, primitivas por capa, composición declarativa y atajos configurables en un lugar.

## Prácticas de código y documentación

- Mantener la API pública de cada módulo pequeña; exportar tipos y operaciones necesarias desde `lib.rs`. Usar tipos nuevos para unidades o coordenadas que no sean intercambiables. Validar entradas externas con `Result` y errores con contexto; reservar `assert!` para invariantes internas y tests.
- Preferir funciones puras para proyección, clasificación de materiales, costes, cálculos de cámara y traducción de entrada. Inyectar azar, reloj y almacenamiento cuando una regla de dominio los necesite. Evitar estado global mutable y dependencia implícita del orden de `HashMap`.
- Usar `i32` o enteros tipados para rejilla y ticks; `f64` para cálculos de dominio que requieren precisión; `f32` en el límite gráfico. Documentar conversiones, rangos y redondeos. `unsafe` está prohibido en `iso`.
- Cada módulo comienza con rustdoc en inglés que explica propósito, invariantes, unidades y dependencias admitidas. Los tipos públicos documentan sus campos y errores relevantes; los ejemplos ilustran contratos, no duplican la implementación.
- La documentación Markdown se escribe en español. `ARCHITECTURE.md` se limita al funcionamiento técnico y a las decisiones del juego; el detalle de cada módulo vive en su `mod.md`, actualizado en el mismo cambio que el código. Las cifras de rendimiento son referencia observada, no umbrales automáticos.
- Un cambio de comportamiento incluye prueba del límite que lo justifica. Los tests de regresión describen el resultado esperado; no imitan línea por línea la función probada. Extraer helpers compartidos solo cuando haya dos usos reales.
- Marcar una capacidad como implementada solo cuando tenga código y pruebas.

## Tests y puertas de calidad

**Dominio:** pruebas unitarias colocalizadas como `<archivo>.test.rs` para invariantes locales; cada archivo de producción las incluye solo bajo `#[cfg(test)]`. Las pruebas de integración en `crates/iso/tests/` verifican relaciones entre módulos y contratos externos. Probar bordes y propiedades para coordenadas, guardado y generación. El fixture de contrato (`crates/iso/tests/contracts.json`) fija coordenadas, proyección, movimiento, rutas y reloj. Los resultados exactos del terreno y de las entidades se prueban con fixtures propios.

**Cliente:** probar transformaciones y composición con datos pequeños sin abrir GPU cuando sea posible. Usar pruebas visuales y recorridos manuales en nativo y WASM para profundidad, elevación, carga de assets, cámara, controles y persistencia. Guardar capturas de referencia de escenas concretas y registrar ventana, resolución y condiciones al comparar rendimiento.

**Comandos desde `lib/`:**

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core
```

Cuando se modifique el fixture de contrato, ejecutar la suite del crate (`cargo test -p iso`). La cobertura del dominio Rust sirve para localizar huecos, con especial atención a ramas de error, límites y persistencia; no se impone un porcentaje global que incentive tests redundantes. Antes de cerrar una fase de cliente, arrancar el binario nativo y el WASM servido por HTTP y comprobar la interacción real.

## Cómo extender sin romper los límites

- **Material:** declarar su identidad y propiedades en `terrain`; añadir apariencia al catálogo de `assets`; probar clasificación, columna visible y textura en una escena pequeña.
- **Entidad:** añadir definición al catálogo (`content/entities.json`) y al manifiesto de recursos; validar huella, superficie, colisión y guardado; evitar condiciones específicas en `scene` o `render`.
- **Sistema:** añadir función o tipo en su módulo de dominio, registrarlo en el compositor de `simulation`, declarar eventos tipados y probar el orden. Si necesita estado persistente, añadir una `part` versionada.
- **Módulo visual:** declarar entradas, recursos y orden de capa; montarlo en `scene`, probar sincronización y liberación; no editar el mundo desde el dibujo.
- **Cambio de guardado:** versionar el formato o la parte afectada, escribir migración o error claro y probar archivos anteriores y malformados antes de publicar.
