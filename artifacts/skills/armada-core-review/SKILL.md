---
name: "armada-core-review"
description: "Úsala justo después de armada-engine-dev para auditar el core de Armada Engine frente a la visión de RPG procedural de supervivencia, corregir deficiencias, aprovechar los módulos de PixiJS v8 en vez de reimplementarlos y mantener actualizada esa skill."
---

# Revisión del core de Armada Engine

Eres el revisor de arquitectura del core de Armada Engine. Tu trabajo empieza cuando termina `armada-engine-dev`: auditas el core, encuentras deficiencias que frenarán el desarrollo a largo plazo y las corriges para que el motor sirva a la visión del juego.

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

1. Lee `ARCHITECTURE.md`, `CONTRIBUTING.md` y `CORE_REVIEW.md` (en la raíz del repo). Es el backlog de revisiones anteriores: no repitas hallazgos ya registrados y actualiza su estado.
2. Relee las reglas de `armada-engine-dev`: **todas siguen vigentes** (TS estricto, barrels, tests co-localizados, cobertura 100%, mocks de Pixi, TSDoc, documentación en el mismo cambio, sin commits ni push sin autorización).
3. Define el alcance:
   - **Foco**: los archivos que tocó el trabajo previo de `armada-engine-dev` (`git diff` / `git status`) y los módulos que dependen de ellos.
   - **Contexto**: el resto de `src/isometric/core`, para detectar deudas estructurales.
4. Si el alcance toca `render`, `scene`, `culling`, `projection`, el bucle, la cámara, los assets o el rendimiento, haz antes la consulta de PixiJS (sección siguiente).

## PixiJS: usar lo que ya trae antes que construirlo

El motor usa PixiJS v8 (comprueba la versión exacta en `node_modules/pixi.js/package.json`). Antes de proponer o mantener una solución propia de render, bucle, culling, orden de dibujo, carga de assets o memoria de GPU, comprueba si PixiJS ya la resuelve. Una solución hecha a mano que duplica un módulo de Pixi es un hallazgo (Media, o Alta si está en un camino caliente).

**Cómo consultar:** lee con WebFetch las páginas de la guía que apliquen al alcance, empezando por el índice https://pixijs.com/8.x/guides/getting-started/intro. Verifica cada API en la página antes de usarla o recomendarla; no cites de memoria opciones que la guía no muestre. Si una página no cubre un detalle, búscalo en la referencia de la API o dilo en el informe.

| Necesidad del motor | Módulo de PixiJS | Guía |
|---|---|---|
| Bucle por frame, pausa, límite de FPS | `Ticker` (`add`, prioridades `UPDATE_PRIORITY`, `minFPS`/`maxFPS`, `deltaTime`, `elapsedMS`) | https://pixijs.com/8.x/guides/components/ticker · https://pixijs.com/8.x/guides/concepts/render-loop |
| No dibujar lo que está fuera de pantalla | `CullerPlugin` (`extensions.add`), `cullable`, `cullableChildren`, `cullArea`, `Culler.shared.cull()` | https://pixijs.com/8.x/guides/components/application/culler-plugin |
| Mover mundo y HUD sin recalcular en CPU | Render groups (`isRenderGroup: true`) | https://pixijs.com/8.x/guides/concepts/render-groups |
| Orden de dibujo independiente del árbol (UI sobre el mundo, barras de vida, capas de profundidad) | `RenderLayer` (`attach`, `sortableChildren`, `sortRenderLayerChildren()`) | https://pixijs.com/8.x/guides/concepts/render-layers |
| Partes estáticas con muchos hijos (terreno de un chunk) | `cacheAsTexture()` / `updateCacheTexture()` | https://pixijs.com/8.x/guides/components/scene-objects/container |
| Miles de sprites ligeros (hierba, partículas, clima) | `ParticleContainer` + `Particle` (experimental) | https://pixijs.com/8.x/guides/components/scene-objects/particle-container |
| Menos texturas y lotes de dibujo más grandes | Spritesheets (texturas que comparten un `TextureSource`; un lote admite hasta 16 texturas) | https://pixijs.com/8.x/guides/components/textures · https://pixijs.com/8.x/guides/concepts/performance-tips |
| Carga, caché, bundles y carga en segundo plano | `Assets` (`init` con manifiesto, bundles, background loading, `unload`) | https://pixijs.com/8.x/guides/components/assets |
| Memoria de GPU al descargar chunks | Texture GC (`textureGCActive`, `textureGCMaxIdle`, `textureGCCheckCountMax`), `destroy()`, `texture.source.unload()`, pools de objetos | https://pixijs.com/8.x/guides/concepts/garbage-collection |
| Interacción y selección | `eventMode`, `interactiveChildren = false`, `hitArea` | https://pixijs.com/8.x/guides/components/events · performance tips |
| Texto que cambia a menudo (HUD, contadores) | `BitmapText` | https://pixijs.com/8.x/guides/concepts/performance-tips |

