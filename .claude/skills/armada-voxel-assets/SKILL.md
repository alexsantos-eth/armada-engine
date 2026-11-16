---
name: "armada-voxel-assets"
description: "Úsala para crear o cambiar sprites de entidades de Armada Engine (árboles, arbustos, rocas, props, edificios) por la ruta voxel: se arman con las piezas (prefabs) del kit, salen como .vox de MagicaVoxel y se renderizan en Blender con acabado clay sobre el lienzo de la casilla. Sustituye al flujo iso-asset-generator → fal.ai. También sirve para añadir piezas nuevas al kit."
---

# Assets voxel de Armada: kit de piezas, `.vox` y render en Blender

Una entidad no se dibuja: **se arma con piezas voxel reutilizables** (un bloque de hoja, un
tramo de tronco, una fruta) y el modelo armado se renderiza a sprite. Todas las entidades
comparten las mismas piezas, la misma paleta y la misma luz, y por eso se ven de la misma
familia. No se llama a ningún modelo de imagen y no cuesta nada.

Este flujo es completo por sí solo. No uses `iso-asset-generator` ni los scripts de
`artifacts/paint/` para una entidad que vaya por aquí.

```
artifacts/vox_prefabs.py   las piezas del kit            → artifacts/vox/prefabs/*.vox
artifacts/vox_models.py    las entidades armadas         → artifacts/vox/models/<nombre>.vox
artifacts/vox_render.py    Blender: modelo → sprite PNG  → lib/assets-src/assets/<dir>/<asset>.png
lib/scripts/build-atlas.sh sprite → atlas y manifiesto   (y recompilar el juego)
```

`artifacts/vox_lib.py` es el núcleo que comparten (cajas redondeadas → vóxeles → `.vox`).
Solo usa la librería estándar de Python; Blender solo hace falta para el paso de render.

## 1. Las medidas que no se cambian

| Regla | Valor |
| --- | --- |
| Escala | 1 vóxel = 4 unidades de plantilla (4 px del lienzo) |
| Casilla | 128 × 128 vóxeles |
| Altura de un bloque | 85 vóxeles (2 bloques: 170; 3 bloques: 255) |
| Módulo | 28 vóxeles. Tres módulos son un bloque de alto |
| Junta | cada pieza deja 1 vóxel de aire por lado: dos vecinas enseñan una junta de 2 |
| Redondeo | radio del 40 al 45 % del lado menor de la pieza |
| Pivote de una pieza | centro de su base |
| Límite de un modelo | 256 vóxeles por eje: como mucho 2 casillas de largo y 3 bloques de alto |

Ejes del modelo: **x** baja hacia la derecha en pantalla, **y** baja hacia la izquierda, **z**
sube. El pie de la casilla ancla es `(0, 0, 0)`. La cara `+x` es la iluminada (abajo a la
derecha) y la cara `+y` la que queda en sombra (abajo a la izquierda).

**Un modelo ocupa el volumen entero de su huella**: 128 por casilla en x e y, 85 por bloque
de alto (un árbol 1x1x2 es 128 × 128 × 170). Así el `.vox` dice dónde está plantada la entidad
dentro de su casilla, y el render cae en el lienzo sin más datos. `vox_models.py` lo escribe
así; si se arma a mano en MagicaVoxel, hay que fijar ese tamaño de modelo **antes** de
construir, y la casilla ancla es la primera.

## 2. Estilo

- **Pocas piezas, grandes y legibles.** El detalle viene de la silueta y de dónde va cada
  pieza, no de la cantidad. Un árbol lleva de 15 a 35 piezas.
- **Las juntas se ven.** Cada pieza se lee como un trozo de arcilla aparte. Las hojas van
  siempre en la rejilla del módulo (centros a múltiplos de 28, o a ±14 en un 2x2); nunca se
  funden dos bloques en uno.
- **Capas que se van cerrando.** Las copas se arman por capas con los patrones de
  `vox_models.py`: `RING` (3x3 sin el bloque del frente), `FULL` (3x3), `PLUS` (una cruz) y
  `QUAD` (2x2). De abajo arriba cada capa es igual o menor que la anterior, y arriba va un
  bloque o una punta (`leaf_cap`).
- **El frente de la capa más baja va vacío** (`RING`, o `QUAD[:3]`), y la copa se desplaza de
  2 a 6 vóxeles hacia atrás (x e y negativos). Si no, el bloque del frente tapa el tronco.
- **Un solo acento por entidad**: fruta, hojas rojas o setas. Va **en la cara** de un bloque:
  el centro de la fruta en el plano de la cara (`x = centro del bloque + 13`, o lo mismo en
  y), a media altura del bloque. Metida más adentro queda enterrada y no se ve.
