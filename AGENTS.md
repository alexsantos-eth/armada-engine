# Guía para agentes

## Objetivo

Armada Engine es un motor isométrico construido con TypeScript, Preact, PixiJS, Vite y Vitest. Los cambios deben conservar la separación entre lógica de dominio, proyección, generación de terreno y renderizado.

Para entender el flujo runtime completo, consulta [ARCHITECTURE.md](ARCHITECTURE.md). Las instrucciones de contribución y validación están en [CONTRIBUTING.md](CONTRIBUTING.md).

## Arquitectura

La lógica principal vive en `src/isometric/core`.

```text
core/
  engine/
    board/
    constants/
    entities/
    projection/
    render/
    scene/
    terrain/
    index.ts
  types/
    entities.ts
    iso.ts
    terrain.ts
    index.ts
```

Cada responsabilidad debe permanecer en su propia carpeta. Los `index.ts` son barrels públicos: los imports entre responsabilidades deben preferirlos, por ejemplo `../entities` o `./core/engine`, en lugar de apuntar al archivo interno.

La UI de entrada está en `src/isometric/page.tsx` y `src/main.tsx` solo monta esa página.

Los bloques visibles se cargan como SVG desde `public/assets/<material>/block.svg`. El renderer usa una textura por bloque y aplica el tintado de agua por elevación; no reintroducir composición de caras separadas.

Las entidades que no son bloques de terreno se declaran en `engine/entities/config.ts` y se crean mediante `createEntitiesFromConfig()`. La escena no debe conocer nombres concretos como `tree`, ni incluir ramas, constantes o assets específicos de una entidad. Para añadir una entidad, agrega una definición de configuración y su asset; usa la clase `Entity` genérica y conserva `Box` exclusivamente para `grass`, `ground` y `water`.

## Reglas de cambios

- Mantener TypeScript estricto y no introducir `any` para ocultar errores.
- No mezclar responsabilidades de terreno, proyección, entidades y Pixi en un mismo módulo.
- Crear o actualizar el `index.ts` de la responsabilidad cuando se exponga un nuevo símbolo.
- Todo archivo de comportamiento en `src` debe tener un test co-localizado con el mismo nombre y extensión `.test.ts`: `foo.ts` junto a `foo.test.ts`.
- Los archivos que solo declaran tipos no necesitan tests runtime; se validan con `tsc` y Typedoc.
- Los tests deben usar mocks para Pixi cuando prueben lógica de escena o renderer; no depender de WebGL ni de un navegador real.
- Mantener la cobertura en 100% para statements, branches, functions y lines. No bajar los thresholds para hacer pasar un cambio.
- No editar manualmente `dist/` ni los artefactos generados de `coverage/` o Typedoc.
- Usar los SVG de `public/assets` como fuente de los bloques; conservar sus proporciones isométricas.
- Mantener los comentarios públicos en formato TSDoc para que Typedoc los publique.

## Flujo requerido

Antes de terminar un cambio:

```bash
pnpm test:coverage
pnpm build
pnpm run docs
```

`pnpm test:coverage` debe terminar con 100% en las cuatro métricas. Si se añade comportamiento, primero añade el caso de test que lo defina y después implementa el cambio.

Para trabajar visualmente:

```bash
pnpm dev
```

No crear commits ni ramas automáticamente. No revertir cambios existentes que no pertenezcan al trabajo actual.

## Estado actual del core

Las entidades se configuran en `engine/entities/config.ts` y pueden usar `surfaceElevation`, `length`, `lengthAxis`, `colorReplacements` y `debug`. `createEntitiesFromConfig()` valida la superficie y la elevación de toda la huella, reserva las coordenadas con un `Set` y evita solapamientos entre entidades.

Los assets multi-bloque declaran su geometría con `data-tiles`; `lengthAxis: "x"` es el valor por defecto y `lengthAxis: "y"` orienta la huella hacia el eje `y`. El renderer aplica la orientación al sprite y dibuja un rombo de debug por bloque ocupado en sus niveles inferior y superior.

`colorReplacements` acepta colores individuales o listas de variantes. La escena genera una textura SVG recoloreada por instancia, manteniendo una elección coherente de variante dentro de cada asset.

## Regla de documentación

Cada cambio que modifique el funcionamiento del core, sus contratos, el renderizado o el flujo de assets debe actualizar en el mismo cambio los Markdown afectados. Como mínimo, revisa `ARCHITECTURE.md` para el runtime y `CONTRIBUTING.md` para el flujo; revisa también `ISO_ASSET_AGENT.md` si cambia la geometría o integración de assets.