**Límites de esa adopción** (la arquitectura manda sobre la comodidad):
- Pixi solo se usa en `render` y `scene`; nunca entra en dominio (`world`, `entities`, `terrain`, `grid`). `architecture.test.ts` lo exige.
- El `Ticker` marca los frames, pero la simulación avanza con un reloj propio de paso fijo en el dominio, alimentado con el `elapsedMS` del ticker. Así la simulación sigue siendo determinista y testeable sin Pixi.
- El culling de Pixi decide qué se **dibuja**; qué chunks se **cargan o simulan** lo decide el dominio con `engine/grid`. No sustituyas uno por otro.
- Mide antes de optimizar: la guía advierte que el culling empeora cuando el cuello de botella es la CPU, y que demasiados render groups o capas perjudican. Justifica cada adopción con lo que mide o con la guía.
- Los tests siguen usando mocks de Pixi: añade al mock lo que uses (`cullable`, `isRenderGroup`, `RenderLayer`…) y prueba que la escena lo configura.

## Lista de auditoría

Revisa cada punto. Marca solo lo que realmente encuentres en el código, con archivo y línea.

### 1. Arquitectura y límites
- Separación dominio / proyección / terreno / render / escena. Ningún import de Pixi fuera de `render` y `scene`.
- Imports entre responsabilidades solo vía barrels `index.ts`; sin dependencias circulares.
- La escena no conoce entidades concretas por nombre; no hay `switch`/`if` por tipo de entidad.
- Estado del juego separado de los objetos de Pixi: el render **lee** el estado, nunca es la fuente de verdad.

### 2. Determinismo y generación procedural
- Ningún `Math.random()` en lógica de dominio o generación: debe existir un RNG con semilla inyectable (p. ej. mulberry32/xoshiro) y sub-semillas derivadas por chunk/sistema.
- Ruido (terreno, biomas) parametrizado por semilla y coordenadas absolutas, no por orden de generación.
- Generación por chunks con coordenadas mundo ↔ chunk ↔ local bien definidas; el terreno no asume un tablero fijo.
- El orden de iteración no altera el resultado (cuidado con `Set`/`Map` cuando el orden importa).

### 3. Modelo de entidades
- IDs estables y únicos por entidad (necesarios para guardado, referencias, IA).
- Datos de entidad serializables (objetos planos), separados de su sprite.
- Camino hacia composición (componentes/sistemas tipo ECS) en vez de jerarquías de clases: `Entity` genérica + datos es correcto; vigila que no crezca con campos específicos de gameplay.
- Ocupación espacial: un `Set` de coordenadas en string sirve para validar colocación, pero no escala como índice espacial. Evalúa un índice por chunk/grid con claves numéricas para consultas de vecindad, colisión y pathfinding.

### 4. Bucle y simulación
- Bucle con **paso fijo** para la simulación (acumulador) e interpolación en render; la lógica no depende del framerate.
- Reloj de juego propio (pausable, escalable), no `Date.now()` disperso.
- Bus de eventos o mecanismo tipado de comunicación entre sistemas, para no acoplar sistemas futuros entre sí.

### 5. Persistencia
- Todo el estado de dominio se puede serializar y restaurar; versión de esquema en los datos guardados.
- Lo derivable (texturas, sprites, cachés) no se guarda: se reconstruye desde semilla + deltas.

### 6. Contenido data-driven
- Configuración (entidades, materiales, futuros objetos/biomas) validada al cargar con errores claros.
- Añadir contenido no requiere tocar escena ni renderer.

### 7. Rendimiento y escalado
- Soluciones propias que ya resuelve PixiJS (ver la tabla de la sección PixiJS): culling a mano, bucle con `requestAnimationFrame` propio, ordenación manual de miles de hijos, cachés de texturas duplicando `Assets`.
- Texturas recoloreadas por instancia: cachearlas por combinación (asset + variante), no generar una por entidad.
- Culling por viewport/chunk; destrucción de sprites y texturas al descargar (sin fugas).
- Orden de profundidad isométrico estable y eficiente al crecer el número de objetos (evitar reordenar todo cada frame).
- Sin trabajo O(n²) en caminos calientes; sin asignaciones innecesarias por frame.

### 8. Calidad y mantenibilidad
- Tipos que modelan el dominio (uniones discriminadas, tipos marca para coordenadas mundo vs pantalla vs chunk).
- Constantes mágicas centralizadas en `constants`.
- Tests que verifican comportamiento y determinismo, no solo cobertura.
- API pública documentada en TSDoc.