- **Sin sombra en el suelo.** El juego dibuja la sombra de cada entidad; el modelo no lleva
  ninguna pieza que la imite.
- **Los árboles miden dos bloques**: llegan a z = 164–170. Un árbol «pequeño» es un árbol de
  dos bloques con menos copa, nunca uno más bajo. Arbustos, rocas, tocones y props no tienen
  esa regla.
- **Entidades de dos casillas**: se escriben una vez en ejes locales (`u` a lo largo, `v` a lo
  ancho, desde el centro de la huella) y se generan las dos orientaciones desde ahí, como
  hace `grove(axis)`. Nunca se espeja un sprite: el espejo cambia la cara iluminada por la
  de sombra.

## 3. Paleta

Una sola paleta para todo el kit, colores planos de material. El modelo **no lleva luz
pintada**: la pone el render. Una variante de color es otro índice de la misma pieza, no una
pieza nueva.

| Material | Color | Uso |
| --- | --- | --- |
| `LEAF` | `#80c034` | hoja de casi todos los árboles y del arbusto |
| `LEAF_DARK` | `#4c8f3a` | coníferas |
| `LEAF_AUTUMN` | `#f0a830` | abedul de otoño |
| `ROSETTE` | `#6fb81e` | hojas a ras de suelo, tallos, brotes |
| `WOOD` | `#8a5a30` | troncos y ramas |
| `BIRCH` / `BIRCH_MARK` | `#f1ece1` / `#4a4038` | corteza de abedul y sus marcas |
| `BARK` | `#7a5a3a` | tronco caído |
| `CUT` | `#d9b98a` | madera recién cortada (tocón, extremos del tronco) |
| `MOSS` | `#6f8f4a` | musgo sobre roca o madera |
| `RED` / `WHITE` / `YELLOW` / `PINK` | `#d9463a` / `#f4f1e6` / `#f4bd43` / `#f7a8c9` | fruta, pétalos, centro de flor |
| `CAP` / `STEM` / `DOT` | `#b5473a` / `#eee8d8` / `#fff2dc` | seta |
| `OCHRE` / `RUST` | `#d9a441` / `#c9702e` | hojas caídas |
| `ROCK` / `ROCK_DARK` | `#9a9a96` / `#7c7c7a` | piedra |

Un material nuevo se añade como constante en `vox_prefabs.py` **y a la lista `PALETTE`**
(si falta, el script se detiene). Elige tonos medios y saturados: el render los oscurece en
las caras en sombra por su cuenta. Como mucho 255 colores.

## 4. El kit

Tamaños en vóxeles, ancho × fondo × alto. Las variantes son el sufijo del archivo
(`leaf_block_dark.vox`) y el argumento `variant` al armar.

| Pieza | Tamaño | Variantes | Uso |
| --- | --- | --- | --- |
| `leaf_block` | 26 × 26 × 26 | green, dark, autumn | el bloque de copa; una celda del módulo |
| `leaf_block_small` | 20 × 20 × 20 | green, dark, autumn | capas altas más estrechas (celda de 22) |
| `leaf_cap` | 32 × 32 × 24 | green, dark, autumn | remate ancho de una copa |
| `leaf_slab` | 36 × 36 × 12 | green, dark, autumn | copa plana (celda de 38, capas cada 13) |
| `leaf_tuft` | 20 × 20 × 11 | green, dark, autumn | mata baja, almohadilla de rama (celda de 21) |
| `trunk` | 14 × 14 × 28 | brown, birch | tronco; se apila cada 28 |
| `trunk_thin` | 9 × 9 × 28 | brown, birch | rama vertical, retoño |
| `branch` | 26 × 8 × 8 | brown, birch | brazo horizontal (a lo largo de x; `turn=True` para y) |
| `stump` | 16 × 16 × 14 | — | tocón con el corte claro |
| `log` | 30 × 12 × 13 | — | tronco caído con musgo |
| `fruit` | 7 × 7 × 7 | — | el acento rojo |
| `flower_big` | 17 × 17 × 11 | white, red, yellow, pink | flor sobre su roseta |
| `wildflower` | 11 × 11 × 16 | red, white | flor de tallo |
| `mushroom` | 10 × 9 × 11 | — | seta |
| `sprout` | 14 × 14 × 13 | — | tres briznas |
| `fallen_leaf` | 15 × 11 × 2 | ochre, rust | hoja en el suelo |
| `pebble_s` / `_m` / `_l` | hasta 12 × 10 × 6 | — | guijarros |
| `rock_s` | 14 × 12 × 8 | — | piedra suelta |
| `rock_l` | 30 × 26 × 19 | — | roca con losa de musgo |

`python3 artifacts/vox_prefabs.py` regenera todos los `.vox` de las piezas. Sirven para armar
a mano en MagicaVoxel; `vox_models.py` no los lee, usa las mismas definiciones directamente.

