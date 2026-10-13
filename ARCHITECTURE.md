# Arquitectura de Armada Engine

## Propósito

Armada Engine dibuja un terreno discreto en una vista isométrica. El terreno se modela como columnas de bloques; cada columna tiene una coordenada de cuadrícula `(x, y)` y una elevación entera. La escena convierte esas columnas en sprites PixiJS ordenados por profundidad.

El flujo principal es:

```mermaid
flowchart LR
  Main[src/main.tsx] --> Page[src/isometric/page.tsx]
  Page --> Scene[engine/scene]
  Scene --> Terrain[engine/terrain]
  Scene --> Entities[engine/entities]
  Scene --> Projection[engine/projection]
  Scene --> Board[engine/board]
  Scene --> Render[engine/render]
  Render --> Pixi[PixiJS]
  Scene --> Assets[SVG block assets]
```

## Arranque de la aplicación

`src/main.tsx` obtiene el elemento `#app` y monta `IsometricWorld`.

`src/isometric/page.tsx` crea una instancia de `Application` de PixiJS dentro de `useEffect`. Configura:

- ancho limitado por `WIDTH`;
- alto igual al viewport;
- resolución del dispositivo;
- densidad automática;
- fondo oscuro.

Cuando `app.init()` termina, la página añade `app.canvas` al DOM y llama a `createIsometricScene(app)`. El cleanup del efecto destruye la escena y la aplicación. Si el componente se desmonta mientras Pixi aún inicializa, la bandera `disposed` evita añadir un canvas o una escena incompletos.

## Organización de módulos

Cada responsabilidad tiene una carpeta y un barrel `index.ts`:

```text
src/isometric/core/
  engine/
    board/
      board.ts
      board.test.ts
      index.ts
    constants/
      constants.ts
      constants.test.ts
      index.ts
    entities/
      entities.ts
      entities.test.ts
      index.ts
    projection/
      projection.ts
      projection.test.ts
      index.ts
    render/
      render.ts
      render.test.ts
      index.ts
    scene/
      scene.ts
      scene.test.ts
      index.ts
    terrain/
      terrain.ts
      terrain.test.ts
      index.ts
    index.ts
  types/
    entities.ts
    iso.ts
    terrain.ts
    index.ts
```

Los archivos de tipos no contienen lógica runtime y no tienen tests propios. TypeScript y Typedoc validan esos contratos. Los módulos de comportamiento sí tienen tests co-localizados con el sufijo `.test.ts`.

## Modelo de entidades

`Box` representa una celda materializada de la cuadrícula. Sus coordenadas `x` e `y` son inmutables; sus datos (`type`, `walkable`, `elevation` y `metadata`) pueden actualizarse mediante `update()`.

La clase aplica datos por defecto y combina metadata de forma superficial. `getData()` devuelve una copia de los datos y una copia de `metadata`, de modo que el consumidor no puede modificar el estado interno accidentalmente.

## Generación del terreno

`generatePerlinTerrain(options)` produce una lista ordenada por `x` y después por `y`:

1. Normaliza `width` y `height` a enteros no negativos.
2. Usa un generador pseudoaleatorio determinista a partir de `seed`.
3. Muestrea `simplex-noise` en varias octavas.
4. Combina amplitud con `persistence` y frecuencia con `lacunarity`.
5. Normaliza el ruido a `[0, 1]` y lo convierte al rango `[minElevation, maxElevation]`.

`getOrCreateTerrain()` construye el mapa usado por la escena con las dimensiones de `TERRAIN_WIDTH` y `TERRAIN_HEIGHT`, y conserva el resultado en caché. Una segunda llamada con las mismas dimensiones devuelve la misma referencia.

## Construcción de columnas

El terreno inicial se convierte en instancias de `Box`. La escena aplica además una pequeña configuración de demostración al área central: sus bordes reciben elevación `1` y el interior elevación `0`.

`fillElevations(boxes, minElevation)` materializa todos los niveles entre `minElevation` y la elevación de cada caja. Por ejemplo:

