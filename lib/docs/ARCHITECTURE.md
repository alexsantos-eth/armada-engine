# Arquitectura de Armada Engine en Rust

Este documento define los límites, contratos y prácticas de la implementación en Rust con Macroquad. Toma como referencia [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), que describe el juego en TypeScript, pero documenta las decisiones de este workspace. Conservamos los principios útiles del dominio, el flujo y la calidad; el algoritmo de generación y la distribución de entidades se diseñarán y ajustarán aquí.

## Estado y estructura

**Implementado:** el workspace `lib`, el crate `iso` sin dependencias gráficas y el cliente Macroquad (paquete `iso-core`), `grid` con mapa de celdas e índice espacial, búsqueda `paths`, `projection`, geometría y visibilidad básica de `camera`, reloj `time`, acumulador de paso fijo `simulation`, modelo y primer generador de `terrain`, el modelo de mundo `world` en memoria con chunks descubiertos, la geometría de sombras y las fases de luz de `lighting` con el horneado del mapa de sombras de una fase, sus pruebas y una muestra de terreno visible en la demo Macroquad nativa y WASM. El contrato V2 de catálogo de entidades y guardado está definido en TypeScript (`V2_DATA_CONTRACTS.md`) y pendiente de integración en Rust. **Previsto:** los demás módulos descritos abajo, la composición de sistemas de simulación, las reglas de colocación de entidades, el guardado persistente de chunks y la vista definitiva con assets. Una sección prevista es un contrato de diseño, no una afirmación de que su código ya existe.

```text
lib/
  Cargo.toml                  # workspace y cliente Macroquad
  README.md                   # guía del workspace
  docs/ARCHITECTURE.md        # este contrato
  scripts/                    # utilidades de atlas y ejecución nativa
  saves/armada_save.json      # guardado nativo local
  crates/iso/
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
    src/camera/              # geometría de cámara y nivel que mira al seguir; implementado
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
    src/lighting/            # geometría de sombras, fases y horneado; implementado
      mod.rs
      shadow.rs
      phases.rs
      bake.rs
      received.rs
      terrain.rs
      faces.rs
      moving.rs              # la sombra de lo que se mueve, cortada por casillas
      *.test.rs
    src/terrain/
      columns.rs
      generation.rs
      noise.rs
      appearance.rs          # zonas de tinte y variantes por ruido, sin GPU
      *.test.rs
    src/{entities,parts,...}/ # previstos; se crean al implementarlos (catálogo V2 definido en TypeScript)
    tests/contracts.rs        # contratos entre módulos y fixture de migración
  src/main.rs                 # entrada nativa/WASM, demo actual
  src/main.test.rs            # prueba colocalizada de entrada de la demo
  src/game/                  # muestra de chunks generados; implementado
    preview.rs
    preview.test.rs
  src/terrain_view/          # el terreno dibujado con el atlas; implementado
    mod.rs                   # la lista de materiales y su hueco en los arreglos de la vista
    blocks.rs                # la columna apilada y sus bloques
    appearance.rs            # contenido: zonas de color y qué crece sobre la hierba
    *.test.rs
  src/shadow_view/           # sombras horneadas por chunk; implementado
    mod.rs
    masks.rs
    atlas.rs                 # los mapas de los chunks mostrados, en una textura
    *.test.rs
  src/moving_shadow.rs       # la sombra del jugador, sin hornear
  src/moving_shadow.test.rs
  src/cloud_shadows.rs       # las sombras de las nubes, un patrón sobre la vista
  src/cloud_shadows.test.rs
  src/scene_material.rs      # el shader con el que se dibuja toda la escena
  src/scene_material.test.rs
  src/{input,scene,render,...}/ # cliente, previstos
  content/                    # manifiesto de assets y atlas (63 SVGs rasterizados en curso)
  web/                        # cargador WASM y archivos web
  reference/                  # capturas y medidas de referencia
```

La regla de dependencia es `iso-core → iso`. `iso` no importa Macroquad, navegador, audio ni archivos de la escena. El cliente puede usar tipos y decisiones del dominio; el dominio no conoce sprites, texturas ni resolución de pantalla. Si una regla necesita pruebas sin GPU o navegador, normalmente pertenece al dominio. No se añaden crates o módulos vacíos para anticipar fases futuras.

### Correspondencia con la organización anterior

`crates/iso/src/` cumple el papel de `web/src/isometric/core/engine/` y conserva carpetas por responsabilidad (`grid`, `paths`, `projection`, `camera`, y después `terrain`, `entities`, `world`, `player`, `time`, `events`, `simulation`, etc.). Cada carpeta tiene un `mod.rs` que define su API y archivos separados para cálculos o tipos con responsabilidades distintas. Los tipos compartidos viven junto al módulo que los posee; `grid::WorldCoord` es el ejemplo. Un tipo pasa a un módulo común solo cuando varios módulos lo necesitan y queda claro quién mantiene su contrato.

El cliente `lib/src/` mantendrá la separación de `game` (composición y arranque), `input` y módulos de escena y vistas. `scene` registrará módulos de presentación de forma explícita, como hace `game/modules.ts`; cada vista tendrá su propia carpeta y pruebas, y dependerá del dominio y de `render`, nunca al revés. `content/` conservará catálogos y configuración fuera de la lógica de colocación. No se copian carpetas de Pixi que no tengan equivalente funcional en Macroquad: se crean al llegar su fase y se nombran por la responsabilidad que cumplen.

Un módulo nuevo debe ofrecer una entrada pequeña en `mod.rs` y colocar sus pruebas junto al archivo que contiene la regla: `coords.rs` con `coords.test.rs`, por ejemplo. El archivo de producción registra el test con `#[cfg(test)] #[path = "coords.test.rs"] mod tests;`. `tests/` queda para contratos que crucen módulos, fixtures de migración y recorridos de integración. El punto de composición del juego se actualiza cuando se registra un sistema o una vista. Esta organización permite añadir módulos sin ampliar `main.rs`, `World` ni un renderer monolítico.

## Invariantes compartidas

- `World` es la fuente de verdad del juego. La escena y sus vistas mantienen solo cachés y recursos derivados. Descargar un chunk visual no elimina su contenido del mundo ni del archivo guardado.
- La rejilla usa coordenadas enteras para celdas y chunks, y posiciones fraccionarias solo para movimiento y proyección. La conversión de coordenadas negativas usa división euclídea; un chunk mide 32 × 32 celdas mientras no se cambie explícitamente el contrato.
- La proyección isométrica conserva sus ejes: `+x` aparece arriba a la derecha y `+y` arriba a la izquierda. Elevación, orden de dibujo y conversiones inversas comparten la misma configuración.
- La simulación avanza en ticks fijos de 50 ms. El tiempo del fotograma alimenta un acumulador y un factor de interpolación para dibujar; no altera las reglas de juego según los FPS.
- Las decisiones que afecten al juego usan un orden estable de iteración, desempate y eventos. No se exige que una semilla reproduzca el mundo anterior ni que vuelva a generar un mundo guardado.
- Los datos persistidos tienen versión y validación. Índices espaciales, GPU, cámara, listeners y cachés se reconstruyen; no se serializan.

### Sistema de coordenadas que se conserva

