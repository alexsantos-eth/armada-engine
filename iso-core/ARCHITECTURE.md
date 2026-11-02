# Arquitectura de Armada Engine en Rust

Este documento define los límites, contratos y prácticas de la implementación en Rust con Macroquad. Toma como referencia [`../ARCHITECTURE.md`](../ARCHITECTURE.md), que describe el juego en TypeScript, pero documenta las decisiones de este workspace. Conservamos los principios útiles del dominio, el flujo y la calidad; el algoritmo de generación y la distribución de entidades se diseñarán y ajustarán aquí.

## Estado y estructura

**Implementado:** el workspace `iso-core`, el crate `armada-core` sin dependencias gráficas, `grid`, `projection`, sus pruebas de contrato y una demo Macroquad nativa y WASM. **Previsto:** los demás módulos descritos abajo. Una sección prevista es un contrato de diseño, no una afirmación de que su código ya existe.

```text
iso-core/
  Cargo.toml                  # workspace y cliente Macroquad
  ARCHITECTURE.md             # este contrato
  crates/armada-core/
    src/lib.rs                # API pública del dominio
    src/grid.rs               # implementado
    src/projection.rs         # implementado
    src/{world,terrain,...}.rs # previstos; se crean al implementarlos
    tests/                    # contratos e integración del dominio
  src/main.rs                 # entrada nativa/WASM, demo actual
  src/{app,input,scene,...}.rs # previstos; se crean al implementarlos
  web/                        # cargador WASM y archivos web
  reference/                  # capturas y medidas de referencia
```

La regla de dependencia es `iso-core → armada-core`. `armada-core` no importa Macroquad, navegador, audio ni archivos de la escena. El cliente puede usar tipos y decisiones del dominio; el dominio no conoce sprites, texturas ni resolución de pantalla. Si una regla necesita pruebas sin GPU o navegador, normalmente pertenece al dominio. No se añaden crates o módulos vacíos para anticipar fases futuras.

## Invariantes compartidas

- `World` es la fuente de verdad del juego. La escena y sus vistas mantienen solo cachés y recursos derivados. Descargar un chunk visual no elimina su contenido del mundo ni del archivo guardado.
- La rejilla usa coordenadas enteras para celdas y chunks, y posiciones fraccionarias solo para movimiento y proyección. La conversión de coordenadas negativas usa división euclídea; un chunk mide 32 × 32 celdas mientras no se cambie explícitamente el contrato.
- La proyección isométrica conserva sus ejes: `+x` aparece arriba a la derecha y `+y` arriba a la izquierda. Elevación, orden de dibujo y conversiones inversas comparten la misma configuración.
- La simulación avanza en ticks fijos de 50 ms. El tiempo del fotograma alimenta un acumulador y un factor de interpolación para dibujar; no altera las reglas de juego según los FPS.
- Las decisiones que afecten al juego usan un orden estable de iteración, desempate y eventos. No se exige que una semilla reproduzca el mundo anterior ni que vuelva a generar un mundo guardado.
- Los datos persistidos tienen versión y validación. Índices espaciales, GPU, cámara, listeners y cachés se reconstruyen; no se serializan.

## Flujo de un fotograma

1. `input` lee teclado, puntero y controles del cliente y los traduce a comandos de dominio. No mueve entidades directamente.
2. `app` acumula el tiempo transcurrido, aplica un límite a fotogramas largos y ejecuta cero o más ticks fijos.
3. En cada tick, los sistemas leen y modifican `World`; `time` avanza; `events` distribuye avisos tipados en orden de suscripción. Las decisiones sobre colisiones, rutas y terreno se resuelven aquí.
4. `scene` observa el estado resultante, determina los chunks visibles y sincroniza las vistas con presupuesto de trabajo por fotograma.
5. `camera`, `projection` y `render` construyen y dibujan la imagen. La interpolación afecta solo a la presentación. La escena limpia recursos de los chunks que salen de la vista.

La generación de un chunk se inicia desde el flujo de mundo, no desde una vista. El chunk generado o modificado pasa al archivo de mundo; luego la escena puede mostrarlo u ocultarlo cuantas veces sea necesario. El orden exacto de sistemas y eventos se declara en un único punto de composición y se cubre con una prueba de integración.

## Módulos de `armada-core`

### `grid` e índice espacial

**Responsabilidad.** Tipos distintos para coordenada de mundo, chunk y celda local; conversión entre ellas; rectángulos y claves; `CellMap` e índice de ocupación para entidades de varias celdas. `grid.rs` ya implementa el primer conjunto de conversiones y claves. El índice se incorporará cuando exista el modelo de entidades.

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

### `terrain` y materiales (previstos)

**Responsabilidad.** Generar columnas con distintas alturas y clasificar cada bloque y superficie como agua, arena, suelo, hierba u otro material declarado. Expone altura, superficie, transitabilidad y geometría de columna a otros módulos. La elección de textura y tinte queda en el cliente.

