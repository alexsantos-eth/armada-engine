# Contribuir al proyecto

La explicación detallada del runtime está en [ARCHITECTURE.md](ARCHITECTURE.md); este documento se centra en el flujo práctico de cambios y validación.

## Estructura de módulos

El código del engine está organizado por responsabilidad dentro de `src/isometric/core/engine`. Cada carpeta expone su API mediante `index.ts`; los módulos consumidores deben importar desde el barrel de la carpeta.

Los tipos compartidos viven en `src/isometric/core/types` y se exportan desde `core/types/index.ts`. No se crean tests runtime para archivos que solo contienen tipos.

`Box` está reservado para bloques de terreno (`grass`, `ground` y `water`). Las entidades de juego se declaran como datos en `src/isometric/core/engine/entities/config.ts` y se crean con `createEntitiesFromConfig()`. No se deben añadir entidades concretas a `Box`, a `scene.ts` ni a las constantes de terreno.

Las definiciones de entidad admiten `surfaceElevation` para exigir una elevación exacta, `length` y `lengthAxis` (`"x"` por defecto) para huellas multi-bloque, `gap` para exigir una separación mínima en bloques (diagonales incluidas) entre instancias de la misma entidad, `colorReplacements` para variantes SVG por instancia y `debug` para dibujar su huella visual. La factory valida y reserva todas las celdas de la huella antes de crear la entidad, por lo que las definiciones posteriores no pueden solaparse con una entidad ya colocada.

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

Cuando un cambio modifica el funcionamiento del core, también deben actualizarse los Markdown afectados, como mínimo `ARCHITECTURE.md` para el runtime y este archivo para el flujo de contribución. Si afecta a la generación o geometría de assets, actualiza además `ISO_ASSET_AGENT.md`.

## Assets y render

Los materiales de bloque se cargan desde:

```text
public/assets/grass/block.svg
public/assets/ground/block.svg
public/assets/water/block.svg
```

Cada bloque se renderiza con una textura única. Grass se usa en la cima de una columna, ground en los soportes y water en niveles negativos, con oscurecimiento según profundidad. Los cambios de colores o proporciones deben conservar la continuidad entre caras y probarse visualmente con el servidor de Vite.

Como recomendación de diseño, los assets SVG con altura lógica `1` deben usar `viewBox="0 0 1024 853"`, igual que los bloques de terreno. Si una entidad necesita conservar una proporción visual diferente, escala su contenido dentro de ese `viewBox` en lugar de cambiar el lienzo raíz; así se evita que el renderer deforme el asset al ajustarlo a `TILE_HEIGHT + BOX_HEIGHT`.

Las entidades multi-bloque deben reflejar el atributo SVG `data-tiles` en su configuración mediante `length` y `lengthAxis`. `lengthAxis` puede ser `"x"` o `"y"` y afecta a la reserva de celdas, al posicionamiento del sprite y a la huella de debug. Los assets de orientaciones distintas deben generarse como SVG separados; no se deben espejar en runtime. Como los ejes del motor y del asset no coinciden en pantalla, `lengthAxis: "x"` corresponde a `data-tiles="1xN"` y `lengthAxis: "y"` a `data-tiles="Nx1"`; para assets de varios bloques de alto, `height` debe igualar el tercer valor de `data-tiles`. `config.test.ts` falla si alguna entrada no lo cumple. También falla si un `colorReplacements` contiene un color de origen que no aparece en ninguno de los SVG que comparten ese mapa, o si sus listas de variantes tienen longitudes distintas. Para recolorear un material hay que mapear todos sus tonos de sombreado (caras, biseles y caída por altura); si un material comparte color con otra parte del asset, se debe regenerar el asset con un color base propio para ese material.

`colorReplacements` permite reemplazar colores `fill` y `stroke` por un valor o por una lista de variantes. La selección se realiza por instancia al crear la textura, no durante cada frame. `debug: true` dibuja una huella isométrica fina para inspección visual.

## Sincronización documental

Cada cambio funcional del core debe actualizar los Markdown que describen ese comportamiento. Revisa `ARCHITECTURE.md` para el flujo runtime, este archivo para las reglas de contribución y `ISO_ASSET_AGENT.md` para cambios de assets. La documentación debe actualizarse antes de ejecutar la validación final.