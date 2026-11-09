# Plan de migración a Rust, Macroquad y WebAssembly

## Objetivo y criterio de éxito

Migrar el juego de TypeScript, PixiJS y Preact a un núcleo de Rust y un cliente de Macroquad que compile tanto de forma nativa como a `wasm32-unknown-unknown`. Esta nueva implementación conservará las funciones esenciales de juego, controles, presentación y sonido, pero podrá cambiar generación, colocación de entidades y formato de partidas. No se exige regenerar un mundo desde una semilla. Cada fase deja una versión ejecutable; PixiJS sirve como referencia funcional y visual, no como patrón obligatorio para el mundo generado.

**Estado:** fase 0 completada. Fase 1 completa: `grid`, `paths` (A*), `projection`, geometría de `camera`, `time`, paso fijo y proyección isométrica, verificados contra el fixture TypeScript. Fase 2 completa según sus criterios de salida: el generador crea terreno sin costuras entre chunks con alturas y materiales correctos; un chunk descubierto se recupera igual al descargarlo, recargarlo o reabrir la partida (TerrainWorld + guardado V2); las entidades cumplen restricciones de superficie, elevación, huella y separación (placement + tests); la simulación (stepper) y la locomoción (step_player, motion) superan sus pruebas sobre escenarios controlados. Pendientes opcionales de fase 2: bus de eventos (sustituible por llamadas directas en Rust), orquestador `WorldSystem`/`stepWorld`, conexiones de rutas y módulos `wind`/`waves`/`lighting`. Fase 3 en curso: el cliente Macroquad tiene bucle de frame, entrada, streaming de chunks, jugador caminable y cámara que sigue al jugador; faltan renderizado de entidades, culling integrado, animación de sprite del jugador y conexiones de rutas. P5 completa (profundidad, capa, poses, prioridad de hojas, presupuestos, culling). P6 en curso: manifiesto de assets, atlas rasterizado (63 SVGs) y servicios de borde (Input, Audio, UI, ChunkLoader) implementados en Macroquad; el guardado en WASM persiste en `window.localStorage` bajo `armada_save.json`; el `ChunkGround` expone los ocupantes de cada columna. Quedan la elección de textura concreta, la integración de cada vista Pixi una por una, las reglas de densidad/bioma/vecindad para la colocación y el escritor de guardado en segundo plano.

## Punto de partida comprobado

- El arranque está en `src/main.tsx` → `web/src/isometric/page.tsx` → `web/src/isometric/game/game.ts`. `mountGame()` conecta Pixi, simulación, mundo, entrada, carga de chunks, audio y diagnóstico.
- El dominio ya se organiza en `web/src/isometric/core/engine/`: `grid`, `random`, `terrain`, `paths`, `entities`, `world`, `parts`, `time`, `events`, `simulation`, `player`, `projection` y `camera`. Es la secuencia de migración principal.
- No todo el dominio carece de dependencias externas: `terrain/terrain.ts` usa `simplex-noise` y `player/motion.ts` usa XState. El ruido se podrá sustituir al rediseñar la generación; las transiciones del jugador sí requieren pruebas de comportamiento.
- El render usa Pixi de forma extensa: `render`, `scene`, `terrain-view`, `entity-view`, `player-view`, `camera-view`, `shadows`, `water-reflections`, `foliage-wind` y módulos de luz. El audio actual usa Strudel en `game/sound/`.
- El mundo actual es ilimitado y usa chunks de 32 × 32; el guardado serializa semilla, chunks editados y partes del mundo. La generación anticipada usa un Web Worker y datos empaquetados transferibles. La implementación Rust tendrá formato de partida propio y conservará el contenido generado de los chunks descubiertos cuando sea necesario para que una partida continúe igual.

## Arquitectura objetivo

```text
iso (crate Rust, sin Macroquad)
  tipos, rejilla, generación, entidades, mundo, partes, jugador, tiempo,
  simulación, cámara geométrica, proyección y cálculos de luz
        │
        ├── pruebas nativas + fixtures de contratos conservados
        ├── puente WASM pequeño para comparar con el cliente Pixi, si hace falta
        └── armada-game (binario Macroquad)
              entrada, bucle, streaming, escena, texturas, luz, audio, UI
                    ├── ejecutable nativo
                    └── binario WASM + página de carga mínima
```

El núcleo recibe entrada, tiempo transcurrido y una fuente de generación configurable; devuelve estado y eventos. Puede aceptar una semilla opcional para depuración, sin que sea el formato de persistencia del mundo. No lee reloj, DOM ni GPU. Macroquad es dueño del bucle de frame, la entrada, el render y los recursos. Separar el núcleo permite probarlo nativamente y usar el mismo código en web sin acoplar la simulación a la API gráfica.

## Fases, en orden

### 0. Fijar la referencia y el entorno

