# Arquitectura de Armada Engine en Rust

Este documento define los límites, contratos y prácticas de la implementación en Rust con Macroquad. Toma como referencia [`../ARCHITECTURE.md`](../ARCHITECTURE.md), que describe el juego en TypeScript, pero documenta las decisiones de este workspace. Conservamos los principios útiles del dominio, el flujo y la calidad; el algoritmo de generación y la distribución de entidades se diseñarán y ajustarán aquí.

## Estado y estructura

**Implementado:** el workspace `iso-core`, el crate `armada-core` sin dependencias gráficas, `grid` con mapa de celdas e índice espacial, búsqueda `paths`, `projection`, geometría y visibilidad básica de `camera`, reloj `time`, acumulador de paso fijo `simulation`, modelo y primer generador de `terrain`, el modelo de mundo `world` en memoria con chunks descubiertos, sus pruebas y una muestra de terreno visible en la demo Macroquad nativa y WASM. El contrato V2 de catálogo de entidades y guardado está definido en TypeScript (`V2_DATA_CONTRACTS.md`) y pendiente de integración en Rust. **Previsto:** los demás módulos descritos abajo, la composición de sistemas de simulación, las reglas de colocación de entidades, el guardado persistente de chunks y la vista definitiva con assets. Una sección prevista es un contrato de diseño, no una afirmación de que su código ya existe.

```text
iso-core/
  Cargo.toml                  # workspace y cliente Macroquad
  ARCHITECTURE.md             # este contrato
  crates/armada-core/
    src/lib.rs                # entrada pública del dominio
    src/grid/                # coordenadas e índice espacial; implementado
      mod.rs
      coords.rs
      coords.test.rs
      cell_map.rs
      cell_map.test.rs
      spatial_index.rs
      spatial_index.test.rs
    src/paths/               # búsqueda de rutas; implementado
      mod.rs
      astar.rs
      astar.test.rs
    src/projection/          # proyección; implementado
      mod.rs
      geometry.rs
      geometry.test.rs
    src/camera/              # geometría de cámara; implementado
      mod.rs
      geometry.rs
      geometry.test.rs
      visibility.rs
      visibility.test.rs
    src/time/                # reloj lógico; implementado
      clock.rs
      clock.test.rs
    src/simulation/          # paso fijo; implementado (stepper y acumulador)
      stepper.rs
      stepper.test.rs
    src/terrain/             # columnas, ruido y generador inicial
      columns.rs
      noise.rs
      generation.rs
      *.test.rs
    src/world/               # modelo en memoria; primeros chunks implementados
      mod.rs
      chunks.rs
      *.test.rs
    src/{entities,parts,...}/ # previstos; se crean al implementarlos (catálogo V2 definido en TypeScript)
    tests/contracts.rs        # contratos entre módulos y fixture de migración
  src/main.rs                 # entrada nativa/WASM, demo actual
  src/main.test.rs            # prueba colocalizada de entrada de la demo
  src/game/                  # muestra de chunks generados; implementado
    preview.rs
    preview.test.rs
  src/terrain_view/          # dibujo temporal de terreno; implementado
    preview.rs
  src/{input,scene,render,...}/ # cliente, previstos
  content/                    # manifiesto de assets y atlas (63 SVGs rasterizados en curso)
  web/                        # cargador WASM y archivos web
  reference/                  # capturas y medidas de referencia
```

La regla de dependencia es `iso-core → armada-core`. `armada-core` no importa Macroquad, navegador, audio ni archivos de la escena. El cliente puede usar tipos y decisiones del dominio; el dominio no conoce sprites, texturas ni resolución de pantalla. Si una regla necesita pruebas sin GPU o navegador, normalmente pertenece al dominio. No se añaden crates o módulos vacíos para anticipar fases futuras.

### Correspondencia con la organización anterior

`crates/armada-core/src/` cumple el papel de `src/isometric/core/engine/` y conserva carpetas por responsabilidad (`grid`, `paths`, `projection`, `camera`, y después `terrain`, `entities`, `world`, `player`, `time`, `events`, `simulation`, etc.). Cada carpeta tiene un `mod.rs` que define su API y archivos separados para cálculos o tipos con responsabilidades distintas. Los tipos compartidos viven junto al módulo que los posee; `grid::WorldCoord` es el ejemplo. Un tipo pasa a un módulo común solo cuando varios módulos lo necesitan y queda claro quién mantiene su contrato.

