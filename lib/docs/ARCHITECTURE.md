# Arquitectura del motor (Rust)

Este documento define los límites, contratos y prácticas de la implementación en Rust con Macroquad. Es autocontenido: describe el funcionamiento técnico del juego y del workspace, sin depender de otros clientes ni de sus ficheros. Lo que hace cada módulo concreto está en su [`mod.md`](#catálogos-de-api-por-módulo), junto a su código.

**Idioma.** La documentación del workspace está en español: este documento, el [README](../README.md), [Estructura de archivos](FILE_STRUCTURE.md) y los catálogos `mod.md`. Los nombres de código y los comentarios de documentación en el código (`///`, `//!`) van en inglés; una revisión no debe mezclar los dos dentro de un mismo archivo.

## Estado del proyecto

**Implementado:** el workspace `lib`, el crate `iso` sin dependencias gráficas y el cliente Macroquad (paquete `iso-core`), `grid` con mapa de celdas e índice espacial, búsqueda `paths`, `projection`, geometría y visibilidad de `camera`, reloj `time` cableado al juego (`WorldClock` avanza solo en el paso fijo; la fase de sombras sigue al reloj del mundo), acumulador de paso fijo `simulation`, el modelo y generador de `terrain`, el modelo de mundo `world` en memoria con chunks descubiertos, las sombras de `lighting` con el horneado de una fase, el guardado nativo/web y una muestra jugable en la demo nativa y WASM. El contrato del catálogo de entidades vive en `content/entities.json` (`schemaVersion` 1) y lo valida `iso::entities::validate_catalog`. **Previsto:** la composición de sistemas de simulación, las reglas de colocación de entidades, el guardado persistente de chunks y la vista definitiva con assets. Una sección prevista es un contrato de diseño, no una afirmación de que su código ya existe.

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
- La simulación avanza en ticks fijos de 50 ms. El tiempo del fotograma alimenta un acumulador y un factor de interpolación para dibujar; no altera las reglas de juego según los FPS. El render se interpola entre límites de tick con una cúbica de Hermite cuyas tangentes son las velocidades horizontal y vertical de cada límite (continuidad C1), de modo que los arcos de aceleración quedan sin esquinas; la simulación en sí sigue siendo lineal por ticks. El cliente limita el acumulador a un tick por fotograma (`MAX_FRAME_MS`, 50 ms): tras un bloqueo (GC, GPU, horneado de chunks) el juego se ralentiza un momento en vez de teletransportar al jugador varios ticks de golpe.
- Las decisiones que afecten al juego usan un orden estable de iteración, desempate y eventos. No se exige que una semilla reproduzca el mundo anterior ni que vuelva a generar un mundo guardado.
- Los datos persistidos tienen versión y validación. Índices espaciales, GPU, cámara, listeners y cachés se reconstruyen; no se serializan.

### Sistema de coordenadas que se conserva

En el mundo, `x` crece hacia el noreste de la pantalla (arriba a la derecha), `y` hacia el noroeste (arriba a la izquierda), y `x+y` creciente se aleja de la cámara. `(0, 0)` es la columna del vértice sur, la más cercana a la cámara en el diagrama de referencia. `z` o `elevation` crece verticalmente hacia arriba; el nivel `0` corresponde al nivel del mar y los niveles negativos quedan bajo él. Una columna `(x, y)` va hasta `(x+1, y+1)` y su centro es `(x+0.5, y+0.5)`.

La pantalla tiene origen arriba a la izquierda, `screen_x` a la derecha y `screen_y` hacia abajo. El origen de proyección sitúa la columna `(0, 0)` dentro del canvas y no cambia los ejes del mundo. Los chunks repiten esos ejes: `(0, 0)` cubre `0..31` y una coordenada `-1` cae en el chunk `-1` con local `31`. Los assets SVG usan otro convenio de ejes; su orientación y `data-tiles` se convierten al preparar el atlas, sin cambiar el convenio del dominio.

## Flujo de un fotograma

1. `input` lee teclado, puntero y controles del cliente y los traduce a comandos de dominio. No mueve entidades directamente.
2. `app` acumula el tiempo transcurrido, aplica un límite a fotogramas largos y ejecuta cero o más ticks fijos.
3. En cada tick, los sistemas leen y modifican `World`; `time` avanza (el `WorldClock` del cliente solo progresa en `game::frame::update`, después del paso fijo, y de él sale la fase efectiva: `phase_at(clock.tick)` o el override manual del HUD de `/playground`); `events` distribuye avisos tipados en orden de suscripción. Las decisiones sobre colisiones, rutas y terreno se resuelven aquí.
4. `scene` observa el estado resultante, determina los chunks visibles y sincroniza las vistas con presupuesto de trabajo por fotograma.
5. `camera`, `projection` y `render` construyen la escena en un render target del tamaño del framebuffer; las nubes se aplican en ese mismo pase y después se compone la textura al framebuffer aplicando el grado de la fase seleccionada (multiplicador cálido o frío, saturación y levantado de negros — el amanecer y el día casi limpios, el atardecer más saturado, la noche fría, desaturada y con negros despegados del vacío) y un tilt-shift. El cambio de fase interpola el grado con un crossfade suave (`GradeTransition`, smoothstep, `PHASE_TRANSITION_SECONDS`, partiendo de lo que hay en pantalla si se vuelve a cambiar a mitad), de modo que la luz no salta de golpe; el HUD sigue visible y operativo durante el fundido. El filtro mantiene una franja horizontal nítida y desenfoca con nueve muestras los extremos, con radio expresado en píxeles del target. HUD y controles se dibujan encima, fuera de ambos efectos. La interpolación afecta solo a la presentación. La escena limpia recursos de los chunks que salen de la vista.

La generación de un chunk se inicia desde el flujo de mundo, no desde una vista. El chunk generado o modificado pasa al archivo de mundo; después la escena puede mostrarlo u ocultarlo cuantas veces sea necesario. El orden exacto de sistemas y eventos se declara en un único punto de composición y se cubre con una prueba de integración.

## Cómo funciona el juego

### Generación de terreno

El generador produce columnas con alturas y materiales (agua, arena, suelo, hierba) con ruido muestreado en coordenadas absolutas de mundo, de modo que no haya costuras entre chunks ni dependencia del orden de descubrimiento. La semilla del mundo vive en un único lugar: `iso::terrain::WORLD_SEED`, que comparten el valor por defecto de `TerrainConfig`, la configuración del juego (`game/config.rs`) y los tests; sirve para reproducir escenarios, y los guardados almacenan chunks materializados, no la semilla. La elección de textura y tinte no vive en el dominio: `terrain/appearance.rs` es la regla pura de cómo se viste el suelo —un campo de tinte suave (`derive_seed`, FNV-1a) repartido por `TintZones` en paleta ordenada de oscuro a claro, y qué crece encima decidido por `VariantPicker` con tres corrientes de ruido— y el cliente lo une con el atlas. Todo es presentación: no cambia material, altura, transitabilidad ni sombras.

### Entidades y colocación

Las definiciones de entidades viven en `content/entities.json` (`schemaVersion` 1, validado por `iso::entities::validate_catalog`): huella por casilla, colisión, altura, eje de longitud, superficies admitidas. Una instancia es el blueprint más posición y orientación; las instancias tienen identidad estable para guardarse. La colocación es determinista y consulta solo el terreno; la densidad, grupos y reglas se diseñan aquí, no se heredan de ningún contenido anterior.

### Orden de dibujo y sprites

`iso::scene_order` asigna a cada elemento una clave de profundidad: posición proyectada, elevación, casilla de la huella y, como desempate, capa (`PLAYER_BEHIND_LAYER` < `ENTITY_LAYER` < `PLAYER_FRONT_LAYER`). Terreno, entidades y jugador comparten una sola clave (`sprites::scene_key`, alimentada con el centro de la casilla y su elevación), y un sprite que ocupa varias casillas se corta en bandas verticales que caen una media casilla más allá del centro de cada una. El jugador se dibuja centrado en el rombo con su `InkBox` escalado por `PLAYER_SCALE`, y se ordena por la casilla en la que está, nunca por su posición fraccionaria. Una sombra blanda móvil dibujable se pinta sobre el suelo de la misma columna: sigue la posición horizontal, se escora hacia la dirección de las sombras de la fase horneada (sesgo isométrico de `player::shadow_clip`, con el alargamiento de la fase) se recentra bajo los pies y sólo se desplaza con la altura en un salto. La mancha se recorta a las caras superiores de las casillas que toca y cuya cima está a la altura de la sombra (`player::shadow_clip`), de modo que nunca se pinta sobre las caras laterales del terreno; si no hay ningún suelo a esa altura en su huella, se pinta entera como antes. El difuminado se logra con un abanico de triángulos con degradado de alfa por vértice (sin textura ni objetivo de render). Sus hojas resuelven caminar, reposo, salto y escalada; la vista añade una deformación anclada en los pies para la zancada, vuelo, escalada y los pulsos de despegue y aterrizaje, sin alterar la física ni la posición del dominio. Todos los bloques de terreno llenan su casilla entera, así que no hay surco entre bloques. Los bloques de sombra que proyecta se tratan igual.

### Atlas y hojas de sprites

Las texturas del juego salen de los SVG fuente (`assets-src/assets/`), no del binario: `scripts/rasterize.py` dibuja cada SVG a su tamaño de pantalla (320 px por tile de mundo) y `pack_atlas` los recorta y coloca en estanterías dentro de `content/atlas.png` (4096 px de ancho), con su `content/assets.manifest.json`. El recorte coincide con el `InkBox` medido del SVG, y `remeasure_atlas` reescribe la geometría de un atlas ya empaquetado sin rasterizar nada.

Las hojas de poses del jugador son rejillas de 16 orientaciones (una fila por punto de la rosa de los dieciséis vientos, sentido antihorario desde el este) por pose, y no caben en el atlas: reciben textura propia (`content/player-16_<hoja>.png`), con su rejilla descrita por `data-cell` en el manifiesto, de modo que la pose está en `facing * columns + pose`. Las celdas cortadas nunca caen entre píxeles, y todas comparten el `InkBox` de la plantilla del personaje.

### Sombras

`iso::lighting` está en Rust y no dibuja: define la geometría de la sombra (proyección de siluetas, alcance del rayo, fases). El cliente la hornea en CPU una vez por chunk a un mapa de un canal de alfa; la fase sigue al reloj del juego (`iso::time::WorldClock`, que solo avanza en el paso fijo; `iso::lighting::phase_at`: amanecer 06:00–09:00, día 09:00–17:00, atardecer 17:00–20:00, noche el resto — el mundo arranca a las 08:00, en pleno amanecer). En la build web la ruta `/` está siempre en automático; en `/playground` (y en la nativa) los botones de fase del HUD fijan un override manual — volver a pulsar el activo devuelve el control al ciclo —, y la lectura del mundo muestra la hora `HH:MM` (`format_clock_time`). Cambiar de fase (por el reloj o por un override) vacía el atlas lógico y reinicia el horneado de los chunks visibles con la nueva `BakePhase`, y con la misma fase se aplica el grado de presentación del pase offscreen (ver Flujo de un fotograma) — interpolado con `GradeTransition` al cambiar, de modo que la luz no salta de golpe (misma constante `PHASE_TRANSITION_SECONDS` que el fade de sombras); las sombras no se interpolan entre fases, pero cada chunk hace fade-in al terminar su rehorneado — hornear en GPU costaría el terreno y el desenfoque enteros en GLSL sin poder probarlos. El horizonte del terreno se evalúa por chunk contra un `HeightField` que llega más allá del propio chunk, con un recorrido DDA hacia el sol (`TERRAIN_RAY_REACH`), de modo que un acantilado sombrea lo que tiene debajo y oscurece a quien se meta en su sombra. Las entidades y el jugador reciben una rejilla de sombra (`ShadeLattice`) convertida en colores de vértice sobre el propio sprite. El suelo y las caras verticales se dibujan como capas de cuadriláteros apoyadas en el techo que se dibuja. Dos sombras se mueven y no se hornean: la del jugador (una geometría por frame, con su propia profundidad) y la de las nubes (un patrón sobre la vista terminada, bajo el HUD). El horneado es una máquina de estados reanudable con presupuesto por frame (`BAKE_BUDGET_MS`) y el mapa de cada chunk mostrado vive en un atlas de nueve huecos; el recorte de cámara nunca puede pedir más chunks que huecos. Cada chunk hace fade-in de sus sombras al terminar de hornearse (`PHASE_TRANSITION_SECONDS`, smoothstep y por chunk — suelo, caras verticales y las retículas que oscurecen entidades y al jugador), de modo que al cambiar de fase ninguna sombra horneada aparece de golpe. Un único ajuste (`game::config::PHASE_TRANSITION_SECONDS`) controla toda la transición: el crossfade del grado y el fade-in de las sombras.

### Agua y reflejos

El reflejo es el mismo sprite dibujado bocabajo colgando de la línea de agua, sin máscara: voltea el rectángulo del sprite y lo corta a las casillas de agua que cubre (`reflection_piece`), con la profundidad de cada casilla de agua. El pivote del volteo se centra entre los pies en el suelo y la superficie, así que el reflejo queda pegado a la orilla aunque el caster esté sobre un desnivel, y se hunde bajo ella lo mismo que el caster se eleva, de modo que el arco de un salto se lee en el agua. Los reflejos del terreno se encolan aparte y se dibujan de atrás hacia delante (`coord.x + coord.y` descendente), de modo que en una casilla de agua compartida por dos bloques el bloque de delante pinta sobre el sliver del bloque de atrás. Los bloques de terreno se reflejan con sprites dedicados por material (`/assets/<material>/block_reflection.svg`, como el bote y el muelle), dibujados exactamente como los muestra el agua: solo las caras laterales, una banda de un paso de elevación por bloque, colgando de la línea del agua que haya junto a la columna; cortados a las casillas de agua que cubren, con el tinte transparente del agua (`Reflected::AsDrawn`). Una columna retranqueada entre dos vecinos de delante de la misma altura o mayor no refleja: las alas tapan la cuña de agua donde caería su banda y asoma entre ellas como un triángulo suelto en el vértice interior. Los bloques por debajo del plano del agua ni las columnas de agua se reflejan. Las casillas a las que llega se sacan del propio dibujo (`reflection_cells`), solo acotadas en trabajo (`MAX_REFLECTION_CELLS`, `MAX_REFLECTION_DROP`). Una huella de varias casillas se gira media vuelta (`turn_at`) en vez de voltearse, y un asset que trae su propio reflejo dibujado (`reflectionSource` del manifiesto) se coloca como su generador lo puso. El color es `#c4dbe4` al 1,0 de opacidad. La composición mediante render target incluye un tilt-shift real sin mezclarlo con HUD ni controles.

### Cámara y seguimiento

`iso::camera` guarda centro, zoom y seguimiento; `camera::focus` define a qué altura mira una cámara que sigue al jugador: fija el nivel en la cima que pisa, no lo mueve durante un salto, baja con los pies en una caída y sube a una cima más alta sobre la curva de una escalada. `advance()` lleva el nivel mostrado al nivel objetivo con un resorte críticamente amortiguado (`CAMERA_LEVEL_SMOOTH_MS`, 65 ms). La traslación por el suelo sigue al jugador con la semivida del `follow_camera` (`CAMERA_FOLLOW_HALF_LIFE_MS`, 90 ms) sobre límites que nunca se aplican (`UNBOUNDED_CAMERA_LIMITS`), de modo que las esquinas de velocidad de los ticks de 50 ms no llegan a la pantalla entera — en móvil, con menos fps y tiempos de fotograma desiguales, se notaban como tirones. La cámara va siempre un poco por detrás del jugador a velocidad máxima. `streaming` queda previsto: carga/descarga con presupuesto por frame, separando visibilidad de persistencia.

### Guardado

`save` persiste chunks descubiertos, entidades con estado y los objetos de estado del juego (`player`, `systems`) con sus versiones; el contenido guardado es la autoridad al reabrir, no el generador. La persistencia web implementa una interfaz de almacenamiento que una implementación nativa puede sustituir por archivos sin cambiar el formato lógico. Las versiones desconocidas o datos malformados se comunican sin `panic!`.

### Controles táctiles

En pantallas táctiles el cliente pinta dos controles en las esquinas inferiores: un joystick analógico a la izquierda y un botón SALTAR a la derecha (`src/touch`). El joystick alimenta la misma transformación de entrada que el teclado (`x = across + up`, `y = up - across`) pero con magnitud analógica recortada a deflexión máxima: a medio empuje se camina a media velocidad, y a partir de una deflexión fija (`RUN_THRESHOLD`) se enciende `run`, el equivalente a mantener `Shift`. El botón publica `jump_pressed`/`jump_held` como la barra espaciadora. Ambos controles son entrada de juego, no overlay: se pintan siempre encima de la escena, también en `/`, y aparecen en dispositivos de puntero grueso (la build web lo sabe con el import FFI `iso_pointer_coarse`) o en cualquier plataforma tras el primer toque; en escritorio con ratón no aparecen. El HUD sustituye la línea de ayuda por la de los controles cuando son visibles. El joystick sigue a un único dedo, el botón admite varios a la vez. En plataformas de puntero grueso la escena se dibuja alejada un poco (`SceneMetrics::for_pointer` de `src/game/config.rs`, `MOBILE_ZOOM` = 0.7): la casilla mide el 70 % de la referencia, para ver más mundo en una pantalla táctil pequeña; la build nativa conserva la casilla de referencia.

## Previsto (contratos de diseño, no afirmaciones)

- `input` y `app`: comandos del dominio a partir de teclado y puntero; composición del mundo, sistemas, escena y ciclo principal.
- `events` y `simulation`: eventos tipados síncronos en orden de registro; registro y ejecución de sistemas en orden declarado, con eventos de dominio y sin llamadas directas entre sistemas.
- Colocación de entidades completa (densidad, grupos, biomas, vecindad) y reglas de aparición.
- Guardado persistente de chunks (en memoria en esta fase) y migraciones versionadas del formato.
- `parts` y persistencia completa, `streaming` con presupuesto.
- Módulos ambientales (curvas de luz, viento, ondas), `water`/`effects`/`audio` definitivas y `ui` con comandos sobre el flujo de simulación.
- `scene`, `render` y `input` definitivos: listas de materiales, primitivas por capa, composición declarativa y atajos configurables en un lugar.

## Prácticas de código y documentación

Las prácticas de código y documentación, las puertas de calidad y las reglas del workspace viven en [PRACTICES.md](PRACTICES.md).

## Cómo extender sin romper los límites

- **Material:** declarar su identidad y propiedades en `terrain`; añadir apariencia al catálogo de `assets`; probar clasificación, columna visible y textura en una escena pequeña.
- **Entidad:** añadir definición al catálogo (`content/entities.json`) y al manifiesto de recursos; validar huella, superficie, colisión y guardado; evitar condiciones específicas en `scene` o `render`.
- **Sistema:** añadir función o tipo en su módulo de dominio, registrarlo en el compositor de `simulation`, declarar eventos tipados y probar el orden. Si necesita estado persistente, añadir una `part` versionada.
- **Módulo visual:** declarar entradas, recursos y orden de capa; montarlo en `scene`, probar sincronización y liberación; no editar el mundo desde el dibujo.
- **Cambio de guardado:** versionar el formato o la parte afectada, escribir migración o error claro y probar archivos anteriores y malformados antes de publicar.