### Crear una pieza nueva

Hazlo cuando una entidad necesite una forma que ninguna pieza da. Antes comprueba que no se
resuelve con una existente girada, apilada o en otro color.

1. Añade una entrada a `PIECES` en `vox_prefabs.py`: `"nombre": (constructor, variantes)`.
   El constructor recibe el color y devuelve una lista de `box(x, y, z0, ancho, fondo, alto,
   color, radio)` en vóxeles, con el pivote en el centro de la base. Las variantes son
   `{nombre: color}`, o `{"": color}` si solo hay una.
2. **Tamaño**: si la pieza va en la rejilla, mide el módulo menos 2 (26 en un módulo de 28,
   54 en dos). Si es un prop suelto, el tamaño que pida, entero.
3. **Radio**: 40–45 % del lado menor. Por debajo del 30 % se lee como un cubo; por encima del
   48 %, como un cojín.
4. Los detalles de otro color (el corte del tocón, las marcas del abedul) son cajas pequeñas
   **después** de la principal: la última caja gana donde se pisan.
5. Regenera el kit y mira la pieza antes de usarla (sección 6).

Mantén el kit corto: una pieza nueva tiene que servir a más de una entidad o ser lo que hace
reconocible a una.

## 5. Armar una entidad

En `vox_models.py`, una función por entidad que devuelve la lista de cajas, y una entrada en
`MODELS`: `"nombre": (función, (casillas_x, casillas_y, bloques), "dir/asset.png")`. La ruta
es el PNG que el render sustituye, bajo `lib/assets-src/assets/`.

Ayudas disponibles (posiciones en vóxeles):

- `put(pieza, x, y, z, variant="", turn=False)` — una pieza con su base en z.
- `layer(celdas, x, y, z, variant="green", name="leaf_block", cell=28)` — una capa de hojas
  sobre un patrón (`RING`, `FULL`, `PLUS`, `QUAD`) alrededor de (x, y).
- `trunk(x, y, tramos, variant="brown", name="trunk")` — tramos apilados desde el suelo.
- `fruits([(x, y, z), …])` — los acentos.

Receta de un árbol, de abajo arriba:

```python
def fruit_tree():
    c = -6                                              # la copa, hacia atrás
    return (trunk(0, 0, 3)                              # 3 tramos: 84 de tronco
            + layer(RING, c, c, 84)                     # 3x3 sin el bloque del frente
            + layer(PLUS, c, c, 112)                    # una cruz
            + layer([(0, 0)], c, c, 140)                # un bloque arriba: llega a 166
            + fruits([(35, 1, 94), (-11, 35, 101)]))    # en las caras x = c+28+13, y = c+28+13
```

Las alturas se cuadran con el módulo: tronco visible + 28 por capa + la punta = 164 a 170.
Si un modelo se sale del volumen de su huella, el script se detiene y dice por cuánto.

`python3 artifacts/vox_models.py` escribe todos los modelos; con nombres detrás, solo esos.

**A mano en MagicaVoxel**: modelo nuevo del tamaño de la huella, se importan las piezas de
`artifacts/vox/prefabs/` (todas llevan la misma paleta) y se colocan sobre la rejilla de 28.
En MagicaVoxel el eje y va al revés que en `vox_models.py`: lo que aquí es `+y` allí es `−y`.
Guarda el resultado en `artifacts/vox/models/` y pasa al render. Un color marcado como
emisivo en MagicaVoxel brilla en el sprite.

## 6. Renderizar

```sh
python3 artifacts/vox_models.py --render tree_3 bush        # arma y renderiza sobre sus assets
blender -b -P artifacts/vox_render.py -- modelo.vox sprite.png   # un .vox cualquiera
```

Sin Blender instalado vale el módulo de pip (`pip install bpy`): entonces
`python3 artifacts/vox_render.py modelo.vox sprite.png`. Tarda unos 35 s por sprite en CPU.

Lo que hace `vox_render.py`, y por qué no se toca a la ligera:

- **Cámara**: ortográfica, girada 45° y elevada 30° (el 2:1 de las casillas), con el modelo
  **aplastado a √(2/3) de su alto**: un bloque del juego mide 341 sobre una casilla de 512,
  más bajo de lo que esa cámara enseña un cubo. Con eso el render cae en el lienzo de
  plantilla al píxel: 1024 × 1194 para 1x1x2, pie en (512, 938).
- **Luz**: un sol arriba a la derecha (`SUN_FROM`) más un cielo uniforme (`SKY`), ajustados
  para que el techo conserve el color de paleta, la cara derecha quede a 0,93 y la izquierda,
  en sombra, a 0,64. Son los tonos de todos los assets del juego: si se cambian, la entidad
  deja de casar con el resto. Las sombras entre piezas salen solas y son suaves.