El cliente `iso-core/src/` mantendrá la separación de `game` (composición y arranque), `input` y módulos de escena y vistas. `scene` registrará módulos de presentación de forma explícita, como hace `game/modules.ts`; cada vista tendrá su propia carpeta y pruebas, y dependerá del dominio y de `render`, nunca al revés. `content/` conservará catálogos y configuración fuera de la lógica de colocación. No se copian carpetas de Pixi que no tengan equivalente funcional en Macroquad: se crean al llegar su fase y se nombran por la responsabilidad que cumplen.

Un módulo nuevo debe ofrecer una entrada pequeña en `mod.rs` y colocar sus pruebas junto al archivo que contiene la regla: `coords.rs` con `coords.test.rs`, por ejemplo. El archivo de producción registra el test con `#[cfg(test)] #[path = "coords.test.rs"] mod tests;`. `tests/` queda para contratos que crucen módulos, fixtures de migración y recorridos de integración. El punto de composición del juego se actualiza cuando se registra un sistema o una vista. Esta organización permite añadir módulos sin ampliar `main.rs`, `World` ni un renderer monolítico.

## Invariantes compartidas

- `World` es la fuente de verdad del juego. La escena y sus vistas mantienen solo cachés y recursos derivados. Descargar un chunk visual no elimina su contenido del mundo ni del archivo guardado.
- La rejilla usa coordenadas enteras para celdas y chunks, y posiciones fraccionarias solo para movimiento y proyección. La conversión de coordenadas negativas usa división euclídea; un chunk mide 32 × 32 celdas mientras no se cambie explícitamente el contrato.
- La proyección isométrica conserva sus ejes: `+x` aparece arriba a la derecha y `+y` arriba a la izquierda. Elevación, orden de dibujo y conversiones inversas comparten la misma configuración.
- La simulación avanza en ticks fijos de 50 ms. El tiempo del fotograma alimenta un acumulador y un factor de interpolación para dibujar; no altera las reglas de juego según los FPS.
- Las decisiones que afecten al juego usan un orden estable de iteración, desempate y eventos. No se exige que una semilla reproduzca el mundo anterior ni que vuelva a generar un mundo guardado.
- Los datos persistidos tienen versión y validación. Índices espaciales, GPU, cámara, listeners y cachés se reconstruyen; no se serializan.

### Sistema de coordenadas que se conserva

