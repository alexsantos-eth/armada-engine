# Contribuir al proyecto

La explicación detallada del runtime está en [ARCHITECTURE.md](ARCHITECTURE.md); este documento se centra en el flujo práctico de cambios y validación.

## Estructura de módulos

El código del engine está organizado por responsabilidad dentro de `src/isometric/core/engine`. Cada carpeta expone su API mediante `index.ts`; los módulos consumidores deben importar desde el barrel de la carpeta.

Los tipos compartidos viven en `src/isometric/core/types` y se exportan desde `core/types/index.ts`. No se crean tests runtime para archivos que solo contienen tipos.

`Box` está reservado para bloques de terreno (`grass`, `ground` y `water`). Las entidades de juego se declaran como datos en `src/isometric/core/engine/entities/config.ts` y se crean con `createEntitiesFromConfig()`. No se deben añadir entidades concretas a `Box`, a `scene.ts` ni a las constantes de terreno.

## Tests co-localizados

Los tests viven junto al archivo que prueban:

```text
projection/
  projection.ts
  projection.test.ts
```

El proyecto usa Vitest en entorno Node. La lógica de Pixi se prueba con mocks de `pixi.js`, mientras que los tests de proyección, terreno y entidades deben permanecer deterministas y libres de efectos visuales.

Comandos:

```bash
pnpm test             # suite rápida
pnpm test:coverage    # suite + coverage obligatorio
```

La configuración exige 100% de statements, branches, functions y lines. Cada nueva rama debe incluir un caso de test; si una rama es imposible por contrato, simplifica la implementación en vez de ignorarla en coverage.

## Validación y documentación

Antes de abrir un cambio ejecuta:

```bash
pnpm test:coverage
pnpm build
pnpm run docs
```

Typedoc toma `src` como entrada y genera la documentación en `docs/`. Las APIs públicas y los tipos deben tener comentarios TSDoc concisos. Los tests están excluidos de Typedoc.

## Assets y render

Los materiales de bloque se cargan desde:

```text
public/assets/grass/block.svg
public/assets/ground/block.svg
public/assets/water/block.svg
```

Cada bloque se renderiza con una textura única. Grass se usa en la cima de una columna, ground en los soportes y water en niveles negativos, con oscurecimiento según profundidad. Los cambios de colores o proporciones deben conservar la continuidad entre caras y probarse visualmente con el servidor de Vite.