```text
elevación final: 2
mínimo:         -3
columna:        [-3, -2, -1, 0, 1, 2]
```

Esto garantiza que una columna alta no aparezca flotando y que cada nivel pueda recibir su propio bloque visual.

## Proyección isométrica

`projectBoxesToIsometric()` conserva la caja original y añade sus coordenadas de pantalla.

Con ancho `tw`, alto `th`, origen `(ox, oy)` y paso vertical `e`, las fórmulas son:

```text
screenX    = ox + (x - y) * (tw / 2)
baseScreenY = oy - (x + y) * (th / 2)
screenY    = baseScreenY - elevation * e
```

`baseScreenY` representa el contacto con el suelo sin desplazar por elevación. Se usa para ordenar sprites de forma estable. Si no se especifica `elevationStep`, se usa `th / 2`.

Antes de renderizar, la escena calcula los extremos proyectados de todas las cajas y centra el conjunto en el viewport. Después `isWithinViewport()` descarta cajas fuera del viewport más un margen de `VIEW_CULL_MARGIN`.

## Selección de materiales

La escena carga una textura SVG por material:

```text
public/assets/grass/block.svg
public/assets/ground/block.svg
public/assets/water/block.svg
```

La selección se realiza por columna y elevación:

- elevación negativa: `water`;
- bloque con la elevación máxima de su columna: `grass`;
- cualquier bloque inferior no negativo: `ground`.

El bloque superior se identifica con un `Map` cuya clave es `${x}:${y}`. Así el material no depende de la posición absoluta en pantalla.

El agua reutiliza la misma textura SVG para todos sus niveles. `getWaterTint()` aplica un tintado más oscuro cuanto mayor es `Math.abs(elevation)`. No se generan texturas nuevas para cada profundidad.

## Renderizado de bloques

`renderBlock()` crea un `Sprite` a partir de una textura ya cargada:

1. Ajusta el tamaño a `TILE_WIDTH` y `TILE_HEIGHT + BOX_HEIGHT`.
2. Coloca el ancla en `(0.5, 0)` para alinear el centro horizontal y el borde superior.
3. Posiciona el sprite en `screenX` y `screenY - TILE_HEIGHT / 2`.
4. Aplica tint opcional.
5. Calcula `zIndex` usando `baseScreenY`, elevación y una pequeña corrección por `x`.
6. Añade el sprite al `Container` ordenable.

Los SVG representan el bloque completo. No se deben volver a componer caras `top`, `left` y `right` en runtime.

## Ciclo de vida de recursos

`createIsometricScene()` carga los tres SVG con `Assets.load()` en paralelo. Si la escena se desmonta, destruye el container y llama a `Assets.unload()` para cada fuente. Pixi gestiona las texturas; no se debe llamar a `destroy(true)` sobre una textura administrada por `Assets`.

## Testing y calidad

Vitest ejecuta tests co-localizados mediante `src/**/*.test.ts`. La cobertura se mide con V8 y tiene umbrales obligatorios de `100%` para:

- statements;
- branches;
- functions;
- lines.

Los tests de renderer y escena mockean PixiJS. Esto permite probar selección de materiales, carga/unload, geometría y tintado sin WebGL ni navegador.

El flujo completo de validación es:

```bash
pnpm test:coverage
pnpm build
pnpm run docs
```

`pnpm run docs` genera Typedoc en `docs/`. El coverage HTML se genera en `coverage/`; ambos directorios son artefactos generados y no deben editarse manualmente.

## Puntos de extensión

Para añadir un nuevo material:

1. Crear `public/assets/<material>/block.svg` con la misma geometría del bloque.
2. Añadir una clave en `engine/constants`.
3. Cargar el SVG en `engine/scene` y añadir la regla de selección.
4. Actualizar o crear el test de escena para demostrar la selección.
5. Ejecutar coverage, build y Typedoc.

Para añadir una nueva regla de elevación, modificar primero `projection` o la selección de materiales, según dónde pertenezca la decisión. No introducir esa lógica dentro de `render`, porque el renderer solo debe convertir una decisión ya tomada en un Sprite.