La referencia exacta es [Sistema de coordenadas](../../ARCHITECTURE.md#sistema-de-coordenadas). En el mundo, `x` crece hacia el noreste de la pantalla (arriba a la derecha), `y` hacia el noroeste (arriba a la izquierda), y `x+y` creciente se aleja de la cámara. `(0, 0)` es la columna del vértice sur, la más cercana a la cámara en el diagrama de referencia. `z` o `elevation` crece verticalmente hacia arriba; el nivel `0` corresponde al nivel del mar y los niveles negativos quedan bajo él. Una columna `(x, y)` va hasta `(x+1, y+1)` y su centro es `(x+0.5, y+0.5)`.

La pantalla tiene origen arriba a la izquierda, `screen_x` a la derecha y `screen_y` hacia abajo. El origen de proyección sitúa la columna `(0, 0)` dentro del canvas y no cambia los ejes del mundo. Los chunks repiten esos ejes: `(0, 0)` cubre `0..31` y una coordenada `-1` cae en el chunk `-1` con local `31`. Los assets SVG existentes usan otro convenio de ejes; su orientación y `data-tiles` se convierten al preparar atlas, sin cambiar el convenio del dominio.

**Ya cubierto en Rust:** tipos de mundo/chunk/local, división euclídea con negativos, proyección de puntos y elevación, inversa de desplazamientos, orden de vecinos de rutas, desplazamiento/zoom de cámara, selección de chunks visibles y columnas de terreno con nivel del mar `0`. **Pendiente de aplicar y probar:** huellas de entidades, profundidad de render y conversión de orientación de assets. Los mapas de sombras ya siguen el contrato: la matriz de silueta y el desplazamiento de sombra proyectada se portaron de `lighting/shadow.ts` con las mismas unidades. Cada módulo nuevo debe probar sus direcciones contra este contrato antes de integrarse en la escena.

## Flujo de un fotograma

1. `input` lee teclado, puntero y controles del cliente y los traduce a comandos de dominio. No mueve entidades directamente.
2. `app` acumula el tiempo transcurrido, aplica un límite a fotogramas largos y ejecuta cero o más ticks fijos.
3. En cada tick, los sistemas leen y modifican `World`; `time` avanza; `events` distribuye avisos tipados en orden de suscripción. Las decisiones sobre colisiones, rutas y terreno se resuelven aquí.
4. `scene` observa el estado resultante, determina los chunks visibles y sincroniza las vistas con presupuesto de trabajo por fotograma.
5. `camera`, `projection` y `render` construyen y dibujan la imagen. La interpolación afecta solo a la presentación. La escena limpia recursos de los chunks que salen de la vista.

La generación de un chunk se inicia desde el flujo de mundo, no desde una vista. El chunk generado o modificado pasa al archivo de mundo; luego la escena puede mostrarlo u ocultarlo cuantas veces sea necesario. El orden exacto de sistemas y eventos se declara en un único punto de composición y se cubre con una prueba de integración.

## Módulos de `iso`

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

**Y el aspecto del suelo se decide por grupos, no por columna.** `terrain/appearance.rs` es la regla pura de cómo se viste el terreno, el puerto de `terrain-view/variants.ts` y de la mitad `noiseTints` de `terrain-view.ts`. `NoiseField` es un campo suave en `[0, 1]` muestreado en coordenadas absolutas de mundo, con su propia corriente derivada de la semilla y una etiqueta (`derive_seed`, FNV-1a): una pradera cruza el borde de un chunk sin costura, no depende del orden en que llegaron los chunks y añadir un campo nuevo no mueve lo que otro ya decidió. `TintZones` reparte una paleta ordenada de oscuro a claro sobre un campo ancho; los cortes son partes iguales del rango, que sobre este ruido caen en ~9/26/31/25/9 % con cinco colores, de modo que el color intermedio es el común y los extremos son acentos —casi exactamente el reparto que el cliente TypeScript saca de su ruido simplex, así que no hace falta calibrarlo. `VariantPicker` decide qué crece encima con **tres** corrientes: el campo de *parches* (`VARIANT_PATCH_SCALE`, 6 columnas) dice dónde crece algo; dentro de un parche solo `VARIANT_PATCH_FILL` (0,7) de las columnas crece, elegidas por un hash de la columna (`noise::lattice_at`), para que un grupo sea disperso y no un borrón macizo; y el campo de *clase*, mucho más lento (`VARIANT_KIND_SCALE`, 24 columnas), dice *cuál*, así que los grupos vecinos coinciden y un tramo se lee como un tipo de pradera. Los dos umbrales se **miden** una vez sobre una rejilla fija de los campos en vez de suponerse: el ruido no es uniforme y un «por encima de `1 - chance`» a secas erraría la proporción pedida por un factor de dos. Todo es presentación: no cambia material, altura, transitabilidad ni lo que proyecta sombra.

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

`camera` guarda centro, zoom y seguimiento como estado de vista. La geometría y la selección de chunks visibles ya viven en `iso::camera`: desplazamiento, conversión pantalla/suelo, zoom alrededor de un ancla, seguimiento, transformación y visibilidad con margen y elevaciones. `camera::focus` guarda a qué altura mira una cámara que sigue al jugador, como el cierre `ground()` de `createPlayerView()` en TypeScript: fija el nivel en la cima que pisa, no lo mueve durante un salto, baja con los pies en una caída y sube a una cima más alta sobre la curva de una escalada (`CAMERA_RISE_MS_PER_BLOCK`). `advance()` devuelve el nivel que se muestra, llevado al nivel al que apunta por un resorte críticamente amortiguado (`CAMERA_LEVEL_SMOOTH_MS`, 65 ms), y `ground()` lo convierte sin suavizar en el punto de suelo que usa el otro cliente. El cliente Macroquad pone el centro de la cámara en la columna del propio jugador y suma ese nivel al origen de la proyección, así que lo único suavizado es la altura. Las tres decisiones están medidas: sin suavizar la altura, un cambio de nivel desplaza el mundo un escalón entero en un solo fotograma; suavizando también el avance por el suelo con `follow_camera()` —lo que hace TypeScript— el retardo es lo único contra lo que se dibuja al jugador, así que cada cambio de su velocidad se ve como un deslizamiento suyo (±32 px de brinco al subir un escalón, el doble al bajarlo, unos 50 px de disparo en la dirección de una escalada); y el suavizado es un resorte y no una persecución por medio-tiempo porque una persecución responde a toda velocidad, lo que pone una esquina al principio de cada movimiento, y un movimiento corto —medio bloque de arena— es casi todo ese principio. La tabla con el desplazamiento del jugador y el golpe de cámara medidos para cada forma de suavizado está en la documentación de `CAMERA_LEVEL_SMOOTH_MS`, que es el único sitio donde se ajusta. `streaming` queda pendiente; programará carga/descarga con presupuesto por fotograma y separará visibilidad de persistencia. Probar el presupuesto con una escena falsa.

### `scene` y vistas (muestra de terreno implementada)

`scene` compone módulos visuales (terreno, entidades, jugador, efectos, interfaz), resuelve su orden de montaje y los destruye en orden inverso. Cada vista sincroniza el estado de `World` con recursos visibles; no genera ni modifica terreno. El orden de dibujo es estable por profundidad y capa declarada. Probar el montaje y la sincronización de un módulo aislado, además de la composición completa con datos de mundo pequeños.

La muestra actual descubre cuatro chunks en `TerrainWorld` desde `game::preview` y entrega sus columnas ordenadas de lejos a cerca a `terrain_view::preview`. Usa `iso::scene_order` para profundidad por posición proyectada, elevación y casilla de la huella, seguida de capa; el fixture de migración comprueba el mismo orden estable en TypeScript y Rust. La vista únicamente proyecta y dibuja las columnas y consulta alturas vecinas para las caras expuestas. Usa colores de depuración para agua, arena, suelo e hierba; la vista con assets y la composición de `scene` siguen pendientes. La muestra no establece todavía un contrato de streaming, guardado ni colocación de entidades.

`scene_order::poses` también contiene las columnas puras de las hojas de caminar, reposar, trepar y saltar. Las comprueba el mismo fixture TypeScript/Rust antes de que el cliente Macroquad tenga sprites de jugador. La selección de hoja, atlas y textura pertenece al cliente.

`scene_order::select_player_frame` ya decide la prioridad entre hojas (`climb`, `jump`, `idle`, `walk`) y su columna. Cada cliente convierte ese resultado a una textura de la orientación actual; el atlas y el recurso siguen siendo responsabilidad del cliente.

`player_view` es esa conversión en el cliente Macroquad, y es lo único que recuerda de un fotograma al siguiente: las columnas recorridas desde que el jugador dejó de estar quieto, que mueven el ciclo de marcha, y los milisegundos reales que lleva quieto, que mueven el de reposo. Con ellos llama a `select_player_frame` y devuelve fila y columna: la fila es la orientación (`get_player_facing` sobre la dirección de la escalada o de la marcha, y la última conocida mientras está quieto) y la columna la pose. El ciclo de marcha avanza con la distancia y no con el tiempo (`WALK_STRIDE`, 1.4 columnas por ciclo), así que no se desliza al cambiar la tasa de fotogramas y los pies de alguien que corre giran más deprisa solos; patinando pedalean al doble y hacia atrás si se soltaron los controles (`SKID_PEDAL`); el reposo espera `IDLE_DELAY_MS` antes de empezar a bailar, para que una parada entre dos pasos no lo dispare; y las columnas del salto se buscan por nombre (`data-poses`) para que una hoja regenerada en otro orden siga mostrando la fase correcta. Es la misma contabilidad que hace `player-view.ts`, separada del dibujo para poder probarla sin abrir ventana. Si falta una hoja se dibuja la figura quieta de `block.svg`, y si falta también, un marcador.

El cliente dibuja al jugador igual que el cliente TypeScript: el `InkBox` del manifiesto —la ventana que comparten las celdas de su hoja de poses— escalado por `PLAYER_SCALE` (0.75) alrededor del punto de suelo proyectado de su casilla, nunca ajustada al ancho del tile, de modo que la figura queda centrada en el rombo a cualquier zoom. Se dibuja en su posición exacta e interpolada, pero se ordena por la casilla en la que está: una clave construida con la posición fraccionaria deja al jugador detrás de su propio suelo en la mitad de cada casilla. Sobre esa casilla ocupa dos capas, una por debajo de las entidades y otra por encima (`PLAYER_BEHIND_LAYER` < `ENTITY_LAYER` < `PLAYER_FRONT_LAYER`), según esté más allá del centro de la casilla (`x + y`) o antes: así camina detrás del tronco de un árbol y por delante cuando lo rodea, como `SCENE_LAYER.behindObject` en TypeScript. Para que ese empate exista, terreno, entidades y jugador comparten una sola clave, `sprites::scene_key`, alimentada siempre con el centro de la casilla y su elevación. Antes convivían dos: el terreno ordenaba en coordenadas de mundo y las entidades y el jugador por su posición en pantalla, escalas que no se pueden comparar, así que ningún bloque de terreno llegaba a cubrir al jugador; y cada banda de una entidad usaba el centro de su dibujo, que queda tan por encima del suelo como alto sea el sprite, de modo que un árbol se ordenaba un tercio de tile más lejos que su casilla y el jugador que la comparte siempre salía por delante. Sus pies se apoyan en el techo que se dibuja, no en el plano de la casilla: la arena se dibuja como una losa baja, así que `preview_top_inset` la hunde medio bloque y el cliente resta ese `inset` al proyectar y al caminar (`step_player`), igual que `TERRAIN_APPEARANCE.sand.topInset` y `drawnFoot` en TypeScript. Por esa misma losa baja, el escalón desde la playa hacia la tierra medía bloque y medio y se leía como un muro, así que **la última fila de playa antes de un escalón lleva un bloque más de arena** (`TerrainGenerator::shore_step`): el resto de la playa sigue siendo un solo bloque y el ascenso se parte en dos. Solo sube donde nada alrededor es más bajo, para que la playa no levante un acantilado de dos bloques sobre el mar, y se decide con las alturas crudas para que una fila levantada no levante a su vez la de atrás. Bajo una superficie de arena el bloque siguiente también es arena (`material_at`), que es lo que se ve en la orilla del agua y bajo esa fila doble. Un bloque enterrado bajo la superficie de su propia columna se dibuja subido hasta el plano de su casilla (`buried_lift`): la losa de arena solo cubre su propio cuerpo, así que dos bloques de arena a un nivel de distancia dejaban una muesca en los vértices laterales y el de arriba se leía como una placa flotando sobre el otro; subido, su techo encaja con la base del bloque de encima. La cima de la columna nunca se sube, porque ese techo hundido es el aspecto de la playa y es donde se apoya el jugador, y del bloque subido se dibuja además una copia en su sitio original, con la misma clave de profundidad, para que la junta de abajo siga cerrada. La excepción es la **fila de terraza**, la que queda pegada a un escalón de subida (`top_is_flush` en `columns.rs`): esa conserva su elevación y solo sube su techo, de modo que lo que falta del ascenso se parte en dos escalones pequeños en vez de uno de bloque y medio. Es una sola regla, y la consultan tanto la vista como la física (`drawn_inset`), porque si el techo sube y los pies no, el jugador camina dentro del escalón. El resto de la playa y la línea de agua conservan el techo hundido. En Pixi no es así; es una decisión de diseño propia de este cliente. Un sprite que ocupa varias casillas se corta en bandas (`footprint_band`), y el corte cae **recto hacia abajo, media casilla más allá del centro de cada una**, el mismo reparto que hacen las tiras verticales de `createBlockViews` en TypeScript (`length + 1` tiras de media casilla, con clave `[0, 0, 1, …]`): media casilla más allá y no en el centro porque dos columnas vecinas se solapan media casilla en pantalla y ese solape pertenece a la casilla de delante. Cortar por el borde del rombo que comparten las casillas, como se hacía, reparte distinto en una cuña que se ensancha cuanto más alto llega el dibujo, y ahí el jugador a la altura de la casilla lejana asomaba en fragmentos por encima de un edificio largo. Los bloques de terreno se dibujan al tamaño en que fueron dibujados, como cualquier otro sprite y como el cliente TypeScript, que dibuja la plantilla entera del bloque de un tile de ancho; y **el bloque de terreno llena su casilla entera** (`artifacts/terrain_blocks.py`), así que un campo no tiene surco por el que se vea el fondo. Estirar el dibujo hasta el tile —que era la otra forma de cerrar esos surcos mientras los bloques eran de arcilla con las esquinas redondeadas— dejaba cada rombo de suelo un dos por ciento más grande, y la casilla de delante del jugador, que se dibuja después, pintaba ese exceso sobre sus pies. Una columna se apila hacia abajo hasta la más baja de las **tres** columnas que tiene delante (`-x`, `-y` y su diagonal, `exposed_floor`): con las esquinas redondeadas, donde dos columnas a la misma altura se juntaban con una más baja al otro lado de la esquina se veía un cuadro de fondo; con el prisma la esquina ya cierra, pero la regla es la que dice `COVERING_CELLS` en TypeScript con su `[-1, -1, 1]` y se conserva.

`terrain_view::appearance` es el contenido que alimenta esa regla en el cliente, con los números del cliente TypeScript (`content/terrain.ts`), y la unión con el atlas. La hierba y los caminos comparten un mismo campo de tinte (`terrain-tints:grass`, escala 10, `[0xbfd5bd, 0xdde9d4, 0xffffff, 0xfff0c0, 0xffe49c]`: pradera densa y oscura, algo oscura, lisa, amarillenta y amarillo seco), para que los bordes de hierba de un camino tomen el color de la pradera que cruzan en vez de ser una franja de otra zona; el suelo desnudo tiene su propia paleta, deliberadamente tenue (escala 11); la arena y el agua conservan su color. Sobre la hierba crecen nueve topes (`block_flowers`, `block_flowers_2`, `block_wildflowers_red`, `block_wildflowers_white`, `block_sprouts`, `block_leaves`, `block_pebbles`, `block_mushrooms`, `block_bushes`), que suman el 32 % de la hierba: cada uno es un **bloque de hierba completo** con la maleza pintada encima, generado desde el bloque liso por `artifacts/grass_clutter.py`, así que una columna vestida sigue siendo un sprite en una casilla —sin entidad, sin huella, sin colisión y sin sombra propia— y mide exactamente lo que mide el bloque liso, de modo que el margen de recorte de `TerrainFrames::reach` le vale. Solo se viste la **cima** de la columna: un bloque vestido enterrado en un acantilado esconde sus flores dentro del bloque de encima. El atlas ya trae los nueve, así que no cuesta textura ninguna; un tope que el atlas no tenga medido se deja fuera del selector y los demás reparten su proporción, en vez de abrir un agujero en el suelo. El tinte viaja como color por vértice de cada sprite (`DrawKind::Sprite { tint }` y `SpriteDraw::tinted`), no como material ni pipeline, así que el terreno teñido sigue en el mismo lote que el resto de la escena: las zonas de color no cuestan ninguna llamada de dibujo. `TerrainLook::new` recibe el atlas como una función de búsqueda y no por referencia, porque el atlas es una textura de GPU y este catálogo no: así la regla se comprueba contra el manifiesto publicado sin abrir ventana.

### `assets` y `render` (tubería de atlas implementada)

`assets` mantiene un catálogo de identificadores, metadatos de dimensiones/huella y texturas compartidas. Los SVG existentes pueden servir de fuente para generar atlas rasterizados antes de ejecutar el juego; el runtime WASM carga formatos compatibles con Macroquad.

**Resolución por tile, no por celda.** `scripts/rasterize.py` dibuja cada SVG a `PIXELS_PER_TILE / 1024` de su tamaño propio (320 px por tile de mundo), así que un sprite llega al empaquetador ya al tamaño al que se dibuja, sea un canto rodado o un muelle de tres casillas, y `pack_atlas` solo recorta su parte opaca y lo coloca en estanterías dentro de un atlas de 4096 px de ancho. Antes cada archivo se encajaba en una celda fija de 128 px: un arbusto y una torre de seis plantas recibían los mismos píxeles, de modo que la torre se dibujaba a un tercio de su detalle. Como nada se reescala dos veces, el recorte del empaquetador coincide con el `InkBox` medido del SVG (`assets::ink`), y `remeasure_atlas` sigue sirviendo para reescribir la geometría de un atlas ya empaquetado sin rasterizar nada; ambas herramientas redondean con `InkBox::rounded` para que el manifiesto no cambie por la cola decimal.

**Las hojas de poses del jugador tienen textura propia.** `walk.svg`, `idle.svg`, `jump.svg`, `climb.svg` y `jetpack.svg` son rejillas de 16 orientaciones por varias poses; metidas en el atlas como un sprite más, una pose acababa midiendo unos dieciséis píxeles. `assets::sheet` lee la rejilla del propio dibujo (`data-cell`, `data-gap`, `data-frames`, `data-poses`, `data-facings`), `scripts/rasterize.py` dibuja cada celda por separado en la ventana que todas comparten —sin cortar píxeles, así que ningún borde de celda cae entre dos píxeles— y `pack_atlas` las empaqueta en `content/player-16_<hoja>.png`, una rejilla por hoja. El manifiesto (esquema 2) añade `texture`, `textureSize` y `sheet` a esas entradas, y sus `frames` van por filas, de modo que la pose está en `facing * columns + pose`. Como todas las celdas enseñan la misma ventana de la plantilla del personaje, la hoja entera comparte un solo `InkBox`: la pose se mueve dentro de la ventana y la ventana no se mueve del sitio del jugador.

**Dieciséis orientaciones, y son de este cliente.** Las hojas que dibuja están en `web/public/assets/player-16/` y tienen una fila por cada punto de la rosa de los dieciséis vientos, en sentido antihorario desde el este (`PLAYER_FACINGS` en `player::physics`), o sea un giro de 22.5° entre filas en vez de los 45° que se leían como un salto. Las genera `artifacts/player_walk.py` —las demás hojas leen de ahí la lista— con `PLAYER_FACINGS=16` en el entorno, que es su valor por omisión; con `PLAYER_FACINGS=8` saca exactamente las ocho de antes, que son las que sigue usando el cliente Pixi en `web/public/assets/player/` porque carga la hoja entera como una sola textura y dieciséis filas se la doblarían. Este cliente no paga eso: corta cada celda por separado. `rasterize.py` se salta las hojas de ocho (`SKIPPED_SHEETS`) para no empaquetar cinco texturas que nadie pide. Las celdas de dieciséis son un poco más anchas (408 unidades frente a 398) porque el baile del reposo se inclina más en las orientaciones intermedias; cada hoja lleva su `data-cell`, así que las dos conviven y la ventana ancha contiene a la estrecha centrada en el mismo punto. Como el teclado solo apunta a ocho direcciones, un giro recorre las intermedias a razón de `TURN_MS_PER_FACING` (35 ms) por fila y por el lado corto, que es para lo que están: sin eso las filas nuevas no se verían nunca. `render` convierte materiales, entidades y capas decididos previamente en llamadas de dibujo; reutiliza texturas y limita recursos visibles. No contiene reglas de generación, colisión o colocación. Probar el catálogo y el orden de comandos de dibujo sin GPU; revisar composición y escala en nativo y navegador. `render` convierte materiales, entidades y capas decididos previamente en llamadas de dibujo; reutiliza texturas y limita recursos visibles. No contiene reglas de generación, colisión o colocación. Probar el catálogo y el orden de comandos de dibujo sin GPU; revisar composición y escala en nativo y navegador.

### `lighting` y `shadow_view` (sombras de una fase, horneadas; implementado)

**Responsabilidad.** `iso::lighting` es la geometría pura de la luz, sin GPU: `shadow.rs` porta `lighting/shadow.ts` —`ShadowProjection`, la matriz de silueta que lleva píxeles de pantalla a casillas de mundo, el desplazamiento de una sombra proyectada de emisor a receptor y su alcance—; `phases.rs` guarda las cuatro fases autorizadas con los mismos números que `lighting/phases.ts` (`DAWN`, `DAY`, `SUNSET`, `NIGHT`); `bake.rs` hornea un mapa de cobertura por chunk a `SHADOW_MAP_PIXELS_PER_TILE` téxeles por casilla; `received.rs` calcula la rejilla de sombra que recibe un sprite, el equivalente de `receiveShadowGrid`, y contesta además la sombra en un punto suelto (`shaded_at`), que es como se sombrea una cara vertical; `terrain.rs` convierte un trozo de terreno en un campo de alturas (`HeightField`) y contesta, para cualquier punto, qué altura le tapa el sol (`horizon`), que es el equivalente de `terrain-shadow.ts`: el suelo emite sin ser una silueta; `faces.rs` encuentra las caras verticales expuestas de las columnas (`terrain_faces`), solo la cáscara hacia la cámara y partidas por bloque, el equivalente de `lighting/faces.ts`.

**Este cliente hornea; el de Pixi no.** El cliente TypeScript interpola entre fases cuando el juego se lo pide, así que recalcula sus mapas de sombra en render targets de GPU. Aquí la sombra se hornea en CPU una vez por chunk y se queda quieta en una fase: cambiar de fase obligaría a rehornear todos los chunks. Por eso solo `DAWN` está conectada, y por eso el mapa se hornea en CPU a una textura de un canal de alfa y no se recoge en un render target: es estático, se recorta por columna gratis y se sube una vez. Hornearlo en la GPU con un render target es la siguiente fase y mataría los 23 ms por chunk. Las otras tres fases se conservan con sus constantes para que la fase de una escena sea un cambio de una línea.

**Cómo llega a la pantalla.** `shadow_view` es del cliente. `masks.rs` reduce el atlas a siluetas de alfa a un cuarto de resolución (`MASK_SCALE`), que es lo que proyecta cada emisor. `mod.rs` hornea un chunk por fotograma como mucho, con los emisores del propio chunk y de sus ocho vecinos, y rehornea cuando cambia qué vecinos están cargados. El mapa de un chunk se dibuja como una capa propia (`GROUND_SHADOW_LAYER`, por debajo del jugador y de las entidades) con un cuadrilátero por columna cubierta, apoyado en el techo que se dibuja, y la columna sin suelo —agua, hueco— se limpia después del desenfoque para que la sombra no se derrame por el acantilado. Entidades y jugador no se dibujan con una máscara aparte: reciben una rejilla de sombra que se convierte en colores de vértice sobre el propio sprite (`sprites::ShadeLattice`, `SpriteAtlas::draw_shaded`), así que el alfa del dibujo confina el sombreado sin un paso de máscara. La del jugador se muestrea cada fotograma porque se mueve; la de una entidad se hornea con el chunk.

**El terreno también emite, y los acantilados reciben.** El suelo no se reparte en siluetas: se consulta. Cada chunk se hornea contra un `HeightField` que llega más allá de su propia área —el acantilado que sombrea el borde suele estar en el chunk de al lado— y cada punto pregunta su horizonte con un recorrido DDA por los bordes de columna hacia el sol (`TERRAIN_RAY_REACH`, doce casillas), de modo que una duna tapa la playa de atrás y un acantilado dentro de la sombra de otro queda oscuro de arriba abajo. El mismo horizonte sombrea entidades y jugador, así que el mono se oscurece al entrar bajo un escalón. Las caras verticales expuestas se dibujan como una capa de cuadriláteros con su propia rejilla (`FACE_SHADE_STEPS`), sombreados punto a punto con `shaded_at`, así que una entidad proyecta su sombra sobre un acantilado igual que sobre el suelo. Las entidades de varias casillas reciben una sola rejilla para todo el dibujo y cada banda muestrea su parte, para que la sombra cruce un edificio largo en vez de escalonarse en cada corte.

**El horizonte se muestrea en rejilla, y la rejilla no cruza una columna.** Preguntar el horizonte en cada téxel costaba unos seis milisegundos por horneado; se muestrea uno de cada `TERRAIN_SAMPLE_TEXELS` y se interpola. Pero el horizonte salta en el borde de una columna —un acantilado está en el horizonte del suelo de abajo y no en el de su propio techo—, así que una esquina de otra columna no se lee: el téxel toma la de su propio lado. Interpolando a través de ese borde salía una banda oscura en el labio soleado de cada acantilado.

**Fuera de alcance esta vuelta.** El jugador no proyecta sombra, y solo el amanecer está conectado.

**Una sombra se apoya en el techo que se dibuja, no en la casilla.** El cuadrilátero de cada columna va al nivel al que el terreno dibuja su techo, que es la misma pregunta que contestan los pies del jugador y el propio bloque y que vive en un solo sitio (`preview_top_level`): el inset de su material, salvo en la fila de terraza, que el terreno dibuja a ras de su casilla. Sin esa excepción la sombra caía medio bloque por debajo de la arena a la que pertenece y se leía como una losa corrida.

**Y es la casilla, sin recortes ni desplazamientos.** El cuadrilátero de cada columna es su propio rombo. Eso solo vale porque el bloque de terreno llena la casilla: mientras fue un cuatro por ciento más estrecho hubo que elegir entre dejarlo sobre la casilla —y entonces cada esquina lejana sobresalía por encima de su propia losa y posaba una segunda sombra sobre la de atrás, una costura clara a lo largo de cada borde lejano—, recortarlo a la cara dibujada —y el surco entre bloques se quedaba iluminado, así que una sombra sobre un campo de playa salía como una rejilla de costuras— o correrlo hacia la cámara media diferencia, que era lo que había y dejaba sus propias líneas sin sombrear en la arena y en las caras verticales. Con el bloque entero no hay nada que elegir: la sombra del suelo cubre la casilla y la de una cara vertical va de borde a borde del escalón.

**Y el desenfoque tampoco cruza una columna.** El mapa se termina con un desenfoque de caja de un téxel, que es la penumbra. Al no saber de niveles, repartía el téxel pegado al pie de un muro entre su propia sombra y el techo iluminado de encima: el alfa caía de 255 a 170 justo contra la pared y la sombra se despegaba del escalón que la proyecta, una línea pálida al pie de cada peldaño de la playa. En el otro sentido oscurecía el labio soleado del techo. `blur_within_levels` corta el desenfoque en todo borde entre dos columnas que no se dibujan a ras —niveles distintos, o una de las dos sin suelo— y lo deja correr entre las que sí, para que una sombra que cruza un campo conserve su borde suave. Un corte solo puede caer en un borde de casilla, así que cada pasada hace primero la media sin saber de cortes y solo rehace después los pocos téxeles cuya ventana llega a uno.

**Y la sombra se dibuja de una textura, con un lote para toda la escena.** Macroquad abre una llamada de dibujo nueva cada vez que cambia la textura ligada **o el pipeline** (`QuadGl::geometry` compara ambos), y una sombra va entre el bloque sobre el que se apoya y el siguiente. Con un mapa horneado por chunk como textura propia, cada columna costaba dos llamadas —atlas, mapa, atlas— y una escena de 211 sprites, que antes era **un** lote, pasó a 134. La primera respuesta fue leer los téxeles al hornear y guardarlos como una rejilla de cobertura por columna, dibujada con color por vértice sobre un téxel blanco del propio atlas (`sprites::WHITE_PATCH`): eso devolvió el lote, pero movió todo el coste a la geometría —221 vértices por columna a 36 téxeles, el **96 %** de todo lo que dibujaba un fotograma (11.711 de 12.165, contra 292 de todo el terreno y las entidades juntos). La respuesta de ahora es volver a la textura y tener **una sola**: el mapa de cada chunk mostrado vive en un hueco del atlas de sombras (`shadow_view::atlas`, nueve huecos de 1224 téxeles, un canal de alfa, 13,5 MB), y `scene_material` dibuja **toda** la escena con un material cuyo shader muestrea ese atlas por un segundo sampler. Una sombra del suelo es entonces **cuatro vértices**: `normal.xy` lleva dónde leer el mapa y `normal.z` dice que es una sombra —los dieciséis bytes de `normal` que Macroquad no usa y la escena ya subía para nada. Medido sobre el mismo paseo: de 9.353 a **785 vértices** por fotograma (−92 %), de 16.246 a 742 triángulos, el mismo número de lotes, y el fotograma del contenedor de 11,7 a 9,8 ms (p95 de 14,8 a 11,4; peor de 20,4 a 13,1). Píxel a píxel la escena es la misma: solo se mueven los bordes de sombra, como mucho 17/255, porque el sampler lee los téxeles reales donde la rejilla los aproximaba.

**El atlas desaloja, y por eso la cámara no puede mostrar más chunks que huecos.** Un hueco es el mapa de un chunk con su margen, y se reclama al hornear; si están los nueve ocupados sale el chunk mostrado hace más tiempo, y el que lo pierde se olvida y se rehornea si la cámara vuelve a él (guardar sus téxeles para rellenar costaría 1,5 MB por chunk, el precio mayor para el caso más raro). Eso solo es seguro mientras el recorte de cámara devuelva menos chunks que huecos: con una casilla de 280 px un chunk mide miles de píxeles y una pantalla muy grande ve dos o tres, pero si se baja el zoom hay que subir los huecos o bajar la resolución del mapa antes. `the_atlas_holds_more_chunks_than_the_camera_can_show` lo comprueba y `ShadowScene::update` lo afirma en depuración.

**El material es uno para todo, y es OpenGL.** Ligar un material por sombra rompería el lote igual que ligaba una textura, así que el material se liga una vez alrededor de la lista ordenada y se suelta después, para el HUD; cada vértice dice en `normal.z` si es dibujo del atlas de sprites o cobertura del atlas de sombras. El shader es GLSL `#version 100`, que es lo que corre en todas partes donde esto se publica —Miniquad pone macOS en OpenGL por omisión y la web es OpenGL—; no hay fuente Metal en vez de una sin verificar, así que `SceneMaterial::load` rechaza un contexto Metal y lo dice, y el cliente arranca sin sombras horneadas en lugar de dibujarlas mal.

**El detalle de una sombra son téxeles, y el coste del horneado no.** A doce téxeles por casilla —y una casilla mide unos cientos de píxeles en pantalla— la copa de un árbol caía como un borrón de borde recto, y a veinticuatro las hojas seguían siendo una línea vista de cerca. El mapa se hornea a **36**; el techo no es ese número sino las siluetas que muestrea, que el cliente guarda a 80 téxeles por casilla. Un chunk con su margen son 1224 téxeles de lado, 1,4 MB de cobertura, pero es un único búfer de usar y tirar que se reutiliza chunk tras chunk. Se probó también a 48, que vuelve a dar un borde visiblemente más duro, pero su horneado es el doble que este y no compensaba el tirón al entrar un chunk.

Nada del horneado creció con los téxeles si se podía evitar. (1) El paseo del rayo hacia el sol ya no sigue a la resolución del mapa: `TERRAIN_SAMPLES_PER_TILE` es un ritmo sobre el **mundo**, tres por casilla, porque la sombra del propio suelo es tan suave como su horizonte y no gana nada con más muestras, mientras que una silueta lo gana todo. (2) Entre dos esquinas del horizonte la altura es una recta, así que se calcula al primer téxel de cada tramo y luego se lleva sumando: cuatro esquinas y tres mezclas por tramo, dos sumas por téxel. (3) La silueta ya no se pregunta téxel a téxel: `bake_ground_shadows` recibe el plano entero (`Silhouette`, el atlas reducido con la caja de cada sprite dentro) y camina por él, y como el punto avanza un paso fijo por téxel, el tramo de cada fila que cae sobre el dibujo se **despeja** en vez de probarse píxel a píxel. (4) La segunda pasada del desenfoque va por filas y no por columnas, llevando las tres filas vivas en un anillo: leer una columna de un mapa de más de un megabyte tiraba una línea de caché por téxel. Las cuatro son exactas, comparadas píxel a píxel contra la versión anterior a 24 téxeles.

**Y el horneado no divide donde el mapa ya está decidido.** Medido por fases, hornear un chunk a 36 téxeles son 16 ms repartidos así: emisores 13 %, horizonte 4 %, tendido del terreno 38 %, desenfoque 45 %. Casi todo eso era una división por téxel sobre un mapa que no la necesita: contado sobre dos chunks reales, el **97 %** de los téxeles acaba en 0 o en 255 y solo el 3 % en un valor intermedio. Así que (1) el tendido del terreno pregunta la cobertura en los dos extremos de cada tramo del horizonte, que es una recta: si el sol lo pasa por los dos el tramo entero está iluminado y no se escribe nada, y si queda enterrado por los dos es 255 sin dividir. (2) El desenfoque recorre cada fila por tramos de valor constante —la media de una ventana cuyos téxeles son todos iguales es ese valor—, escribe el interior del tramo de golpe y solo promedia las ventanas que pisan el final de un tramo. (3) La pasada vertical lleva las sumas en vez de rehacerlas: suma la fila que entra y resta la que sale. (4) Y la división de una ventana completa sale de una tabla, porque son `2 * span + 1` téxeles de 255 como mucho y por tanto unos pocos cientos de cocientes posibles para millón y medio de téxeles. Las cuatro son exactas: `the_blur_across_is_a_mean_of_its_window_texel_by_texel` y su pareja vertical comparan cada téxel contra una media hecha a mano, y la suma de comprobación del mapa horneado es la misma byte a byte que antes del cambio. De 16,2 a **10,7 ms por chunk** en el contenedor (terreno 5,4 → 3,0; desenfoque 8,5 → 4,5).

No se hornea en la GPU, y no por falta de ganas: la parte que mapea natural a un render target son los emisores, el 13 %, así que haría falta llevar también el terreno y el desenfoque a GLSL, es decir una segunda versión de `iso::lighting` que ya no sería pura ni comprobable. Y el formato no deja: un render target de `TextureFormat::Alpha` funciona en OpenGL —miniquad lo pone en `GL_R8` y el shader escribe el rojo—, pero en WASM lo pone en `GL_ALPHA`, que WebGL no admite como destino de color, así que el atlas tendría que pasar a RGBA8 y de 13,5 a 54 MB. Sobre lo que cuesta de verdad: en 1.199 fotogramas de un paseo solo **30** hornean algo, 14,8 ms de mediana contra 10,7 sin hornear.

**Y ya no hay rejilla que adelgazar.** Mientras la cobertura era color de vértice, la rejilla subía con el mapa —era *cómo* se leía el mapa— y había que adelgazarla por columna (`coarsened`) para que la playa no pagase 361 vértices por cada columna de sombra plana. Con el mapa en una textura eso desaparece: la resolución del mapa ya no cuesta geometría, cuatro vértices valen para cualquier detalle, y el filtrado bilineal de la GPU lee entre los téxeles mejor de lo que leía entre las esquinas de una rejilla. Lo único que `shadow_view` guarda ya por columna es **si hay algo que dibujar** (`ground_cover`), que es lo que evita un cuadrilátero transparente por columna en un chunk a pleno sol.

**Y el cuadrilátero no lee a través de una casilla.** Sus esquinas se meten hasta el centro del téxel exterior de la columna (medio téxel) en vez de quedarse en el canto, porque un canto mezcla la mitad del téxel de la columna vecina —y esa columna está a otro nivel y se dibuja en otro sitio—, lo que devolvía la línea pálida al pie de cada escalón. Es la misma regla que siguen el horizonte y el desenfoque, y la que seguía la rejilla antes. El cuadrado de téxeles de una columna dentro de su hueco lo contesta `MapArea::square_of`, el mismo sitio del que lo saca el horneado: calcularlo dos veces sería una segunda fuente de verdad sobre dónde vive la sombra de una columna, y en cuanto se separasen cada sombra se movería un téxel.

**Y el horneado se reparte entre fotogramas, porque un chunk entero no cabe en uno.** Hornear un chunk a 36 téxeles cuesta unos 40 ms: más de dos fotogramas a 60 Hz, y eso era el tirón al moverse. No era el dibujo ni la resolución; era que `ShadowScene::update` empezaba y acababa un chunk dentro de la misma llamada. Y no ocurre una vez: al cruzar un borde de chunk el nuevo y sus ocho vecinos quedan caducos a la vez, así que el tirón se repetía fotograma tras fotograma hasta vaciar la cola. El cliente de Pixi no lo tiene porque recoge sus sombras en una textura de la GPU y no hornea nada en la CPU.

El horneado es ahora una máquina de estados que se puede parar: `GroundBake` (en `bake.rs`) guarda la cola de emisores, el horizonte a medias y en qué fase va —`Casters`, `Horizon`, `Terrain`, `BlurAcross`, `BlurDown`—, y `step` adelanta **un trozo**: un emisor, ocho filas del horizonte, cuatro filas de terreno, una pasada del desenfoque. El cliente envuelve eso en un `Pending` que lleva además por dónde va la lectura del mapa (`Reading`: el mapa, las columnas del suelo en tandas de 128, las entidades, las caras), y `update` encadena trozos mientras le quede presupuesto: `BAKE_BUDGET_MS`, 3 ms, en lugar del antiguo «un chunk por fotograma». El trozo en curso nunca se interrumpe, así que el presupuesto se pasa por lo que cueste el trozo más gordo, no por un chunk.

Dos propiedades hacen que esto no se note. El `Baked` anterior **no se retira** al empezar el nuevo, así que mientras un chunk se rehornea se siguen viendo sus sombras viejas en vez de un hueco. Y un trabajo a medias se tira si su chunk desaparece del stream o si cambian sus vecinos cargados, que es justo cuando su resultado ya no valdría. El horneado es el mismo cálculo en el mismo orden, así que el mapa sale idéntico píxel a píxel al de la versión que lo hacía de una vez. Medido en el contenedor sobre el mismo paseo: el peor fotograma de CPU baja de **56 ms a 13 ms** —y esos 13 son la ráfaga de los nueve chunks del arranque; ya en marcha el peor es de 3 a 4 ms, con una media de 0,3 ms de montar la escena.

### Las dos sombras que se mueven (implementadas)

Todo lo anterior es horneado, y lo horneado solo vale mientras nada se mueva. Hay dos sombras que sí se mueven, y ninguna de las dos pasa por el horneado.

**La del jugador.** El cliente de Pixi marca como caducos los mapas que toca un emisor móvil y los vuelve a recoger (`shadows/moving-shadow.ts`), que es barato porque sus sombras son una textura de la GPU; aquí rehornear un chunk cuesta decenas de milisegundos, así que hacerlo a cada paso sería un tirón por paso. La sombra del jugador es por eso **geometría**: `lighting::moving` toma la misma `silhouette_matrix` del horneado, tiende la silueta del jugador sobre cada superficie que puede recibirla y la **corta** en trozos convexos (recorte de Sutherland-Hodgman, con la `uv` del dibujo interpolada en cada corte, que es exacto porque el mapa de una superficie plana al dibujo es afín). `moving_shadow` proyecta cada trozo y lo encola con la profundidad de su casilla y `GROUND_SHADOW_LAYER`, así que cada pedazo se ordena como la sombra horneada de esa casilla: encima de su terreno, debajo de lo que esté plantado en él y debajo del jugador. Sin ese corte la sombra sería un cuadrilátero sobre la casilla del jugador y el terreno dibujado por delante se la comía: la sombra de una figura de dos casillas de largo salía como un muñón bajo los pies. La silueta sale del propio fotograma de la hoja de poses, con `SpriteAtlas::draw_silhouette` dibujando ese fotograma en negro al alfa de la fase, así que la sombra tiene brazos, orejas y pose sin costar nada aparte, y un salto la despega hacia donde cae la luz porque el salto es un `lift`.

**Un rayo cae una sola vez.** La primera versión tendía la silueta entera sobre *cada* techo que cruzaba, de modo que al bajar un escalón se veían dos figuras completas, una por nivel, en vez de una que se estira. Un rayo, sin embargo, se detiene en la primera superficie que encuentra. `ShadowSurface` es ahora cualquiera de las dos cosas que lo detienen —el techo de una casilla o una cara vertical— y, antes de tender un trozo sobre una de ellas, `blocked_by` **resta** la región que ya había recogido un techo más alto: para cada casilla del área con techo por encima, los cuatro planos de sus lados vistos a la altura de ese techo, más el plano que separa lo que queda por encima del receptor, dan un convexo; lo que cae dentro de él pertenece a esa casilla y se quita (`subtract`, descomposición en convexos, con un tope de `MAX_PIECES_PER_SURFACE` trozos por superficie). El invariante es exacto y es lo que afirma el test: con rayos paralelos la sección es la misma en cualquier plano horizontal, así que el **área total tendida sobre dos niveles es la de una sola silueta**, con un error por debajo de 1e-6.

**Y se pliega sobre las caras verticales.** Una cara expuesta (`faces::terrain_faces`, las mismas que ya recibían sombra horneada) es un rectángulo en el mundo, así que el paso de sus parámetros `(along, down)` a la `uv` del dibujo también es afín: una pared cuesta los mismos cuatro vértices que un techo y la sombra la sube deformada en vez de saltarla. Como el sol del amanecer viene de `+x`, solo las caras que miran a `-y` lo reciben; las que miran a `-x` están a contraluz y el horneado ya las deja oscuras de arriba abajo, así que no hay nada que pintar encima. Por eso, en el canto de una playa —cuyo escalón corre a lo largo de `y`— la sombra sigue cruzando el hueco y cayendo más allá sobre el agua: no es un salto, es lo que hace un sol bajo sobre una pared que ya está en sombra.

Lo que sigue sin hacer: no sube por los árboles ni por las entidades, y no pregunta al horizonte del propio suelo (`terrain.rs`) si una duna lejana le tapa el sol. `MAX_SHADOW_LIFT` (dos bloques) limita cuánto puede caer o subir un rayo desde el plano del emisor antes de darlo por perdido, que es lo que acota el área de casillas que hay que mirar.

**Las de las nubes.** Las nubes no están en la escena: lo que se ve es su sombra, y es la misma artwork del cliente de Pixi (`web/public/assets/cloud-shadow.svg`, generada por `artifacts/cloud_shadow.py`), nubes de vóxeles hechas de rombos de media casilla y desenfocadas una vez para que los bordes se fundan y los solapes no sumen opacidad. No pertenece a ninguna casilla —mide decenas de casillas, cruza chunks y acantilados y se mueve cada fotograma—, así que `cloud_shadows` la dibuja como el cliente de Pixi: **un patrón sobre la vista terminada**, bajo el HUD, con tantas copias como hagan falta para cubrir la pantalla (cuatro a 1280 × 800). El patrón se repite cada doce casillas en los dos ejes de pantalla, sigue el origen de la proyección —así se queda quieto sobre el suelo mientras la cámara se mueve— y encima va derivando con el tiempo real. La deriva se guarda en casillas y no en píxeles, para que una nube cruce el mismo mundo por segundo en los dos clientes, y se envuelve en el periodo para que una sesión larga no acabe colocando sus copias desde un número del tamaño de su propio tiempo de ejecución.

**Y son negras, de canto redondeado y tenues.** El dibujo se rellena de negro puro y el cliente lo tiñe además de negro (`Color::new(0, 0, 0, CLOUD_SHADOW_ALPHA)`), porque el shader multiplica: así el tono es neutro venga como venga la textura y solo se lee su alfa — antes era `#17242c`, un gris azulado que teñía de azul el borde semitransparente. El contorno se redondea como el de un vóxel de arcilla sin salir de la geometría de rombos: se traza el mismo camino en el mismo color con `stroke-linejoin="round"` y un grosor de `2 * ROUND`, de modo que el trazo engorda la forma media anchura y convierte cada esquina convexa en un arco, mientras los trazos de las juntas entre dos celdas pegadas quedan bajo el relleno y no se ven. Y `BLUR` baja de 3,5 a 1,2 px de escena: con el desenfoque viejo, aplicado de verdad, la nube perdía la silueta de vóxeles y volvía a ser la mancha de gradiente que ya se había descartado; 1,2 solo quita el escalón del borde. La opacidad es `CLOUD_SHADOW_ALPHA`, 0,18, y es el único mando para lo oscuras que son.

El patrón es una textura propia y no un sprite del atlas: el empaquetador recorta el borde transparente de todo lo que empaqueta, y un patrón recortado deja de repetir —la copia que hay en el atlas sale de 600 × 195 donde el periodo es 600 × 300, y se vería una costura por cada fila de nubes—. `scripts/build-atlas.sh` la rasteriza aparte, entera, a un téxel por unidad del SVG (1920 × 960), y `scripts/build-web.sh` la publica con el resto de `content/`. Esa rasterización es `artifacts/cloud_pattern.py` y no `scripts/rasterize.py` por dos motivos: la segunda escala por tile de mundo y le daría la resolución de un sprite, y **cairosvg ignora el `feGaussianBlur`** del dibujo —el cliente Pixi lo recibe del navegador, este se quedaba con el canto duro del rombo—, así que el desenfoque se aplica allí, sobre la imagen pegada a sí misma en una rejilla de 3 × 3 y recortada después, para que el borde suave cruce la costura del patrón como cualquier otro borde.

### Los reflejos del agua (implementados)

El agua devuelve lo que hay a su alrededor, y lo hace sin volver a dibujar nada: un reflejo es **el mismo sprite otra vez**, bocabajo y colgando de la línea de agua, leído del mismo fotograma del atlas y con la misma `uv`. El dominio vive en `iso::water::reflection` —sin gráficos, como todo lo de `iso`— y el cliente lo encola en `reflection_view`.

**El espejo es un volteo sobre la línea de agua, y eso es todo.** El cliente de Pixi llega por un camino más largo: da a cada chunk con agua una textura de render propia, refleja cada sprite en el plano del agua (`getReflectionMatrix`) y tiende el cuadrado de ese mapa sobre el techo de cada columna con su `y` de pantalla negada (`getWaterTopMatrix`). La textura es cómo recorta el reflejo al agua sin máscaras y cómo puede permitirse ondularlo con las olas, redibujando el mapa treinta veces por segundo en la GPU. Al componer las dos matrices solo queda una cosa en pie: un punto dibujado `h` píxeles por encima de la línea de agua se ve `h` píxeles por debajo, en la misma `x`. El `lift` de la primera —`(elevación − nivel) · boxHeight / tileHeight` columnas hacia la cámara— es lo que pone la línea de agua **por debajo** de los pies de lo que está sobre un ribazo y no en ellos (`waterline`).

Así que aquí no hace falta textura de render: se refleja el rectángulo en el que ya se dibujó el sprite y **se corta a las casillas de agua que cubre** (`reflection_piece`), un trozo convexo por casilla, exactamente como `lighting::moving` corta la sombra del que camina a las superficies que la reciben. Cada trozo lleva la profundidad de su propia casilla de agua y `REFLECTION_LAYER`, de modo que se dibuja sobre esa agua y debajo de todo lo que la escena ponga delante: el ribazo que hay entre el espectador y el agua tapa el reflejo que cae sobre ella, y la tierra firme no muestra ninguno. Tampoco hace falta máscara.

Las casillas a las que llega un reflejo se sacan del propio dibujo (`reflection_cells`, la proyección leída al revés sobre el plano del agua) y no de un alcance fijo como el `REFLECTION_REACH` de TypeScript; lo único acotado es el trabajo: `MAX_REFLECTION_CELLS` por eje y `MAX_REFLECTION_DROP` (cuatro bloques) de caída por debajo del emisor, que es lo que ensancha la búsqueda hacia la cámara porque el nivel del agua es justo lo que se está preguntando. Un agua **por encima** de lo que reflejaría no muestra nada de ello: el reflejo cuelga bajo la superficie.

Hay dos formas de reflejarse. La corriente es el volteo, y la usan el jugador y todas las entidades; una huella de varias casillas se gira media vuelta sobre el centro de su propia tirada en vez de voltearse, porque un volteo invierte la diagonal sobre la que corre esa fila (`turn_at`, el mismo punto que calcula `water-reflections.ts`). La otra es para los assets que **traen su propio reflejo dibujado** —los postes de un muelle colgando bajo sí mismos, el casco sumergido de una barca—, que ningún volteo del dibujo produciría: `Entity::reflection_source` nombra ese SVG, se coloca exactamente donde su generador lo puso (`lay_on_water`, el camino `reflectionSource` de TypeScript) y solo se le aplica el corte. El color es el del otro cliente: `#c4dbe4` al 0,62 de opacidad en un solo `Color`, porque el shader multiplica.

Nada de esto se hornea, y por el mismo motivo que la sombra del jugador no se hornea: un reflejo sigue a lo que refleja y lo que hay alrededor del agua anda. Los trozos se recogen cada fotograma del mismo fotograma, `layout` y pies con los que se dibujó el sprite, y la malla es la de una silueta con color en vez de negro (`SpriteAtlas::draw_reflection`), así que va en el mismo lote que el suelo sobre el que cae.

Lo que falta respecto al cliente de Pixi: no se reflejan las caras de los bloques de terreno que están detrás del agua (allí es una malla por material construida con el chunk), el agua abierta no lleva el lavado tenue del cielo (`SKY_REFLECTION`) y nada ondula, porque las olas (`getWaveLift`) son lo que mece un reflejo allí y este cliente todavía no las tiene.

### `water`, `effects`, `audio` y `ui` (previstos)

Estos módulos consumen estado y parámetros del dominio para presentar agua, viento, sonidos e interfaz. Los render targets, texturas y audio pertenecen al cliente y tienen propietario y ciclo de vida explícitos. Su trabajo por fotograma y memoria se miden con escenas representativas. `ui` emite comandos; no edita `World` por fuera del flujo de simulación.

### `web` y almacenamiento (previstos)

`web/` aloja el cargador WASM, recursos y puente mínimo con el navegador. El cargador raw de Macroquad recibe las operaciones de `localStorage` mediante imports propios de `env`; no se usa `web-sys` ni glue code de `wasm-bindgen`, porque el bundle de Macroquad no instancia ese ABI. La persistencia web implementa una interfaz de almacenamiento usada por `save`; una implementación nativa puede usar archivos sin cambiar el formato lógico. Los errores de carga y guardado se muestran al usuario. Probar un guardado y recuperación reales en navegador, incluido cierre y reapertura de la página.

## Prácticas de código y documentación

- Mantener la API pública de cada módulo pequeña; exportar tipos y operaciones necesarias desde `lib.rs`. Usar tipos nuevos para unidades o coordenadas que no sean intercambiables. Validar entradas externas con `Result` y errores con contexto; reservar `assert!` para invariantes internas y tests.
- Preferir funciones puras para proyección, clasificación de materiales, costes, cálculos de cámara y traducción de entrada. Inyectar azar, reloj y almacenamiento cuando una regla de dominio los necesite. Evitar estado global mutable y dependencia implícita del orden de `HashMap`.
- Usar `i32` o enteros tipados para rejilla y ticks; `f64` para cálculos de dominio que requieren precisión; `f32` en el límite gráfico. Documentar conversiones, rangos y redondeos. `unsafe` está prohibido en `iso`.
- Cada módulo comienza con rustdoc que explica propósito, invariantes, unidades y dependencias admitidas. Los tipos públicos documentan sus campos y errores relevantes; los ejemplos ilustran contratos, no duplican la implementación.
- Actualizar este documento, el README y las notas de migración en el mismo cambio que altere contratos, flujo, formato de guardado o estructura. Marcar una capacidad como implementada solo cuando tenga código y pruebas. Mantener decisiones nuevas cerca del módulo correspondiente.
- Un cambio de comportamiento incluye prueba del límite que lo justifica. Los tests de regresión describen el resultado esperado; no imitan línea por línea la función probada. Extraer helpers compartidos solo cuando haya dos usos reales.

## Tests y puertas de calidad

**Dominio:** pruebas unitarias colocalizadas como `<archivo>.test.rs` para invariantes locales; cada archivo de producción las incluye solo bajo `#[cfg(test)]`. Las pruebas de integración en `crates/iso/tests/` verifican relaciones entre módulos y contratos externos. Probar bordes y propiedades para coordenadas, guardado y generación. Los fixtures TypeScript existentes sirven para preservar coordenadas, proyección, movimiento, rutas y reloj durante el port. Los resultados exactos del terreno y entidades nuevos se prueban con fixtures Rust propios, no con las salidas antiguas.

**Cliente:** probar transformaciones y composición con datos pequeños sin abrir GPU cuando sea posible. Usar pruebas visuales y recorridos manuales en nativo y WASM para profundidad, elevación, carga de assets, cámara, controles y persistencia. Guardar capturas de referencia de escenas concretas y registrar ventana, resolución y condiciones al comparar rendimiento. Las cifras de PixiJS son referencia observada, no umbrales automáticos.

**Comandos desde `lib/`:**

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