- **Color**: transformación de vista «Standard». Con AgX o Filmic los colores de paleta se
  apagan.
- **Acabado clay** (`--style clay`, por defecto): los cubos se rehacen como una piel cerrada,
  se suavizan hasta fundir los escalones de vóxel, reciben una leve irregularidad de arcilla
  amasada y un material mate con algo de brillo y de luz que cala. `--style voxel` deja los
  cubos duros. Las constantes `CLAY_*` gradúan cada efecto; cámbialas para todo el juego a la
  vez, no para una entidad, y vuelve a renderizar todas.
- **Fondo transparente y sin suelo**, así que no hay sombra proyectada en el sprite.

Mira siempre el PNG antes de seguir. Lo que suele fallar: un bloque del frente que tapa el
tronco, fruta enterrada, una copa que no llega arriba, piezas que se pisan (se funden en un
bulto sin junta) o que flotan sin apoyo.

## 7. Meterlo al juego

1. El PNG va junto al dibujo del mismo nombre y lo sustituye (`tree/block_3.png` gana a
   `tree/block_3.svg`). Una entidad nueva sin SVG necesita al lado un `<nombre>.json` con su
   huella, por ejemplo `{"tiles": "1x1x2"}`, y su entrada en `lib/content/json/entities.json`.
2. `lib/scripts/build-atlas.sh` (con `PYTHON=python3` si no encuentra cairosvg). Si
   `content/images/cloud-shadow.png` cambia sin haber tocado las nubes, descártalo: es el
   desenfoque de otra versión de cairo.
3. **Recompila el juego** (`cargo build --locked --bin iso-core`). El binario lleva dentro el
   manifiesto: con atlas nuevo y binario viejo los sprites salen recortados y mezclados.
4. Compruébalo corriendo con la skill `armada-visual-check`: una escena `blank` con la
   entidad a una casilla del jugador, de día. Mira que esté plantada en su casilla, que la
   sombra del juego salga de su pie y que el tamaño case con las vecinas.
5. `cargo test --workspace --locked`. Al añadir entidades o assets hay contadores a mano en
   `manifest.test.rs`, `entities_catalog_test.rs` y `wfc_catalog_test.rs`.
6. Si cambian las piezas, las reglas o el render, actualiza en el mismo cambio esta skill y
   la sección 9 de `lib/docs/ASSET-PIPELINE.md`.

El commit y el push solo los hace `armada-commit`, cuando el usuario la invoca.

## 8. Antes de entregar

- [ ] El modelo ocupa el volumen de su huella y `vox_models.py` lo escribe sin quejarse.
- [ ] Solo piezas del kit y colores de la paleta; las piezas nuevas siguen la sección 4.
- [ ] Hojas en la rejilla del módulo, juntas visibles, frente de la capa baja vacío.
- [ ] Árboles a dos bloques (z 164–170); un solo acento, puesto en una cara.
- [ ] Sin sombra propia en el suelo; dos orientaciones generadas, no espejadas.
- [ ] Viste el sprite renderizado y la entidad dentro del juego, y adjuntas las dos imágenes.
- [ ] Atlas regenerado, juego recompilado y tests en verde.
- [ ] Entregas el `.vox` del modelo, el sprite y los cambios de `vox_prefabs.py` / `vox_models.py`.

## 9. El techo de hierba con adornos

`artifacts/grass_clay.py` genera las variantes del bloque de hierba (`block_flowers.png`,
`block_flowers_2.png`, `block_wildflowers_red.png`, `block_wildflowers_white.png`,
`block_sprouts.png`, `block_leaves.png`, `block_pebbles.png`, `block_mushrooms.png`,
`block_bushes.png`): el bloque de `assets/grass/block.png` **no se toca ni se redibuja**; lo
que se arma con piezas del kit es solo el adorno, de pie sobre un volumen 1x1x1 con la base en
z = 0, y el render se compone encima del bloque con un desplazamiento vertical de −341 px del
lienzo (−171 px a la escala de `block.png`, la del techo, exactamente donde la planta del
adorno pisa el bloque). En el
lienzo 1x1x1 el plano de suelo del adorno y la cara de arriba del bloque caen en el mismo
sitio, así que los dos encajan al píxel.

Los adornos se quedan bajos y dentro de la silueta del bloque, de modo que la caja de tinta de
cada variante es la del bloque llano: el atlas mide el adorno como el bloque y el terreno lo
dibuja donde dibuja el bloque. Regenerar: `python3 artifacts/grass_clay.py` (escribe los
`.vox` en `vox/models/block_*.vox` y los PNG sobre el bloque). Si cambian las piezas que un
adorno usa, el kit o el render, se rehacen todos y el atlas se reconstruye igual que siempre.