**Trabajo.** Fijar pruebas de referencia para coordenadas, proyección, rutas, entradas del jugador, ticks y reglas de simulación que se quieran conservar. Registrar capturas y perfiles del juego actual como guía de experiencia y rendimiento, sin convertir cada chunk o entidad en un resultado obligatorio. Crear el workspace Cargo, fijar versión de Rust y Macroquad y compilar un programa mínimo nativo y WASM en un navegador real. Documentar cómo servir el `.wasm` y sus assets.

**Salida.** Matriz de compatibilidad y una página que muestra el prototipo de Macroquad. Esta comprobación temprana evita descubrir al final problemas de arranque web, texturas o eventos táctiles.

### 1. Migrar lógica pura de bajo acoplamiento

**Orden.** Tipos y constantes de dominio → `grid` (incluidas coordenadas negativas e índice espacial) → `random` → `paths` → `projection` → cálculos geométricos de `camera` → funciones puras de `time`, `wind`, `waves` y `lighting` que no administran texturas.

**Trabajo.** Portar los contratos públicos que se conservarán y sus tests como pruebas Rust. Comparar salidas de coordenadas, rutas y proyección con fixtures de TypeScript. Definir explícitamente enteros, redondeo, orden estable, operaciones de bits y precisión de coma flotante. El PRNG actual solo se porta si otro sistema lo necesita; no se requiere para reproducir mundos anteriores.

**Salida.** `iso` compila sin Macroquad y supera las pruebas de los contratos conservados de esta capa.

### 2. Migrar generación, mundo y simulación

**Orden.** Modelo de bloques, elevación y materiales → generación de terreno con ruido → formato de configuración de entidades y nuevo sistema de colocación → `world` y streaming de chunks → `parts` y nuevo guardado → `events`, `time` y `simulation` → física del `player` y máquina de locomoción.

**Trabajo.** Definir primero los invariantes del nuevo terreno: columnas y bloques con alturas diferentes, continuidad entre chunks, material de cada nivel y reglas coherentes para `sand`, `water`, `ground` y `grass`. Elegir y ajustar un campo de ruido en Rust; una semilla de depuración puede ayudar a repetir escenarios, pero no es requisito de las partidas. Mantener un archivo de configuración de entidades separado del algoritmo de colocación, por ejemplo `content/entities.ron`, cargado y validado por Rust; su contrato puede cambiar para expresar biomas, superficie, pendiente, distancia, agrupación y huella de forma más útil. Ajustar las posiciones de entidades directamente en Rust mediante escenarios visuales y pruebas de validez, sin portar las probabilidades ni formaciones actuales por obligación. Representar la máquina XState como estados/eventos en Rust y comprobar las transiciones del jugador. Portar el paso fijo, el orden sistemas→reloj→eventos, la interpolación, la colisión y el salto. Diseñar guardados nuevos que almacenen el terreno, las entidades y los cambios de cada chunk descubierto, además del estado del jugador y sistemas. Antes de descargar un chunk generado de memoria, conservar sus datos en el almacenamiento de la partida. No se importan snapshots versión 7.

**Salida.** El nuevo generador crea terreno sin costuras entre chunks, con alturas y materiales correctos. Un chunk descubierto vuelve a mostrarse igual al descargarlo y cargarlo o al reabrir la partida. Las entidades cumplen restricciones de superficie, elevación, huella, separación y visibilidad. La simulación y locomoción conservadas superan sus pruebas sobre escenarios controlados.

### 3. Primer juego visible en Macroquad

**Orden.** Bucle de frame y entrada básica → cámara y culling → terreno y caminos → entidades → jugador y animación básica.

**Trabajo.** Desarrollar el cliente en `lib/` (paquete `iso-core`) sobre `crates/iso`, manteniendo carpetas por responsabilidad como en el motor actual: `game` para composición, `input`, `scene`, `render` y vistas separadas para terreno, entidades y jugador. Mantener el paso de simulación fijo y dibujar con interpolación. Adaptar `scene` a una lista de comandos de dibujo con profundidad y capas, conservando el orden de terreno, sombras, objetos y jugador. Llevar la carga/descarga de chunks con presupuesto por frame. Convertir los SVG actuales fuera del runtime a atlas rasterizados y metadatos de frames, escala, anclajes y variantes; comprobar especialmente `data-tiles`, proporciones isométricas y orientaciones. No depender de que Macroquad rasterice SVG en tiempo de ejecución.

**Salida.** Se puede recorrer un mundo infinito en nativo y WASM con cámara, jugador, terreno, caminos y entidades. Capturas de referencia revisadas en ambos destinos.

### 4. Paridad de presentación e interacción

**Orden.** Luz ambiental y ciclo de día → oclusión y sombras de terreno → siluetas y sombras recibidas → agua, reflejos y viento → efectos y animaciones del jugador → teclado, ratón, zoom y controles táctiles → sonido y opciones de arranque.