La referencia exacta es [Sistema de coordenadas](../ARCHITECTURE.md#sistema-de-coordenadas). En el mundo, `x` crece hacia el noreste de la pantalla (arriba a la derecha), `y` hacia el noroeste (arriba a la izquierda), y `x+y` creciente se aleja de la cámara. `(0, 0)` es la columna del vértice sur, la más cercana a la cámara en el diagrama de referencia. `z` o `elevation` crece verticalmente hacia arriba; el nivel `0` corresponde al nivel del mar y los niveles negativos quedan bajo él. Una columna `(x, y)` va hasta `(x+1, y+1)` y su centro es `(x+0.5, y+0.5)`.

La pantalla tiene origen arriba a la izquierda, `screen_x` a la derecha y `screen_y` hacia abajo. El origen de proyección sitúa la columna `(0, 0)` dentro del canvas y no cambia los ejes del mundo. Los chunks repiten esos ejes: `(0, 0)` cubre `0..31` y una coordenada `-1` cae en el chunk `-1` con local `31`. Los assets SVG existentes usan otro convenio de ejes; su orientación y `data-tiles` se convierten al preparar atlas, sin cambiar el convenio del dominio.

**Ya cubierto en Rust:** tipos de mundo/chunk/local, división euclídea con negativos, proyección de puntos y elevación, inversa de desplazamientos, orden de vecinos de rutas, desplazamiento/zoom de cámara, selección de chunks visibles y columnas de terreno con nivel del mar `0`. **Pendiente de aplicar y probar:** huellas de entidades, profundidad de render, mapas de sombras y conversión de orientación de assets. Cada módulo nuevo debe probar sus direcciones contra este contrato antes de integrarse en la escena.

## Flujo de un fotograma

1. `input` lee teclado, puntero y controles del cliente y los traduce a comandos de dominio. No mueve entidades directamente.
2. `app` acumula el tiempo transcurrido, aplica un límite a fotogramas largos y ejecuta cero o más ticks fijos.
3. En cada tick, los sistemas leen y modifican `World`; `time` avanza; `events` distribuye avisos tipados en orden de suscripción. Las decisiones sobre colisiones, rutas y terreno se resuelven aquí.
4. `scene` observa el estado resultante, determina los chunks visibles y sincroniza las vistas con presupuesto de trabajo por fotograma.
5. `camera`, `projection` y `render` construyen y dibujan la imagen. La interpolación afecta solo a la presentación. La escena limpia recursos de los chunks que salen de la vista.

La generación de un chunk se inicia desde el flujo de mundo, no desde una vista. El chunk generado o modificado pasa al archivo de mundo; luego la escena puede mostrarlo u ocultarlo cuantas veces sea necesario. El orden exacto de sistemas y eventos se declara en un único punto de composición y se cubre con una prueba de integración.

## Módulos de `armada-core`

### `grid` e índice espacial

**Responsabilidad.** Tipos distintos para coordenada de mundo, chunk y celda local; conversión entre ellas; rectángulos y claves; `CellMap` e índice de ocupación para entidades de varias celdas. `grid/coords.rs` implementa conversiones y claves; `grid/cell_map.rs` almacena valores por chunk en orden de inserción; `grid/spatial_index.rs` implementa `SpatialIndex`.

**Contrato.** La conversión conserva el recorrido por coordenadas negativas y límites de chunk. Las claves tienen rango validado antes de empaquetarse. Una consulta espacial devuelve resultados en orden estable y distingue la huella de una entidad de su punto de anclaje. El índice es derivado y se reconstruye al cargar.

**Pruebas.** Bordes `-33`, `-32`, `-1`, `0`, `31`, `32`; ida y vuelta mundo/chunk/local; límites de claves; inserción, retirada y consulta de huellas que cruzan chunks; orden de iteración.

### `projection`

**Responsabilidad.** Transformaciones matemáticas de rejilla y elevación a pantalla, e inversas para desplazamientos o selección. Está implementado y se usa en la demo.

**Contrato.** Para un origen `(ox, oy)`, ancho `tw`, alto `th` y paso vertical `step`: `screen_x = ox + (x-y)·tw/2`; `screen_y = oy - (x+y)·th/2 - elevation·step`. El dominio calcula en `f64`; el cliente convierte a `f32` al dibujar. El zoom y la cámara no introducen una segunda fórmula de proyección.

**Pruebas.** Ejes, elevaciones, puntos fraccionarios, inversa de desplazamientos, valores de contrato compartidos con TypeScript y comportamiento en las cuatro direcciones de pantalla.

### `random` y `noise` (previstos)

**Responsabilidad.** Fuente explícita de aleatoriedad y ruido para generación y variación visual que requiera estabilidad. El módulo debe permitir fijar una semilla durante una operación, sin estado global ni dependencia del reloj.

**Contrato.** Se documenta qué parámetros de ruido afectan a alturas, agua y superficies. Los campos se muestrean con coordenadas absolutas para evitar costuras entre chunks. Una semilla puede facilitar depuración, pero no forma parte del contrato de reconstrucción de guardados ni necesita coincidir con la implementación TypeScript.

**Pruebas.** Muestras conocidas del algoritmo nuevo, independencia del orden de petición de chunks y continuidad en límites.

### `terrain` y materiales (modelo y primer generador implementados)

**Responsabilidad.** Generar columnas con distintas alturas y clasificar cada bloque y superficie como agua, arena, suelo, hierba u otro material declarado. `columns.rs` define `TerrainColumn`, `TerrainBlock` y `TerrainMaterial`, separados del ruido (`noise.rs`) y del generador (`generation.rs`). Expone altura, superficie y transitabilidad a otros módulos. La elección de textura y tinte queda en el cliente.

**Contrato.** Los bloques de una columna ocupan niveles explícitos: agua bajo `0`, arena en la orilla, soporte `ground` bajo cimas secas y `grass` o `ground` en otras superficies. El generador inicial usa ruido de valor con coordenadas absolutas y consulta vecinas para clasificar costas sin costuras. La semilla sirve para reproducir escenarios de prueba; los guardados almacenarán chunks materializados. Los parámetros iniciales (`min_elevation = -3`, `max_elevation = 4`, escalas `48` y `16`) se ajustarán al revisar el paisaje en pantalla. Los laterales visibles y la optimización de bloques ocultos quedan para la vista del terreno. No se trasladan posiciones ni salidas exactas del generador anterior.

**Pruebas.** Alturas y materiales válidos, capas coherentes, bordes entre chunks, agua y costas, casos de elevación y consulta de transitabilidad. Usar mapas pequeños construidos a mano para las reglas de bloques visibles.

### `paths` (implementado: búsqueda básica)

**Responsabilidad.** Búsqueda de rutas y costes de movimiento sobre un mapa de transitabilidad. Recibe consultas del mundo sin conocer la escena ni los controles. Ya existe `find_path`; la integración con terreno y los caminos visibles queda pendiente.

**Contrato.** El coste, los vecinos permitidos y el desempate son explícitos. El recorrido lateral `+x, +y, -x, -y` del juego anterior es una referencia cuando no hay razón para cambiarlo. Los diseños de caminos y asentamientos del generador anterior no son un requisito de compatibilidad.

**Pruebas.** Ruta simple, obstáculo, sin ruta, coste por material, bordes de chunk y desempate reproducible.

### `entities` y configuración (previstos)

**Responsabilidad.** Definiciones de entidades separadas de instancias; huella, colisión, capacidades, superficie admitida y reglas de aparición. Un archivo de configuración conserva las definiciones de contenido, con un contrato propio de Rust y validación al cargar.

**Contrato.** La fábrica valida toda la huella y reserva sus celdas mediante el índice espacial. Las instancias tienen identidad estable y datos suficientes para guardarse. La colocación se rediseña y calibra en Rust; las posiciones, probabilidades, formaciones y valores del catálogo anterior no son obligatorios. La configuración no contiene manejadores de texturas ni objetos Macroquad: usa identificadores de recursos. Un error de configuración indica entidad y campo.

**Pruebas.** Validación de definiciones, huellas de varios bloques, límites de colisión, rechazo de solapamiento, colocación en superficie permitida y carga/guardado de instancias.

### `world` y chunks (primer modelo en memoria)

**Responsabilidad.** Poseer chunks descubiertos, columnas, entidades e índices derivados; coordinar generación inicial y cambios posteriores. Expone consultas y mutaciones controladas para los sistemas.

**Contrato.** Generar un chunk nuevo y volver a cargar uno descubierto son operaciones distintas. La carga no aplica de nuevo el generador sobre contenido persistido. Un chunk puede salir de la vista y seguir en memoria o en almacenamiento según la política de streaming. La generación nunca depende del orden en que la cámara pide chunks.

**Pruebas.** Generar, editar, ocultar, recuperar y conservar contenido; consultas entre chunks; reconstrucción de índices tras carga; invariantes de identidad y ocupación.

`TerrainWorld` ya conserva en memoria los chunks descubiertos aunque se oculten. `show_chunk()` solo genera el primer descubrimiento; `edit_column()` valida la relación entre agua y nivel del mar y actualiza la transitabilidad. La muestra Macroquad lee sus cuatro chunks de ese mundo. Aún faltan entidades, presupuesto de streaming, descarga de memoria y almacenamiento persistente; ocultar un chunk no equivale a guardarlo en disco.

El `ChunkManager` calcula y ordena sus anillos de carga y prefetch únicamente cuando cambia el chunk de foco. En cada frame reutiliza esos objetivos y el cliente Macroquad itera directamente los chunks que devuelve el cull de cámara, consultando la visibilidad del stream sin materializar conjuntos auxiliares. Así el movimiento dentro del mismo chunk no añade asignaciones ni ordenaciones al camino de render.

### `parts` y `save` (previstos)

**Responsabilidad.** Estado propio de sistemas que no pertenece al núcleo de `World`, formato de archivo, validación y migraciones del formato de guardado.

**Contrato.** Cada parte declara una clave y una versión. El formato raíz declara su versión y contiene los chunks descubiertos completos, sus modificaciones y las instancias necesarias para restaurar la partida. El guardado no depende de regenerar desde una semilla. Las partes se restauran antes de reactivar sistemas; índices y listeners se reconstruyen después. Los errores de versión o datos se comunican sin `panic!`.

**Pruebas.** Ida y vuelta de mundos editados, partes ausentes u opcionales, versión desconocida, archivo malformado, recuperación de un chunk ya descubierto y ausencia de recursos de presentación en el archivo.

### `time`, `events` y `simulation` (reloj y paso fijo implementados)

**Responsabilidad.** `time` guarda el tick lógico y deriva hora/día; su reloj ya está implementado. `events` distribuirá eventos tipados síncronos; `simulation` ya tiene el acumulador de paso fijo y registrará y ejecutará sistemas en un orden declarado.

**Contrato.** Un tick dura 50 ms; el ciclo día/noche usa 24 000 ticks mientras no se cambie deliberadamente el diseño. Un fotograma largo tiene límite de acumulación y la simulación produce un `alpha` de interpolación entre `0` y `1`. Los listeners se ejecutan en orden de registro y no se guardan. Pausa y delta inválido no avanzan el mundo. Los sistemas no llaman a otros sistemas para comunicar acontecimientos: emiten eventos de dominio.

**Pruebas.** Acumulación, varios ticks por fotograma, pausa, límite de tiempo, orden de sistemas/eventos y transición de día. Probar los sistemas con un `World` mínimo, sin abrir ventana.

### `player` y movimiento (previstos)

**Responsabilidad.** Intención de movimiento, locomoción, salto, colisiones y transición de estados del jugador. Consume comandos independientes de teclado o mando.

**Contrato.** El movimiento usa el tiempo de simulación, altura del terreno e índice de ocupación; una vista no corrige la posición lógica. Los eventos de locomoción representan transiciones reales. La cámara puede seguir al jugador, pero el jugador no conoce a la cámara.

**Pruebas.** Direcciones, diagonal, terreno a distinta altura, bloqueo parcial, salto y aterrizaje, evento sin cambio de estado y trayectoria breve sobre un mapa controlado.

### Cálculos ambientales puros (previstos)

**Responsabilidad.** Curvas de luz por hora, vectores de viento, geometría de ondas y parámetros de reflejos o sombras que se puedan expresar como datos. Sus efectos GPU se implementan en el cliente.

**Contrato.** La iluminación que afecta decisiones del juego depende del tick; una animación puramente visual puede usar tiempo de fotograma. Los cálculos no crean texturas ni render targets.

**Pruebas.** Extremos de curvas, continuidad, límites numéricos y geometría conocida.

## Módulos del cliente Macroquad

### `app` e `input` (previstos)

`app` compone el mundo, sistemas, escena y ciclo principal; `main.rs` queda como entrada corta cuando se sustituya la demo. `input` convierte teclas, ratón y eventos de ventana en comandos. Configurar atajos en un lugar y mantener igual el movimiento nativo/WASM. Probar la traducción de comandos como función pura y comprobar manualmente foco, flechas, WASD y puntero en navegador.

### `camera` y `streaming` (geometría básica implementada)

`camera` guarda centro, zoom y seguimiento como estado de vista. La geometría y la selección de chunks visibles ya viven en `armada-core::camera`: desplazamiento, conversión pantalla/suelo, zoom alrededor de un ancla, seguimiento, transformación y visibilidad con margen y elevaciones. `streaming` queda pendiente; programará carga/descarga con presupuesto por fotograma y separará visibilidad de persistencia. Probar el presupuesto con una escena falsa.

### `scene` y vistas (muestra de terreno implementada)

`scene` compone módulos visuales (terreno, entidades, jugador, efectos, interfaz), resuelve su orden de montaje y los destruye en orden inverso. Cada vista sincroniza el estado de `World` con recursos visibles; no genera ni modifica terreno. El orden de dibujo es estable por profundidad y capa declarada. Probar el montaje y la sincronización de un módulo aislado, además de la composición completa con datos de mundo pequeños.

La muestra actual descubre cuatro chunks en `TerrainWorld` desde `game::preview` y entrega sus columnas ordenadas de lejos a cerca a `terrain_view::preview`. Usa `armada-core::scene_order` para profundidad por posición proyectada, elevación y casilla de la huella, seguida de capa; el fixture de migración comprueba el mismo orden estable en TypeScript y Rust. La vista únicamente proyecta y dibuja las columnas y consulta alturas vecinas para las caras expuestas. Usa colores de depuración para agua, arena, suelo e hierba; la vista con assets y la composición de `scene` siguen pendientes. La muestra no establece todavía un contrato de streaming, guardado ni colocación de entidades.

`scene_order::poses` también contiene las columnas puras de las hojas de caminar, reposar, trepar y saltar. Las comprueba el mismo fixture TypeScript/Rust antes de que el cliente Macroquad tenga sprites de jugador. La selección de hoja, atlas y textura pertenece al cliente.

`scene_order::select_player_frame` ya decide la prioridad entre hojas (`climb`, `jump`, `idle`, `walk`) y su columna. Cada cliente convierte ese resultado a una textura de la orientación actual; el atlas y el recurso siguen siendo responsabilidad del cliente.

El cliente dibuja al jugador igual que el cliente TypeScript: su `InkBox` del manifiesto escalada por `PLAYER_SCALE` (0.75) alrededor del punto de suelo proyectado de su casilla, nunca ajustada al ancho del tile, de modo que la figura queda centrada en el rombo a cualquier zoom. Se dibuja en su posición exacta e interpolada, pero se ordena por la casilla en la que está: una clave construida con la posición fraccionaria deja al jugador detrás de su propio suelo en la mitad de cada casilla. Sobre esa casilla ocupa dos capas, una por debajo de las entidades y otra por encima (`PLAYER_BEHIND_LAYER` < `ENTITY_LAYER` < `PLAYER_FRONT_LAYER`), según esté más allá del centro de la casilla (`x + y`) o antes: así camina detrás del tronco de un árbol y por delante cuando lo rodea, como `SCENE_LAYER.behindObject` en TypeScript. Para que ese empate exista, terreno, entidades y jugador comparten una sola clave, `sprites::scene_key`, alimentada siempre con el centro de la casilla y su elevación. Antes convivían dos: el terreno ordenaba en coordenadas de mundo y las entidades y el jugador por su posición en pantalla, escalas que no se pueden comparar, así que ningún bloque de terreno llegaba a cubrir al jugador; y cada banda de una entidad usaba el centro de su dibujo, que queda tan por encima del suelo como alto sea el sprite, de modo que un árbol se ordenaba un tercio de tile más lejos que su casilla y el jugador que la comparte siempre salía por delante. Sus pies se apoyan en el techo que se dibuja, no en el plano de la casilla: la arena se dibuja como una losa baja, así que `preview_top_inset` la hunde medio bloque y el cliente resta ese `inset` al proyectar y al caminar (`step_player`), igual que `TERRAIN_APPEARANCE.sand.topInset` y `drawnFoot` en TypeScript. Por esa misma losa baja, el escalón desde la playa hacia la tierra medía bloque y medio y se leía como un muro, así que **la última fila de playa antes de un escalón lleva un bloque más de arena** (`TerrainGenerator::shore_step`): el resto de la playa sigue siendo un solo bloque y el ascenso se parte en dos. Solo sube donde nada alrededor es más bajo, para que la playa no levante un acantilado de dos bloques sobre el mar, y se decide con las alturas crudas para que una fila levantada no levante a su vez la de atrás. Bajo una superficie de arena el bloque siguiente también es arena (`material_at`), que es lo que se ve en la orilla del agua y bajo esa fila doble. Un bloque enterrado bajo la superficie de su propia columna se dibuja subido hasta el plano de su casilla (`buried_lift`): la losa de arena solo cubre su propio cuerpo, así que dos bloques de arena a un nivel de distancia dejaban una muesca en los vértices laterales y el de arriba se leía como una placa flotando sobre el otro; subido, su techo encaja con la base del bloque de encima. La cima de la columna nunca se sube, porque ese techo hundido es el aspecto de la playa y es donde se apoya el jugador, y del bloque subido se dibuja además una copia en su sitio original, con la misma clave de profundidad, para que la junta de abajo siga cerrada. La excepción es la **fila de terraza**, la que queda pegada a un escalón de subida (`top_is_flush` en `columns.rs`): esa conserva su elevación y solo sube su techo, de modo que lo que falta del ascenso se parte en dos escalones pequeños en vez de uno de bloque y medio. Es una sola regla, y la consultan tanto la vista como la física (`drawn_inset`), porque si el techo sube y los pies no, el jugador camina dentro del escalón. El resto de la playa y la línea de agua conservan el techo hundido. En Pixi no es así; es una decisión de diseño propia de este cliente. Un sprite que ocupa varias casillas se corta en bandas (`footprint_band`), y el corte cae **recto hacia abajo, media casilla más allá del centro de cada una**, el mismo reparto que hacen las tiras verticales de `createBlockViews` en TypeScript (`length + 1` tiras de media casilla, con clave `[0, 0, 1, …]`): media casilla más allá y no en el centro porque dos columnas vecinas se solapan media casilla en pantalla y ese solape pertenece a la casilla de delante. Cortar por el borde del rombo que comparten las casillas, como se hacía, reparte distinto en una cuña que se ensancha cuanto más alto llega el dibujo, y ahí el jugador a la altura de la casilla lejana asomaba en fragmentos por encima de un edificio largo. Los bloques de terreno se dibujan al tamaño en que fueron dibujados, como cualquier otro sprite y como el cliente TypeScript, que dibuja la plantilla entera del bloque de un tile de ancho: los bloques son de arcilla con las esquinas redondeadas, así que el dibujo es un cuatro por ciento más estrecho que su casilla y el campo muestra un surco en cada borde, que es el aspecto de los dos clientes. Estirar el dibujo hasta el tile cerraba esos surcos pero dejaba cada rombo de suelo un dos por ciento más grande, y la casilla de delante del jugador, que se dibuja después, pintaba ese exceso sobre sus pies. Por esas mismas esquinas redondeadas, una columna se apila hacia abajo hasta la más baja de las **tres** columnas que tiene delante (`-x`, `-y` y su diagonal, `exposed_floor`): donde dos columnas a la misma altura se juntan con una más baja al otro lado de la esquina, la esquina queda abierta y se veía un cuadro de fondo. Es lo que dice `COVERING_CELLS` en TypeScript con su `[-1, -1, 1]`.

### `assets` y `render` (previstos)

`assets` mantiene un catálogo de identificadores, metadatos de dimensiones/huella y texturas compartidas. Los SVG existentes pueden servir de fuente para generar atlas rasterizados antes de ejecutar el juego; el runtime WASM carga formatos compatibles con Macroquad. `render` convierte materiales, entidades y capas decididos previamente en llamadas de dibujo; reutiliza texturas y limita recursos visibles. No contiene reglas de generación, colisión o colocación. Probar el catálogo y el orden de comandos de dibujo sin GPU; revisar composición y escala en nativo y navegador.

### `lighting`, `water`, `effects`, `audio` y `ui` (previstos)

Estos módulos consumen estado y parámetros del dominio para presentar luz ambiente, sombras, agua, viento, sonidos e interfaz. Los render targets, texturas y audio pertenecen al cliente y tienen propietario y ciclo de vida explícitos. Su trabajo por fotograma y memoria se miden con escenas representativas. `ui` emite comandos; no edita `World` por fuera del flujo de simulación.

### `web` y almacenamiento (previstos)

`web/` aloja el cargador WASM, recursos y puente mínimo con el navegador. La persistencia web implementa una interfaz de almacenamiento usada por `save`; una implementación nativa puede usar archivos sin cambiar el formato lógico. Los errores de carga y guardado se muestran al usuario. Probar un guardado y recuperación reales en navegador, incluido cierre y reapertura de la página.

## Prácticas de código y documentación

- Mantener la API pública de cada módulo pequeña; exportar tipos y operaciones necesarias desde `lib.rs`. Usar tipos nuevos para unidades o coordenadas que no sean intercambiables. Validar entradas externas con `Result` y errores con contexto; reservar `assert!` para invariantes internas y tests.
- Preferir funciones puras para proyección, clasificación de materiales, costes, cálculos de cámara y traducción de entrada. Inyectar azar, reloj y almacenamiento cuando una regla de dominio los necesite. Evitar estado global mutable y dependencia implícita del orden de `HashMap`.
- Usar `i32` o enteros tipados para rejilla y ticks; `f64` para cálculos de dominio que requieren precisión; `f32` en el límite gráfico. Documentar conversiones, rangos y redondeos. `unsafe` está prohibido en `armada-core`.
- Cada módulo comienza con rustdoc que explica propósito, invariantes, unidades y dependencias admitidas. Los tipos públicos documentan sus campos y errores relevantes; los ejemplos ilustran contratos, no duplican la implementación.
- Actualizar este documento, el README y las notas de migración en el mismo cambio que altere contratos, flujo, formato de guardado o estructura. Marcar una capacidad como implementada solo cuando tenga código y pruebas. Mantener decisiones nuevas cerca del módulo correspondiente.
- Un cambio de comportamiento incluye prueba del límite que lo justifica. Los tests de regresión describen el resultado esperado; no imitan línea por línea la función probada. Extraer helpers compartidos solo cuando haya dos usos reales.

## Tests y puertas de calidad

**Dominio:** pruebas unitarias colocalizadas como `<archivo>.test.rs` para invariantes locales; cada archivo de producción las incluye solo bajo `#[cfg(test)]`. Las pruebas de integración en `crates/armada-core/tests/` verifican relaciones entre módulos y contratos externos. Probar bordes y propiedades para coordenadas, guardado y generación. Los fixtures TypeScript existentes sirven para preservar coordenadas, proyección, movimiento, rutas y reloj durante el port. Los resultados exactos del terreno y entidades nuevos se prueban con fixtures Rust propios, no con las salidas antiguas.

**Cliente:** probar transformaciones y composición con datos pequeños sin abrir GPU cuando sea posible. Usar pruebas visuales y recorridos manuales en nativo y WASM para profundidad, elevación, carga de assets, cámara, controles y persistencia. Guardar capturas de referencia de escenas concretas y registrar ventana, resolución y condiciones al comparar rendimiento. Las cifras de PixiJS son referencia observada, no umbrales automáticos.

**Comandos desde `iso-core/`:**

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo build --release --target wasm32-unknown-unknown --locked
```

Cuando se modifique el contrato compartido de TypeScript, ejecutar además `pnpm test:migration` desde la raíz; si se modifica código TypeScript, aplicar también sus controles de lint, cobertura y build. La cobertura del dominio Rust sirve para localizar huecos, con especial atención a ramas de error, límites y persistencia; no se impone un porcentaje global que incentive tests redundantes. Antes de cerrar una fase de cliente, arrancar el binario nativo y el WASM servido por HTTP y comprobar la interacción real.

## Cómo extender sin romper los límites

- **Material:** declarar su identidad y propiedades en `terrain`; añadir apariencia al catálogo de `assets`; probar clasificación, columna visible y textura en una escena pequeña.
- **Entidad:** añadir definición al archivo de configuración y al catálogo de recursos; validar huella, superficie, colisión y guardado; evitar condiciones específicas en `scene` o `render`.
- **Sistema:** añadir función o tipo en su módulo de dominio, registrarlo en el compositor de `simulation`, declarar eventos tipados y probar el orden. Si necesita estado persistente, añadir una `part` versionada.
- **Módulo visual:** declarar entradas, recursos y orden de capa; montarlo en `scene`, probar sincronización y liberación; no editar el mundo desde el dibujo.
- **Cambio de guardado:** versionar el formato o la parte afectada, escribir migración o error claro y probar archivos anteriores y malformados antes de publicar.