**Contrato.** Los bloques de una columna ocupan niveles explícitos; el bloque superior y los laterales visibles se derivan de las columnas y sus vecinas. El ruido y las reglas de materiales funcionan al cruzar chunks. Los parámetros y la distribución visual se ajustarán en Rust; no se trasladan posiciones ni salidas exactas del generador anterior.

**Pruebas.** Alturas y materiales válidos, capas coherentes, bordes entre chunks, agua y costas, casos de elevación y consulta de transitabilidad. Usar mapas pequeños construidos a mano para las reglas de bloques visibles.

### `paths` (previsto)

**Responsabilidad.** Búsqueda de rutas y costes de movimiento sobre un mapa de transitabilidad. Recibe consultas del mundo sin conocer la escena ni los controles.

**Contrato.** El coste, los vecinos permitidos y el desempate son explícitos. El recorrido lateral `+x, +y, -x, -y` del juego anterior es una referencia cuando no hay razón para cambiarlo. Los diseños de caminos y asentamientos del generador anterior no son un requisito de compatibilidad.

**Pruebas.** Ruta simple, obstáculo, sin ruta, coste por material, bordes de chunk y desempate reproducible.

### `entities` y configuración (previstos)

**Responsabilidad.** Definiciones de entidades separadas de instancias; huella, colisión, capacidades, superficie admitida y reglas de aparición. Un archivo de configuración conserva las definiciones de contenido, con un contrato propio de Rust y validación al cargar.

**Contrato.** La fábrica valida toda la huella y reserva sus celdas mediante el índice espacial. Las instancias tienen identidad estable y datos suficientes para guardarse. La colocación se rediseña y calibra en Rust; las posiciones, probabilidades, formaciones y valores del catálogo anterior no son obligatorios. La configuración no contiene manejadores de texturas ni objetos Macroquad: usa identificadores de recursos. Un error de configuración indica entidad y campo.

**Pruebas.** Validación de definiciones, huellas de varios bloques, límites de colisión, rechazo de solapamiento, colocación en superficie permitida y carga/guardado de instancias.

### `world` y chunks (previstos)

**Responsabilidad.** Poseer chunks descubiertos, columnas, entidades e índices derivados; coordinar generación inicial y cambios posteriores. Expone consultas y mutaciones controladas para los sistemas.

**Contrato.** Generar un chunk nuevo y volver a cargar uno descubierto son operaciones distintas. La carga no aplica de nuevo el generador sobre contenido persistido. Un chunk puede salir de la vista y seguir en memoria o en almacenamiento según la política de streaming. La generación nunca depende del orden en que la cámara pide chunks.

**Pruebas.** Generar, editar, ocultar, recuperar y conservar contenido; consultas entre chunks; reconstrucción de índices tras carga; invariantes de identidad y ocupación.

### `parts` y `save` (previstos)

**Responsabilidad.** Estado propio de sistemas que no pertenece al núcleo de `World`, formato de archivo, validación y migraciones del formato de guardado.

**Contrato.** Cada parte declara una clave y una versión. El formato raíz declara su versión y contiene los chunks descubiertos completos, sus modificaciones y las instancias necesarias para restaurar la partida. El guardado no depende de regenerar desde una semilla. Las partes se restauran antes de reactivar sistemas; índices y listeners se reconstruyen después. Los errores de versión o datos se comunican sin `panic!`.

**Pruebas.** Ida y vuelta de mundos editados, partes ausentes u opcionales, versión desconocida, archivo malformado, recuperación de un chunk ya descubierto y ausencia de recursos de presentación en el archivo.

### `time`, `events` y `simulation` (previstos)

**Responsabilidad.** `time` guarda el tick lógico y deriva hora/día; `events` distribuye eventos tipados síncronos; `simulation` registra y ejecuta sistemas en un orden declarado.

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

### `camera` y `streaming` (previstos)

`camera` guarda centro, zoom y seguimiento como estado de vista. El zoom alrededor de un ancla conserva el punto del mundo bajo el cursor. `streaming` calcula chunks visibles, programa carga/descarga con presupuesto por fotograma y separa visibilidad de persistencia. Probar matemáticamente cámara y selección de chunks; probar el presupuesto con una escena falsa.

### `scene` y vistas (previstos)

`scene` compone módulos visuales (terreno, entidades, jugador, efectos, interfaz), resuelve su orden de montaje y los destruye en orden inverso. Cada vista sincroniza el estado de `World` con recursos visibles; no genera ni modifica terreno. El orden de dibujo es estable por profundidad y capa declarada. Probar el montaje y la sincronización de un módulo aislado, además de la composición completa con datos de mundo pequeños.

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

**Dominio:** tests unitarios junto al módulo para invariantes locales; tests de integración en `crates/armada-core/tests/` para relaciones entre módulos; casos de borde y propiedades para coordenadas, guardado y generación. Los fixtures TypeScript existentes sirven para preservar coordenadas, proyección, movimiento, rutas y reloj durante el port. Los resultados exactos del terreno y entidades nuevos se prueban con fixtures Rust propios, no con las salidas antiguas.

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