**Trabajo.** Prototipar pronto los casos caros de sombra con render targets, máscaras y shaders de Macroquad; después portar las capas completas. Medir memoria de texturas, llamadas de dibujo y p95 de frame durante streaming. Conservar el recorte de trabajo por frame y la liberación de recursos al ocultar chunks. Para los patrones `.strudel`, elegir mediante un prototipo entre producir audio equivalente en Rust y conservar temporalmente un puente JavaScript para el navegador; comprobar desbloqueo de audio tras interacción. Rehacer la capa de interfaz y etiquetas de hora en Macroquad o en una página contenedora mínima según la accesibilidad y la fidelidad requeridas.

**Salida.** Lista de funciones de Pixi/Preact/Strudel cerrada por escenarios visuales y de entrada, con diferencias conocidas registradas.

### 5. Cambio final y retirada de TypeScript

**Trabajo.** Ejecutar una batería de mundos de prueba, partidas guardadas, acciones y dispositivos; usar la versión anterior para comparar jugabilidad y presentación, no la disposición exacta del mundo. Publicar primero una versión WASM de prueba; medir arranque, tamaño descargado, memoria, p95 y tirones de chunks frente a la referencia. Adaptar empaquetado, caché y hosting para servir `.wasm` y atlas. Cambiar el punto de entrada web cuando los criterios funcionales estén cerrados. Retirar PixiJS, Preact, Strudel, Vite y el código TypeScript únicamente cuando ya no tengan consumidores.

**Salida.** Armada Engine completo en nativo y web desde Rust/Macroquad, con guardados nuevos versionados y documentación y comandos de desarrollo actualizados.

## Pruebas y puertas de salida

1. **Invariantes del terreno nuevo:** alturas diferentes, continuidad en bordes y coordenadas negativas, y materiales `sand`/`water`/`ground`/`grass` coherentes.
2. **Colocación nueva de entidades:** configuración validada, huellas libres, elevación y separación válidas, densidad ajustable y revisión visual de escenarios representativos.
3. **Simulación conservada:** sobre escenarios de terreno controlados, entradas grabadas → ticks, eventos, estados de locomoción y colisiones esperados; comprobar saltos, trepa, vuelo y bordes.
4. **Guardados nuevos:** guardar y reabrir terreno, entidades y cambios de chunks descubiertos, además del jugador y otros sistemas; descargar y volver a cargar chunks sin cambiar el mundo ya visto.
5. **Paridad visual:** capturas en horas y zoom comparables; inspección de sombras, oclusión, profundidad y animaciones, incluidos bordes de chunk.
6. **Rendimiento y web:** arranque en navegador, teclado y multitáctil, audio tras gesto, cambio de tamaño, streaming prolongado y memoria estable. Usar los escenarios `?perf` documentados como referencia; fijar umbrales con las mediciones de la fase 0, no inventarlos.

## Riesgos que deben resolverse antes del cambio final

- **Persistencia de chunks:** el sistema actual puede regenerar chunks descargados desde la semilla. En Rust, el contenido descubierto debe persistirse antes de expulsarlo de memoria y recuperarse sin cambios. Medir crecimiento del guardado y establecer una estrategia de almacenamiento por chunks.
- **Calidad de generación:** la nueva colocación debe evaluarse con múltiples semillas, bordes de chunk y distribución de biomas; no basta una captura atractiva de una sola zona.
- **Sombras y memoria:** el render actual usa mapas y atlas por chunk; una traducción directa puede multiplicar texturas o bloquear frames. Validar el prototipo gráfico antes de portar todos los efectos.
- **Web Workers:** el prefetch actual mueve datos empaquetados entre hilos. En WASM hay que probar si un worker separado aporta beneficio en el despliegue elegido; mientras tanto, presupuestar generación por frame sin bloquear la interacción.
- **Audio y contenido SVG:** Strudel y los SVG no son partes intercambiables de Macroquad. Su sustitución necesita pipeline y pruebas de fidelidad propios.
- **Guardado síncrono del cliente Rust (#111):** `main.rs` serializa y escribe el snapshot completo en el hilo de render al pulsar F5, cerrar o tras 120 s; con decenas de chunks puede superar un frame y causar un tirón. Antes del cambio final, diseñar un escritor nativo en segundo plano que publique atómicamente el último snapshot terminado, con cola/coalescencia de guardados y un adaptador distinto para WASM.

## Primera iteración recomendada

Hacer la fase 0 y el primer corte de la fase 1: workspace Cargo, demo Macroquad nativa/WASM, pruebas para `grid` y proyección, y puertos Rust de esos módulos. Después, crear un prototipo de terreno con alturas y los cuatro materiales antes de portar la colocación de entidades. Esto valida el destino técnico y da una base visual para ajustar la nueva generación.

## Referencia técnica de Macroquad

La [guía oficial de Macroquad](https://github.com/not-fl3/macroquad#wasm) documenta el build con `wasm32-unknown-unknown` y la página de carga web. Su [API de texturas](https://docs.rs/macroquad/latest/macroquad/texture/index.html) incluye render targets; conviene comprobar con un prototipo si bastan para las sombras actuales.