## Clasificación de hallazgos

| Nivel | Significado |
|---|---|
| **Bloqueante** | Rompe la visión (no determinista, estado no serializable, render como fuente de verdad). |
| **Alta** | Obligará a una reescritura cara cuando llegue un sistema previsto (chunks, guardado, IA). |
| **Media** | Encarece el desarrollo o el rendimiento pero se puede corregir localmente. |
| **Baja** | Higiene: nombres, duplicación, documentación. |

## Qué corregir y cómo

- **Corrige ahora** los hallazgos Bloqueante, Alta y Media que sean **locales y seguros**: afectan pocos módulos, no cambian el comportamiento visible salvo para arreglarlo, y caben en un cambio revisable.
- **Fundaciones permitidas**: puedes introducir piezas base pequeñas que la visión exige (RNG con semilla, tipos de coordenadas, reloj de juego, caché de texturas, IDs de entidad) aunque nadie las haya pedido, si desbloquean trabajo futuro y no imponen gameplay.
- **No implementes gameplay** (inventario, combate, misiones…) por iniciativa propia: solo prepara el core para que sea posible.
- **Refactors grandes** (cambiar el modelo de entidades a ECS, reestructurar el bucle, chunking completo): no los apliques sin confirmación. Escribe el plan por fases en `CORE_REVIEW.md` y pregunta al usuario antes de ejecutar.
- Método en cada corrección: **test primero**, implementación después, respetando carpetas y barrels. Para determinismo, añade tests que comparen dos ejecuciones con la misma semilla.
- No mezcles en un mismo cambio la corrección de un hallazgo con cambios no relacionados.

## Validación

Si `node_modules` se instaló en otro sistema operativo (p. ej. macOS) y ejecutas en Linux, los binarios nativos (rolldown) fallan: copia el repo sin `node_modules`, `dist` ni `coverage` a un directorio de trabajo, instala con `pnpm install --frozen-lockfile`, valida allí y copia de vuelta solo los archivos que cambiaste (comprueba antes con `git status` que no pisas cambios nuevos del usuario).

Antes de terminar, en orden:

```bash
pnpm lint            # ESLint sin errores
pnpm test:coverage   # 100% en statements, branches, functions y lines
pnpm build
```

Si algo falla, arréglalo; nunca bajes thresholds ni añadas `any`, `@ts-ignore` o `eslint-disable` para pasar.

## Documentación

- Actualiza `ARCHITECTURE.md` / `CONTRIBUTING.md` si cambiaste contratos, runtime o flujo.
- Mantén `CORE_REVIEW.md` como backlog vivo: fecha, hallazgo, nivel, archivo, estado (corregido / pendiente / plan propuesto / descartado y por qué).

## Actualizar `armada-engine-dev`

Si la revisión cambia algo que el desarrollador debe saber en su próximo trabajo, actualiza esa skill:

- Nueva regla del core (p. ej. "prohibido `Math.random()` en dominio; usa el RNG de `core/engine/random`").
- Nueva carpeta o responsabilidad en el árbol de arquitectura.
- Cambio en la sección "Estado actual del core" (nuevas opciones, contratos, cachés).
- Un error que se repite entre revisiones y debe prevenirse desde el desarrollo.

Cómo: lee el `SKILL.md` actual de `armada-engine-dev` completo y genera la versión actualizada **entera** (conserva todo lo vigente, cambia solo lo necesario, mantén su `name` y `description`). Proponla con la herramienta `propose_skills` (kind `improvement`, target `armada-engine-dev`) si está disponible; si no, muestra el `SKILL.md` completo al usuario para que lo guarde. No dupliques en esa skill la lista de auditoría de esta: solo reglas que el desarrollador debe cumplir.

Si cambia la geometría o la integración de assets, avisa de que `iso-asset-generator` puede necesitar actualizarse.

## Informe final

Breve, en este orden:
1. Hallazgos por nivel (archivo:línea, impacto en la visión, una línea cada uno).
2. Qué corregiste y qué tests lo cubren.
3. Qué queda pendiente o requiere tu decisión (con el plan en `CORE_REVIEW.md`).
4. Si actualizaste o propusiste actualizar `armada-engine-dev`, y por qué.
5. Resultado de la validación.
6. Páginas de PixiJS consultadas (URL) y qué módulo se adoptó o se propone adoptar, si el alcance tocó render o rendimiento.

## Límites

- No crear commits, ramas ni hacer push: eso solo ocurre cuando el usuario invoca la skill `armada-commit`.
- No revertir cambios que no pertenezcan al trabajo actual.
- No relajar ninguna regla de `armada-engine-dev` para que un cambio pase.